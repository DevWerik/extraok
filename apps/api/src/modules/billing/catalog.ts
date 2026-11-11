// Public product data shared with the web build. Keep this module independent
// of server configuration, providers, database access and other runtime code.
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

function definePlan<const T extends { id: string; name: string; priceCents: number; compareAtPriceCents: number | null; jobLimit: number; durationDays: number | null; features: PlanFeatures }>(plan: T) {
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
  definePlan({ id: "free", name: "Gratuito", priceCents: 0, compareAtPriceCents: null, jobLimit: 3, durationDays: null, features: { pdfExport: false, advancedReports: false, csvExport: false } }),
  definePlan({ id: "pro", name: "Pro", priceCents: 999, compareAtPriceCents: 1_999, jobLimit: 50, durationDays: 30, features: { pdfExport: true, advancedReports: false, csvExport: false } }),
  definePlan({ id: "business", name: "Negócio", priceCents: 1_999, compareAtPriceCents: 3_999, jobLimit: 200, durationDays: 30, features: { pdfExport: true, advancedReports: true, csvExport: true } }),
] as const;
