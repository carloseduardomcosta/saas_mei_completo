-- Migration 057: Módulo de Agenda para MEI
-- Add-on pago R$ 12/mês — prestadores de serviço (cabeleireiro, manicure, personal, consultor...)
-- Timezone fixo: America/Sao_Paulo (UTC-3 permanente desde 2019 — sem DST)

CREATE SCHEMA IF NOT EXISTS agenda;

-- ── Perfil público de agendamento ──────────────────────────────────────────
-- Um MEI pode ter apenas um perfil. O slug vira a URL pública:
--   meuapp.com/agendar/:slug
CREATE TABLE agenda.profiles (
  mei_id               UUID         PRIMARY KEY, -- FK lógica para public.users(id)
  slug                 VARCHAR(60)  UNIQUE NOT NULL
                         CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  business_name        VARCHAR(120) NOT NULL,
  description          TEXT,
  avatar_url           TEXT,
  -- Quantos dias à frente o cliente pode agendar
  booking_advance_days INTEGER      NOT NULL DEFAULT 30
                         CHECK (booking_advance_days BETWEEN 1 AND 90),
  -- Antecedência mínima em horas para novo agendamento
  min_advance_hours    INTEGER      NOT NULL DEFAULT 1
                         CHECK (min_advance_hours BETWEEN 0 AND 72),
  active               BOOLEAN      NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Serviços oferecidos ────────────────────────────────────────────────────
CREATE TABLE agenda.services (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id           UUID         NOT NULL,
  name             VARCHAR(120) NOT NULL,
  description      TEXT,
  duration_minutes INTEGER      NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price_cents      INTEGER      NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  active           BOOLEAN      NOT NULL DEFAULT true,
  display_order    SMALLINT     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Disponibilidade semanal ────────────────────────────────────────────────
-- Cada linha define o intervalo de trabalho de um dia da semana.
-- 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
-- Um MEI sem linha para um dado dia_semana = não atende naquele dia.
CREATE TABLE agenda.weekly_availability (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id       UUID     NOT NULL,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME     NOT NULL,
  end_time     TIME     NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE (mei_id, day_of_week)
);

-- ── Bloqueios manuais de horário ───────────────────────────────────────────
-- Feriados, folgas, compromissos pessoais.
-- Intervalos sobrepostos com agendamentos existentes são tolerados —
-- o MEI decide; a lógica de slots apenas evita NOVOS agendamentos no período.
CREATE TABLE agenda.time_blocks (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id     UUID         NOT NULL,
  starts_at  TIMESTAMPTZ  NOT NULL,
  ends_at    TIMESTAMPTZ  NOT NULL,
  reason     VARCHAR(200),
  CHECK (ends_at > starts_at),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Agendamentos ───────────────────────────────────────────────────────────
CREATE TABLE agenda.bookings (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  mei_id              UUID         NOT NULL,
  service_id          UUID         NOT NULL REFERENCES agenda.services(id),
  client_name         VARCHAR(120) NOT NULL,
  client_email        VARCHAR(200) NOT NULL,
  client_phone        VARCHAR(20),
  starts_at           TIMESTAMPTZ  NOT NULL,
  ends_at             TIMESTAMPTZ  NOT NULL,
  CHECK (ends_at > starts_at),
  status              VARCHAR(20)  NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  notes               TEXT,
  cancel_reason       VARCHAR(300),
  -- Preenchido ao lançar no módulo financeiro (opcional)
  financial_launch_id UUID,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Índices ────────────────────────────────────────────────────────────────

-- Busca de serviços ativos por MEI (página pública)
CREATE INDEX idx_agenda_services_mei_active
  ON agenda.services(mei_id) WHERE active = true;

-- Disponibilidade: busca por MEI + dia da semana
CREATE INDEX idx_agenda_avail_mei_dow
  ON agenda.weekly_availability(mei_id, day_of_week);

-- Bloqueios: overlap range query por MEI
CREATE INDEX idx_agenda_blocks_mei_range
  ON agenda.time_blocks(mei_id, starts_at, ends_at);

-- Agendamentos ativos por MEI e data (slot collision check)
CREATE INDEX idx_agenda_bookings_mei_active_range
  ON agenda.bookings(mei_id, starts_at, ends_at)
  WHERE status != 'cancelled';

-- Dashboard: listar agendamentos por MEI, data DESC
CREATE INDEX idx_agenda_bookings_mei_starts
  ON agenda.bookings(mei_id, starts_at DESC);

-- Lembrete automático 24h antes: busca por starts_at + status
CREATE INDEX idx_agenda_bookings_reminder
  ON agenda.bookings(starts_at)
  WHERE status = 'confirmed';
