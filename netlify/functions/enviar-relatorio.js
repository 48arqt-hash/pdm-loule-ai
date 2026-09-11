import { hasProfessionalAccess } from './lib/access.js';
import { sendReportEmail, validEmail } from './lib/report-email.js';
import { recordOperation } from './lib/operation-metrics.js';
import { createDossier } from './lib/dossier-store.js';

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
    const { to, reportText, reportHtml, location, documentPlan, privacyConsent, privacyPolicyVersion } = JSON.parse(event.body || '{}');
    if (privacyConsent !== true) return json(400, { error: 'Aceite a Política de Privacidade antes de enviar o relatório.' });
    if (!validEmail(to)) return json(400, { error: 'Indique um e-mail de destino válido.' });
    if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) return json(400, { error: 'O relatório a enviar é inválido ou demasiado extenso.' });
    const validPlan = documentPlan?.base64 && ['image/jpeg', 'image/png'].includes(documentPlan.mimeType)
      && documentPlan.base64.length <= 2_500_000
      ? { image: Buffer.from(documentPlan.base64, 'base64'), source: String(documentPlan.source || 'Planta de Localização oficial') }
      : null;
    let dossier = null;
    try {
      dossier = await createDossier({ email: to, location: location || null, reportHtml, reportText });
    } catch (dossierError) {
      console.warn('manual_report_dossier_unavailable', dossierError?.message || 'unknown');
    }
    const siteUrl = String(process.env.PUBLIC_SITE_URL || 'https://leonelmendes.com').replace(/\/$/, '');
    const dossierLink = dossier?.available ? `${siteUrl}/dossier.html?id=${encodeURIComponent(dossier.id)}&token=${encodeURIComponent(dossier.token)}` : null;
    const sent = await sendReportEmail({ to, reportText, reportHtml, location, privacyPolicyVersion: privacyPolicyVersion || null, documentPlan: validPlan, dossierLink, reportReference: dossier?.reportReference || null });
    await recordOperation({ eventType: 'report_resend', email: to, municipality: location?.municipio?.nome || null }).catch((error) => console.warn('report_resend_tracking_unavailable', error.message));
    console.info('privacy_consent_recorded', JSON.stringify({ service: 'reenvio-relatorio', policyVersion: privacyPolicyVersion || 'não indicado', at: new Date().toISOString() }));
    console.info('report_email_sent', JSON.stringify(sent));
    return json(200, { sent: true, dossierAvailable: Boolean(dossier?.available) });
  } catch (error) {
    console.error('report_email_error', error);
    return json(500, { error: 'Não foi possível preparar ou enviar o relatório por e-mail.' });
  }
};
