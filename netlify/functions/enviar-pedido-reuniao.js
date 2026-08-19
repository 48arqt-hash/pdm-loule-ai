import { randomUUID } from 'node:crypto';

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
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) return json(503, { error: 'O envio de pedidos de reunião ainda não está configurado.' });

  try {
    const { date, time, name, phone, email } = JSON.parse(event.body || '{}');
    if (!date || !time || !name?.trim() || !phone?.trim() || !validEmail(email)) return json(400, { error: 'Preencha a data, hora e todos os dados de contacto.' });

    const owner = validEmail(process.env.REPORT_OWNER_EMAIL || '') ? process.env.REPORT_OWNER_EMAIL.trim() : OWNER_EMAIL;
    const payload = {
      from: process.env.REPORT_FROM_EMAIL,
      to: [owner],
      reply_to: email.trim(),
      subject: `Novo pedido de reunião - ${name.trim()} - ${date} às ${time}`,
      html: `<h2>Novo pedido de reunião de consultoria</h2><table style="border-collapse:collapse"><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Cliente</th><td style="padding:6px;border:1px solid #ddd">${escapeHtml(name)}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Data pretendida</th><td style="padding:6px;border:1px solid #ddd">${escapeHtml(date)}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Hora pretendida</th><td style="padding:6px;border:1px solid #ddd">${escapeHtml(time)}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">Telefone</th><td style="padding:6px;border:1px solid #ddd">${escapeHtml(phone)}</td></tr><tr><th style="text-align:left;padding:6px;border:1px solid #ddd">E-mail</th><td style="padding:6px;border:1px solid #ddd"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr></table><p>Responda diretamente a este e-mail para contactar o cliente.</p>`,
    };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `meeting-${randomUUID()}` },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 300) }; }
    if (!response.ok) {
      console.error('meeting_email_provider_error', JSON.stringify({ status: response.status, error: data?.message || data?.name || null }));
      return json(502, { error: 'O serviço de e-mail recusou o pedido de reunião. Confirme as variáveis RESEND_API_KEY e REPORT_FROM_EMAIL na Netlify e que o domínio leonelmendes.com está verificado no Resend.' });
    }
    console.info('meeting_request_sent', JSON.stringify({ id: data?.id || null, owner, date, time }));
    return json(200, { sent: true });
  } catch (error) {
    console.error('meeting_request_error', error);
    return json(500, { error: 'Não foi possível registar o pedido de reunião.' });
  }
};
