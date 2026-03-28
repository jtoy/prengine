#!/bin/bash
# Auto-restarting worker wrapper.
# Usage: nohup bash run_worker.sh >> /tmp/bugfixvibe/worker.log 2>&1 &

cd "$(dirname "$0")"
source ~/.bash_profile 2>/dev/null  # load asdf shims
eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null  # homebrew PATH (ffmpeg, etc.)
export PATH="$HOME/.asdf/shims:$HOME/.asdf/bin:/opt/homebrew/bin:$PATH"

while true; do
  echo "[$(date)] Starting worker..."
  bundle exec ruby worker.rb
  EXIT_CODE=$?
  echo "[$(date)] Worker exited with code $EXIT_CODE. Restarting in 5s..."
  sleep 5
done
