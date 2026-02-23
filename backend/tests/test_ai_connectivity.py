import pytest
from app import config
from app.ai import call_ai
from app.models.board import ChatMessage


@pytest.mark.skipif(not config.OPENROUTER_API_KEY, reason="no API key")
def test_ai_responds_to_arithmetic():
    result = call_ai(board={}, messages=[ChatMessage(role="user", content="What is 2+2?")])
    assert "message" in result
    assert "4" in result["message"]
