import { readDossier } from './lib/dossier-store.js';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const data = await readDossier(JSON.parse(event.body || '{}'));
    if (!data.available) return json(503, { error: 'O Dossier Digital está a ser preparado pelo atelier.' });
    if (!data.authorised) return json(403, { error: 'Este link de acesso não é válido ou já não está disponível.' });
    return json(200, data.dossier);
  } catch (error) {
    console.error('dossier_read_error', error.message);
    return json(500, { error: 'Não foi possível abrir o dossier neste momento.' });
  }
};
