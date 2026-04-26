import "dotenv/config";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { logger } from "./utils/logger";
import { dbConnect } from "./db";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth.routes";
import { agendaRouter } from "./routes/agenda.routes";
import { financeiroRouter } from "./routes/financeiro.routes";
import { authMiddleware } from "./middleware/auth";
import { publicRateLimiter } from "./middleware/rateLimiter";
import { initFinanceiroJobs } from "./jobs/financeiro-cron";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*", credentials: true }));
app.use(express.json());
app.use(publicRateLimiter);

app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", agendaRouter);
app.use("/api/financeiro", authMiddleware, financeiroRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Erro interno do servidor" });
});

async function start(): Promise<void> {
  await dbConnect();
  initFinanceiroJobs();
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`API rodando em http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  logger.error("Erro ao iniciar servidor", { error: err.message });
  process.exit(1);
});
