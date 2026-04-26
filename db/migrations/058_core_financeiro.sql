-- ============================================================
-- 058_core_financeiro.sql
-- Core Financeiro: lançamentos, DAS, alertas, configuração
-- ============================================================

CREATE SCHEMA IF NOT EXISTS financeiro;

-- ------------------------------------------------------------
-- Configuração por MEI (override do limite global)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financeiro.config (
  mei_id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  limite_anual_cents INTEGER NOT NULL DEFAULT 8100000, -- R$ 81.000,00
  tipo_atividade     TEXT    NOT NULL DEFAULT 'comercio'
                             CHECK (tipo_atividade IN ('comercio', 'servicos', 'ambos')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Limite global default (sobrescreve env var; admin pode ajustar)
CREATE TABLE IF NOT EXISTS financeiro.parametros_globais (
  chave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO financeiro.parametros_globais (chave, valor)
VALUES ('limite_anual_mei_cents', '8100000')   -- R$ 81.000,00
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Lançamentos de receitas e despesas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financeiro.lancamentos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id            UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  data              DATE        NOT NULL,
  tipo              TEXT        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria         TEXT        NOT NULL,
  descricao         TEXT,
  valor_cents       INTEGER     NOT NULL CHECK (valor_cents > 0),
  status            TEXT        NOT NULL DEFAULT 'confirmado'
                                CHECK (status IN ('confirmado', 'pendente')),
  origem            TEXT        NOT NULL DEFAULT 'manual'
                                CHECK (origem IN ('manual', 'agenda')),
  agenda_booking_id UUID,       -- FK lógica (sem FK física — agenda em schema separado)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ           -- soft delete
);

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
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id            UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  competencia_mes   SMALLINT    NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano   SMALLINT    NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2099),
  valor_cents       INTEGER     NOT NULL CHECK (valor_cents > 0),
  data_pagamento    DATE,       -- NULL = não pago ainda
  comprovante_url   TEXT,       -- S3 presigned URL (após upload)
  comprovante_s3_key TEXT,      -- Chave S3 para regenerar URL
  observacao        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tipo_alerta TEXT        NOT NULL,
  -- Chave de período: ex "2025-06" para DAS, "2025" para termômetro
  periodo_ref TEXT        NOT NULL,
  enviado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mei_id, tipo_alerta, periodo_ref)
);

CREATE INDEX IF NOT EXISTS idx_alertas_mei
  ON financeiro.alertas_enviados (mei_id, tipo_alerta);
