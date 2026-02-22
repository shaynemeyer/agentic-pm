# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-board Kanban app with an AI chat sidebar. Runs locally in Docker.
Sign in with `user` / `password`. App served at `http://localhost:8000`.

## Commands

### Container (full stack)

The scripts auto-detect `docker` or `podman`. Override with `CONTAINER_RUNTIME`:

```bash
./scripts/start.sh              # Build and run (auto-detects docker/podman)
./scripts/stop.sh               # Stop the container
CONTAINER_RUNTIME=podman ./scripts/start.sh  # Force podman
```

See `frontend/CLAUDE.md` for frontend commands and `backend/CLAUDE.md` for backend commands.

## Architecture

```text
frontend/   Next.js static export → served by FastAPI at /
backend/    FastAPI — API routes + serves frontend static files
scripts/    start.sh / stop.sh (Docker)
docs/       Planning documents (see docs/PLAN.md)
```

The Next.js app is built as a static export and copied into the Docker image. FastAPI serves those static files at `/` and exposes a REST API under `/api/`. SQLite is created on backend startup if missing. AI calls go through OpenRouter (`OPENROUTER_API_KEY` in `.env`).

## Coding standards

- Keep it simple — no over-engineering, no unnecessary defensive programming
- No extra features beyond what is asked
- Identify root cause before fixing — prove with evidence, then fix
- No emojis, ever
