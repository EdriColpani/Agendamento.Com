export const BRAND_NAME = "PlanoAgenda";
export const BRAND_SITE_URL = "https://www.planoagenda.com.br";
export const BRAND_FROM_EMAIL = `${BRAND_NAME} <noreply@planoagenda.com.br>`;
export const BRAND_COPYRIGHT = `© ${BRAND_NAME} - Todos os direitos reservados`;

export const TRIAL_REMINDER_DAYS = [0, 7, 12, 15] as const;
export type TrialReminderDay = (typeof TRIAL_REMINDER_DAYS)[number];

export interface TrialEmailParams {
  companyName: string;
  planName: string | null;
  trialDays: number;
  trialEndsAtBr?: string;
}

type SupabaseAdminLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: number) => {
          maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>;
        };
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
};

function formatDateBrFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, day] = ymd.split("-");
  if (!y || !m || !day) return ymd;
  return `${day}/${m}/${y}`;
}

function buildMessage(day: TrialReminderDay, params: TrialEmailParams) {
  const planLabel = params.planName ? ` no plano <strong>${params.planName}</strong>` : "";
  const ends = params.trialEndsAtBr ? ` (até ${params.trialEndsAtBr})` : "";

  switch (day) {
    case 0:
      return {
        subject: `Bem-vindo ao ${BRAND_NAME} — seu teste grátis começou!`,
        headline: "Seu teste grátis começou",
        body: `Parabéns! Você tem <strong>${params.trialDays} dias grátis</strong>${planLabel}${ends} para explorar o ${BRAND_NAME}.`,
        checklist: [
          "Confirme seu e-mail e acesse o painel",
          "Cadastre seus serviços e colaboradores",
          "Configure lembretes automáticos via WhatsApp",
          "Compartilhe seu link de agendamento com clientes",
        ],
        ctaLabel: "Acessar o painel",
        ctaUrl: `${BRAND_SITE_URL}/dashboard`,
      };
    case 7:
      return {
        subject: `Metade do seu teste grátis no ${BRAND_NAME}`,
        headline: "Você já está na metade do teste",
        body: `Faltam cerca de ${params.trialDays - 7} dias para o fim do seu período de teste${ends}. Aproveite para validar o fluxo completo de agendamentos.`,
        checklist: [
          "Crie pelo menos um agendamento de teste",
          "Ative os lembretes automáticos no WhatsApp",
          "Convide um colaborador para usar a agenda",
        ],
        ctaLabel: "Ver agendamentos",
        ctaUrl: `${BRAND_SITE_URL}/dashboard`,
      };
    case 12:
      return {
        subject: `Faltam 3 dias — teste grátis ${BRAND_NAME}`,
        headline: "Restam 3 dias do seu teste grátis",
        body: `Seu teste encerra em breve${ends}. Para continuar sem interrupção, escolha um plano antes do vencimento.`,
        checklist: [
          "Revise o plano que melhor atende sua operação",
          "Assine com antecedência para manter WhatsApp e agenda ativos",
        ],
        ctaLabel: "Assinar e continuar",
        ctaUrl: `${BRAND_SITE_URL}/planos`,
      };
    case 15:
      return {
        subject: `Seu teste grátis no ${BRAND_NAME} encerrou`,
        headline: "Período de teste encerrado",
        body: `Seu teste gratuito${planLabel} chegou ao fim. Assine agora para retomar o acesso completo ao sistema.`,
        checklist: [
          "Seus dados permanecem salvos",
          "Escolha o plano e conclua o pagamento para reativar",
        ],
        ctaLabel: "Escolher plano",
        ctaUrl: `${BRAND_SITE_URL}/planos`,
      };
  }
}

export function buildTrialEmailHtml(day: TrialReminderDay, params: TrialEmailParams): string {
  const msg = buildMessage(day, params);
  const checklistHtml = msg.checklist
    .map((item) => `<li style="margin-bottom: 8px;">${item}</li>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #F59E0B; color: #000; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #F59E0B; color: #000; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .checklist { background: #fff; border-left: 3px solid #F59E0B; padding: 12px 16px; margin: 16px 0; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h2>${msg.headline}</h2></div>
        <div class="content">
          <p>Olá, <strong>${params.companyName}</strong>.</p>
          <p>${msg.body}</p>
          <div class="checklist">
            <p><strong>Próximos passos:</strong></p>
            <ul>${checklistHtml}</ul>
          </div>
          <p><a href="${msg.ctaUrl}" class="button">${msg.ctaLabel}</a></p>
          <p style="font-size: 13px;">Links úteis: <a href="${BRAND_SITE_URL}/mensagens-whatsapp">WhatsApp</a> · <a href="${BRAND_SITE_URL}/servicos">Serviços</a> · <a href="${BRAND_SITE_URL}/planos">Planos</a></p>
          <div class="footer"><p>${BRAND_COPYRIGHT}</p></div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getTrialEmailSubject(day: TrialReminderDay, params: TrialEmailParams): string {
  return buildMessage(day, params).subject;
}

export async function sendTrialEmailViaResend(
  resendKey: string,
  toEmail: string,
  day: TrialReminderDay,
  params: TrialEmailParams,
): Promise<boolean> {
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: BRAND_FROM_EMAIL,
      to: toEmail,
      subject: getTrialEmailSubject(day, params),
      html: buildTrialEmailHtml(day, params),
    }),
  });

  if (!resendResponse.ok) {
    const errBody = await resendResponse.json().catch(() => ({}));
    console.error("[trial-email] Resend error:", day, errBody);
    return false;
  }

  return true;
}

export async function sendAndLogTrialReminder(
  supabaseAdmin: SupabaseAdminLike,
  resendKey: string,
  input: {
    companyId: string;
    subscriptionId: string;
    toEmail: string;
    day: TrialReminderDay;
    companyName: string;
    planName: string | null;
    trialDays: number;
    trialEndsAt?: string | null;
  },
): Promise<{ sent: boolean; skipped: boolean }> {
  const toEmail = input.toEmail.trim();
  if (!toEmail) return { sent: false, skipped: true };

  const { data: existing } = await supabaseAdmin
    .from("trial_reminder_log")
    .select("id")
    .eq("subscription_id", input.subscriptionId)
    .eq("days_since_start", input.day)
    .maybeSingle();

  if (existing) return { sent: false, skipped: true };

  const params: TrialEmailParams = {
    companyName: input.companyName,
    planName: input.planName,
    trialDays: input.trialDays,
    trialEndsAtBr: input.trialEndsAt ? formatDateBrFromIso(input.trialEndsAt) : undefined,
  };

  const ok = await sendTrialEmailViaResend(resendKey, toEmail, input.day, params);
  if (!ok) return { sent: false, skipped: false };

  const { error: logErr } = await supabaseAdmin.from("trial_reminder_log").insert({
    company_id: input.companyId,
    subscription_id: input.subscriptionId,
    days_since_start: input.day,
    email: toEmail,
  });

  if (logErr && logErr.code !== "23505") {
    console.error("[trial-email] log insert failed:", logErr.message);
  }

  return { sent: true, skipped: false };
}
