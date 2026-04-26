// Módulo Financeiro — rotas REST
//
// Todas as rotas requerem JWT (authMiddleware aplicado em server.ts).
// Multi-tenant: todo query inclui WHERE mei_id = req.user.userId.
//
// Rotas:
//   GET    /api/financeiro/termometro
//   GET    /api/financeiro/config
//   PUT    /api/financeiro/config
//   GET    /api/financeiro/lancamentos/resumo
//   GET    /api/financeiro/lancamentos
//   POST   /api/financeiro/lancamentos
//   GET    /api/financeiro/lancamentos/:id
//   PUT    /api/financeiro/lancamentos/:id
//   DELETE /api/financeiro/lancamentos/:id
//   GET    /api/financeiro/das/status/:mes/:ano
//   GET    /api/financeiro/das
//   POST   /api/financeiro/das
//   GET    /api/financeiro/das/:id
//   PUT    /api/financeiro/das/:id
//   DELETE /api/financeiro/das/:id

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { logger } from "../utils/logger";
import { dasVencimento } from "../utils/feriados";
import {
  calcularTermometro,
  isCategoriaValida,
} from "../services/financeiro.pure";

export const financeiroRouter = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Retorna data de hoje no fuso SP como "YYYY-MM-DD". */
function todaySP(): string {
  return new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .split("/")
    .reverse()
    .join("-");
}

/** Formata Date UTC como "YYYY-MM-DD". */
function fmtDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Schemas Zod ──────────────────────────────────────────────────────────────

const LancamentoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  tipo: z.enum(["receita", "despesa"]),
  categoria: z.string().min(1),
  descricao: z.string().max(500).optional().nullable(),
  valor_cents: z.number().int().positive("Valor deve ser positivo"),
  status: z.enum(["confirmado", "pendente"]).default("confirmado"),
});

const FiltrosSchema = z.object({
  mes: z.coerce.number().min(1).max(12).optional(),
  ano: z.coerce.number().min(2020).max(2099).optional(),
  tipo: z.enum(["receita", "despesa"]).optional(),
  categoria: z.string().optional(),
  status: z.enum(["confirmado", "pendente"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const DASSchema = z.object({
  competencia_mes: z.number().int().min(1).max(12),
  competencia_ano: z.number().int().min(2020).max(2099),
  valor_cents: z.number().int().positive("Valor deve ser positivo"),
  data_pagamento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  observacao: z.string().max(500).optional().nullable(),
});

const ConfigSchema = z.object({
  tipo_atividade: z.enum(["comercio", "servicos", "ambos"]).optional(),
  limite_anual_cents: z.number().int().min(1).optional(),
});

// ── GET /financeiro/termometro ───────────────────────────────────────────────

financeiroRouter.get("/termometro", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1; // 1–12

  // Total de receitas confirmadas no ano corrente
  const { rows: totaisRows } = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(valor_cents), 0) AS total
     FROM financeiro.lancamentos
     WHERE mei_id = $1
       AND tipo = 'receita'
       AND status = 'confirmado'
       AND deleted_at IS NULL
       AND EXTRACT(YEAR FROM data) = $2`,
    [meiId, anoAtual]
  );

  const totalReceitasCents = Number(totaisRows[0]?.total ?? 0);

  // Limite do MEI (config individual ou global)
  const { rows: configRows } = await db.query<{ limite_anual_cents: number }>(
    `SELECT COALESCE(
       (SELECT limite_anual_cents FROM financeiro.config WHERE mei_id = $1),
       (SELECT valor::INTEGER FROM financeiro.parametros_globais WHERE chave = 'limite_anual_mei_cents'),
       8100000
     ) AS limite_anual_cents`,
    [meiId]
  );

  const limiteCents = configRows[0]?.limite_anual_cents ?? 8_100_000;

  const resultado = calcularTermometro({
    totalReceitasCents,
    limiteCents,
    mesAtual,
  });

  res.json({
    ano: anoAtual,
    total_receitas_cents: totalReceitasCents,
    limite_cents: limiteCents,
    percentual_usado: resultado.percentualUsado,
    valor_restante_cents: resultado.valorRestanteCents,
    media_mensal_cents: resultado.mediaMensalCents,
    meses_ate_limite: resultado.mesesAteLimite,
    status: resultado.status,
  });
});

// ── GET /financeiro/config ───────────────────────────────────────────────────

financeiroRouter.get("/config", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;

  const { rows } = await db.query<{
    limite_anual_cents: number;
    tipo_atividade: string;
    updated_at: string;
  }>(
    `SELECT limite_anual_cents, tipo_atividade, updated_at
     FROM financeiro.config
     WHERE mei_id = $1`,
    [meiId]
  );

  if (rows.length === 0) {
    // Retorna defaults globais se sem config
    const { rows: globalRows } = await db.query<{ valor: string }>(
      `SELECT valor FROM financeiro.parametros_globais WHERE chave = 'limite_anual_mei_cents'`
    );
    res.json({
      limite_anual_cents: Number(globalRows[0]?.valor ?? 8_100_000),
      tipo_atividade: "comercio",
      is_default: true,
    });
    return;
  }

  res.json({ ...rows[0], is_default: false });
});

// ── PUT /financeiro/config ───────────────────────────────────────────────────

financeiroRouter.put("/config", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const parsed = ConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { tipo_atividade, limite_anual_cents } = parsed.data;

  await db.query(
    `INSERT INTO financeiro.config (mei_id, tipo_atividade, limite_anual_cents, updated_at)
     VALUES ($1, COALESCE($2, 'comercio'), COALESCE($3, 8100000), NOW())
     ON CONFLICT (mei_id) DO UPDATE
       SET tipo_atividade    = COALESCE($2, financeiro.config.tipo_atividade),
           limite_anual_cents = COALESCE($3, financeiro.config.limite_anual_cents),
           updated_at        = NOW()`,
    [meiId, tipo_atividade ?? null, limite_anual_cents ?? null]
  );

  const { rows } = await db.query<{
    limite_anual_cents: number;
    tipo_atividade: string;
  }>(
    `SELECT limite_anual_cents, tipo_atividade FROM financeiro.config WHERE mei_id = $1`,
    [meiId]
  );

  res.json(rows[0]);
});

// ── GET /financeiro/lancamentos/resumo ──────────────────────────────────────

financeiroRouter.get("/lancamentos/resumo", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const now = new Date();
  const mesDefault = now.getMonth() + 1;
  const anoDefault = now.getFullYear();

  const mesQ = req.query.mes ? Number(req.query.mes) : mesDefault;
  const anoQ = req.query.ano ? Number(req.query.ano) : anoDefault;

  if (isNaN(mesQ) || mesQ < 1 || mesQ > 12 || isNaN(anoQ)) {
    res.status(400).json({ error: "Parâmetros mes/ano inválidos" });
    return;
  }

  const { rows } = await db.query<{
    tipo: string;
    categoria: string;
    count: string;
    total_cents: string;
  }>(
    `SELECT tipo, categoria, COUNT(*) AS count, SUM(valor_cents) AS total_cents
     FROM financeiro.lancamentos
     WHERE mei_id = $1
       AND EXTRACT(YEAR  FROM data) = $2
       AND EXTRACT(MONTH FROM data) = $3
       AND deleted_at IS NULL
       AND status = 'confirmado'
     GROUP BY tipo, categoria
     ORDER BY tipo, total_cents DESC`,
    [meiId, anoQ, mesQ]
  );

  const totalReceitas = rows
    .filter((r) => r.tipo === "receita")
    .reduce((sum, r) => sum + Number(r.total_cents), 0);
  const totalDespesas = rows
    .filter((r) => r.tipo === "despesa")
    .reduce((sum, r) => sum + Number(r.total_cents), 0);

  res.json({
    mes: mesQ,
    ano: anoQ,
    total_receitas_cents: totalReceitas,
    total_despesas_cents: totalDespesas,
    saldo_cents: totalReceitas - totalDespesas,
    por_categoria: rows.map((r) => ({
      tipo: r.tipo,
      categoria: r.categoria,
      total_cents: Number(r.total_cents),
      count: Number(r.count),
    })),
  });
});

// ── GET /financeiro/lancamentos ──────────────────────────────────────────────

financeiroRouter.get("/lancamentos", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const now = new Date();

  const parsed = FiltrosSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros inválidos", details: parsed.error.flatten() });
    return;
  }

  const {
    mes = now.getMonth() + 1,
    ano = now.getFullYear(),
    tipo,
    categoria,
    status,
    limit,
    offset,
  } = parsed.data;

  const conditions: string[] = [
    "mei_id = $1",
    "deleted_at IS NULL",
    "EXTRACT(YEAR FROM data) = $2",
    "EXTRACT(MONTH FROM data) = $3",
  ];
  const params: unknown[] = [meiId, ano, mes];
  let idx = 4;

  if (tipo) {
    conditions.push(`tipo = $${idx++}`);
    params.push(tipo);
  }
  if (categoria) {
    conditions.push(`categoria = $${idx++}`);
    params.push(categoria);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.join(" AND ");

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM financeiro.lancamentos WHERE ${where}`,
    params
  );

  const { rows } = await db.query(
    `SELECT id, data, tipo, categoria, descricao, valor_cents, status, origem,
            agenda_booking_id, created_at
     FROM financeiro.lancamentos
     WHERE ${where}
     ORDER BY data DESC, created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  res.json({
    lancamentos: rows,
    total: Number(countRows[0]?.total ?? 0),
  });
});

// ── POST /financeiro/lancamentos ─────────────────────────────────────────────

financeiroRouter.post("/lancamentos", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const parsed = LancamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { data, tipo, categoria, descricao, valor_cents, status } = parsed.data;

  if (!isCategoriaValida(tipo, categoria)) {
    res.status(400).json({ error: `Categoria '${categoria}' inválida para tipo '${tipo}'` });
    return;
  }

  const { rows } = await db.query(
    `INSERT INTO financeiro.lancamentos
       (mei_id, data, tipo, categoria, descricao, valor_cents, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, data, tipo, categoria, descricao, valor_cents, status, origem, created_at`,
    [meiId, data, tipo, categoria, descricao ?? null, valor_cents, status]
  );

  const lancamento = rows[0];
  logger.info("financeiro.lancamentos.created", {
    meiId,
    lancamentoId: lancamento.id,
    tipo,
    valorCents: valor_cents,
    categoria,
  });

  res.status(201).json(lancamento);
});

// ── GET /financeiro/lancamentos/:id ─────────────────────────────────────────

financeiroRouter.get("/lancamentos/:id", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const { id } = req.params;

  const { rows } = await db.query(
    `SELECT id, data, tipo, categoria, descricao, valor_cents, status, origem,
            agenda_booking_id, created_at, updated_at
     FROM financeiro.lancamentos
     WHERE id = $1 AND mei_id = $2 AND deleted_at IS NULL`,
    [id, meiId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Lançamento não encontrado" });
    return;
  }

  res.json(rows[0]);
});

// ── PUT /financeiro/lancamentos/:id ─────────────────────────────────────────

financeiroRouter.put("/lancamentos/:id", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const { id } = req.params;

  const parsed = LancamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { data, tipo, categoria, descricao, valor_cents, status } = parsed.data;

  if (!isCategoriaValida(tipo, categoria)) {
    res.status(400).json({ error: `Categoria '${categoria}' inválida para tipo '${tipo}'` });
    return;
  }

  // Verifica existência e ownership
  const { rows: existing } = await db.query(
    `SELECT id FROM financeiro.lancamentos WHERE id = $1 AND mei_id = $2 AND deleted_at IS NULL`,
    [id, meiId]
  );
  if (existing.length === 0) {
    res.status(404).json({ error: "Lançamento não encontrado" });
    return;
  }

  const { rows } = await db.query(
    `UPDATE financeiro.lancamentos
     SET data = $1, tipo = $2, categoria = $3, descricao = $4,
         valor_cents = $5, status = $6, updated_at = NOW()
     WHERE id = $7 AND mei_id = $8
     RETURNING id, data, tipo, categoria, descricao, valor_cents, status, origem, updated_at`,
    [data, tipo, categoria, descricao ?? null, valor_cents, status, id, meiId]
  );

  logger.info("financeiro.lancamentos.updated", {
    meiId,
    lancamentoId: id,
    tipo,
    valorCents: valor_cents,
  });

  res.json(rows[0]);
});

// ── DELETE /financeiro/lancamentos/:id (soft delete) ────────────────────────

financeiroRouter.delete("/lancamentos/:id", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const { id } = req.params;

  const { rows } = await db.query(
    `UPDATE financeiro.lancamentos
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND mei_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, meiId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Lançamento não encontrado" });
    return;
  }

  logger.info("financeiro.lancamentos.deleted", { meiId, lancamentoId: id });

  res.status(204).send();
});

// ── GET /financeiro/das/status/:mes/:ano ────────────────────────────────────

financeiroRouter.get("/das/status/:mes/:ano", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const mes = Number(req.params.mes);
  const ano = Number(req.params.ano);

  if (isNaN(mes) || mes < 1 || mes > 12 || isNaN(ano) || ano < 2020) {
    res.status(400).json({ error: "Parâmetros mes/ano inválidos" });
    return;
  }

  const vencimento = dasVencimento(mes, ano);
  const vencimentoStr = fmtDate(vencimento);
  const hoje = todaySP();

  const { rows } = await db.query<{
    id: string;
    valor_cents: number;
    data_pagamento: string | null;
    observacao: string | null;
  }>(
    `SELECT id, valor_cents, data_pagamento, observacao
     FROM financeiro.das_pagamentos
     WHERE mei_id = $1 AND competencia_mes = $2 AND competencia_ano = $3`,
    [meiId, mes, ano]
  );

  const das = rows[0];

  if (!das) {
    const statusCalc = hoje > vencimentoStr ? "vencido" : "nao_registrado";
    const diasAtraso =
      statusCalc === "vencido"
        ? Math.floor(
            (new Date(hoje).getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

    res.json({
      competencia_mes: mes,
      competencia_ano: ano,
      status: statusCalc,
      data_vencimento: vencimentoStr,
      data_pagamento: null,
      valor_cents: null,
      dias_atraso: diasAtraso,
    });
    return;
  }

  let statusCalc: "pago" | "pendente" | "vencido";
  let diasAtraso = 0;

  if (das.data_pagamento) {
    statusCalc = "pago";
  } else if (hoje > vencimentoStr) {
    statusCalc = "vencido";
    diasAtraso = Math.floor(
      (new Date(hoje).getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24)
    );
  } else {
    statusCalc = "pendente";
  }

  res.json({
    competencia_mes: mes,
    competencia_ano: ano,
    status: statusCalc,
    data_vencimento: vencimentoStr,
    data_pagamento: das.data_pagamento,
    valor_cents: das.valor_cents,
    dias_atraso: diasAtraso,
    id: das.id,
  });
});

// ── GET /financeiro/das ──────────────────────────────────────────────────────

financeiroRouter.get("/das", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const anoDefault = new Date().getFullYear();
  const ano = req.query.ano ? Number(req.query.ano) : anoDefault;
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 24) : 12;

  if (isNaN(ano) || isNaN(limit)) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { rows } = await db.query(
    `SELECT id, competencia_mes, competencia_ano, valor_cents,
            data_pagamento, comprovante_url, observacao, created_at, updated_at
     FROM financeiro.das_pagamentos
     WHERE mei_id = $1 AND competencia_ano = $2
     ORDER BY competencia_mes DESC
     LIMIT $3`,
    [meiId, ano, limit]
  );

  res.json({ das: rows });
});

// ── POST /financeiro/das ─────────────────────────────────────────────────────

financeiroRouter.post("/das", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const parsed = DASSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { competencia_mes, competencia_ano, valor_cents, data_pagamento, observacao } =
    parsed.data;

  try {
    const { rows } = await db.query(
      `INSERT INTO financeiro.das_pagamentos
         (mei_id, competencia_mes, competencia_ano, valor_cents, data_pagamento, observacao)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, competencia_mes, competencia_ano, valor_cents,
                 data_pagamento, observacao, created_at`,
      [meiId, competencia_mes, competencia_ano, valor_cents, data_pagamento ?? null, observacao ?? null]
    );

    logger.info("financeiro.das.created", {
      meiId,
      dasId: rows[0].id,
      competenciaMes: competencia_mes,
      competenciaAno: competencia_ano,
    });

    res.status(201).json(rows[0]);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      res.status(409).json({
        error: `DAS para ${String(competencia_mes).padStart(2, "0")}/${competencia_ano} já registrado`,
      });
      return;
    }
    throw err;
  }
});

// ── GET /financeiro/das/:id ──────────────────────────────────────────────────

financeiroRouter.get("/das/:id", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const { id } = req.params;

  const { rows } = await db.query(
    `SELECT id, competencia_mes, competencia_ano, valor_cents,
            data_pagamento, comprovante_url, comprovante_s3_key,
            observacao, created_at, updated_at
     FROM financeiro.das_pagamentos
     WHERE id = $1 AND mei_id = $2`,
    [id, meiId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "DAS não encontrado" });
    return;
  }

  res.json(rows[0]);
});

// ── PUT /financeiro/das/:id ──────────────────────────────────────────────────

financeiroRouter.put("/das/:id", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const { id } = req.params;

  const parsed = DASSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  // Verifica existência e ownership
  const { rows: existing } = await db.query(
    `SELECT id FROM financeiro.das_pagamentos WHERE id = $1 AND mei_id = $2`,
    [id, meiId]
  );
  if (existing.length === 0) {
    res.status(404).json({ error: "DAS não encontrado" });
    return;
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const { competencia_mes, competencia_ano, valor_cents, data_pagamento, observacao } =
    parsed.data;

  if (competencia_mes !== undefined) {
    updates.push(`competencia_mes = $${idx++}`);
    params.push(competencia_mes);
  }
  if (competencia_ano !== undefined) {
    updates.push(`competencia_ano = $${idx++}`);
    params.push(competencia_ano);
  }
  if (valor_cents !== undefined) {
    updates.push(`valor_cents = $${idx++}`);
    params.push(valor_cents);
  }
  if ("data_pagamento" in parsed.data) {
    updates.push(`data_pagamento = $${idx++}`);
    params.push(data_pagamento ?? null);
  }
  if ("observacao" in parsed.data) {
    updates.push(`observacao = $${idx++}`);
    params.push(observacao ?? null);
  }

  // comprovante_s3_key pode ser enviado diretamente no body
  if (req.body.comprovante_s3_key !== undefined) {
    updates.push(`comprovante_s3_key = $${idx++}`);
    params.push(req.body.comprovante_s3_key);
  }
  if (req.body.comprovante_url !== undefined) {
    updates.push(`comprovante_url = $${idx++}`);
    params.push(req.body.comprovante_url);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }

  updates.push(`updated_at = NOW()`);
  params.push(id, meiId);

  const { rows } = await db.query(
    `UPDATE financeiro.das_pagamentos
     SET ${updates.join(", ")}
     WHERE id = $${idx} AND mei_id = $${idx + 1}
     RETURNING id, competencia_mes, competencia_ano, valor_cents,
               data_pagamento, observacao, updated_at`,
    params
  );

  logger.info("financeiro.das.updated", { meiId, dasId: id });

  res.json(rows[0]);
});

// ── DELETE /financeiro/das/:id ───────────────────────────────────────────────

financeiroRouter.delete("/das/:id", async (req: Request, res: Response) => {
  const meiId = req.user!.userId;
  const { id } = req.params;

  const { rows } = await db.query(
    `DELETE FROM financeiro.das_pagamentos
     WHERE id = $1 AND mei_id = $2
     RETURNING id`,
    [id, meiId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "DAS não encontrado" });
    return;
  }

  logger.info("financeiro.das.deleted", { meiId, dasId: id });

  res.status(204).send();
});
