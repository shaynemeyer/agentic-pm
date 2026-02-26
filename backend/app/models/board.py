from typing import Literal
from sqlalchemy import Column as SAColumn, String, Integer, ForeignKey, delete, select
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = SAColumn(String, primary_key=True)
    username = SAColumn(String, nullable=False, unique=True)
    password = SAColumn(String, nullable=False)

    owned_boards = relationship("Board", back_populates="owner", cascade="all, delete-orphan")
    board_memberships = relationship("BoardMember", back_populates="user", cascade="all, delete-orphan")


class Board(Base):
    __tablename__ = "boards"

    id = SAColumn(String, primary_key=True)
    title = SAColumn(String, nullable=False)
    owner_id = SAColumn(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    owner = relationship("User", back_populates="owned_boards")
    members = relationship("BoardMember", back_populates="board", cascade="all, delete-orphan")
    columns = relationship("KanbanColumn", back_populates="board", cascade="all, delete-orphan")


class BoardMember(Base):
    __tablename__ = "board_members"

    board_id = SAColumn(String, ForeignKey("boards.id", ondelete="CASCADE"), primary_key=True)
    user_id = SAColumn(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

    board = relationship("Board", back_populates="members")
    user = relationship("User", back_populates="board_memberships")


class KanbanColumn(Base):
    __tablename__ = "kanban_columns"

    id = SAColumn(String, primary_key=True)
    title = SAColumn(String, nullable=False)
    position = SAColumn(Integer, nullable=False)
    board_id = SAColumn(String, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    cards = relationship("KanbanCard", back_populates="column", cascade="all, delete-orphan", lazy="selectin")
    board = relationship("Board", back_populates="columns")


class KanbanCard(Base):
    __tablename__ = "kanban_cards"

    id = SAColumn(String, primary_key=True)
    title = SAColumn(String, nullable=False)
    details = SAColumn(String, default="")
    column_id = SAColumn(String, ForeignKey("kanban_columns.id", ondelete="CASCADE"), nullable=False)
    position = SAColumn(Integer, nullable=False)
    created_by_id = SAColumn(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to_id = SAColumn(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    column = relationship("KanbanColumn", back_populates="cards")
    created_by = relationship("User", foreign_keys=[created_by_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])


class CardSchema(BaseModel):
    id: str
    title: str
    details: str = ""
    created_by: str | None = None
    assigned_to: str | None = None


class ColumnSchema(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[ColumnSchema]
    cards: dict[str, CardSchema]


class BoardSummary(BaseModel):
    id: str
    title: str
    owner_username: str


class MemberSchema(BaseModel):
    user_id: str
    username: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    board: BoardData
    board_id: str


class ChatResponse(BaseModel):
    message: str
    board_update: BoardData | None = None


async def db_to_board(session: AsyncSession, board_id: str) -> BoardData:
    result = await session.execute(
        select(KanbanColumn)
        .where(KanbanColumn.board_id == board_id)
        .order_by(KanbanColumn.position)
    )
    cols = result.scalars().all()

    col_ids = [col.id for col in cols]
    if not col_ids:
        return BoardData(columns=[], cards={})

    cards_result = await session.execute(
        select(KanbanCard)
        .where(KanbanCard.column_id.in_(col_ids))
        .order_by(KanbanCard.position)
    )
    all_cards = cards_result.scalars().all()

    # Collect user IDs to resolve usernames
    user_ids = set()
    for card in all_cards:
        if card.created_by_id:
            user_ids.add(card.created_by_id)
        if card.assigned_to_id:
            user_ids.add(card.assigned_to_id)

    username_map: dict[str, str] = {}
    if user_ids:
        users_result = await session.execute(
            select(User).where(User.id.in_(user_ids))
        )
        for user in users_result.scalars().all():
            username_map[user.id] = user.username

    cards_by_col: dict[str, list[KanbanCard]] = {}
    for card in all_cards:
        cards_by_col.setdefault(card.column_id, []).append(card)

    columns = []
    for col in cols:
        col_cards = sorted(cards_by_col.get(col.id, []), key=lambda c: c.position)
        columns.append(ColumnSchema(id=col.id, title=col.title, cardIds=[c.id for c in col_cards]))

    cards_dict = {
        c.id: CardSchema(
            id=c.id,
            title=c.title,
            details=c.details or "",
            created_by=username_map.get(c.created_by_id) if c.created_by_id else None,
            assigned_to=username_map.get(c.assigned_to_id) if c.assigned_to_id else None,
        )
        for c in all_cards
    }

    return BoardData(columns=columns, cards=cards_dict)


async def board_to_db(session: AsyncSession, board_id: str, board: BoardData, created_by_id: str | None = None) -> None:
    existing_col_ids = set(
        (await session.execute(
            select(KanbanColumn.id).where(KanbanColumn.board_id == board_id)
        )).scalars().all()
    )

    col_ids_in_board = [col.id for col in board.columns]
    existing_card_ids = set()
    if col_ids_in_board:
        existing_card_ids = set(
            (await session.execute(
                select(KanbanCard.id).where(KanbanCard.column_id.in_(col_ids_in_board))
            )).scalars().all()
        )

    new_col_ids = {col.id for col in board.columns}
    new_card_ids = set(board.cards.keys())

    # Delete removed columns (cascade deletes their cards)
    removed_cols = existing_col_ids - new_col_ids
    if removed_cols:
        await session.execute(delete(KanbanColumn).where(KanbanColumn.id.in_(removed_cols)))

    # Delete removed cards
    removed_cards = existing_card_ids - new_card_ids
    if removed_cards:
        await session.execute(delete(KanbanCard).where(KanbanCard.id.in_(removed_cards)))

    # Upsert columns
    for pos, col in enumerate(board.columns):
        existing = await session.get(KanbanColumn, col.id)
        if existing:
            existing.title = col.title
            existing.position = pos
        else:
            session.add(KanbanColumn(id=col.id, title=col.title, position=pos, board_id=board_id))

    # Upsert cards
    for col in board.columns:
        for pos, card_id in enumerate(col.cardIds):
            card_data = board.cards.get(card_id)
            if card_data is None:
                continue
            existing = await session.get(KanbanCard, card_id)
            if existing:
                existing.title = card_data.title
                existing.details = card_data.details
                existing.column_id = col.id
                existing.position = pos
                # Only update assigned_to if provided in card_data
                if card_data.assigned_to is not None:
                    pass  # assigned_to is resolved via separate endpoint
            else:
                session.add(KanbanCard(
                    id=card_id,
                    title=card_data.title,
                    details=card_data.details,
                    column_id=col.id,
                    position=pos,
                    created_by_id=created_by_id,
                ))

    await session.commit()
