#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.test.yml"

echo "=========================================================="
echo "  ZIPLI PRO — CI TEST HARNESS (F-040, F-041)"
echo "=========================================================="

USE_DOCKER=false
if docker info >/dev/null 2>&1; then
  USE_DOCKER=true
  echo "==> Docker daemon detected. Spinning up isolated test containers..."
  docker compose -f "${COMPOSE_FILE}" up -d --wait
  
  trap 'echo "==> Tearing down test containers..."; docker compose -f "${COMPOSE_FILE}" down -v' EXIT
  
  export DATABASE_URL="postgresql://zipli_test_user:zipli_test_secure_password_123@127.0.0.1:5433/zipli_test"
  export REDIS_URL="redis://:test_redis_secure_pass_123@127.0.0.1:6380"
  export NODE_ENV="test"
  export JWT_SECRET="zipli_test_environment_jwt_secret_min_32_characters_long"
  
  echo "==> Running migrations on isolated test database..."
  cd "${REPO_ROOT}/backend"
  npm run db:migrate
else
  echo "==> Notice: Docker daemon is not running. Falling back to configured test environment."
  export NODE_ENV="test"
  export JWT_SECRET="zipli_test_environment_jwt_secret_min_32_characters_long"
fi

echo "==> Running full test suite with coverage thresholds..."
cd "${REPO_ROOT}/backend"
npm run test:coverage

echo "=========================================================="
echo "  CI TEST SUITE PASSED SUCCESSFULLY"
echo "=========================================================="
