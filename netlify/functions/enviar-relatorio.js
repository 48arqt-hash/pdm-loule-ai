import { hasProfessionalAccess } from './lib/access.js';
import { sendReportEmail, validEmail } from './lib/report-email.js';

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  const professionalAccess = hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '');
  if (process.env.ALLOW_DIRECT_ANALYSIS === 'false' && !professionalAccess) return json(403, { error: 'Valide o acesso profissional antes de enviar o relatório.' });

  try {
    const { to, reportText, reportHtml } = JSON.parse(event.body || '{}');
    if (!validEmail(to)) return json(400, { error: 'Indique um e-mail de destino válido.' });
    if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) return json(400, { error: 'O relatório a enviar é inválido ou demasiado extenso.' });
    const sent = await sendReportEmail({ to, reportText, reportHtml });
    console.info('report_email_sent', JSON.stringify(sent));
    return json(200, { sent: true });
  } catch (error) {
    console.error('report_email_error', error);
    return json(500, { error: 'Não foi possível preparar ou enviar o relatório por e-mail.' });
  }
};
