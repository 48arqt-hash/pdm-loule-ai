import { hasProfessionalAccess } from './lib/access.js';
import { listDossiers } from './lib/dossier-store.js';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método não permitido.' });
  if (!hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '')) return json(403, { error: 'É necessário validar o acesso profissional para consultar os processos.' });
  try {
    const data = await listDossiers({ limit: 100 });
    if (!data.available) return json(503, { error: 'A lista de processos está temporariamente indisponível.' });
    return json(200, data);
  } catch (error) {
    console.error('professional_dossier_list_error', error.message);
    return json(500, { error: 'Não foi possível consultar os processos neste momento.' });
  }
};
