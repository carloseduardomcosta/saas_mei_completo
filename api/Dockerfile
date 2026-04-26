# Build — context é a raiz do projeto (para copiar db/migrations/)
FROM node:20-alpine AS builder
WORKDIR /app

# Instalar deps da API
COPY api/package*.json ./
RUN npm install

# Compilar TypeScript
COPY api/src ./src
COPY api/tsconfig.json ./
RUN npx tsc --project tsconfig.json

# Copiar migrations para o container
COPY db/migrations /app/db/migrations

# ── Imagem de produção ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -S meicompleto && adduser -S meicompleto -G meicompleto

COPY --from=builder --chown=meicompleto:meicompleto /app/dist          ./dist
COPY --from=builder --chown=meicompleto:meicompleto /app/node_modules  ./node_modules
COPY --from=builder --chown=meicompleto:meicompleto /app/package.json  ./
COPY --from=builder --chown=meicompleto:meicompleto /app/db/migrations ./db/migrations

USER meicompleto
ENV NODE_ENV=production
ENV MIGRATIONS_DIR=/app/db/migrations
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD node -e "require('http').get('http://localhost:4000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Roda migrations e depois sobe o servidor
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
