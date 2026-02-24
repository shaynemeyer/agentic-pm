"""Tests for AI error handling (C2 remediation)."""
import pytest
from app.ai import call_ai


class _FakeChoice:
    def __init__(self, content):
        self.message = type("_Msg", (), {"content": content})()


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


def test_call_ai_malformed_json_returns_fallback(monkeypatch):
    """call_ai must not raise when the model returns non-JSON content."""

    def _fake_create(**kwargs):
        return _FakeResponse("sorry, I cannot help with that")

    monkeypatch.setattr("app.ai._client.chat.completions.create", _fake_create)
    # Ensure key appears to be set so we don't hit the empty-key early-return
    monkeypatch.setattr("app.ai.config.OPENROUTER_API_KEY", "sk-fake")

    result = call_ai({}, [])

    assert "message" in result
    assert result["board_update"] is None
    assert "error" in result["message"].lower() or "encountered" in result["message"].lower()


def test_call_ai_partial_json_returns_fallback(monkeypatch):
    """call_ai must not raise when the model returns truncated JSON."""

    def _fake_create(**kwargs):
        return _FakeResponse('{"message": "hello", "board_update":')

    monkeypatch.setattr("app.ai._client.chat.completions.create", _fake_create)
    monkeypatch.setattr("app.ai.config.OPENROUTER_API_KEY", "sk-fake")

    result = call_ai({}, [])

    assert result["board_update"] is None


def test_call_ai_missing_key_returns_error_message(monkeypatch):
    """call_ai must return a clear message when the API key is not configured."""
    monkeypatch.setattr("app.ai.config.OPENROUTER_API_KEY", "")

    result = call_ai({}, [])

    assert result["board_update"] is None
    assert "OPENROUTER_API_KEY" in result["message"] or "not configured" in result["message"]


def test_call_ai_valid_response_passed_through(monkeypatch):
    """call_ai must return parsed JSON unchanged when the model responds correctly."""

    def _fake_create(**kwargs):
        return _FakeResponse('{"message": "Done", "board_update": null}')

    monkeypatch.setattr("app.ai._client.chat.completions.create", _fake_create)
    monkeypatch.setattr("app.ai.config.OPENROUTER_API_KEY", "sk-fake")

    result = call_ai({}, [])

    assert result["message"] == "Done"
    assert result["board_update"] is None
