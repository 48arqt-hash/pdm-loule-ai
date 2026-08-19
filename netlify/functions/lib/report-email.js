import { createProfessionalPdf } from './report-pdf.js';

const OWNER_EMAIL = 'geral@leonelmendes.com';

export function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export async function sendReportEmail({ to, reportText, reportHtml, location = null }) {
  const recipient = String(to || '').trim();
  if (!validEmail(recipient)) throw new Error('Indique um e-mail de destino válido.');
  if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) throw new Error('O relatório a enviar é inválido ou demasiado extenso.');
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) throw new Error('O envio por e-mail ainda não está configurado.');

  const owner = validEmail(process.env.REPORT_OWNER_EMAIL || '') ? process.env.REPORT_OWNER_EMAIL.trim() : OWNER_EMAIL;
  const pdf = await createProfessionalPdf({ reportHtml, reportText, location });
  const payload = {
    from: process.env.REPORT_FROM_EMAIL,
    to: [recipient],
    subject: 'Relatório de Pré-Análise Urbanística - Arq. Leonel Mendes',
    html: `<p>Exmo.(a) Cliente,</p><p>Segue em anexo o seu <strong>Relatório de Pré-Análise Urbanística</strong>.</p><p>Este documento foi produzido com apoio de inteligência artificial e dados geográficos oficiais. É uma pré-análise e requer validação técnica antes de qualquer decisão, projeto ou licenciamento.</p><hr><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12px;color:#17201f">${escapeHtml(reportText)}</pre>`,
    attachments: [{ filename: 'relatorio-pre-analise-urbanistica.pdf', content: pdf.toString('base64') }],
  };
  if (owner.toLowerCase() !== recipient.toLowerCase()) payload.bcc = [owner];

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pdm-report-${crypto.randomUUID()}` },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 300) }; }
  if (!response.ok) {
    console.error('email_provider_error', JSON.stringify({ status: response.status, error: data?.message || data?.name || null }));
    throw new Error('O serviço de e-mail recusou o envio. Verifique as variáveis Resend e o domínio remetente.');
  }
  return { id: data?.id || null, recipient, owner };
}
