# Stage 1: Build Next.js static export
FROM oven/bun:1 AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN NODE_OPTIONS=--max-old-space-size=1024 bun run build

# Stage 2: Python backend
FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy backend source and install dependencies
COPY backend/ ./backend/
RUN cd backend && uv sync --no-dev

# Copy built frontend static files
COPY --from=frontend-builder /app/frontend/out ./frontend/out

WORKDIR /app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
