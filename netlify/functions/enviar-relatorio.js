import PDFDocument from 'pdfkit';
import { hasProfessionalAccess } from './lib/access.js';

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createPdf(text) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 46, info: { Title: 'Relatório Técnico Preliminar - PDM Loulé' } });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document.font('Helvetica-Bold').fontSize(16).fillColor('#1F4B52').text('Relatório Técnico Preliminar - PDM Loulé');
    document.moveDown(0.4);
    document.font('Helvetica').fontSize(8).fillColor('#5D6866').text(`Gerado em ${new Date().toLocaleString('pt-PT')}`);
    document.moveDown();

    for (const rawLine of String(text).split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) { document.moveDown(0.35); continue; }
      const heading = /^(\d+\.|Resultado preliminar|Relatório de Análise Técnica|Documentação e identificação|Elementos extraídos|Regime e regras|Divergências|Informação não confirmada|Próximos passos)/i.test(line);
      document.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(heading ? 10 : 9).fillColor(heading ? '#1F4B52' : '#17201F').text(line, { lineGap: 2 });
    }
    document.moveDown();
    document.font('Helvetica').fontSize(7).fillColor('#5D6866').text('Este relatório é uma pré-análise e não substitui informação prévia, parecer municipal, levantamento topográfico ou validação por técnico habilitado.');
    document.end();
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  const professionalAccess = hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '');
  if (process.env.ALLOW_DIRECT_ANALYSIS !== 'true' && !professionalAccess) return json(403, { error: 'Valide o acesso profissional antes de enviar o relatório.' });
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) return json(503, { error: 'O envio por e-mail ainda não está configurado.' });

  try {
    const { to, reportText } = JSON.parse(event.body || '{}');
    if (!validEmail(to)) return json(400, { error: 'Indique um e-mail de destino válido.' });
    if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) return json(400, { error: 'O relatório a enviar é inválido ou demasiado extenso.' });

    const pdf = await createPdf(reportText);
    const recipient = to.trim();
    const payload = {
      from: process.env.REPORT_FROM_EMAIL,
      to: [recipient],
      subject: 'Relatório Técnico Preliminar - PDM Loulé',
      html: `<p>Segue em anexo o seu <strong>Relatório Técnico Preliminar - PDM Loulé</strong>.</p><p>Este documento é uma pré-análise e requer validação técnica antes de qualquer decisão, projeto ou licenciamento.</p><hr><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12px;color:#17201f">${escapeHtml(reportText)}</pre>`,
      attachments: [{ filename: 'relatorio-tecnico-preliminar-pdm-loule.pdf', content: pdf.toString('base64') }],
    };
    if (validEmail(process.env.REPORT_OWNER_EMAIL || '') && process.env.REPORT_OWNER_EMAIL.trim().toLowerCase() !== recipient.toLowerCase()) payload.bcc = [process.env.REPORT_OWNER_EMAIL.trim()];

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `pdm-report-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('email_provider_error', JSON.stringify({ status: response.status, error: data?.message || data?.name || null }));
      return json(502, { error: 'O serviço de e-mail recusou o envio. Verifique as variáveis Resend e o domínio remetente.' });
    }
    console.info('report_email_sent', JSON.stringify({ id: data?.id || null, recipient }));
    return json(200, { sent: true });
  } catch (error) {
    console.error('report_email_error', error);
    return json(500, { error: 'Não foi possível preparar ou enviar o relatório por e-mail.' });
  }
};
