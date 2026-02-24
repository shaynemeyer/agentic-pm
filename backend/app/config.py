import logging
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./board.db")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

if not OPENROUTER_API_KEY:
    logging.warning("OPENROUTER_API_KEY is not set — AI chat will not function")
