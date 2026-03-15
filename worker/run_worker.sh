#!/bin/bash
# Auto-restarting worker wrapper.
# Usage: nohup bash run_worker.sh >> /tmp/bugfixvibe/worker.log 2>&1 &

cd "$(dirname "$0")"
source ~/.bashrc 2>/dev/null  # load asdf shims

while true; do
  echo "[$(date)] Starting worker..."
  bundle exec ruby worker.rb
  EXIT_CODE=$?
  echo "[$(date)] Worker exited with code $EXIT_CODE. Restarting in 5s..."
  sleep 5
done
