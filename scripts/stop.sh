#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="agentic-pm"

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

if $RUNTIME ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping container..."
  $RUNTIME stop "$CONTAINER_NAME" >/dev/null
  $RUNTIME rm "$CONTAINER_NAME" >/dev/null
  echo "Stopped."
else
  echo "No running container named '${CONTAINER_NAME}'."
fi
