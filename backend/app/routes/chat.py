from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import require_auth, SessionData
from app.database import get_session
from app.models.board import BoardData, ChatRequest, ChatResponse, board_to_db, BoardMember
from app.ai import call_ai

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def post_chat(
    body: ChatRequest,
    session_data: SessionData = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    # Verify membership
    member = await session.get(BoardMember, (body.board_id, session_data.user_id))
    if member is None:
        raise HTTPException(status_code=403, detail="Not a member of this board")

    result = call_ai(body.board.model_dump(), body.messages)
    message = result.get("message", "")
    board_update = None
    raw_update = result.get("board_update")
    if raw_update is not None:
        board_update = BoardData.model_validate(raw_update)
        await board_to_db(session, body.board_id, board_update, session_data.user_id)
    return ChatResponse(message=message, board_update=board_update)
