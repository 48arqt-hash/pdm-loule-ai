import { createProfessionalPdf } from './report-pdf.js';

const OWNER_EMAIL = 'geral@leonelmendes.com';

export function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export async function sendReportEmail({
  to,
  reportText,
  reportHtml,
  location = null,
  documentTitle = 'Relatório de Pré-Análise Urbanística',
  documentLabel = 'PRÉ-ANÁLISE URBANÍSTICA',
  attachmentFilename = 'relatorio-pre-analise-urbanistica.pdf',
  disclaimer = 'Pré-análise assistida por IA. Não constitui parecer municipal nem decisão de licenciamento.',
  emailIntro = 'Este documento foi produzido com apoio de inteligência artificial e dados geográficos oficiais. É uma pré-análise e requer validação técnica antes de qualquer decisão, projeto ou licenciamento.',
  privacyPolicyVersion = null,
  documentPlan = null,
}) {
  const recipient = String(to || '').trim();
  if (!validEmail(recipient)) throw new Error('Indique um e-mail de destino válido.');
  if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) throw new Error('O relatório a enviar é inválido ou demasiado extenso.');
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) throw new Error('O envio por e-mail ainda não está configurado.');

  const owner = validEmail(process.env.REPORT_OWNER_EMAIL || '') ? process.env.REPORT_OWNER_EMAIL.trim() : OWNER_EMAIL;
  const pdf = await createProfessionalPdf({ reportHtml, reportText, location, documentTitle, documentLabel, disclaimer, documentPlan });
  const siteUrl = String(process.env.PUBLIC_SITE_URL || 'https://leonelmendes.com').replace(/\/$/, '');
  const logoUrl = `${siteUrl}/images/logo.png`;
  const payload = {
    from: process.env.REPORT_FROM_EMAIL,
    to: [recipient],
    subject: `Segue em anexo o seu ${documentTitle} - Arq. Leonel Mendes`,
    // O e-mail é uma comunicação de entrega, não uma cópia desformatada do
    // relatório. A leitura técnica permanece no PDF profissional em anexo.
    html: `<div style="max-width:620px;margin:0 auto;font-family:Arial,sans-serif;color:#183e5a;line-height:1.55"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #d8e0df;margin:0 0 26px"><tr><td width="58" style="padding:0 12px 14px 0;vertical-align:middle"><img src="${escapeHtml(logoUrl)}" width="50" height="50" alt="Arq. Leonel Mendes" style="display:block;width:50px;height:50px;object-fit:contain;border:0"></td><td style="padding:0 0 14px;vertical-align:middle;line-height:1.1"><span style="display:block;font-size:18px;line-height:20px;font-weight:700;color:#183e5a">Arq. Leonel Mendes</span><span style="display:block;margin-top:2px;font-size:11px;line-height:13px;letter-spacing:.55px;color:#687775;text-transform:uppercase">Arquitetura + Inteligência</span></td></tr></table><p>Exmo.(a) Cliente,</p><p>Segue em anexo o seu <strong>${escapeHtml(documentTitle)}</strong>.</p><p>${escapeHtml(emailIntro)}</p><div style="margin:22px 0;padding:16px 18px;background:#f3f5f3;border-left:4px solid #bd8b37;color:#273238"><strong>Informação importante</strong><br>O documento é uma pré-análise técnica. Antes de qualquer compra, projeto, obra ou pedido de licenciamento, o enquadramento deve ser validado por técnico habilitado e, quando aplicável, pelas entidades competentes.</div><p>Para sua segurança, este pedido foi registado pelo atelier${privacyPolicyVersion ? ` de acordo com a informação de privacidade indicada (versão ${escapeHtml(privacyPolicyVersion)})` : ''}.</p><p>Sem mais a acrescentar, com os melhores cumprimentos.</p><p style="margin:0 0 2px"><strong>Leonel Mendes</strong><br>Arquiteto</p><p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#57645f">Morada/Adress: Av. José da Costa Mealha n.º 133, 8100-500 Loulé<br>Tel: <a href="tel:+351960010870" style="color:#183e5a;text-decoration:none">(+351) 960 010 870</a><br>E-mail: <a href="mailto:geral@leonelmendes.com" style="color:#183e5a">geral@leonelmendes.com</a><br><a href="https://www.leonelmendes.com/" style="color:#183e5a">www.leonelmendes.com</a></p></div>`,
    attachments: [{ filename: attachmentFilename, content: pdf.toString('base64') }],
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
