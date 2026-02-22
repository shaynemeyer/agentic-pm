from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth.permissions import issue_token, require_auth, _valid_tokens

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str


@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    if body.username != "user" or body.password != "password":
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(token=issue_token())


@router.post("/auth/logout", status_code=204)
async def logout(token: str = Depends(require_auth)):
    _valid_tokens.discard(token)
    return Response(status_code=204)
