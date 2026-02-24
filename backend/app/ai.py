import json
import logging
import openai
from app import config
from app.models.board import ChatMessage

logger = logging.getLogger(__name__)

_client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=config.OPENROUTER_API_KEY,
)


def call_ai(board: dict, messages: list[ChatMessage]) -> dict:
    if not config.OPENROUTER_API_KEY:
        logger.error("OPENROUTER_API_KEY is not configured")
        return {
            "message": "AI is not configured. Please set OPENROUTER_API_KEY in your .env file.",
            "board_update": None,
        }

    system_prompt = (
        "You are an AI assistant helping manage a Kanban board. "
        "The current board state is provided as JSON below.\n\n"
        f"Board: {json.dumps(board)}\n\n"
        "Respond with a JSON object containing:\n"
        '  "message": a string response to the user\n'
        '  "board_update": an updated BoardData object if changes are needed, or null\n'
        "Return only valid JSON."
    )

    openai_messages = [{"role": "system", "content": system_prompt}] + [
        {"role": m.role, "content": m.content} for m in messages
    ]

    response = _client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=openai_messages,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("AI response was not valid JSON: %s | raw=%r", exc, content)
        return {
            "message": "I encountered an error processing my response. Please try again.",
            "board_update": None,
        }
