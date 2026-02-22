from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import require_auth
from app.database import get_session
from app.models.board import BoardData, db_to_board, board_to_db

router = APIRouter()


@router.get("/board", response_model=BoardData)
async def get_board(
    _: str = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    return await db_to_board(session)


@router.patch("/board", response_model=BoardData)
async def patch_board(
    body: BoardData,
    _: str = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    await board_to_db(session, body)
    return await db_to_board(session)
