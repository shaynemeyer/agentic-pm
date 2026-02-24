import time
from uuid import uuid4
from fastapi import Depends, Header, HTTPException

TOKEN_TTL_SECONDS = 3600  # 1 hour

_valid_tokens: dict[str, float] = {}  # token → expiry timestamp


def issue_token() -> str:
    token = str(uuid4())
    _valid_tokens[token] = time.time() + TOKEN_TTL_SECONDS
    return token


def revoke_token(token: str) -> None:
    _valid_tokens.pop(token, None)


async def require_auth(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.removeprefix("Bearer ")
    expiry = _valid_tokens.get(token)
    if expiry is None or time.time() > expiry:
        _valid_tokens.pop(token, None)
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token
