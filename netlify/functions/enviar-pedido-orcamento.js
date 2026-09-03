import { recordOperation } from './lib/operation-metrics.js';

const OWNER_EMAIL = 'geral@leonelmendes.com';

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

const validEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) return json(503, { error: 'O envio de pedidos de orçamento ainda não está configurado.' });

  try {
    const { name, email, phone, description, documents = [], privacyConsent, privacyPolicyVersion } = JSON.parse(event.body || '{}');
    if (!name?.trim() || !phone?.trim() || !description?.trim() || !validEmail(email)) return json(400, { error: 'Preencha os dados de contacto e a descrição do projeto.' });
    if (privacyConsent !== true) return json(400, { error: 'Aceite a Política de Privacidade antes de enviar o pedido.' });
    const owner = validEmail(process.env.REPORT_OWNER_EMAIL || '') ? process.env.REPORT_OWNER_EMAIL.trim() : OWNER_EMAIL;
    const safeDocuments = Array.isArray(documents) ? documents.map((item) => escapeHtml(item)).filter(Boolean).join('<br>') : '';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.REPORT_FROM_EMAIL,
        to: [owner],
        reply_to: email.trim(),
        subject: `Novo pedido de orçamento - ${name.trim()}`,
        html: `<h2>Novo pedido de orçamento de projeto</h2><table style="border-collapse:collapse"><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Cliente</th><td style="padding:6px;border:1px solid #ddd">${escapeHtml(name)}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Telefone</th><td style="padding:6px;border:1px solid #ddd">${escapeHtml(phone)}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">E-mail</th><td style="padding:6px;border:1px solid #ddd"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Análise técnica de viabilidade</th><td style="padding:6px;border:1px solid #ddd">Incluída - 100,00 €</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Descrição</th><td style="padding:6px;border:1px solid #ddd">${escapeHtml(description).replaceAll('\n', '<br>')}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Ficheiros indicados</th><td style="padding:6px;border:1px solid #ddd">${safeDocuments || 'Nenhum'}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Privacidade</th><td style="padding:6px;border:1px solid #ddd">Consentimento aceite — Política ${escapeHtml(privacyPolicyVersion || 'não indicada')}</td></tr></table><p>Os ficheiros não são enviados por e-mail nesta fase; a lista serve apenas de referência.</p>`,
      }),
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 300) }; }
    if (!response.ok) {
      console.error('quote_email_provider_error', JSON.stringify({ status: response.status, error: data?.message || data?.name || null }));
      return json(502, { error: 'O serviço de e-mail recusou o pedido. Confirme as variáveis RESEND_API_KEY e REPORT_FROM_EMAIL.' });
    }
    console.info('quote_request_sent', JSON.stringify({ id: data?.id || null, owner }));
    await recordOperation({ eventType: 'quote_request', email, documentsCount: Array.isArray(documents) ? documents.length : 0 }).catch((error) => console.warn('quote_tracking_unavailable', error.message));
    console.info('privacy_consent_recorded', JSON.stringify({ service: 'pedido-orcamento', policyVersion: privacyPolicyVersion || 'não indicado', at: new Date().toISOString() }));
    return json(200, { sent: true });
  } catch (error) {
    console.error('quote_request_error', error);
    return json(500, { error: 'Não foi possível registar o pedido de orçamento.' });
  }
};
