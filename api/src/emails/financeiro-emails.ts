// Templates de email para o módulo Financeiro.
// Segue o padrão de agenda-emails.ts: funções fire-and-forget via sesSendEmail.
// Tags SES: modulo=financeiro, tipo_alerta={tipo}, mei_id={id}.

import { sesSendEmail } from "../integrations/ses/client";

const FROM_EMAIL =
  process.env.FINANCEIRO_FROM_EMAIL ||
  process.env.FROM_EMAIL ||
  "financeiro@meicompleto.com.br";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Formata centavos para "R$ 0,00". */
function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formata "YYYY-MM-DD" para "DD/MM/YYYY". */
function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Template HTML base — padrão visual do MEI Completo. */
function emailWrapper(title: string, headerBg: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 1px 4px rgba(0,0,0,.08);max-width:600px;width:100%;">
          <tr>
            <td style="background:${headerBg};padding:28px 32px;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px;">
                MEI Completo · Financeiro
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                MEI Completo — Gestão para microempreendedores brasileiros.<br/>
                Você recebeu este email pois é usuário cadastrado no MEI Completo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── sendDasAvisoVencimento ─────────────────────────────────────────────────

export interface DasAvisoParams {
  meiEmail: string;
  meiNome: string;
  meiId: string;
  competenciaMes: number;
  competenciaAno: number;
  dataVencimento: string;   // "YYYY-MM-DD"
  valorCents?: number | null;
}

/**
 * Envia aviso de DAS próximo do vencimento (~5 dias antes).
 * Fire-and-forget: capturar erros no caller com .catch(() => {}).
 */
export async function sendDasAvisoVencimento(params: DasAvisoParams): Promise<void> {
  const { meiEmail, meiNome, meiId, competenciaMes, competenciaAno, dataVencimento, valorCents } = params;

  const mesNome = new Date(competenciaAno, competenciaMes - 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const valorStr = valorCents ? brl(valorCents) : "valor a confirmar no Portal do Empreendedor";

  const subject = `⚠️ DAS de ${mesNome} vence em 5 dias — MEI Completo`;

  const html = emailWrapper(subject, "#d97706", `
    <h2 style="margin:0 0 16px;color:#92400e;font-size:18px;">
      ⚠️ Seu DAS vence em breve!
    </h2>
    <p style="color:#374151;line-height:1.6;">
      Olá, <strong>${meiNome}</strong>! O DAS referente a <strong>${mesNome}</strong>
      está próximo do vencimento.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Competência:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;">${String(competenciaMes).padStart(2, "0")}/${competenciaAno}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Vencimento:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;color:#d97706;">${fmtData(dataVencimento)}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Valor estimado:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;">${valorStr}</td>
      </tr>
    </table>
    <p style="color:#374151;line-height:1.6;">
      Pague pelo <a href="https://www.gov.br/empresas-e-negocios/pt-br/empreendedor" style="color:#2563eb;">Portal do Empreendedor</a>
      ou acesse o <a href="${process.env.APP_URL ?? "https://app.meicompleto.com.br"}/financeiro" style="color:#2563eb;">MEI Completo</a>
      para registrar o pagamento.
    </p>
    <p style="color:#9ca3af;font-size:12px;">
      Pagar após o vencimento gera multa de 2% + juros de 0,033% por dia.
    </p>
  `);

  const text = `MEI Completo — Aviso de DAS\n\nOlá ${meiNome},\n\nSeu DAS de ${mesNome} vence em ${fmtData(dataVencimento)}.\nValor: ${valorStr}\n\nEvite multas pagando até a data de vencimento!\nAcesse: ${process.env.APP_URL ?? "https://app.meicompleto.com.br"}/financeiro`;

  await sesSendEmail({
    to: meiEmail,
    subject,
    html,
    text,
    from: FROM_EMAIL,
    tags: [
      { name: "modulo", value: "financeiro" },
      { name: "tipo_alerta", value: "das_aviso_vencimento" },
      { name: "mei_id", value: meiId },
    ],
  });
}

// ── sendDasVencido ─────────────────────────────────────────────────────────

export interface DasVencidoParams {
  meiEmail: string;
  meiNome: string;
  meiId: string;
  competenciaMes: number;
  competenciaAno: number;
  dataVencimento: string;  // "YYYY-MM-DD"
  diasAtraso: number;
  valorCents?: number | null;
}

/**
 * Envia alerta de DAS vencido (sem pagamento após data de vencimento).
 * Inclui estimativa de multa e juros.
 */
export async function sendDasVencido(params: DasVencidoParams): Promise<void> {
  const { meiEmail, meiNome, meiId, competenciaMes, competenciaAno, dataVencimento, diasAtraso, valorCents } = params;

  const mesNome = new Date(competenciaAno, competenciaMes - 1).toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  let estimativaStr = "";
  if (valorCents) {
    const multa = valorCents * 0.02;
    const juros = valorCents * 0.00033 * diasAtraso;
    const total = valorCents + multa + juros;
    estimativaStr = `
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Valor original:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;">${brl(valorCents)}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Multa estimada (2%):</td>
        <td style="padding:8px 0;text-align:right;color:#ef4444;">${brl(Math.round(multa))}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Juros estimados (0,033%/dia × ${diasAtraso}d):</td>
        <td style="padding:8px 0;text-align:right;color:#ef4444;">${brl(Math.round(juros))}</td>
      </tr>
      <tr style="border-top:2px solid #e5e7eb;">
        <td style="padding:8px 0;font-weight:700;">Total estimado:</td>
        <td style="padding:8px 0;font-weight:700;text-align:right;color:#ef4444;">${brl(Math.round(total))}</td>
      </tr>
    `;
  }

  const subject = `🚨 DAS de ${mesNome} está vencido — MEI Completo`;

  const html = emailWrapper(subject, "#dc2626", `
    <h2 style="margin:0 0 16px;color:#991b1b;font-size:18px;">
      🚨 Seu DAS está vencido!
    </h2>
    <p style="color:#374151;line-height:1.6;">
      Olá, <strong>${meiNome}</strong>! O DAS referente a <strong>${mesNome}</strong>
      não foi pago até a data de vencimento.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Competência:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;">${String(competenciaMes).padStart(2, "0")}/${competenciaAno}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Venceu em:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;color:#ef4444;">${fmtData(dataVencimento)}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Dias em atraso:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;color:#ef4444;">${diasAtraso} dias</td>
      </tr>
      ${estimativaStr}
    </table>
    ${valorCents ? '<p style="color:#9ca3af;font-size:12px;">⚠️ Valor estimado — consulte o DAS atualizado no Portal do Empreendedor.</p>' : ""}
    <p style="color:#374151;line-height:1.6;">
      Regularize pelo <a href="https://www.gov.br/empresas-e-negocios/pt-br/empreendedor" style="color:#2563eb;">Portal do Empreendedor</a>
      ou pelo <a href="${process.env.APP_URL ?? "https://app.meicompleto.com.br"}/financeiro" style="color:#2563eb;">MEI Completo</a>.
    </p>
  `);

  const text = `MEI Completo — DAS Vencido\n\nOlá ${meiNome},\n\nSeu DAS de ${mesNome} está vencido há ${diasAtraso} dias (venceu em ${fmtData(dataVencimento)}).\nRegularize o quanto antes para evitar mais multas e juros.\n\nAcesse: ${process.env.APP_URL ?? "https://app.meicompleto.com.br"}/financeiro`;

  await sesSendEmail({
    to: meiEmail,
    subject,
    html,
    text,
    from: FROM_EMAIL,
    tags: [
      { name: "modulo", value: "financeiro" },
      { name: "tipo_alerta", value: "das_vencido" },
      { name: "mei_id", value: meiId },
    ],
  });
}

// ── sendTermometroAlerta ───────────────────────────────────────────────────

export interface TermometroAlertaParams {
  meiEmail: string;
  meiNome: string;
  meiId: string;
  ano: number;
  marco: 50 | 75 | 90 | 100;
  percentualAtual: number;
  totalCents: number;
  limiteCents: number;
  mesesAteLimite: number | null;
}

/** Emoji e cor do header por marco. */
const MARCO_CONFIG = {
  50:  { emoji: "⚠️",  headerBg: "#d97706", textColor: "#92400e" },
  75:  { emoji: "🟠",  headerBg: "#ea580c", textColor: "#9a3412" },
  90:  { emoji: "🔴",  headerBg: "#dc2626", textColor: "#991b1b" },
  100: { emoji: "🚨",  headerBg: "#991b1b", textColor: "#7f1d1d" },
} as const;

/**
 * Envia alerta de marco do termômetro do limite anual.
 */
export async function sendTermometroAlerta(params: TermometroAlertaParams): Promise<void> {
  const { meiEmail, meiNome, meiId, ano, marco, percentualAtual, totalCents, limiteCents, mesesAteLimite } = params;

  const cfg = MARCO_CONFIG[marco];
  const restanteCents = Math.max(0, limiteCents - totalCents);
  const projecaoStr = mesesAteLimite === null
    ? "Sem receitas registradas"
    : mesesAteLimite === 0
      ? "⚠️ Limite ultrapassado!"
      : `Estimativa: ~${mesesAteLimite} meses para atingir o limite`;

  const subject = `${cfg.emoji} Você usou ${marco}% do seu limite MEI em ${ano} — MEI Completo`;

  const html = emailWrapper(subject, cfg.headerBg, `
    <h2 style="margin:0 0 16px;color:${cfg.textColor};font-size:18px;">
      ${cfg.emoji} Alerta de Limite Anual MEI
    </h2>
    <p style="color:#374151;line-height:1.6;">
      Olá, <strong>${meiNome}</strong>! Suas receitas em ${ano} atingiram
      <strong>${percentualAtual.toFixed(2)}%</strong> do limite anual do MEI.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Total de receitas em ${ano}:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;">${brl(totalCents)}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Limite anual MEI:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;">${brl(limiteCents)}</td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Ainda disponível:</td>
        <td style="padding:8px 0;font-weight:600;text-align:right;color:${restanteCents > 0 ? "#16a34a" : "#ef4444"};">
          ${brl(restanteCents)}
        </td>
      </tr>
      <tr style="border-top:1px solid #e5e7eb;">
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Projeção:</td>
        <td style="padding:8px 0;text-align:right;">${projecaoStr}</td>
      </tr>
    </table>
    ${marco >= 75 ? `
    <p style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:12px;color:#92400e;font-size:14px;line-height:1.5;">
      <strong>Atenção:</strong> Se suas receitas anuais superarem R$ 81.000, você será desenquadrado
      do MEI e deverá se reenquadrar como ME (Microempresa), com obrigações fiscais adicionais.
      Consulte um contador se necessário.
    </p>
    ` : ""}
    <p style="color:#374151;line-height:1.6;">
      Acompanhe seu termômetro em tempo real no
      <a href="${process.env.APP_URL ?? "https://app.meicompleto.com.br"}/financeiro" style="color:#2563eb;">MEI Completo</a>.
    </p>
  `);

  const text = `MEI Completo — Alerta de Limite Anual\n\nOlá ${meiNome},\n\nVocê usou ${percentualAtual.toFixed(2)}% do limite MEI em ${ano}.\nTotal de receitas: ${brl(totalCents)}\nLimite: ${brl(limiteCents)}\nDisponível: ${brl(restanteCents)}\n\nAcesse: ${process.env.APP_URL ?? "https://app.meicompleto.com.br"}/financeiro`;

  await sesSendEmail({
    to: meiEmail,
    subject,
    html,
    text,
    from: FROM_EMAIL,
    tags: [
      { name: "modulo", value: "financeiro" },
      { name: "tipo_alerta", value: `termometro_${marco}pct` },
      { name: "mei_id", value: meiId },
    ],
  });
}
