import { meetingAvailability } from './lib/google-calendar.js';

const json = (statusCode, payload) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(payload) });

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const { date, time } = JSON.parse(event.body || '{}');
    const result = await meetingAvailability({ date, time });
    return json(200, result);
  } catch (error) {
    console.error('meeting_availability_error', error);
    return json(503, { error: error.message || 'Não foi possível consultar o calendário.' });
  }
};
