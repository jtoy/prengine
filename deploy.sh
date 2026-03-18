#!/bin/bash
# Auto-deploy: pull latest code on studio, restart worker.
# Called automatically by gp/gpl when this file exists at repo root.

# Run migrations locally (hits remote DB via DATABASE_URL from frontend/.env.local)
echo "[deploy] Running migrations..."
source frontend/.env.local
psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW());" 2>/dev/null
applied=$(psql "$DATABASE_URL" -tAc "SELECT filename FROM schema_migrations;")
for f in migrations/*.sql; do
  name=$(basename "$f")
  if echo "$applied" | grep -qx "$name"; then
    continue
  fi
  echo "  -> $f"
  psql "$DATABASE_URL" -f "$f" 2>&1 | grep -v "already exists"
  psql "$DATABASE_URL" -c "INSERT INTO schema_migrations (filename) VALUES ('$name');" 2>/dev/null
done

ssh studio "bash -lc '
  cd /Users/jtoy/projects/prengine || exit 1
  echo \"[deploy] Pulling latest code...\"
  git clean -fd -e .env worker/
  git pull --ff-only

  cd worker || exit 1
  echo \"[deploy] Installing dependencies...\"
  bundle install --quiet 2>/dev/null

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
