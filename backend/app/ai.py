import json
import openai
from app import config

_client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=config.OPENROUTER_API_KEY,
)


def call_ai(board: dict, messages: list[dict]) -> dict:
    system_prompt = (
        "You are an AI assistant helping manage a Kanban board. "
        "The current board state is provided as JSON below.\n\n"
        f"Board: {json.dumps(board)}\n\n"
        "Respond with a JSON object containing:\n"
        '  "message": a string response to the user\n'
        '  "board_update": an updated BoardData object if changes are needed, or null\n'
        "Return only valid JSON."
    )

    openai_messages = [{"role": "system", "content": system_prompt}] + messages

    response = _client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=openai_messages,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    return json.loads(content)
