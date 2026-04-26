#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

echo "==> MEI Completo — Setup"

if [ ! -f "$ENV_FILE" ]; then
  echo "==> Gerando .env a partir de .env.example..."
  cp "$ROOT/.env.example" "$ENV_FILE"

  JWT_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)

  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
    sed -i '' "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" "$ENV_FILE"
  else
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" "$ENV_FILE"
  fi

  echo "    JWT_SECRET e POSTGRES_PASSWORD gerados automaticamente."
  echo "    Edite $ENV_FILE para ajustar outras variáveis (SES, etc.) se necessário."
else
  echo "==> .env já existe — pulando geração."
fi

echo "==> Subindo containers..."
docker compose -f "$ROOT/docker-compose.yml" up -d --build

echo ""
echo "OK! Sistema disponível em:"
echo "  API:      http://localhost:4000/api/health"
echo "  Frontend: http://localhost:3000"
