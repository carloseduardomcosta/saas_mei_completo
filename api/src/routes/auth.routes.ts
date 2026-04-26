import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";

export const authRouter = Router();

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  cpf_cnpj: z.string().min(11).max(18).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/auth/register", authRateLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { name, email, password, cpf_cnpj } = parsed.data;

  const existing = await db.query("SELECT id FROM public.users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: "E-mail já cadastrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Transação: cria usuário + config financeira padrão atomicamente
  const client = await db.connect();
  let user: { id: string; email: string; name: string };
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ id: string; email: string; name: string }>(
      `INSERT INTO public.users (name, email, password_hash, cpf_cnpj)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name`,
      [name, email, passwordHash, cpf_cnpj ?? null]
    );
    user = rows[0];

    // Cria config financeira com defaults: limite R$ 81.000, tipo 'comercio'
    await client.query(
      `INSERT INTO financeiro.config (mei_id, limite_anual_cents, tipo_atividade)
       VALUES ($1, 8100000, 'comercio')`,
      [user.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

authRouter.post("/auth/login", authRateLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const { email, password } = parsed.data;

  const { rows } = await db.query<{ id: string; email: string; name: string; password_hash: string }>(
    "SELECT id, email, name, password_hash FROM public.users WHERE email = $1",
    [email]
  );

  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

authRouter.get("/auth/me", authMiddleware, async (req: Request, res: Response) => {
  const { rows } = await db.query<{ id: string; email: string; name: string; cpf_cnpj: string | null }>(
    "SELECT id, email, name, cpf_cnpj FROM public.users WHERE id = $1",
    [req.user!.userId]
  );

  const user = rows[0];
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  res.json({ id: user.id, name: user.name, email: user.email, cpf_cnpj: user.cpf_cnpj });
});
