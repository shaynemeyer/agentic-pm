#!/usr/bin/env python3
"""Standalone script to verify OpenRouter connectivity."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.ai import call_ai

def main():
    if not __import__("app.config", fromlist=["config"]).OPENROUTER_API_KEY:
        print("Error: OPENROUTER_API_KEY is not set in .env")
        sys.exit(1)

    try:
        result = call_ai(board={}, messages=[{"role": "user", "content": "What is 2+2?"}])
        print(result.get("message", str(result)))
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
