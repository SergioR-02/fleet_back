#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

# RUN_SEED=false en producción si el seed ya se aplicó
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Seeding database..."
  if node prisma/seed.cjs; then
    echo "Seed completed."
  else
    echo "WARNING: seed failed (continuing)."
  fi
else
  echo "Skipping seed (RUN_SEED=${RUN_SEED})."
fi

echo "Starting FleetExpense API..."
if [ -f dist/main.js ]; then
  exec node dist/main.js
elif [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
else
  echo "ERROR: no se encontró el entrypoint compilado."
  ls -laR dist || true
  exit 1
fi
