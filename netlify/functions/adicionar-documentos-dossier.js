import { addDossierDocuments } from './lib/dossier-store.js';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const body = JSON.parse(event.body || '{}');
    const documents = Array.isArray(body.documents) ? body.documents : [];
    if (!documents.length) return json(400, { error: 'Selecione pelo menos um documento.' });
    if (documents.length > 3 || documents.some((document) => !['application/pdf', 'image/jpeg', 'image/png'].includes(document?.mimeType) || !document?.base64 || String(document.base64).length > 5_600_000)) {
      return json(400, { error: 'Envie até 3 documentos em PDF, JPG ou PNG, num total inferior a 4 MB.' });
    }
    const result = await addDossierDocuments({ id: body.id, token: body.token, documents });
    if (!result.available) return json(503, { error: 'O Dossier Digital está a ser preparado pelo atelier.' });
    if (!result.authorised) return json(403, { error: 'Este link de acesso não é válido ou já não está disponível.' });
    return json(200, result);
  } catch (error) {
    console.error('dossier_upload_error', error.message);
    return json(500, { error: 'Não foi possível guardar os documentos. Confirme que o total é inferior a 4 MB.' });
  }
};
