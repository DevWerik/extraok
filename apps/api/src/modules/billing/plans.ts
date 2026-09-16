export interface PlanFeatures {
  pdfExport: boolean;
  advancedReports: boolean;
  csvExport: boolean;
}
export type PlanFeature = keyof PlanFeatures;

const commonBenefits = [
  "Cadastro de clientes e serviços extras",
  "Aprovação pelo celular do cliente",
  "Histórico de atendimentos e respostas",
  "Reenvio do mesmo atendimento sem novo consumo",
];

function definePlan<const T extends { id: string; name: string; priceCents: number; jobLimit: number; durationDays: number | null; features: PlanFeatures }>(plan: T) {
  return {
    ...plan,
    benefits: [
      `${plan.jobLimit} atendimentos com link ${plan.durationDays ? `a cada ${plan.durationDays} dias` : "por mês"}`,
      ...commonBenefits,
      ...(plan.features.pdfExport ? ["PDF do atendimento com extras e respostas"] : []),
      ...(plan.features.advancedReports ? ["Relatórios por período, cliente e status"] : []),
      ...(plan.features.csvExport ? ["Exportação dos relatórios em CSV"] : []),
    ],
  };
}

export const BILLING_PLANS = [
  definePlan({ id: "free", name: "Gratuito", priceCents: 0, jobLimit: 3, durationDays: null, features: { pdfExport: false, advancedReports: false, csvExport: false } }),
  definePlan({ id: "pro", name: "Pro", priceCents: 2_990, jobLimit: 50, durationDays: 30, features: { pdfExport: true, advancedReports: false, csvExport: false } }),
  definePlan({ id: "business", name: "Negócio", priceCents: 5_990, jobLimit: 200, durationDays: 30, features: { pdfExport: true, advancedReports: true, csvExport: true } }),
] as const;

export function planFeatures(id: "free" | "pro" | "business"): PlanFeatures {
  return BILLING_PLANS.find((plan) => plan.id === id)!.features;
}

export type PaidPlan = "pro" | "business";
export const BILLING_WEBHOOK_PATH = "/api/v1/billing/webhooks/mercadopago";
export const PAID_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const PIX_EXPIRATION_MS = 30 * 60 * 1000;

export function paidPlan(id: PaidPlan) {
  return id === "pro" ? BILLING_PLANS[1] : BILLING_PLANS[2];
}

export function freeMonthWindow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    // Sao Paulo uses UTC-03; the quota resets at local midnight.
    startsAt: new Date(Date.UTC(year, month - 1, 1, 3)),
    endsAt: new Date(Date.UTC(year, month, 1, 3)),
  };
}

export function validCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(value[length])) return false;
  }
  return true;
}
