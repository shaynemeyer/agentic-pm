from sqlalchemy import Column as SAColumn, String, Integer, ForeignKey, delete, select
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import Base


class KanbanColumn(Base):
    __tablename__ = "kanban_columns"

    id = SAColumn(String, primary_key=True)
    title = SAColumn(String, nullable=False)
    position = SAColumn(Integer, nullable=False)
    cards = relationship("KanbanCard", back_populates="column", cascade="all, delete-orphan", lazy="selectin")


class KanbanCard(Base):
    __tablename__ = "kanban_cards"

    id = SAColumn(String, primary_key=True)
    title = SAColumn(String, nullable=False)
    details = SAColumn(String, default="")
    column_id = SAColumn(String, ForeignKey("kanban_columns.id", ondelete="CASCADE"), nullable=False)
    position = SAColumn(Integer, nullable=False)
    column = relationship("KanbanColumn", back_populates="cards")


class CardSchema(BaseModel):
    id: str
    title: str
    details: str = ""


class ColumnSchema(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[ColumnSchema]
    cards: dict[str, CardSchema]


async def db_to_board(session: AsyncSession) -> BoardData:
    result = await session.execute(select(KanbanColumn).order_by(KanbanColumn.position))
    cols = result.scalars().all()

    cards_result = await session.execute(select(KanbanCard).order_by(KanbanCard.position))
    all_cards = cards_result.scalars().all()

    cards_by_col: dict[str, list[KanbanCard]] = {}
    for card in all_cards:
        cards_by_col.setdefault(card.column_id, []).append(card)

    columns = []
    for col in cols:
        col_cards = sorted(cards_by_col.get(col.id, []), key=lambda c: c.position)
        columns.append(ColumnSchema(id=col.id, title=col.title, cardIds=[c.id for c in col_cards]))

    cards_dict = {c.id: CardSchema(id=c.id, title=c.title, details=c.details or "") for c in all_cards}

    return BoardData(columns=columns, cards=cards_dict)


async def board_to_db(session: AsyncSession, board: BoardData) -> None:
    existing_col_ids = set((await session.execute(select(KanbanColumn.id))).scalars().all())
    existing_card_ids = set((await session.execute(select(KanbanCard.id))).scalars().all())

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
            session.add(KanbanColumn(id=col.id, title=col.title, position=pos))

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
            else:
                session.add(KanbanCard(
                    id=card_id,
                    title=card_data.title,
                    details=card_data.details,
                    column_id=col.id,
                    position=pos,
                ))

    await session.commit()
