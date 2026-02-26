"""Tests for token expiry and revocation (C1 remediation)."""
import time
import pytest
from app.auth.permissions import issue_token, revoke_token, _sessions

BOARD_ID = "board-1"


def test_issued_token_has_future_expiry():
    token = issue_token("user-1", "user")
    assert token in _sessions
    assert _sessions[token].expiry > time.time()
    revoke_token(token)


def test_revoke_token_removes_it():
    token = issue_token("user-1", "user")
    revoke_token(token)
    assert token not in _sessions


def test_expired_token_rejected(client):
    """An expired token must be rejected with 401."""
    token = issue_token("user-1", "user")
    # Back-date the expiry to the past
    _sessions[token].expiry = time.time() - 1

    resp = client.get(f"/api/boards/{BOARD_ID}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    # Expired entry should have been cleaned up
    assert token not in _sessions


def test_expired_token_cleaned_up_on_check(client):
    """Checking an expired token must remove it from the store."""
    token = issue_token("user-1", "user")
    _sessions[token].expiry = time.time() - 1

    client.get(f"/api/boards/{BOARD_ID}", headers={"Authorization": f"Bearer {token}"})
    assert token not in _sessions
