import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import { extraStatusLabels, jobStatusLabels } from "./service.js";

const require = createRequire(import.meta.url);
const regularFont = require.resolve("@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff");
const boldFont = require.resolve("@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff");
interface JobDocument {
  id: string;
  title: string;
  description: string;
  scheduledAt: Date;
  status: keyof typeof jobStatusLabels;
  client: { name: string; phone: string; email: string };
  extras: { title: string; description: string; priceCents: number; status: keyof typeof extraStatusLabels; respondedAt: Date | null }[];
}

export function createJobPdf(job: JobDocument, businessName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true,
      info: { Title: `Atendimento - ${job.title}`, Author: businessName, Creator: "ExtraOK" }, lang: "pt-BR" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("Body", regularFont).registerFont("Heading", boldFont);
    const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
    const date = (value: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(value);
    const text = (value: string, size = 10, bold = false, color = "#334155") => {
      doc.font(bold ? "Heading" : "Body").fontSize(size).fillColor(color).text(value.normalize("NFC"), { lineGap: 3 });
    };
    const section = (title: string, minimumHeight = 92) => {
      if (doc.y + minimumHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();
      doc.moveDown(0.6);
      text(title, 13, true, "#12352c");
      doc.moveDown(0.3);
    };
    text("ExtraOK", 23, true, "#166534");
    text("Registro de atendimento e respostas", 12);
    doc.moveDown();
    text(businessName, 13, true);
    text(`Emitido em ${date(new Date())} · Horário de Brasília`, 9);
    section("Atendimento");
    text(job.title, 16, true);
    text(`Agendado: ${date(job.scheduledAt)} · ${jobStatusLabels[job.status]}`);
    text(`Identificador: ${job.id}`, 8);
    doc.moveDown(0.4);
    text(job.description);
    section("Cliente");
    text(job.client.name, 11, true);
    text(`Telefone: ${job.client.phone}`);
    text(`E-mail: ${job.client.email}`);
    section("Serviços extras e respostas");
    if (!job.extras.length) text("Nenhum serviço extra cadastrado.");
    for (const [index, extra] of job.extras.entries()) {
      if (doc.y > doc.page.height - 170) doc.addPage();
      text(`${index + 1}. ${extra.title}`, 11, true);
      text(`${money(extra.priceCents)} · ${extraStatusLabels[extra.status]}`, 10, true);
      text(extra.description);
      text(extra.respondedAt ? `Resposta registrada em ${date(extra.respondedAt)}` : "Sem resposta registrada.", 9);
      doc.moveDown(0.7);
    }
    section("Totais dos extras", 160);
    for (const status of ["approved", "pending", "rejected"] as const) {
      text(`${extraStatusLabels[status]}: ${money(job.extras.filter((extra) => extra.status === status).reduce((total, extra) => total + extra.priceCents, 0))}`, 11, status === "approved");
    }
    doc.moveDown();
    text("Este documento registra o estado dos extras no momento da emissão. A aprovação não comprova pagamento. Não é nota fiscal.", 9);
    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page);
      doc.font("Body").fontSize(8).fillColor("#64748b")
        .text(`ExtraOK · ${page + 1} / ${pages.count}`, 48, doc.page.height - 32, { lineBreak: false });
    }
    doc.end();
  });
}
