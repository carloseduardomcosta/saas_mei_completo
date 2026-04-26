# Backlog — Core Financeiro MEI Completo

> Prioridade: P0 = bloqueador de lançamento · P1 = MVP · P2 = melhoria pós-lançamento  
> Tamanho: XS (<2h) · S (2–4h) · M (4–8h) · L (1–2d) · XL (2–5d)

---

## Epic 1 — Infraestrutura e Schema

### FINF-001 · Migration 058_core_financeiro.sql · P0 · S · ✅ CONCLUÍDO

**Descrição**  
Criar o arquivo `db/migrations/058_core_financeiro.sql` com o schema completo do módulo financeiro.

**Tabelas a criar:**
- `financeiro.config` — limite por MEI, tipo de atividade
- `financeiro.parametros_globais` — limite global default
- `financeiro.lancamentos` — receitas e despesas (soft delete)
- `financeiro.das_pagamentos` — controle de DAS com comprovante
- `financeiro.alertas_enviados` — idempotência de alertas

**Critérios de aceitação:**
- [x] Todos os índices de performance criados (por ano, mês, tipo, status)
- [x] Constraints CHECK validam tipos e categorias no nível do banco
- [x] UNIQUE (mei_id, competencia_mes, competencia_ano) em das_pagamentos
- [x] UNIQUE (mei_id, tipo_alerta, periodo_ref) em alertas_enviados
- [x] Migration roda sem erro em banco vazio e em banco com migration 057

---

### FINF-002 · Inicializar config padrão por MEI · P0 · XS · ✅ CONCLUÍDO

**Descrição**  
Criar `financeiro.config` default (limite = R$ 81.000, tipo = 'comercio') ao registrar novo usuário.

**Onde:** `api/src/routes/auth.routes.ts` — após INSERT em `public.users`.

**Critérios de aceitação:**
- [x] Novo registro cria linha em `financeiro.config` na mesma transação
- [x] Se INSERT falhar, rollback impede usuário órfão sem config

---

## Epic 2 — Lógica de Feriados e Dias Úteis

### FINF-010 · utils/feriados.ts · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar `api/src/utils/feriados.ts` com lógica de feriados brasileiros e cálculo de vencimento do DAS.

**Funções a implementar:**
```typescript
export function pascoa(ano: number): Date
export function feriadosNacionais(ano: number): Date[]
export function isBusinessDay(date: Date): boolean
export function nextBusinessDay(date: Date): Date
export function dasVencimento(mes: number, ano: number): Date
```

**Feriados fixos (9):** 01-01, 04-21, 05-01, 09-07, 10-12, 11-02, 11-15, 11-20, 12-25  
**Feriados móveis (5):** Carnaval (2d), Sexta-Santa, Páscoa, Corpus Christi  
**Algoritmo:** Butcher/Meeus (sem dependências externas)

**Critérios de aceitação:**
- [x] Implementado sem imports externos (zero deps)
- [x] Funciona para anos 2024–2035 sem ajuste manual
- [x] `dasVencimento(5, 2025)` retorna `2025-06-20` (sexta-feira útil)
- [x] `dasVencimento(1, 2026)` retorna data ajustada se dia 20 cair em FDS/feriado

**Nota:** Carnaval segunda = Páscoa - 48 (não -47 como documentado). Backlog corrigido aqui; FINANCEIRO_CORE.md mantém a lógica correta.

---

### FINF-011 · Testes de feriados.test.ts · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Cobertura de testes unitários para `utils/feriados.ts` usando Vitest.

**Casos de teste obrigatórios:**

| Caso | Input | Expected |
|------|-------|----------|
| Páscoa 2024 | `pascoa(2024)` | 31 março 2024 |
| Páscoa 2025 | `pascoa(2025)` | 20 abril 2025 |
| Páscoa 2026 | `pascoa(2026)` | 5 abril 2026 |
| Sexta Santa 2025 | `feriadosNacionais(2025)` | contém 18/04/2025 |
| Carnaval 2026 | `feriadosNacionais(2026)` | contém 16/02/2026 e 17/02/2026 |
| Dia útil normal | `isBusinessDay(2025-06-16)` | `true` (segunda) |
| Sábado | `isBusinessDay(2025-06-14)` | `false` |
| Domingo | `isBusinessDay(2025-06-15)` | `false` |
| Feriado fixo | `isBusinessDay(2025-12-25)` | `false` |
| Feriado móvel | `isBusinessDay(2025-04-18)` | `false` (Sexta Santa) |
| nextBusinessDay(sexta) | `nextBusinessDay(2025-04-18)` | `2025-04-22` (pula Sexta+FDS) |
| DAS em dia útil | `dasVencimento(5, 2025)` | `2025-06-20` |
| DAS em sábado | verificar competência onde dia 20 = sábado | dia 22 (segunda) |

**Critérios de aceitação:**
- [x] `vitest run` passa todos os testes sem container Docker (30 testes, todos verdes)
- [x] Cobertura ≥ 90% para `feriados.ts`

---

## Epic 3 — API: Lançamentos

### FINF-020 · CRUD de Lançamentos · P0 · L · ✅ CONCLUÍDO

**Descrição**  
Implementar `api/src/routes/financeiro.routes.ts` com CRUD completo de lançamentos.

**Endpoints:**
- `GET /api/financeiro/lancamentos` — lista com filtros e paginação
- `POST /api/financeiro/lancamentos` — criar
- `GET /api/financeiro/lancamentos/:id` — detalhe
- `PUT /api/financeiro/lancamentos/:id` — atualizar
- `DELETE /api/financeiro/lancamentos/:id` — soft delete

**Validação Zod:**
```typescript
const LancamentoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(['receita', 'despesa']),
  categoria: z.string().min(1),
  descricao: z.string().max(500).optional(),
  valor_cents: z.number().int().positive(),
  status: z.enum(['confirmado', 'pendente']).default('confirmado'),
});
```

**Query params com Zod:**
```typescript
const FiltrosSchema = z.object({
  mes: z.coerce.number().min(1).max(12).optional(),
  ano: z.coerce.number().min(2020).max(2099).optional(),
  tipo: z.enum(['receita', 'despesa']).optional(),
  categoria: z.string().optional(),
  status: z.enum(['confirmado', 'pendente']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});
```

**Critérios de aceitação:**
- [x] Todas as rotas autenticadas com `authMiddleware`
- [x] Multi-tenant: todo query inclui `WHERE mei_id = req.user.userId`
- [x] Soft delete seta `deleted_at`, GET exclui `deleted_at IS NOT NULL`
- [x] `categoria` validada contra lista permitida por tipo
- [x] Response com paginação: `{ lancamentos: [], total: N }`

---

### FINF-021 · Resumo Mensal · P0 · S · ✅ CONCLUÍDO

**Descrição**  
Rota `GET /api/financeiro/lancamentos/resumo` que agrega totais por mês.

**SQL base:**
```sql
SELECT
  tipo,
  categoria,
  COUNT(*) as count,
  SUM(valor_cents) as total_cents
FROM financeiro.lancamentos
WHERE mei_id = $1
  AND EXTRACT(YEAR FROM data) = $2
  AND EXTRACT(MONTH FROM data) = $3
  AND deleted_at IS NULL
  AND status = 'confirmado'
GROUP BY tipo, categoria
ORDER BY tipo, total_cents DESC
```

**Critérios de aceitação:**
- [x] Retorna `total_receitas_cents`, `total_despesas_cents`, `saldo_cents`
- [x] Retorna breakdown por categoria em `por_categoria`
- [x] Default: mês e ano atuais se não informado

---

### FINF-022 · Totais do Ano (gráfico) · P1 · S

**Descrição**  
Rota `GET /api/financeiro/lancamentos/totais-ano` que retorna os 12 meses para gráfico.

**Critérios de aceitação:**
- [ ] Sempre retorna array com 12 elementos (meses sem lançamento retornam zeros)
- [ ] Considera apenas `status='confirmado'` e `deleted_at IS NULL`
- [ ] Performance: query única com `GROUP BY EXTRACT(MONTH FROM data)`

---

## Epic 4 — API: Termômetro

### FINF-030 · Serviço do Termômetro (pure) · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar `api/src/services/financeiro.pure.ts` com funções de cálculo do termômetro.

**Funções:**
```typescript
export interface TermometroInput {
  totalReceitasCents: number;
  limiteCents: number;
  mesAtual: number; // 1–12
}

export interface TermometroResult {
  percentualUsado: number;      // 2 decimais
  valorRestanteCents: number;
  mediaMensalCents: number;
  mesesAteLimite: number | null; // null se mediaMonsal = 0
  status: 'verde' | 'amarelo' | 'laranja' | 'vermelho';
}

export function calcularTermometro(input: TermometroInput): TermometroResult
export function termometroStatus(percentual: number): TermometroResult['status']
```

**Critérios de aceitação:**
- [x] Funções puras sem imports de DB/external
- [x] `termometroStatus(49.9)` → `'verde'`, `(50)` → `'amarelo'`, `(75)` → `'laranja'`, `(90)` → `'vermelho'`
- [x] `mesesAteLimite` = null quando `totalReceitasCents = 0`
- [x] Testes unitários com `vitest` (sem container)

---

### FINF-031 · Endpoint GET /financeiro/termometro · P0 · S · ✅ CONCLUÍDO

**Descrição**  
Implementar rota `GET /api/financeiro/termometro` que lê do banco e usa `calcularTermometro`.

**SQL:**
```sql
SELECT COALESCE(SUM(valor_cents), 0) as total
FROM financeiro.lancamentos
WHERE mei_id = $1
  AND tipo = 'receita'
  AND status = 'confirmado'
  AND deleted_at IS NULL
  AND EXTRACT(YEAR FROM data) = EXTRACT(YEAR FROM CURRENT_DATE)
```

**Critérios de aceitação:**
- [x] Lê limite de `financeiro.config` do MEI (fallback: parametros_globais)
- [x] Usa `calcularTermometro` da camada pure
- [x] Retorna campos conforme spec da documentação
- [x] Cache opcional: pode ser calculado em tempo real (query simples)

---

## Epic 5 — API: DAS

### FINF-040 · CRUD de DAS · P0 · L · ✅ CONCLUÍDO

**Descrição**  
Implementar endpoints de DAS em `financeiro.routes.ts`.

**Endpoints:**
- `GET /api/financeiro/das?ano=2025` — histórico do ano
- `POST /api/financeiro/das` — registrar DAS
- `GET /api/financeiro/das/:id` — detalhe
- `PUT /api/financeiro/das/:id` — atualizar
- `DELETE /api/financeiro/das/:id` — remover registro

**Validação Zod:**
```typescript
const DASSchema = z.object({
  competencia_mes: z.number().int().min(1).max(12),
  competencia_ano: z.number().int().min(2020).max(2099),
  valor_cents: z.number().int().positive(),
  data_pagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  observacao: z.string().max(500).optional(),
});
```

**Critérios de aceitação:**
- [x] UNIQUE constraint no banco impede duplicata; API retorna 409 com mensagem clara
- [x] Multi-tenant seguro
- [x] `data_pagamento` aceita null (DAS registrado mas não pago)

---

### FINF-041 · Status por competência · P0 · S · ✅ CONCLUÍDO

**Descrição**  
`GET /api/financeiro/das/status/:mes/:ano` — status calculado para uma competência.

**Lógica:**
1. Buscar `das_pagamentos` para (mei_id, mes, ano)
2. Calcular `data_vencimento = dasVencimento(mes, ano)` via `utils/feriados.ts`
3. Calcular `status`: pago / pendente / vencido / nao_registrado
4. Calcular `dias_atraso` se vencido

**Critérios de aceitação:**
- [x] Usa `dasVencimento()` importado de `utils/feriados.ts`
- [x] `dias_atraso` = número de dias corridos após o vencimento (0 se não vencido)
- [x] `status = 'nao_registrado'` se não há linha no banco para essa competência

---

### FINF-042 · Próximos vencimentos · P1 · S

**Descrição**  
`GET /api/financeiro/das/proximos-vencimentos?meses=3` — lista de vencimentos futuros.

**Lógica:**
- Gerar lista dos próximos N meses a partir do mês corrente
- Para cada mês: calcular `dasVencimento()`, buscar `das_pagamentos` se existe
- Retornar status de cada competência futura

**Critérios de aceitação:**
- [ ] `meses` máximo = 12, default = 3
- [ ] Ordenado por data de vencimento ASC
- [ ] Inclui competências já pagas (para histórico recente)

---

### FINF-043 · Upload de comprovante DAS via S3 · P1 · M

**Descrição**  
`POST /api/financeiro/das/:id/comprovante-upload-url` — gera presigned URL para upload.

**Fluxo:**
1. API valida que `das_pagamento.mei_id == req.user.userId`
2. Gera S3 key: `das-comprovantes/{meiId}/{dasId}/{timestamp}.{ext}`
3. Cria presigned `PutObjectCommand` (expiração: 5 min)
4. Retorna `{ upload_url, s3_key, expires_in: 300 }`
5. Frontend faz PUT direto ao S3
6. Frontend chama `PUT /api/financeiro/das/:id` com `comprovante_s3_key`
7. API gera URL permanente ou presigned GET para visualização

**Critérios de aceitação:**
- [ ] Usar `@aws-sdk/s3-request-presigner` (verificar deps; adicionar se necessário)
- [ ] Aceitar apenas `.pdf`, `.jpg`, `.jpeg`, `.png` (validar Content-Type)
- [ ] S3 key inclui mei_id para isolamento de tenant
- [ ] Presigned URL de download regenerado a cada `GET /api/financeiro/das/:id`

---

## Epic 6 — Cron Jobs e Alertas

### FINF-050 · Infraestrutura de cron (node-cron) · P0 · S · ✅ CONCLUÍDO

**Descrição**  
Configurar `node-cron` (ou `node-schedule`) no servidor Express para disparar jobs.

**Arquivo:** `api/src/jobs/financeiro-cron.ts`

```typescript
import cron from 'node-cron';
import { runFinanceiroDailyJobs } from './financeiro-jobs';

export function initFinanceiroJobs() {
  // 08h00 America/Sao_Paulo = 11h00 UTC (sem DST)
  cron.schedule('0 11 * * *', runFinanceiroDailyJobs, {
    timezone: 'America/Sao_Paulo',
  });
}
```

Chamar `initFinanceiroJobs()` em `server.ts`.

**Critérios de aceitação:**
- [x] `node-cron` adicionado a `package.json` e `@types/node-cron` em devDeps
- [x] Job registrado no startup do servidor
- [x] Log estruturado (winston) no início e fim de cada execução do job
- [x] Erros no job não derrubam o servidor (try/catch global no job)

---

### FINF-051 · Job de alertas DAS · P0 · L · ✅ CONCLUÍDO

**Descrição**  
Implementar verificação diária de DAS a vencer ou vencido.

**Lógica detalhada:**
```
Para cada MEI ativo em public.users:
  Calcular competências relevantes: mês atual + 2 meses anteriores
  Para cada competência:
    vencimento = dasVencimento(mes, ano)
    das = SELECT FROM das_pagamentos WHERE mei_id AND mes AND ano
    
    Se das.data_pagamento IS NOT NULL: SKIP (pago)
    
    Se CURRENT_DATE BETWEEN vencimento - 5 dias AND vencimento:
      periodo = "{ano}-{mes:02d}"
      tipo = "das_aviso_vencimento"
      Se NOT existe em alertas_enviados (mei_id, tipo, periodo):
        sendDasAvisoVencimento(meiEmail, competencia, vencimento, das.valor_cents)
        INSERT alertas_enviados
    
    Se CURRENT_DATE > vencimento:
      periodo = "{ano}-{mes:02d}"
      tipo = "das_vencido"
      Se NOT existe em alertas_enviados (mei_id, tipo, periodo):
        sendDasVencido(meiEmail, competencia, vencimento, diasAtraso)
        INSERT alertas_enviados
```

**Critérios de aceitação:**
- [x] Usa `dasVencimento()` de `utils/feriados.ts`
- [x] Não reenvia alerta na mesma competência (idempotência via UNIQUE)
- [x] Log de quantos alertas enviados por execução
- [x] Falha de email de um MEI não para o processamento dos outros (try/catch por MEI)
- [x] Não envia alertas para MEIs sem email verificado (campo futuro; hoje: todos)

---

### FINF-052 · Job de alertas do Termômetro · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar verificação diária de marcos do limite anual.

**Lógica:**
```
Para cada MEI ativo:
  total = SUM(valor_cents) WHERE tipo='receita' AND status='confirmado' E ano corrente
  limite = financeiro.config.limite_anual_cents (fallback: parametros_globais)
  percentual = total / limite * 100
  
  Para marco em [50, 75, 90, 100]:
    Se percentual >= marco:
      tipo = "termometro_{marco}pct"
      periodo = "{ano}"
      Se NOT existe em alertas_enviados:
        sendTermometroAlerta(email, percentual, marco, total, limite, projecao)
        INSERT alertas_enviados
```

**Critérios de aceitação:**
- [x] Todos os 4 marcos verificados independentemente
- [x] MEI recebe os alertas de marcos inferiores mesmo que já tenha passado do superior
  - Ex: se cruzar direto de 40% para 78%, envia alerta de 50% E de 75%
- [x] Idempotência: mesmos critérios da FINF-051

---

### FINF-053 · Templates de email financeiro · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar `api/src/emails/financeiro-emails.ts` seguindo padrão de `agenda-emails.ts`.

**Funções a implementar:**
1. `sendDasAvisoVencimento(params)` — aviso 5 dias antes
2. `sendDasVencido(params)` — DAS vencido (inclui cálculo de multa)
3. `sendTermometroAlerta(params)` — marco do limite anual

**Multa e juros do DAS vencido:**
```typescript
// Multa: 2% flat sobre o valor
// Juros: 0,033% por dia de atraso
const multa = valor * 0.02;
const juros = valor * 0.00033 * diasAtraso;
const totalEstimado = valor + multa + juros;
```
Nota: incluir disclaimer "valor estimado — consulte o DAS atualizado no Portal do Empreendedor".

**Critérios de aceitação:**
- [x] HTML responsivo (mesmo padrão dos emails de agenda)
- [x] Tags SES: `modulo=financeiro`, `tipo_alerta={tipo}`, `mei_id={id}`
- [x] Fire-and-forget: `.catch(() => {})` não bloqueia o cron job
- [x] Texto alternativo (plain text) para clientes de email sem HTML

---

## Epic 7 — Frontend

### FINF-060 · Adicionar rota /financeiro · P0 · XS · ✅ CONCLUÍDO

**Descrição**  
Adicionar `/financeiro` ao router em `frontend/src/App.tsx` como rota protegida.

```tsx
<Route path="/financeiro" element={
  <ProtectedRoute><FinanceiroPage /></ProtectedRoute>
} />
```

Adicionar link na navegação principal em `Layout.tsx`.

**Critérios de aceitação:**
- [x] Redireciona para `/login` se não autenticado
- [x] Link ativo no menu lateral/topo (já estava no Layout.tsx)

---

### FINF-061 · Componente Termômetro · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar `frontend/src/components/financeiro/Termometro.tsx`.

**Props:**
```typescript
interface TermometroProps {
  percentualUsado: number;
  totalCents: number;
  limiteCents: number;
  valorRestanteCents: number;
  mediaMensalCents: number;
  mesesAteLimite: number | null;
  status: 'verde' | 'amarelo' | 'laranja' | 'vermelho';
  isLoading?: boolean;
}
```

**Especificações visuais:**
- Barra de progresso com `transition-all duration-700 ease-out`
- Cores: `bg-green-500` (verde), `bg-yellow-500` (amarelo), `bg-orange-500` (laranja), `bg-red-600` (vermelho)
- Fundo da barra: `bg-gray-200`
- Badge percentual: cor semântica igual à barra
- Texto "Restam R$ X.XXX" em cinza
- Projeção: "Você atingirá o limite em ~N meses" / "⚠️ Limite ultrapassado!"
- Skeleton loader quando `isLoading`

**Critérios de aceitação:**
- [x] Animação da barra ao montar o componente
- [x] Números formatados como BRL: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- [x] Responsivo: funciona em 320px (mobile mínimo)
- [x] Acessível: `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

---

### FINF-062 · Componente DASCard · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar `frontend/src/components/financeiro/DASCard.tsx`.

**Estado exibido:**
- Competência atual e próxima
- Data real de vencimento
- Dias restantes / dias de atraso
- Badge de status colorido
- Botão "Marcar como Pago" (abre DASModal)
- Link "Ver histórico"

**Critérios de aceitação:**
- [x] Status `pago` → badge verde, sem botão de pagamento
- [x] Status `pendente` com ≤ 5 dias → badge amarelo + urgência visual
- [x] Status `vencido` → badge vermelho + texto "X dias em atraso"
- [x] Skeleton loader no carregamento inicial

---

### FINF-063 · Modal de Pagamento DAS · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar `frontend/src/components/financeiro/DASModal.tsx`.

**Campos:**
- Competência (read-only se aberto do card)
- Valor pago (R$ ____)
- Data de pagamento (date input, default hoje)
- Upload comprovante (PDF/JPG/PNG, opcional)
- Observação (textarea, opcional)

**Fluxo de upload:**
1. Usuário seleciona arquivo
2. Frontend: `POST /api/financeiro/das/:id/comprovante-upload-url`
3. Frontend: PUT diretamente no S3 via presigned URL
4. Frontend: `PUT /api/financeiro/das/:id` com `comprovante_s3_key`

**Critérios de aceitação:**
- [x] Validação inline: valor obrigatório > 0, data obrigatória
- [x] Upload com progress indicator (% enviado)
- [x] Erro de upload não bloqueia salvar o pagamento (comprovante é opcional)
- [x] Fecha e atualiza card ao salvar com sucesso

---

### FINF-064 · Lista de Lançamentos · P0 · L · ✅ CONCLUÍDO

**Descrição**  
Implementar `frontend/src/components/financeiro/LancamentosLista.tsx`.

**Features:**
- Navegação mês/ano com `◀ ▶` (sem lib de calendário)
- Totais do mês: receitas, despesas, saldo
- Lista de lançamentos do mês com ícone de tipo e status
- Tap em um lançamento abre edição inline (modal)
- Skeleton loader no primeiro fetch

**Critérios de aceitação:**
- [x] Navegar para mês anterior/próximo carrega novos dados
- [x] Valores formatados em BRL
- [x] Receitas em verde, despesas em vermelho
- [x] Saldo positivo = verde, negativo = vermelho
- [x] Lançamentos de `origem='agenda'` mostram badge "Agenda"
- [x] Paginação: botão "Carregar mais" se `total > lancamentos.length`

---

### FINF-065 · Modal de Novo Lançamento · P0 · L · ✅ CONCLUÍDO

**Descrição**  
Implementar `frontend/src/components/financeiro/NovoLancamentoModal.tsx`.

**UX mobile-first:**
- Toggle Receita/Despesa no topo (estilo pill/segmented control)
- Select de categoria filtrado por tipo selecionado
- Input de valor com formatação automática (ex: `350` → `R$ 3,50` → `R$ 350,00`)
- Date input (default: hoje)
- Campo descrição opcional (não obrigatório para submit rápido)
- Toggle Confirmado/Pendente

**Critérios de aceitação:**
- [x] Formulário válido com apenas tipo + categoria + valor + data
- [x] Submit com Enter no campo valor
- [x] Após salvar: fecha modal, atualiza lista
- [x] Modo edição: preenche campos com dados do lançamento existente
- [x] Botão "Excluir" aparece apenas no modo edição (soft delete)

---

### FINF-066 · Dashboard Principal FinanceiroPage · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Implementar `frontend/src/pages/FinanceiroPage.tsx` que compõe as três seções.

**Layout:**
```
<FinanceiroPage>
  <Termometro />           ← Pilar 1
  <DASCard />              ← Pilar 2
  <LancamentosLista />     ← Pilar 3
  <FAB onClick={abrirNovoLancamento} />   ← botão + flutuante mobile
</FinanceiroPage>
```

**Data fetching:**
- `GET /api/financeiro/termometro`
- `GET /api/financeiro/das/proximos-vencimentos?meses=1`
- `GET /api/financeiro/lancamentos?mes=X&ano=Y`

**Critérios de aceitação:**
- [x] Três fetches em paralelo (`Promise.all`) — não aguardar um para iniciar o outro
- [x] Cada seção tem skeleton independente (não bloqueia renderização das outras)
- [x] FAB (Floating Action Button) posicionado em `bottom-6 right-6` mobile
- [ ] Pull-to-refresh em mobile (não implementado — P2)
- [x] Título da página e meta title: "Financeiro — MEI Completo"

---

## Epic 8 — Integração Agenda → Financeiro

### FINF-070 · Lançamento automático ao concluir agendamento · P1 · M

**Descrição**  
Implementar o TODO em `agenda.routes.ts`: ao marcar agendamento como `completed`, criar lançamento de receita pré-preenchido.

**Localização:** `PATCH /api/agenda/bookings/:id/status` quando `status = 'completed'`

**Lançamento criado:**
```typescript
{
  mei_id: booking.mei_id,
  data: hoje em SP (YYYY-MM-DD),
  tipo: 'receita',
  categoria: 'prestacao_servico',
  descricao: `Agendamento: ${service.name}`,
  valor_cents: service.price_cents,
  status: 'pendente',  // MEI confirma ao receber pagamento
  origem: 'agenda',
  agenda_booking_id: booking.id,
}
```

**Critérios de aceitação:**
- [ ] Só cria lançamento se `service.price_cents > 0`
- [ ] Se INSERT em `financeiro.lancamentos` falhar, PATCH do status ainda funciona (fire-and-forget)
- [ ] `financial_launch_id` no response do PATCH aponta para o novo lançamento
- [ ] Lançamento aparece na lista com badge "Agenda" no frontend

---

### FINF-071 · Detalhe do lançamento mostra link para agendamento · P2 · XS

**Descrição**  
No modal de edição de lançamento, quando `origem='agenda'`, mostrar link "Ver agendamento" que navega para `/agenda` com o booking destacado.

**Critérios de aceitação:**
- [ ] Link visível apenas para `origem='agenda'`
- [ ] Abre `/agenda?booking={id}` ou navega para tab de agenda

---

## Epic 9 — Configuração e Limites

### FINF-080 · Endpoint de configuração do MEI · P1 · S

**Descrição**  
`GET` e `PUT` para `financeiro.config` do MEI (tipo de atividade, limite customizado).

```
GET /api/financeiro/config
PUT /api/financeiro/config
```

**Body PUT:**
```json
{
  "tipo_atividade": "servicos",
  "limite_anual_cents": 8100000
}
```

**Critérios de aceitação:**
- [ ] `tipo_atividade` aceita: `comercio`, `servicos`, `ambos`
- [ ] `limite_anual_cents` mínimo: 1 (permite override manual)
- [ ] GET retorna config do MEI ou defaults globais se não cadastrado

---

## Epic 10 — Qualidade e Observabilidade

### FINF-090 · Testes do serviço financeiro (pure) · P0 · M · ✅ CONCLUÍDO

**Descrição**  
Testes unitários para `financeiro.pure.ts` com Vitest.

**Casos obrigatórios:**
- `calcularTermometro` com 0 receitas, 50%, 100%, >100%
- `termometroStatus` para cada faixa
- Projeção: com média > 0, com média = 0 (null)
- Meses decorridos: janeiro (1), dezembro (12)

**Critérios de aceitação:**
- [x] Todos passam em `vitest run` sem Docker (22 testes, todos verdes)
- [x] Cobertura ≥ 90% para `financeiro.pure.ts`

---

### FINF-091 · Logs estruturados no módulo financeiro · P1 · XS

**Descrição**  
Garantir que todas as rotas e jobs usam `logger` (winston) com contexto estruturado.

**Campos mínimos por log:**
```typescript
logger.info('financeiro.lancamentos.created', {
  meiId, lancamentoId, tipo, valorCents, categoria
});
logger.error('financeiro.cron.das_alerta.failed', {
  meiId, error: err.message
});
```

**Critérios de aceitação:**
- [ ] Rotas logam criação, edição e soft delete
- [ ] Cron loga início, fim e contagem de alertas enviados
- [ ] Erros logados com `logger.error` (não `console.error`)

---

### FINF-092 · Registrar financeiro.routes.ts no server.ts · P0 · XS · ✅ CONCLUÍDO

**Descrição**  
Importar e montar o router do módulo financeiro no Express.

**Em `api/src/server.ts`:**
```typescript
import { financeiroRouter } from './routes/financeiro.routes';
app.use('/api/financeiro', authMiddleware, financeiroRouter);
```

**Critérios de aceitação:**
- [x] `GET /api/financeiro/termometro` retorna 401 sem token
- [x] `GET /api/financeiro/termometro` retorna 200 com token válido

---

## Ordem de Implementação Sugerida

```
Sprint 1 — Fundação (P0 bloqueadores)
  FINF-001  Migration 058
  FINF-002  Config padrão no registro
  FINF-010  utils/feriados.ts
  FINF-011  Testes de feriados
  FINF-092  Registrar router

Sprint 2 — API Core (P0)
  FINF-020  CRUD Lançamentos
  FINF-021  Resumo mensal
  FINF-030  Termômetro (pure)
  FINF-031  GET /termometro
  FINF-040  CRUD DAS
  FINF-041  Status por competência
  FINF-090  Testes do pure

Sprint 3 — Alertas (P0)
  FINF-050  Infra cron
  FINF-053  Templates email
  FINF-051  Job alertas DAS
  FINF-052  Job alertas termômetro

Sprint 4 — Frontend (P0)
  FINF-060  Rota /financeiro
  FINF-061  Componente Termômetro
  FINF-062  DASCard
  FINF-063  DASModal
  FINF-064  LancamentosLista
  FINF-065  NovoLancamentoModal
  FINF-066  FinanceiroPage

Sprint 5 — Complementos (P1)
  FINF-022  Totais do ano
  FINF-042  Próximos vencimentos
  FINF-043  Upload comprovante S3
  FINF-070  Integração Agenda
  FINF-080  Config do MEI
  FINF-091  Logs estruturados

Sprint 6 — Refinamentos (P2)
  FINF-071  Link lançamento → agendamento
```

---

## Resumo de Esforço

| Sprint | Itens | Tamanho estimado | Horas estimadas |
|--------|-------|-----------------|-----------------|
| 1 — Fundação | 5 | XS+XS+M+M+XS | ~10h |
| 2 — API Core | 7 | S+S+M+S+L+S+M | ~25h |
| 3 — Alertas | 4 | S+M+L+M | ~18h |
| 4 — Frontend | 7 | XS+M+M+M+L+L+M | ~30h |
| 5 — Complementos | 6 | S+S+M+M+S+XS | ~18h |
| 6 — Refinamentos | 1 | XS | ~2h |
| **Total** | **30** | | **~103h** |

---

## Dependências Externas a Adicionar

```json
// api/package.json — verificar se já não estão presentes
{
  "dependencies": {
    "node-cron": "^3.0.3",
    "@aws-sdk/client-s3": "^3.x",
    "@aws-sdk/s3-request-presigner": "^3.x"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.x"
  }
}
```

> `@aws-sdk/client-sesv2` já está presente. Verificar se `@aws-sdk/client-s3` está antes de adicionar.
