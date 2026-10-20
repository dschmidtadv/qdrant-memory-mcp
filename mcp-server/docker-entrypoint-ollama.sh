#!/bin/bash
# Ollama Docker Entrypoint with Automatic Model Initialization
# This script ensures the required embedding model is available before
# the service begins accepting requests.

set -e

# Start Ollama in background
/usr/bin/ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready (max 60 seconds)
echo "Waiting for Ollama service to be ready..."
MAX_ATTEMPTS=60
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Ollama service is ready"
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 1
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "ERROR: Ollama service failed to start within 60 seconds"
  kill $OLLAMA_PID 2>/dev/null || true
  exit 1
fi

# Check if the embedding model is already present
echo "Checking for embedding model: nomic-embed-text:latest"
if ! ollama list | grep -q "nomic-embed-text"; then
  echo "Model not found. Pulling nomic-embed-text:latest..."
  ollama pull nomic-embed-text:latest
  if [ $? -eq 0 ]; then
    echo "Successfully pulled nomic-embed-text:latest"
  else
    echo "ERROR: Failed to pull embedding model"
    kill $OLLAMA_PID 2>/dev/null || true
    exit 1
  fi
else
  echo "Model nomic-embed-text:latest is already available"
fi

# Keep Ollama running in foreground
wait $OLLAMA_PID
