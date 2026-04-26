# Integração do Módulo de Agenda

## 1. Rodar a migration

```bash
psql $DATABASE_URL < db/migrations/057_agenda_module.sql
```

## 2. Registrar rota no server.ts

```typescript
// Adicionar ao server.ts junto com os demais imports:
import { agendaRouter } from "./routes/agenda.routes";

// Adicionar ao app (antes do error handler):
app.use("/api/agenda", agendaRouter);
```

## 3. Variáveis de ambiente

```bash
# .env — apenas se diferente do padrão SES existente
AGENDA_FROM_EMAIL=agenda@seudomain.com.br

# Frontend .env
VITE_API_URL=http://10.0.111.7:4000
VITE_APP_URL=http://10.0.111.7:3000   # ou domínio público
```

## 4. Roteamento público no frontend

### React Router (se usando):
```tsx
// App.tsx
import Agendar from "./pages/public/Agendar";

// Adicionar rota pública:
<Route path="/agendar/:slug" element={<AgendasRoute />} />

// AgendasRoute.tsx
import { useParams } from "react-router-dom";
import Agendar from "./pages/public/Agendar";
export default function AgendasRoute() {
  const { slug } = useParams<{ slug: string }>();
  return <Agendar slug={slug!} />;
}
```

### Rota privada no painel:
```tsx
// Adicionar tab "Agenda" no layout do MEI logado:
<Route path="/agenda" element={<AgendaPage />} />
```

## 5. Cron job para lembretes 24h (opcional — implementar depois)

```typescript
// Adicionar ao cron/scheduler existente:
// Roda 1x por hora, busca agendamentos entre 23h e 25h à frente
import { sendBookingReminder } from "./emails/agenda-emails";
import { query } from "./db";

async function sendReminders() {
  const bookings = await query(`
    SELECT b.id, b.client_name, b.client_email, b.starts_at,
           b.duration_minutes, s.name AS service_name, p.business_name
    FROM agenda.bookings b
    JOIN agenda.services s ON s.id = b.service_id
    JOIN agenda.profiles p ON p.mei_id = b.mei_id
    WHERE b.status = 'confirmed'
      AND b.starts_at BETWEEN NOW() + INTERVAL '23 hours'
                          AND NOW() + INTERVAL '25 hours'
  `);
  for (const b of bookings) {
    await sendBookingReminder({ ...b, startsAt: new Date(b.starts_at) });
  }
}
```

## 6. Estrutura de arquivos entregues

```
db/migrations/
  057_agenda_module.sql          ← schema + índices

api/src/
  routes/agenda.routes.ts        ← ~15 endpoints REST
  services/
    agenda-slots.service.ts      ← algoritmo de slots
    agenda-slots.service.test.ts ← 12 testes unitários
  emails/
    agenda-emails.ts             ← templates SES (cliente + MEI + lembrete)

frontend/src/pages/
  public/Agendar.tsx             ← página pública (5 steps, mobile-first)
  AgendaPage.tsx                 ← dashboard do MEI (4 tabs)
```

## 7. Endpoints completos

### Públicos (sem auth)
| Método | Path | Descrição |
|--------|------|-----------|
| GET | /api/agenda/public/:slug | Perfil + serviços |
| GET | /api/agenda/public/:slug/slots?service_id=&date= | Slots disponíveis |
| POST | /api/agenda/public/:slug/bookings | Criar agendamento |

### Privados (Bearer token)
| Método | Path | Descrição |
|--------|------|-----------|
| GET | /api/agenda/profile | Perfil de agendamento |
| PUT | /api/agenda/profile | Criar/atualizar perfil |
| GET | /api/agenda/services | Listar serviços |
| POST | /api/agenda/services | Criar serviço |
| PUT | /api/agenda/services/:id | Atualizar serviço |
| DELETE | /api/agenda/services/:id | Desativar serviço |
| GET | /api/agenda/availability | Disponibilidade semanal |
| PUT | /api/agenda/availability | Atualizar disponibilidade |
| GET | /api/agenda/blocks | Listar bloqueios futuros |
| POST | /api/agenda/blocks | Criar bloqueio |
| DELETE | /api/agenda/blocks/:id | Remover bloqueio |
| GET | /api/agenda/bookings | Listar agendamentos (filtros) |
| GET | /api/agenda/bookings/day?date= | Agenda de um dia |
| PATCH | /api/agenda/bookings/:id/status | Alterar status |
| POST | /api/agenda/bookings/:id/launch-financial | Lançar no financeiro |
