import { hasProfessionalAccess } from './lib/access.js';
import { operationSummary } from './lib/operation-metrics.js';

const json = (statusCode, payload) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(payload) });

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método não permitido.' });
  if (!hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '')) return json(403, { error: 'Valide o acesso profissional para consultar as métricas.' });
  try { return json(200, await operationSummary()); }
  catch (error) { console.error('operation_metrics_error', error); return json(503, { error: 'Não foi possível consultar as métricas neste momento.' }); }
};
