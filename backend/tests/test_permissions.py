"""Tests for token expiry and revocation (C1 remediation)."""
import time
import pytest
from app.auth.permissions import issue_token, revoke_token, _valid_tokens


def test_issued_token_has_future_expiry():
    token = issue_token()
    assert token in _valid_tokens
    assert _valid_tokens[token] > time.time()
    revoke_token(token)


def test_revoke_token_removes_it():
    token = issue_token()
    revoke_token(token)
    assert token not in _valid_tokens


def test_expired_token_rejected(client):
    """An expired token must be rejected with 401."""
    token = issue_token()
    # Back-date the expiry to the past
    _valid_tokens[token] = time.time() - 1

    resp = client.get("/api/board", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    # Expired entry should have been cleaned up
    assert token not in _valid_tokens


def test_expired_token_cleaned_up_on_check(client):
    """Checking an expired token must remove it from the store."""
    token = issue_token()
    _valid_tokens[token] = time.time() - 1

    client.get("/api/board", headers={"Authorization": f"Bearer {token}"})
    assert token not in _valid_tokens
