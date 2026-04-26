# MEI Completo — Guia do Projeto

## Stack
- **API**: Node.js 20 + TypeScript + Express + `express-async-errors` + Zod + JWT
- **DB**: PostgreSQL 16 (pool via `pg`) + migrações SQL em `db/migrations/`
- **Cache/Queue**: Redis 7 (para futuros jobs de lembrete)
- **Frontend**: React 18 + Vite + TailwindCSS + React Router v6
- **Email**: AWS SES via `@aws-sdk/client-ses`
- **Containers**: Docker Compose com healthchecks

## Estrutura
```
meicompleto/
├── api/
│   ├── src/
│   │   ├── db/           # Pool PostgreSQL + migrate runner
│   │   ├── middleware/   # auth (JWT), rateLimiter
│   │   ├── routes/       # health, auth, agenda
│   │   ├── services/     # agenda-slots.pure.ts + .service.ts
│   │   ├── emails/       # templates SES
│   │   ├── integrations/ # ses/client.ts
│   │   └── server.ts
│   └── Dockerfile        # contexto = raiz do projeto
├── frontend/
│   ├── src/
│   │   ├── hooks/        # useAuth (React Context)
│   │   ├── lib/          # api.ts (fetch wrapper)
│   │   ├── components/   # Layout, ProtectedRoute
│   │   └── pages/        # Login, Register, Dashboard, AgendaPage, public/Agendar
│   └── Dockerfile
├── db/migrations/        # 001_users.sql, 002_financeiro_base.sql, 057_agenda_module.sql
├── scripts/setup.sh      # gera .env + sobe containers
└── docker-compose.yml
```

## Convenções críticas

### Timezone Brasil
Brazil aboliu DST em 2019 (Decreto 9.772) — UTC-3 permanente.
```typescript
// Sempre usar offset fixo:
new Date(`${date}T${time}:00-03:00`)
// NUNCA usar Intl ou bibliotecas para converter SP↔UTC em slots
```

### Pure/IO separation (agenda-slots)
- `agenda-slots.pure.ts` — zero imports de DB, testável com Vitest sem Docker
- `agenda-slots.service.ts` — importa pure, adiciona I/O PostgreSQL
- Testes importam APENAS de `.pure.ts`

### Overlap de slots
```typescript
// Conflito: A.start < B.end && A.end > B.start (strict — adjacentes não conflitam)
```

### Rodar testes
```bash
cd api && npx vitest run --config vitest-pure.config.ts
```

### Migração runner
- Executa antes do servidor: `node dist/db/migrate.js && node dist/server.js`
- Rastreia arquivos aplicados em `public.migrations`
- Ordem lexicográfica: `001_`, `002_`, ..., `057_`, etc.

### Autenticação
- JWT com `sub` = userId (UUID), `email` no payload
- `req.user = { userId, email }` após `authMiddleware`
- Token armazenado em `localStorage` no frontend

### Dockerfile API
- Build context = raiz `.` (não `./api`) — necessário para acessar `db/migrations/`
- Ver `docker-compose.yml` → `context: .`

## Rodar localmente
```bash
./scripts/setup.sh
# ou:
cp .env.example .env  # editar variáveis
docker compose up -d --build
```

## Endpoints principais
| Método | Path | Auth |
|--------|------|------|
| GET | /api/health | — |
| POST | /api/auth/register | — |
| POST | /api/auth/login | — |
| GET | /api/auth/me | JWT |
| GET | /api/agenda/public/:slug/profile | — |
| GET | /api/agenda/public/:slug/slots | — |
| POST | /api/agenda/public/:slug/bookings | — |
| GET | /api/agenda/profile | JWT |
| PUT | /api/agenda/profile | JWT |
| GET/POST | /api/agenda/services | JWT |
| PUT/DELETE | /api/agenda/services/:id | JWT |
| GET/PUT | /api/agenda/availability | JWT |
| GET/POST | /api/agenda/blocks | JWT |
| DELETE | /api/agenda/blocks/:id | JWT |
| GET | /api/agenda/bookings/day | JWT |
| PATCH | /api/agenda/bookings/:id/status | JWT |

## Frontend — URL pública de agendamento
`/agendar/:slug` → página sem autenticação, 5 etapas: Serviço → Data → Horário → Formulário → Confirmação
