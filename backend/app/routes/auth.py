from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import issue_token, require_auth, revoke_token, SessionData
from app.database import get_session
from app.models.board import User

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user_id: str
    username: str


@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None or user.password != body.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = issue_token(user.id, user.username)
    return TokenResponse(token=token, user_id=user.id, username=user.username)


@router.post("/auth/logout", status_code=204)
async def logout(session_data: SessionData = Depends(require_auth)):
    revoke_token(session_data.token)
    return Response(status_code=204)
