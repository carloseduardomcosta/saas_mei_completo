CREATE SCHEMA IF NOT EXISTS financeiro;

CREATE TABLE IF NOT EXISTS financeiro.lancamentos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id        UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  descricao     TEXT         NOT NULL,
  valor_cents   INTEGER      NOT NULL,
  tipo          VARCHAR(10)  NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria     VARCHAR(50),
  data_lancamento DATE       NOT NULL,
  origem        VARCHAR(50)  DEFAULT 'manual',
  origem_ref_id UUID,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_mei_id     ON financeiro.lancamentos(mei_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data       ON financeiro.lancamentos(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_origem_ref ON financeiro.lancamentos(origem_ref_id) WHERE origem_ref_id IS NOT NULL;
