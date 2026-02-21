# Agentic PM

A single-board Kanban app with an AI chat sidebar. Runs locally in Docker.

## Stack

- Frontend: Next.js, React, Tailwind CSS
- Backend: Python FastAPI (serves the static Next.js build)
- Database: SQLite
- AI: OpenRouter (`openai/gpt-oss-120b`)

## Prerequisites

- Docker
- An `OPENROUTER_API_KEY` in a `.env` file at the project root

## Running

```bash
# Start
./scripts/start.sh

# Stop
./scripts/stop.sh
```

The app is served at `http://localhost:8000`. Sign in with `user` / `password`.

## Development

Frontend dev server (no backend):

```bash
cd frontend
bun install
bun run dev
```

See `frontend/CLAUDE.md` for frontend-specific commands and architecture notes.

## Project structure

```
frontend/   Next.js app
backend/    FastAPI app
scripts/    Start/stop scripts
docs/       Planning documents
```
