import time
from dataclasses import dataclass
from uuid import uuid4
from fastapi import Depends, Header, HTTPException

TOKEN_TTL_SECONDS = 3600  # 1 hour


@dataclass
class SessionData:
    token: str
    user_id: str
    username: str
    expiry: float


_sessions: dict[str, SessionData] = {}  # token → SessionData


def issue_token(user_id: str, username: str) -> str:
    token = str(uuid4())
    _sessions[token] = SessionData(
        token=token,
        user_id=user_id,
        username=username,
        expiry=time.time() + TOKEN_TTL_SECONDS,
    )
    return token


def revoke_token(token: str) -> None:
    _sessions.pop(token, None)


async def require_auth(authorization: str | None = Header(default=None)) -> SessionData:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.removeprefix("Bearer ")
    session = _sessions.get(token)
    if session is None or time.time() > session.expiry:
        _sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Unauthorized")
    return session
