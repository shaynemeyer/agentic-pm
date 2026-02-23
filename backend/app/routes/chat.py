from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import require_auth
from app.database import get_session
from app.models.board import BoardData, ChatRequest, ChatResponse, board_to_db
from app.ai import call_ai

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def post_chat(
    body: ChatRequest,
    _: str = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    result = call_ai(body.board.model_dump(), body.messages)
    message = result.get("message", "")
    board_update = None
    raw_update = result.get("board_update")
    if raw_update is not None:
        board_update = BoardData.model_validate(raw_update)
        await board_to_db(session, board_update)
    return ChatResponse(message=message, board_update=board_update)
