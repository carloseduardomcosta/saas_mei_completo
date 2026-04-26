-- ============================================================
-- 058_core_financeiro.sql
-- Core Financeiro: lançamentos (evolução do 002), DAS, alertas, config
-- ============================================================

CREATE SCHEMA IF NOT EXISTS financeiro;

-- ------------------------------------------------------------
-- Configuração por MEI (override do limite global)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financeiro.config (
  mei_id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  limite_anual_cents INTEGER NOT NULL DEFAULT 8100000,
  tipo_atividade     TEXT    NOT NULL DEFAULT 'comercio'
                             CHECK (tipo_atividade IN ('comercio', 'servicos', 'ambos')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Parâmetros globais
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financeiro.parametros_globais (
  chave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO financeiro.parametros_globais (chave, valor)
VALUES ('limite_anual_mei_cents', '8100000')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Evolução da tabela lancamentos (criada em 002_financeiro_base.sql)
-- Adiciona colunas ausentes sem recriar a tabela
-- ------------------------------------------------------------

-- Coluna "data" (alias de data_lancamento para o novo schema)
ALTER TABLE financeiro.lancamentos ADD COLUMN IF NOT EXISTS data DATE;
UPDATE financeiro.lancamentos SET data = data_lancamento WHERE data IS NULL;

-- Demais colunas novas
ALTER TABLE financeiro.lancamentos ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmado';
ALTER TABLE financeiro.lancamentos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE financeiro.lancamentos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE financeiro.lancamentos ADD COLUMN IF NOT EXISTS agenda_booking_id UUID;

-- Índices para queries de soma por ano/mês por tenant
CREATE INDEX IF NOT EXISTS idx_lanc_mei_ano
  ON financeiro.lancamentos (mei_id, EXTRACT(YEAR FROM data))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lanc_mei_mes
  ON financeiro.lancamentos (mei_id, EXTRACT(YEAR FROM data), EXTRACT(MONTH FROM data))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lanc_mei_tipo_status
  ON financeiro.lancamentos (mei_id, tipo, status)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Pagamentos do DAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financeiro.das_pagamentos (
  id                 UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id             UUID     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  competencia_mes    SMALLINT NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano    SMALLINT NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2099),
  valor_cents        INTEGER  NOT NULL CHECK (valor_cents > 0),
  data_pagamento     DATE,
  comprovante_url    TEXT,
  comprovante_s3_key TEXT,
  observacao         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mei_id, competencia_mes, competencia_ano)
);

CREATE INDEX IF NOT EXISTS idx_das_mei_ano
  ON financeiro.das_pagamentos (mei_id, competencia_ano);

CREATE INDEX IF NOT EXISTS idx_das_nao_pagos
  ON financeiro.das_pagamentos (mei_id, competencia_mes, competencia_ano)
  WHERE data_pagamento IS NULL;

-- ------------------------------------------------------------
-- Controle de alertas enviados (idempotência)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financeiro.alertas_enviados (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tipo_alerta TEXT NOT NULL,
  periodo_ref TEXT NOT NULL,
  enviado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mei_id, tipo_alerta, periodo_ref)
);

CREATE INDEX IF NOT EXISTS idx_alertas_mei
  ON financeiro.alertas_enviados (mei_id, tipo_alerta);
