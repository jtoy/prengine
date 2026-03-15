#!/bin/bash
# Auto-deploy: SSH into studio, pull latest worker code, restart worker.
# Called automatically by gp/gpl when this file exists at repo root.

ssh studio "bash -lc '
  cd /Users/jtoy/projects/prengine/worker || exit 1
  echo \"[deploy] Pulling latest code...\"
  git pull --ff-only
  echo \"[deploy] Installing dependencies...\"
  bundle install --quiet

  # Kill existing worker (run_worker.sh loop will auto-restart it)
  PIDS=\$(pgrep -f \"ruby worker.rb\" || true)
  if [ -n \"\$PIDS\" ]; then
    echo \"[deploy] Stopping worker (PIDs: \$PIDS)...\"
    kill \$PIDS
    echo \"[deploy] Worker stopped — run_worker.sh will restart it\"
  else
    echo \"[deploy] No running worker found. Starting...\"
    mkdir -p /tmp/bugfixvibe
    nohup bash run_worker.sh >> /tmp/bugfixvibe/worker.log 2>&1 &
    echo \"[deploy] Worker started (PID: \$!)\"
  fi
  echo \"[deploy] Done!\"
'"
