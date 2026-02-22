from uuid import uuid4
from fastapi import Depends, Header, HTTPException

_valid_tokens: set[str] = set()


def issue_token() -> str:
    token = str(uuid4())
    _valid_tokens.add(token)
    return token


async def require_auth(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.removeprefix("Bearer ")
    if token not in _valid_tokens:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token
