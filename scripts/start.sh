#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="agentic-pm"
IMAGE_NAME="agentic-pm"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Detect container runtime: prefer CONTAINER_RUNTIME env var, then docker, then podman
if [ -n "${CONTAINER_RUNTIME:-}" ]; then
  RUNTIME="$CONTAINER_RUNTIME"
elif command -v docker &>/dev/null; then
  RUNTIME="docker"
elif command -v podman &>/dev/null; then
  RUNTIME="podman"
else
  echo "Error: neither docker nor podman found in PATH." >&2
  exit 1
fi

echo "Using runtime: $RUNTIME"

# Stop and remove any existing container
if $RUNTIME ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping existing container..."
  $RUNTIME stop "$CONTAINER_NAME" >/dev/null
  $RUNTIME rm "$CONTAINER_NAME" >/dev/null
fi

echo "Building image..."
$RUNTIME build -t "$IMAGE_NAME" "$ROOT_DIR"

ENV_ARGS=()
if [ -f "$ROOT_DIR/.env" ]; then
  ENV_ARGS=(--env-file "$ROOT_DIR/.env")
fi

echo "Starting container..."
$RUNTIME run -d \
  --name "$CONTAINER_NAME" \
  -p 8000:8000 \
  "${ENV_ARGS[@]}" \
  "$IMAGE_NAME"

echo "Running at http://localhost:8000"
