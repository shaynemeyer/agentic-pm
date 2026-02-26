from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import require_auth, SessionData
from app.database import get_session
from app.models.board import (
    Board, BoardMember, User, KanbanCard,
    BoardData, BoardSummary, MemberSchema,
    db_to_board, board_to_db,
)

router = APIRouter()


async def _get_board_or_404(session: AsyncSession, board_id: str) -> Board:
    board = await session.get(Board, board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


async def _require_member(session: AsyncSession, board_id: str, user_id: str) -> Board:
    board = await _get_board_or_404(session, board_id)
    member = await session.get(BoardMember, (board_id, user_id))
    if member is None:
        raise HTTPException(status_code=403, detail="Not a member of this board")
    return board


async def _require_owner(session: AsyncSession, board_id: str, user_id: str) -> Board:
    board = await _require_member(session, board_id, user_id)
    if board.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Only the board owner can perform this action")
    return board


@router.get("/boards", response_model=list[BoardSummary])
async def list_boards(
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Board, User.username)
        .join(BoardMember, Board.id == BoardMember.board_id)
        .join(User, Board.owner_id == User.id)
        .where(BoardMember.user_id == session_data.user_id)
        .order_by(Board.title)
    )
    rows = result.all()
    return [BoardSummary(id=board.id, title=board.title, owner_username=owner_username) for board, owner_username in rows]


class CreateBoardRequest(BaseModel):
    title: str


@router.post("/boards", response_model=BoardSummary, status_code=201)
async def create_board(
    body: CreateBoardRequest,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    from uuid import uuid4
    from app.models.board import KanbanColumn
    board_id = str(uuid4())
    board = Board(id=board_id, title=body.title, owner_id=session_data.user_id)
    session.add(board)
    session.add(BoardMember(board_id=board_id, user_id=session_data.user_id))
    default_columns = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
    for pos, col_title in enumerate(default_columns):
        session.add(KanbanColumn(id=str(uuid4()), title=col_title, position=pos, board_id=board_id))
    await session.commit()
    return BoardSummary(id=board_id, title=body.title, owner_username=session_data.username)


@router.delete("/boards/{board_id}", status_code=204)
async def delete_board(
    board_id: str,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    board = await _require_owner(session, board_id, session_data.user_id)
    await session.delete(board)
    await session.commit()


@router.get("/boards/{board_id}", response_model=BoardData)
async def get_board(
    board_id: str,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    await _require_member(session, board_id, session_data.user_id)
    return await db_to_board(session, board_id)


@router.patch("/boards/{board_id}", response_model=BoardData)
async def patch_board(
    board_id: str,
    body: BoardData,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    await _require_member(session, board_id, session_data.user_id)
    await board_to_db(session, board_id, body, session_data.user_id)
    return await db_to_board(session, board_id)


@router.get("/boards/{board_id}/members", response_model=list[MemberSchema])
async def get_members(
    board_id: str,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    await _require_member(session, board_id, session_data.user_id)
    result = await session.execute(
        select(User)
        .join(BoardMember, User.id == BoardMember.user_id)
        .where(BoardMember.board_id == board_id)
        .order_by(User.username)
    )
    users = result.scalars().all()
    return [MemberSchema(user_id=u.id, username=u.username) for u in users]


class InviteMemberRequest(BaseModel):
    username: str


@router.post("/boards/{board_id}/members", response_model=MemberSchema, status_code=201)
async def invite_member(
    board_id: str,
    body: InviteMemberRequest,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    await _require_owner(session, board_id, session_data.user_id)
    result = await session.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await session.get(BoardMember, (board_id, user.id))
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member")
    session.add(BoardMember(board_id=board_id, user_id=user.id))
    await session.commit()
    return MemberSchema(user_id=user.id, username=user.username)


@router.delete("/boards/{board_id}/members/{username}", status_code=204)
async def remove_member(
    board_id: str,
    username: str,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    board = await _require_owner(session, board_id, session_data.user_id)
    if username == session_data.username:
        raise HTTPException(status_code=400, detail="Owner cannot remove themselves from the board")
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    await session.execute(
        delete(BoardMember).where(
            BoardMember.board_id == board_id,
            BoardMember.user_id == user.id,
        )
    )
    await session.commit()


class AssignCardRequest(BaseModel):
    username: str | None


@router.patch("/boards/{board_id}/cards/{card_id}/assignee", response_model=None)
async def assign_card(
    board_id: str,
    card_id: str,
    body: AssignCardRequest,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    await _require_member(session, board_id, session_data.user_id)
    card = await session.get(KanbanCard, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")

    if body.username is None:
        card.assigned_to_id = None
    else:
        result = await session.execute(select(User).where(User.username == body.username))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        card.assigned_to_id = user.id

    await session.commit()
    await session.refresh(card)

    # Return card with resolved usernames
    created_by_username = None
    if card.created_by_id:
        creator = await session.get(User, card.created_by_id)
        if creator:
            created_by_username = creator.username

    assigned_to_username = None
    if card.assigned_to_id:
        assignee = await session.get(User, card.assigned_to_id)
        if assignee:
            assigned_to_username = assignee.username

    from app.models.board import CardSchema
    return CardSchema(
        id=card.id,
        title=card.title,
        details=card.details or "",
        created_by=created_by_username,
        assigned_to=assigned_to_username,
    )
