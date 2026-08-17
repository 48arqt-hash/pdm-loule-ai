import { accessCookie, createAccessToken, isConfigured, matchesAccessCode } from './lib/access.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido.' }) };
  if (!isConfigured()) return { statusCode: 503, body: JSON.stringify({ error: 'O acesso profissional ainda não está configurado.' }) };
  try {
    const { codigo } = JSON.parse(event.body || '{}');
    if (!matchesAccessCode(codigo)) return { statusCode: 401, body: JSON.stringify({ error: 'Código inválido.' }) };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': accessCookie(createAccessToken()) },
      body: JSON.stringify({ ok: true }),
    };
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Pedido inválido.' }) };
  }
};
