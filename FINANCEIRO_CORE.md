# Core Financeiro — MEI Completo

> Módulo principal do produto. Justifica a assinatura mensal ao entregar controle financeiro real para os 15M+ MEIs brasileiros.

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Schema do Banco](#3-schema-do-banco)
4. [API REST](#4-api-rest)
5. [Lógica de Feriados e Dias Úteis](#5-lógica-de-feriados-e-dias-úteis)
6. [Cron Jobs e Alertas](#6-cron-jobs-e-alertas)
7. [Templates de Email](#7-templates-de-email)
8. [Frontend](#8-frontend)
9. [Integração com Módulo de Agenda](#9-integração-com-módulo-de-agenda)
10. [Regras de Negócio](#10-regras-de-negócio)
11. [Variáveis de Ambiente](#11-variáveis-de-ambiente)
12. [TODOs e Pontos de Expansão](#12-todos-e-pontos-de-expansão)

---

## 1. Visão Geral

### Os Três Pilares

| Pilar | Propósito | Dor que resolve |
|-------|-----------|-----------------|
| **Termômetro do Limite Anual** | Mostra quanto do limite de R$ 81.000 foi usado | MEI descobre que foi desenquadrado meses depois, com multa |
| **Controle de DAS** | Rastreia pagamento mensal do imposto | DAS esquecido acumula multa + juros (2% + 0,033%/dia) |
| **Lançamentos** | Controle de receitas e despesas | MEI não sabe se está lucrando ou perdendo |

### Limites Vigentes (2024)

```
Limite anual MEI:          R$ 81.000,00
Sublimite serviços MEI:    R$ 36.000,00 (TODO — ver seção 12)
DAS vencimento:            Dia 20 do mês M+1
```

---

## 2. Arquitetura

### Estrutura de Arquivos

```
api/src/
  routes/
    financeiro.routes.ts          ← CRUD + endpoints de negócio
  services/
    financeiro.pure.ts            ← Funções puras (termômetro, projeção)
    financeiro.service.ts         ← I/O + queries
    financeiro.service.test.ts    ← Testes unitários (Vitest)
  emails/
    financeiro-emails.ts          ← Templates SES
  utils/
    feriados.ts                   ← Algoritmo de Páscoa + feriados
    feriados.test.ts              ← Testes unitários
  jobs/
    financeiro-cron.ts            ← Cron diário 08h SP

frontend/src/
  pages/
    FinanceiroPage.tsx            ← Dashboard principal (3 seções)
  components/
    financeiro/
      Termometro.tsx              ← Barra de progresso animada
      DASCard.tsx                 ← Card do próximo DAS
      LancamentosLista.tsx        ← Lista mensal com totais
      NovoLancamentoModal.tsx     ← Formulário mobile-first
      DASModal.tsx                ← Registrar pagamento DAS

db/migrations/
  058_core_financeiro.sql         ← Schema completo
```

### Padrões Herdados do Módulo de Agenda

- **Separação pure/IO**: `financeiro.pure.ts` contém funções sem I/O, testáveis sem container.
- **Emails fire-and-forget**: `.catch(() => {})` — não bloqueia resposta HTTP.
- **Multi-tenant por `mei_id`**: Toda query filtra por `mei_id = req.user.userId`.
- **Timezone UTC-3 fixo**: Brazil aboliu DST em 2019 — usar `-03:00` literal.
- **Soft delete**: Lançamentos nunca deletados fisicamente (auditoria).
- **Transações manuais**: `BEGIN/COMMIT/ROLLBACK` para operações multi-tabela.

---

## 3. Schema do Banco

### Migration: `db/migrations/058_core_financeiro.sql`

```sql
-- ============================================================
-- 058_core_financeiro.sql
-- Core Financeiro: lançamentos, DAS, alertas, configuração
-- ============================================================

CREATE SCHEMA IF NOT EXISTS financeiro;

-- ------------------------------------------------------------
-- Configuração por MEI (override do limite global)
-- ------------------------------------------------------------
CREATE TABLE financeiro.config (
  mei_id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  limite_anual_cents INTEGER NOT NULL DEFAULT 8100000, -- R$ 81.000,00
  tipo_atividade     TEXT    NOT NULL DEFAULT 'comercio'
                             CHECK (tipo_atividade IN ('comercio', 'servicos', 'ambos')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Limite global default (sobrescreve env var; admin pode ajustar)
CREATE TABLE financeiro.parametros_globais (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO financeiro.parametros_globais (chave, valor)
VALUES ('limite_anual_mei_cents', '8100000')   -- R$ 81.000,00
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Lançamentos de receitas e despesas
-- ------------------------------------------------------------
CREATE TABLE financeiro.lancamentos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  data        DATE        NOT NULL,
  tipo        TEXT        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria   TEXT        NOT NULL,
  descricao   TEXT,
  valor_cents INTEGER     NOT NULL CHECK (valor_cents > 0),
  status      TEXT        NOT NULL DEFAULT 'confirmado'
                          CHECK (status IN ('confirmado', 'pendente')),
  origem      TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (origem IN ('manual', 'agenda')),
  agenda_booking_id UUID, -- FK lógica (sem FK física — agenda em schema separado)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ          -- soft delete
);

-- Índices para queries de soma por ano/mês por tenant
CREATE INDEX idx_lanc_mei_ano
  ON financeiro.lancamentos (mei_id, EXTRACT(YEAR FROM data))
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lanc_mei_mes
  ON financeiro.lancamentos (mei_id, EXTRACT(YEAR FROM data), EXTRACT(MONTH FROM data))
  WHERE deleted_at IS NULL;

CREATE INDEX idx_lanc_mei_tipo_status
  ON financeiro.lancamentos (mei_id, tipo, status)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Pagamentos do DAS
-- ------------------------------------------------------------
CREATE TABLE financeiro.das_pagamentos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  competencia_mes  SMALLINT    NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano  SMALLINT    NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2099),
  valor_cents      INTEGER     NOT NULL CHECK (valor_cents > 0),
  data_pagamento   DATE,       -- NULL = não pago ainda
  comprovante_url  TEXT,       -- S3 presigned URL (após upload)
  comprovante_s3_key TEXT,     -- Chave S3 para regenerar URL
  observacao       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mei_id, competencia_mes, competencia_ano)
);

CREATE INDEX idx_das_mei_ano
  ON financeiro.das_pagamentos (mei_id, competencia_ano);

CREATE INDEX idx_das_nao_pagos
  ON financeiro.das_pagamentos (mei_id, competencia_mes, competencia_ano)
  WHERE data_pagamento IS NULL;

-- ------------------------------------------------------------
-- Controle de alertas enviados (idempotência)
-- ------------------------------------------------------------
CREATE TABLE financeiro.alertas_enviados (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tipo_alerta  TEXT        NOT NULL,
  -- Chave de período: ex "2025-06" para DAS, "2025-75pct" para termômetro
  periodo_ref  TEXT        NOT NULL,
  enviado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mei_id, tipo_alerta, periodo_ref)
);

CREATE INDEX idx_alertas_mei
  ON financeiro.alertas_enviados (mei_id, tipo_alerta);
```

### Categorias Válidas

```typescript
// Definidas no código (não no banco — evita migração a cada mudança)
const CATEGORIAS_RECEITA = [
  'venda_produto',
  'prestacao_servico',
  'outros_receita',
] as const;

const CATEGORIAS_DESPESA = [
  'aluguel',
  'material',
  'transporte',
  'alimentacao',
  'marketing',
  'das',
  'outros_despesa',
] as const;
```

---

## 4. API REST

Todas as rotas exigem `Authorization: Bearer <token>` (middleware `authMiddleware` existente).  
Validação com Zod. Erros retornam `{ error: string }`.

### Prefixo: `/api/financeiro`

#### 4.1 Termômetro

```
GET /api/financeiro/termometro
```

**Response 200:**
```json
{
  "ano": 2025,
  "total_receitas_cents": 4050000,
  "limite_cents": 8100000,
  "percentual_usado": 50.0,
  "valor_restante_cents": 4050000,
  "media_mensal_cents": 675000,
  "meses_ate_limite": 6.0,
  "status": "amarelo"
}
```

**Campos calculados:**
- `percentual_usado`: `(total_receitas / limite) * 100` — 2 casas decimais
- `media_mensal_cents`: soma / meses decorridos no ano (mínimo 1)
- `meses_ate_limite`: `valor_restante / media_mensal` — null se média = 0
- `status`: `verde` (0–49%), `amarelo` (50–74%), `laranja` (75–89%), `vermelho` (90–100%)

Considera apenas `tipo='receita'` e `status='confirmado'` e `deleted_at IS NULL` no ano corrente.

---

#### 4.2 Lançamentos

```
GET    /api/financeiro/lancamentos
POST   /api/financeiro/lancamentos
GET    /api/financeiro/lancamentos/:id
PUT    /api/financeiro/lancamentos/:id
DELETE /api/financeiro/lancamentos/:id
```

**Query params (GET lista):**
| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `mes` | `1–12` | mês atual | Filtro de mês |
| `ano` | `YYYY` | ano atual | Filtro de ano |
| `tipo` | `receita\|despesa` | — | Filtro de tipo |
| `categoria` | string | — | Filtro de categoria |
| `status` | `confirmado\|pendente` | — | Filtro de status |
| `limit` | `1–100` | `50` | Paginação |
| `offset` | `≥0` | `0` | Paginação |

**Response 200 (lista):**
```json
{
  "lancamentos": [
    {
      "id": "uuid",
      "data": "2025-06-15",
      "tipo": "receita",
      "categoria": "prestacao_servico",
      "descricao": "Conserto elétrico",
      "valor_cents": 35000,
      "status": "confirmado",
      "origem": "agenda",
      "created_at": "2025-06-15T12:00:00Z"
    }
  ],
  "total": 12
}
```

**Body (POST/PUT):**
```json
{
  "data": "2025-06-15",
  "tipo": "receita",
  "categoria": "prestacao_servico",
  "descricao": "Conserto elétrico",
  "valor_cents": 35000,
  "status": "confirmado"
}
```

- DELETE faz soft-delete: seta `deleted_at = NOW()`.
- PUT retorna 404 se `deleted_at IS NOT NULL`.

---

#### 4.3 Resumo Mensal

```
GET /api/financeiro/lancamentos/resumo?mes=6&ano=2025
```

**Response 200:**
```json
{
  "mes": 6,
  "ano": 2025,
  "total_receitas_cents": 350000,
  "total_despesas_cents": 120000,
  "saldo_cents": 230000,
  "por_categoria": [
    { "categoria": "prestacao_servico", "tipo": "receita", "total_cents": 350000, "count": 3 },
    { "categoria": "aluguel", "tipo": "despesa", "total_cents": 80000, "count": 1 }
  ]
}
```

---

#### 4.4 Totais do Ano

```
GET /api/financeiro/lancamentos/totais-ano?ano=2025
```

**Response 200:**
```json
{
  "ano": 2025,
  "meses": [
    { "mes": 1, "receitas_cents": 0, "despesas_cents": 0, "saldo_cents": 0 },
    { "mes": 2, "receitas_cents": 680000, "despesas_cents": 120000, "saldo_cents": 560000 },
    ...
  ],
  "total_receitas_cents": 4050000,
  "total_despesas_cents": 890000,
  "saldo_cents": 3160000
}
```

Retorna todos os 12 meses (zerado se sem lançamento). Considera apenas `status='confirmado'` e `deleted_at IS NULL`.

---

#### 4.5 DAS — Pagamentos

```
GET    /api/financeiro/das
POST   /api/financeiro/das
GET    /api/financeiro/das/:id
PUT    /api/financeiro/das/:id
DELETE /api/financeiro/das/:id
```

**Query params (GET lista):**
| Param | Tipo | Default |
|-------|------|---------|
| `ano` | `YYYY` | ano atual |
| `limit` | `1–24` | `12` |

**Body (POST/PUT):**
```json
{
  "competencia_mes": 5,
  "competencia_ano": 2025,
  "valor_cents": 7160,
  "data_pagamento": "2025-06-18",
  "observacao": "Pago via PIX"
}
```

---

#### 4.6 Status por Competência

```
GET /api/financeiro/das/status/:mes/:ano
```

**Response 200:**
```json
{
  "competencia_mes": 5,
  "competencia_ano": 2025,
  "status": "pago",
  "data_vencimento": "2025-06-20",
  "data_pagamento": "2025-06-18",
  "valor_cents": 7160,
  "dias_atraso": 0
}
```

**Valores de `status`:**
- `pago` — `data_pagamento IS NOT NULL`
- `pendente` — não pago E `TODAY <= data_vencimento`
- `vencido` — não pago E `TODAY > data_vencimento`
- `nao_registrado` — sem registro para esta competência

---

#### 4.7 Próximos Vencimentos

```
GET /api/financeiro/das/proximos-vencimentos?meses=3
```

Retorna os próximos N meses com data real de vencimento (respeitando dias úteis).

**Response 200:**
```json
{
  "vencimentos": [
    {
      "competencia_mes": 6,
      "competencia_ano": 2025,
      "data_vencimento": "2025-07-21",
      "status": "pendente",
      "valor_cents": null
    }
  ]
}
```

---

#### 4.8 Upload de Comprovante DAS

```
POST /api/financeiro/das/:id/comprovante-upload-url
```

**Response 200:**
```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "s3_key": "das-comprovantes/{mei_id}/{das_id}/comprovante.pdf",
  "expires_in": 300
}
```

Após upload pelo cliente, chamar `PUT /api/financeiro/das/:id` com `comprovante_url` preenchido.

---

## 5. Lógica de Feriados e Dias Úteis

### Arquivo: `api/src/utils/feriados.ts`

#### Feriados Nacionais Fixos

```typescript
// Formato MM-DD
const FERIADOS_FIXOS = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência do Brasil
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (lei federal desde 2024)
  '12-25', // Natal
];
```

#### Algoritmo de Páscoa (Butcher/Meeus)

```typescript
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 1-indexed
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia); // UTC midnight
}
```

#### Feriados Móveis derivados da Páscoa

```typescript
function feriadosMoveis(ano: number): Date[] {
  const p = pascoa(ano);
  return [
    addDays(p, -47), // Carnaval (segunda-feira)
    addDays(p, -46), // Carnaval (terça-feira)
    addDays(p, -2),  // Sexta-feira Santa
    p,               // Páscoa (domingo — geralmente não afeta DAS, mas inclui)
    addDays(p, 60),  // Corpus Christi
  ];
}
```

#### Funções Exportadas

```typescript
// Verifica se a data não é fim de semana nem feriado nacional
export function isBusinessDay(date: Date): boolean

// Retorna o próximo dia útil a partir de date (inclusive se já for útil)
export function nextBusinessDay(date: Date): Date

// Retorna a data real de vencimento do DAS para uma competência
// DAS vence dia 20 do mês seguinte; se não útil, avança para próximo dia útil
export function dasVencimento(mes: number, ano: number): Date
```

#### Testes (`api/src/utils/feriados.test.ts`)

Cobertura obrigatória:
- Páscoa correta para anos conhecidos (2024: 31 mar; 2025: 20 abr; 2026: 5 abr)
- Feriados móveis derivados corretamente
- `isBusinessDay` para: dia útil normal, sábado, domingo, feriado fixo, feriado móvel
- `nextBusinessDay` para: dia útil (retorna si mesmo), véspera de feriado, final de semana
- `dasVencimento` quando dia 20 cai em: dia útil, sábado, domingo, feriado

---

## 6. Cron Jobs e Alertas

### Arquivo: `api/src/jobs/financeiro-cron.ts`

**Schedule:** todo dia às 08:00 `America/Sao_Paulo`  
**Implementação:** `node-cron` (já disponível como dev dep, verificar; se não, adicionar)

```typescript
// Exemplo de cron expression para 08h SP
// Como o servidor roda em UTC, 08h SP = 11h UTC (sem DST)
cron.schedule('0 11 * * *', runFinanceiroDailyJobs, {
  timezone: 'America/Sao_Paulo',
});
```

### Job A — Alertas de DAS

Verificar, para cada MEI ativo, as competências pendentes próximas de vencer.

**Lógica:**

```
Para cada MEI:
  Para cada competência dos últimos 2 meses e mês atual:
    Calcular data real de vencimento (dasVencimento)
    Se data_pagamento IS NOT NULL → pago, skip
    Se hoje == vencimento - 5 dias úteis (~dia 15):
      chave = "das-aviso-{mes}-{ano}"
      Se NOT existe em alertas_enviados → enviar email + inserir alerta
    Se hoje >= vencimento E não pago:
      chave = "das-vencido-{mes}-{ano}"
      Se NOT existe em alertas_enviados → enviar email + inserir alerta
```

### Job B — Alertas do Termômetro

```
Para cada MEI ativo:
  Calcular total receitas confirmadas no ano corrente
  Calcular percentual = total / limite_anual
  Para cada marco em [50, 75, 90, 100]:
    Se percentual >= marco:
      chave = "termometro-{ano}-{marco}pct"
      Se NOT existe em alertas_enviados → enviar email + inserir alerta
```

### Tipos de Alerta (`tipo_alerta`)

| tipo_alerta | periodo_ref | Quando |
|------------|-------------|--------|
| `das_aviso_vencimento` | `{ano}-{mes:02d}` | ~dia 15, DAS não pago |
| `das_vencido` | `{ano}-{mes:02d}` | dia 20+, DAS não pago |
| `termometro_50pct` | `{ano}` | ao cruzar 50% do limite |
| `termometro_75pct` | `{ano}` | ao cruzar 75% |
| `termometro_90pct` | `{ano}` | ao cruzar 90% |
| `termometro_100pct` | `{ano}` | ao cruzar 100% |

---

## 7. Templates de Email

### Arquivo: `api/src/emails/financeiro-emails.ts`

Segue o padrão de `agenda-emails.ts`: exporta funções que chamam `sesSendEmail`.

#### `sendDasAvisoVencimento(params)`

```
Assunto: ⚠️ DAS de {mes}/{ano} vence em 5 dias — MEI Completo
```
Corpo: data de vencimento real, valor se registrado, link para o app.

#### `sendDasVencido(params)`

```
Assunto: 🚨 DAS de {mes}/{ano} está vencido — MEI Completo
```
Corpo: data de vencimento que passou, multa (2%) + juros (0,033%/dia), link para regularizar.

#### `sendTermometroAlerta(params: { percentual: number, limite_cents: number, total_cents: number })`

```
Assunto: ⚠️ Você usou {percentual}% do seu limite MEI — MEI Completo
```
Corpo: valor usado, restante, projeção em meses, link para o dashboard.  
Cor do subject emoji muda por marco: 50% → ⚠️, 75% → 🟠, 90% → 🔴, 100% → 🚨.

**Tags SES para tracking:**
```typescript
tags: [
  { name: 'modulo', value: 'financeiro' },
  { name: 'tipo_alerta', value: tipo },
  { name: 'mei_id', value: meiId },
]
```

---

## 8. Frontend

### Página Principal: `frontend/src/pages/FinanceiroPage.tsx`

Montada em `/financeiro` (rota protegida). Três seções empilhadas verticalmente.

#### Seção 1 — Termômetro

```
┌─────────────────────────────────────────────┐
│ 💰 Limite Anual MEI                          │
│                                             │
│ R$ 40.500 de R$ 81.000                      │
│ ████████████████░░░░░░░░░░░░░░░░░  50%      │
│                                             │
│ Restam R$ 40.500 | Projeção: 6 meses        │
└─────────────────────────────────────────────┘
```

- Barra animada via `transition-all duration-700` no Tailwind.
- Cores: `bg-green-500` (0–49%), `bg-yellow-500` (50–74%), `bg-orange-500` (75–89%), `bg-red-500` (90–100%).
- Texto percentual com badge colorido igual à barra.
- Projeção: "Você atingirá o limite em ~6 meses" ou "⚠️ Limite ultrapassado!" se ≥ 100%.

#### Seção 2 — DAS

```
┌─────────────────────────────────────────────┐
│ 📄 DAS — Próximo Vencimento                  │
│                                             │
│ Competência: Junho/2025                     │
│ Vencimento:  20/07/2025 (segunda-feira)     │
│ Status:      🟡 Pendente (15 dias)           │
│                                             │
│ [Marcar como Pago]  [Ver histórico]          │
└─────────────────────────────────────────────┘
```

- Status badge: `🟢 Pago`, `🟡 Pendente`, `🔴 Vencido`.
- "Marcar como Pago" abre `DASModal` com campos: valor, data pagamento, upload comprovante.
- Upload de comprovante: `POST /api/financeiro/das/:id/comprovante-upload-url` → PUT para S3 → salva URL.

#### Seção 3 — Lançamentos

```
┌─────────────────────────────────────────────┐
│ Junho 2025  ◀ ▶            [+ Lançamento]   │
│                                             │
│ Receitas: R$ 3.500  Despesas: R$ 1.200      │
│ Saldo: R$ 2.300                             │
│                                             │
│ 15/06  Conserto elétrico    +R$ 350,00  ✅  │
│ 12/06  Aluguel              -R$ 800,00  ✅  │
│ 10/06  Material             -R$ 120,00  ⏳  │
└─────────────────────────────────────────────┘
```

- Navegação mês/ano com `◀ ▶` (sem lib de calendário).
- Ícone `✅` = confirmado, `⏳` = pendente.
- Tap na linha abre edição inline.
- Botão `+` abre `NovoLancamentoModal`.

### Modal de Novo Lançamento (`NovoLancamentoModal.tsx`)

Mobile-first, campos mínimos para submit rápido:

```
Tipo:       [Receita] [Despesa]     ← toggle buttons
Categoria:  <select>                ← categorias filtradas por tipo
Valor:      R$ _______              ← input numérico com formatação
Data:       [hoje]                  ← date picker, default hoje
Descrição:  (opcional)              ← text input
Status:     ● Confirmado ○ Pendente

[Cancelar]              [Salvar]
```

---

## 9. Integração com Módulo de Agenda

O endpoint `POST /api/agenda/bookings/:id/launch-financial` já existe em `agenda.routes.ts` como TODO.

### Implementação

Quando um agendamento é concluído (status → `completed`):

```typescript
// Em agenda.routes.ts — PATCH /api/agenda/bookings/:id/status
// Quando newStatus === 'completed' e booking tem service com price_cents > 0:

const lancamento = await db.query(`
  INSERT INTO financeiro.lancamentos
    (mei_id, data, tipo, categoria, descricao, valor_cents, status, origem, agenda_booking_id)
  VALUES ($1, $2, 'receita', 'prestacao_servico', $3, $4, 'pendente', 'agenda', $5)
  RETURNING id
`, [
  meiId,
  new Date().toISOString().split('T')[0],  // data de hoje SP
  `Agendamento: ${serviceName}`,
  service.price_cents,
  bookingId,
]);

// Retornar financial_launch_id no response do PATCH
```

O lançamento nasce com `status='pendente'` — o MEI confirma quando receber o pagamento.

---

## 10. Regras de Negócio

### Termômetro

| Regra | Detalhe |
|-------|---------|
| Período fiscal | 1 jan a 31 dez do ano corrente |
| Filtro obrigatório | `tipo='receita'` AND `status='confirmado'` AND `deleted_at IS NULL` |
| Limite padrão | R$ 81.000 = 8.100.000 cents |
| Override por MEI | `financeiro.config.limite_anual_cents` tem prioridade |
| Projeção | `valor_restante / (total / meses_decorridos)` — null se 0 receitas |
| Meses decorridos | `EXTRACT(MONTH FROM CURRENT_DATE)` — mínimo 1 |

### DAS

| Regra | Detalhe |
|-------|---------|
| Vencimento base | Dia 20 do mês M+1 |
| Ajuste fim de semana | Avança para segunda-feira |
| Ajuste feriado | Avança para próximo dia útil |
| Status `pendente` | `data_pagamento IS NULL AND CURRENT_DATE <= vencimento` |
| Status `vencido` | `data_pagamento IS NULL AND CURRENT_DATE > vencimento` |
| Aviso antecipado | Cron verifica se `vencimento - CURRENT_DATE <= 5` (dias corridos, não úteis) |
| Idempotência de alertas | Tabela `alertas_enviados` com UNIQUE (mei_id, tipo, periodo_ref) |

### Lançamentos

| Regra | Detalhe |
|-------|---------|
| Soft delete | `deleted_at = NOW()` — nunca DELETE físico |
| Edição | Qualquer campo exceto `origem` e `agenda_booking_id` |
| Validação de categoria | Deve pertencer ao conjunto válido para o `tipo` |
| Valor | Armazenado em **centavos** (INTEGER) — sem arredondamento de ponto flutuante |

---

## 11. Variáveis de Ambiente

Adicionar ao `.env` e `.env.example`:

```bash
# Core Financeiro
FINANCEIRO_FROM_EMAIL=financeiro@meicompleto.com.br
LIMITE_ANUAL_MEI_CENTS=8100000     # R$ 81.000 — override global (sem cadastro no banco)

# S3 para comprovantes DAS
AWS_S3_BUCKET=meicompleto-docs
AWS_S3_REGION=sa-east-1
# Usa as mesmas credenciais AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY
```

---

## 12. TODOs e Pontos de Expansão

```typescript
// TODO(financeiro): Sublimite de serviços
// MEI que presta SOMENTE serviços tem limite adicional de R$ 36.000/ano
// para atividades de serviço. Requer campo `tipo_atividade` em financeiro.config
// e split do cálculo do termômetro por tipo de categoria.
// Referência: Art. 18-A, § 4º, I da LC 123/2006.

// TODO(financeiro): Integração com a Receita Federal
// A Receita disponibiliza consulta de situação cadastral do MEI via CNPJ.
// Endpoint futuro: GET /api/financeiro/situacao-receita
// Biblioteca: scraping do portal do empreendedor ou e-CNPJ.

// TODO(financeiro): Emissão de NFS-e
// Prefeituras brasileiras usam padrões distintos (ABRASF, ISS.net, NF Paulistana).
// Requer integração por município.

// TODO(financeiro): DAS automático via PGFN
// PGFN disponibiliza API para consulta de débitos. Poderia puxar DAS em aberto
// sem o MEI informar manualmente.

// TODO(financeiro): Exportação IR
// MEI deve declarar IR anual. Relatório de receitas/despesas do ano em PDF/CSV.

// TODO(financeiro): Feriados estaduais e municipais
// Afetam o DAS indiretamente apenas se o banco processar em horário específico.
// Por ora, apenas feriados nacionais.

// TODO(financeiro): Múltiplos comprovantes por DAS
// Alguns MEIs pagam DAS parcelado (raro, mas ocorre com parcelamento de dívidas).
```
