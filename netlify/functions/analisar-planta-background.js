import { createHmac, timingSafeEqual } from 'node:crypto';
import { detailedAnalysisHandler } from './analisar-planta.js';

function signature(payload) {
  const secret = process.env.DOSSIER_ACCESS_SECRET || process.env.ANALYSIS_SESSION_SECRET || '';
  return secret ? createHmac('sha256', secret).update(payload).digest('hex') : '';
}
function validSignature(received, payload) {
  const expected = signature(payload);
  if (!received || !expected || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Função de fundo Netlify: devolve 202 de imediato e pode aguardar pelo
// fornecedor de IA sem bloquear a experiência do cliente no navegador.
export const handler = async (event) => {
  const raw = event.body || '';
  const received = event.headers?.['x-lm-analysis-dispatch'] || event.headers?.['X-LM-Analysis-Dispatch'];
  if (event.httpMethod !== 'POST' || !validSignature(received, raw)) return { statusCode: 403, body: 'Forbidden' };
  return detailedAnalysisHandler({ ...event, body: raw });
};
