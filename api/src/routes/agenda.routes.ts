// Módulo de Agenda — rotas REST
//
// Rotas públicas (sem auth):
//   GET  /api/agenda/public/:slug               → perfil + serviços
//   GET  /api/agenda/public/:slug/slots         → slots livres (query: service_id, date)
//   POST /api/agenda/public/:slug/bookings      → criar agendamento (cliente)
//
// Rotas privadas (MEI autenticado):
//   GET|PUT  /api/agenda/profile                → perfil de agendamento
//   GET      /api/agenda/services               → listar serviços
//   POST     /api/agenda/services               → criar serviço
//   PUT      /api/agenda/services/:id           → atualizar serviço
//   DELETE   /api/agenda/services/:id           → desativar serviço
//   GET|PUT  /api/agenda/availability           → disponibilidade semanal
//   GET      /api/agenda/blocks                 → listar bloqueios
//   POST     /api/agenda/blocks                 → criar bloqueio
//   DELETE   /api/agenda/blocks/:id             → remover bloqueio
//   GET      /api/agenda/bookings               → listar agendamentos (filtros)
//   GET      /api/agenda/bookings/day           → agenda do dia (query: date)
//   PATCH    /api/agenda/bookings/:id/status    → alterar status
//   POST     /api/agenda/bookings/:id/launch-financial → lançar no módulo financeiro

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db, query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { getAvailableSlots } from "../services/agenda-slots.service";
import {
  sendBookingConfirmation,
  sendMeiNotification,
} from "../emails/agenda-emails";

export const agendaRouter = Router();

// ══════════════════════════════════════════════════════════════════════════════
// ROTAS PÚBLICAS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/agenda/public/:slug
agendaRouter.get("/public/:slug", async (req: Request, res: Response) => {
  const slug = req.params.slug.toLowerCase().trim();

  const profile = await queryOne<{
    mei_id: string;
    slug: string;
    business_name: string;
    description: string | null;
    avatar_url: string | null;
    booking_advance_days: number;
    min_advance_hours: number;
  }>(
    `SELECT mei_id, slug, business_name, description, avatar_url,
            booking_advance_days, min_advance_hours
     FROM agenda.profiles
     WHERE slug = $1 AND active = true`,
    [slug]
  );

  if (!profile) {
    res.status(404).json({ error: "Página de agendamento não encontrada" });
    return;
  }

  const services = await query<{
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price_cents: number;
    display_order: number;
  }>(
    `SELECT id, name, description, duration_minutes, price_cents, display_order
     FROM agenda.services
     WHERE mei_id = $1 AND active = true
     ORDER BY display_order, name`,
    [profile.mei_id]
  );

  res.json({ profile, services });
});

// GET /api/agenda/public/:slug/slots?service_id=UUID&date=YYYY-MM-DD
agendaRouter.get(
  "/public/:slug/slots",
  async (req: Request, res: Response) => {
    const parseQ = z.object({
      service_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido"),
    });

    const parsed = parseQ.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Parâmetros inválidos", details: parsed.error.flatten() });
      return;
    }

    const { service_id, date } = parsed.data;
    const slug = req.params.slug.toLowerCase().trim();

    const profile = await queryOne<{
      mei_id: string;
      booking_advance_days: number;
      min_advance_hours: number;
    }>(
      `SELECT mei_id, booking_advance_days, min_advance_hours
       FROM agenda.profiles WHERE slug = $1 AND active = true`,
      [slug]
    );

    if (!profile) {
      res.status(404).json({ error: "Perfil não encontrado" });
      return;
    }

    const service = await queryOne<{ duration_minutes: number }>(
      `SELECT duration_minutes FROM agenda.services
       WHERE id = $1 AND mei_id = $2 AND active = true`,
      [service_id, profile.mei_id]
    );

    if (!service) {
      res.status(404).json({ error: "Serviço não encontrado" });
      return;
    }

    const slots = await getAvailableSlots({
      meiId: profile.mei_id,
      durationMinutes: service.duration_minutes,
      date,
      bookingAdvanceDays: profile.booking_advance_days,
      minAdvanceHours: profile.min_advance_hours,
    });

    res.json({ slots });
  }
);

// POST /api/agenda/public/:slug/bookings
const createBookingSchema = z.object({
  service_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true, message: "starts_at inválido" }),
  client_name: z.string().min(2).max(120).trim(),
  client_email: z.string().email().max(200).toLowerCase(),
  client_phone: z.string().max(20).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});

agendaRouter.post(
  "/public/:slug/bookings",
  async (req: Request, res: Response) => {
    const slug = req.params.slug.toLowerCase().trim();

    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Dados inválidos", details: parsed.error.flatten() });
      return;
    }

    const { service_id, starts_at, client_name, client_email, client_phone, notes } =
      parsed.data;

    const profile = await queryOne<{
      mei_id: string;
      business_name: string;
      min_advance_hours: number;
    }>(
      `SELECT mei_id, business_name, min_advance_hours
       FROM agenda.profiles WHERE slug = $1 AND active = true`,
      [slug]
    );

    if (!profile) {
      res.status(404).json({ error: "Perfil não encontrado" });
      return;
    }

    const service = await queryOne<{
      id: string;
      name: string;
      duration_minutes: number;
      price_cents: number;
    }>(
      `SELECT id, name, duration_minutes, price_cents
       FROM agenda.services
       WHERE id = $1 AND mei_id = $2 AND active = true`,
      [service_id, profile.mei_id]
    );

    if (!service) {
      res.status(404).json({ error: "Serviço não encontrado" });
      return;
    }

    const startsAt = new Date(starts_at);
    const endsAt = new Date(
      startsAt.getTime() + service.duration_minutes * 60_000
    );

    // Checar antecedência mínima
    const minAdvanceMs = profile.min_advance_hours * 60 * 60_000;
    if (startsAt.getTime() - Date.now() < minAdvanceMs) {
      res.status(409).json({
        error: "Horário muito próximo. Escolha um horário com mais antecedência.",
      });
      return;
    }

    // Checar conflito de agendamento (proteção contra race condition)
    const bookingConflict = await queryOne(
      `SELECT id FROM agenda.bookings
       WHERE mei_id = $1
         AND status != 'cancelled'
         AND starts_at < $3
         AND ends_at   > $2`,
      [profile.mei_id, startsAt.toISOString(), endsAt.toISOString()]
    );

    if (bookingConflict) {
      res.status(409).json({
        error: "Horário não disponível. Por favor, escolha outro horário.",
      });
      return;
    }

    // Checar bloqueio manual
    const blockConflict = await queryOne(
      `SELECT id FROM agenda.time_blocks
       WHERE mei_id = $1
         AND starts_at < $3
         AND ends_at   > $2`,
      [profile.mei_id, startsAt.toISOString(), endsAt.toISOString()]
    );

    if (blockConflict) {
      res.status(409).json({
        error: "Horário bloqueado. Por favor, escolha outro horário.",
      });
      return;
    }

    const booking = await queryOne<{
      id: string;
      starts_at: string;
      ends_at: string;
      status: string;
    }>(
      `INSERT INTO agenda.bookings
         (mei_id, service_id, client_name, client_email, client_phone,
          starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, starts_at, ends_at, status`,
      [
        profile.mei_id,
        service_id,
        client_name,
        client_email,
        client_phone ?? null,
        startsAt.toISOString(),
        endsAt.toISOString(),
        notes ?? null,
      ]
    );

    // Fire-and-forget — não bloquear o response por falha de email
    sendBookingConfirmation({
      bookingId: booking!.id,
      clientName: client_name,
      clientEmail: client_email,
      serviceName: service.name,
      businessName: profile.business_name,
      startsAt,
      durationMinutes: service.duration_minutes,
      priceCents: service.price_cents,
    }).catch(() => {});

    sendMeiNotification({
      meiId: profile.mei_id,
      businessName: profile.business_name,
      bookingId: booking!.id,
      clientName: client_name,
      clientEmail: client_email,
      clientPhone: client_phone,
      serviceName: service.name,
      startsAt,
      durationMinutes: service.duration_minutes,
    }).catch(() => {});

    res.status(201).json({
      message: "Agendamento confirmado!",
      booking: {
        id: booking!.id,
        starts_at: booking!.starts_at,
        ends_at: booking!.ends_at,
        status: booking!.status,
      },
    });
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// ROTAS PRIVADAS (MEI autenticado)
// ══════════════════════════════════════════════════════════════════════════════

const priv = Router();
priv.use(authMiddleware);
agendaRouter.use("/", priv);

// ── Perfil ────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(60)
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/, "Slug inválido — use apenas letras, números e hífens"),
  business_name: z.string().min(2).max(120).trim(),
  description: z.string().max(500).trim().optional(),
  booking_advance_days: z.number().int().min(1).max(90).default(30),
  min_advance_hours: z.number().int().min(0).max(72).default(1),
});

priv.get("/profile", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const profile = await queryOne(
    `SELECT mei_id, slug, business_name, description, avatar_url,
            booking_advance_days, min_advance_hours, active, updated_at
     FROM agenda.profiles WHERE mei_id = $1`,
    [meiId]
  );
  res.json(profile ?? null);
});

priv.put("/profile", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { slug, business_name, description, booking_advance_days, min_advance_hours } =
    parsed.data;

  const slugConflict = await queryOne(
    `SELECT mei_id FROM agenda.profiles WHERE slug = $1 AND mei_id != $2`,
    [slug, meiId]
  );
  if (slugConflict) {
    res.status(409).json({ error: "Este link já está em uso. Escolha outro." });
    return;
  }

  const profile = await queryOne(
    `INSERT INTO agenda.profiles
       (mei_id, slug, business_name, description, booking_advance_days, min_advance_hours)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (mei_id) DO UPDATE SET
       slug                 = EXCLUDED.slug,
       business_name        = EXCLUDED.business_name,
       description          = EXCLUDED.description,
       booking_advance_days = EXCLUDED.booking_advance_days,
       min_advance_hours    = EXCLUDED.min_advance_hours,
       updated_at           = NOW()
     RETURNING *`,
    [meiId, slug, business_name, description ?? null, booking_advance_days, min_advance_hours]
  );

  res.json(profile);
});

// ── Serviços ──────────────────────────────────────────────────────────────

const serviceSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  description: z.string().max(500).trim().optional(),
  duration_minutes: z.number().int().min(5).max(480),
  price_cents: z.number().int().min(0).default(0),
  display_order: z.number().int().min(0).default(0),
});

priv.get("/services", async (req: Request, res: Response) => {
  const rows = await query(
    `SELECT id, name, description, duration_minutes, price_cents, active, display_order,
            created_at, updated_at
     FROM agenda.services WHERE mei_id = $1
     ORDER BY active DESC, display_order, name`,
    [req.user!.userId]
  );
  res.json(rows);
});

priv.post("/services", async (req: Request, res: Response) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }
  const { name, description, duration_minutes, price_cents, display_order } = parsed.data;
  const row = await queryOne(
    `INSERT INTO agenda.services
       (mei_id, name, description, duration_minutes, price_cents, display_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.user!.userId, name, description ?? null, duration_minutes, price_cents, display_order]
  );
  res.status(201).json(row);
});

priv.put("/services/:id", async (req: Request, res: Response) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }
  const { name, description, duration_minutes, price_cents, display_order } = parsed.data;
  const row = await queryOne(
    `UPDATE agenda.services
     SET name=$1, description=$2, duration_minutes=$3,
         price_cents=$4, display_order=$5, updated_at=NOW()
     WHERE id=$6 AND mei_id=$7
     RETURNING *`,
    [name, description ?? null, duration_minutes, price_cents, display_order,
     req.params.id, req.user!.userId]
  );
  if (!row) { res.status(404).json({ error: "Serviço não encontrado" }); return; }
  res.json(row);
});

// Soft delete — histórico de agendamentos deve permanecer intacto
priv.delete("/services/:id", async (req: Request, res: Response) => {
  const row = await queryOne(
    `UPDATE agenda.services SET active=false, updated_at=NOW()
     WHERE id=$1 AND mei_id=$2 RETURNING id`,
    [req.params.id, req.user!.userId]
  );
  if (!row) { res.status(404).json({ error: "Serviço não encontrado" }); return; }
  res.json({ ok: true });
});

// ── Disponibilidade semanal ───────────────────────────────────────────────

const availabilityRowSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
});

const availabilitySchema = z.array(availabilityRowSchema).max(7);

priv.get("/availability", async (req: Request, res: Response) => {
  const rows = await query(
    `SELECT day_of_week,
            TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time,   'HH24:MI') AS end_time
     FROM agenda.weekly_availability
     WHERE mei_id = $1
     ORDER BY day_of_week`,
    [req.user!.userId]
  );
  res.json(rows);
});

// Substitui toda a disponibilidade — cliente envia os 7 dias (omitir = dia fechado)
priv.put("/availability", async (req: Request, res: Response) => {
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  // Validar que end_time > start_time em cada linha
  for (const row of parsed.data) {
    if (row.end_time <= row.start_time) {
      res.status(400).json({
        error: `Horário inválido no dia ${row.day_of_week}: end_time deve ser posterior a start_time`,
      });
      return;
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM agenda.weekly_availability WHERE mei_id = $1`,
      [req.user!.userId]
    );
    for (const row of parsed.data) {
      await client.query(
        `INSERT INTO agenda.weekly_availability (mei_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, row.day_of_week, row.start_time, row.end_time]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  res.json({ ok: true });
});

// ── Bloqueios de horário ──────────────────────────────────────────────────

const blockSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  reason: z.string().max(200).trim().optional(),
});

priv.get("/blocks", async (req: Request, res: Response) => {
  const rows = await query(
    `SELECT id, starts_at, ends_at, reason, created_at
     FROM agenda.time_blocks
     WHERE mei_id = $1 AND ends_at > NOW()
     ORDER BY starts_at`,
    [req.user!.userId]
  );
  res.json(rows);
});

priv.post("/blocks", async (req: Request, res: Response) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }
  const { starts_at, ends_at, reason } = parsed.data;
  if (new Date(ends_at) <= new Date(starts_at)) {
    res.status(400).json({ error: "ends_at deve ser posterior a starts_at" });
    return;
  }
  const row = await queryOne(
    `INSERT INTO agenda.time_blocks (mei_id, starts_at, ends_at, reason)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user!.userId, starts_at, ends_at, reason ?? null]
  );
  res.status(201).json(row);
});

priv.delete("/blocks/:id", async (req: Request, res: Response) => {
  const row = await queryOne(
    `DELETE FROM agenda.time_blocks WHERE id=$1 AND mei_id=$2 RETURNING id`,
    [req.params.id, req.user!.userId]
  );
  if (!row) { res.status(404).json({ error: "Bloqueio não encontrado" }); return; }
  res.json({ ok: true });
});

// ── Agendamentos ──────────────────────────────────────────────────────────

const bookingsQuerySchema = z.object({
  status: z.enum(["confirmed", "cancelled", "completed", "all"]).default("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

priv.get("/bookings", async (req: Request, res: Response) => {
  const parsed = bookingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { status, from, to, limit, offset } = parsed.data;
  const meiId = req.user!.userId;

  let where = `WHERE b.mei_id = $1`;
  const params: unknown[] = [meiId];
  let p = 2;

  if (status !== "all") { where += ` AND b.status = $${p++}`; params.push(status); }
  if (from) { where += ` AND b.starts_at >= $${p++}::date`; params.push(from); }
  if (to) {
    where += ` AND b.starts_at < ($${p++}::date + INTERVAL '1 day')`;
    params.push(to);
  }

  params.push(limit, offset);

  const rows = await query(
    `SELECT b.id, b.starts_at, b.ends_at, b.status,
            b.client_name, b.client_email, b.client_phone,
            b.notes, b.cancel_reason, b.financial_launch_id, b.created_at,
            s.name AS service_name, s.duration_minutes, s.price_cents
     FROM agenda.bookings b
     JOIN agenda.services s ON s.id = b.service_id
     ${where}
     ORDER BY b.starts_at DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    params
  );

  res.json(rows);
});

// GET /api/agenda/bookings/day?date=YYYY-MM-DD  (deve vir antes de /:id)
priv.get("/bookings/day", async (req: Request, res: Response) => {
  const parsed = z
    .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetro date inválido" });
    return;
  }

  const { date } = parsed.data;
  const rows = await query(
    `SELECT b.id, b.starts_at, b.ends_at, b.status,
            b.client_name, b.client_email, b.client_phone, b.notes,
            b.financial_launch_id,
            s.name AS service_name, s.duration_minutes, s.price_cents
     FROM agenda.bookings b
     JOIN agenda.services s ON s.id = b.service_id
     WHERE b.mei_id = $1
       AND (b.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
     ORDER BY b.starts_at`,
    [req.user!.userId, date]
  );

  res.json(rows);
});

// PATCH /api/agenda/bookings/:id/status
priv.patch("/bookings/:id/status", async (req: Request, res: Response) => {
  const parsed = z
    .object({
      status: z.enum(["confirmed", "cancelled", "completed"]),
      cancel_reason: z.string().max(300).trim().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { status, cancel_reason } = parsed.data;
  const row = await queryOne(
    `UPDATE agenda.bookings
     SET status=$1, cancel_reason=$2, updated_at=NOW()
     WHERE id=$3 AND mei_id=$4
     RETURNING *`,
    [status, cancel_reason ?? null, req.params.id, req.user!.userId]
  );

  if (!row) { res.status(404).json({ error: "Agendamento não encontrado" }); return; }
  res.json(row);
});

// POST /api/agenda/bookings/:id/launch-financial
priv.post(
  "/bookings/:id/launch-financial",
  async (req: Request, res: Response) => {
    const booking = await queryOne<{
      id: string;
      status: string;
      financial_launch_id: string | null;
      client_name: string;
      starts_at: string;
      service_name: string;
      price_cents: number;
    }>(
      `SELECT b.id, b.status, b.financial_launch_id, b.client_name, b.starts_at,
              s.name AS service_name, s.price_cents
       FROM agenda.bookings b
       JOIN agenda.services s ON s.id = b.service_id
       WHERE b.id = $1 AND b.mei_id = $2`,
      [req.params.id, req.user!.userId]
    );

    if (!booking) {
      res.status(404).json({ error: "Agendamento não encontrado" });
      return;
    }
    if (booking.financial_launch_id) {
      res.status(409).json({ error: "Este agendamento já foi lançado no financeiro" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({
        error: "Somente agendamentos concluídos podem ser lançados no financeiro",
      });
      return;
    }

    // TODO: integrar com financeiro.lancamentos do MEI Completo quando módulo estiver pronto.
    // Por enquanto, gera um UUID de lançamento placeholder.
    // Quando integrado: INSERT INTO financeiro.lancamentos (...) e usar o ID retornado.
    const launchId = crypto.randomUUID();

    await queryOne(
      `UPDATE agenda.bookings
       SET financial_launch_id=$1, updated_at=NOW()
       WHERE id=$2 AND mei_id=$3`,
      [launchId, req.params.id, req.user!.userId]
    );

    res.json({
      ok: true,
      financial_launch_id: launchId,
      message: `Receita de R$ ${(booking.price_cents / 100).toFixed(2).replace(".", ",")} lançada`,
    });
  }
);
