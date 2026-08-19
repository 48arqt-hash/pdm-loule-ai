import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FREE_BUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const TIME_ZONE = 'Europe/Lisbon';

const base64Url = (value) => Buffer.from(value).toString('base64url');

function readServiceAccount() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('A ligação ao Google Calendar ainda não está configurada.');
  try {
    const account = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (!account.client_email || !account.private_key) throw new Error('Dados incompletos.');
    return account;
  } catch {
    throw new Error('A variável GOOGLE_SERVICE_ACCOUNT_JSON não contém uma chave JSON válida.');
  }
}

async function accessToken() {
  const account = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.freebusy',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3300,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`); signer.end();
  const assertion = `${header}.${claim}.${signer.sign(account.private_key).toString('base64url')}`;
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    console.error('calendar_token_error', JSON.stringify({ status: response.status, error: data?.error || data?.error_description || null }));
    throw new Error('Não foi possível autenticar a consulta ao Google Calendar.');
  }
  return data.access_token;
}

function offsetMinutes(date, time) {
  const utcGuess = new Date(`${date}T${time}:00Z`);
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' }).formatToParts(utcGuess).find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = zone.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '+' ? minutes : -minutes;
}

function toLisbonIso(date, time) {
  const offset = offsetMinutes(date, time);
  const utc = Date.parse(`${date}T${time}:00Z`) - offset * 60_000;
  return new Date(utc).toISOString();
}

export async function meetingAvailability({ date, time }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) throw new Error('Indique uma data e hora válidas.');
  const duration = Math.max(15, Math.min(240, Number(process.env.MEETING_DURATION_MINUTES || 60)));
  const start = toLisbonIso(date, time);
  const end = new Date(new Date(start).getTime() + duration * 60_000).toISOString();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || '48arqt@gmail.com';
  const token = await accessToken();
  const response = await fetch(FREE_BUSY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: start, timeMax: end, timeZone: TIME_ZONE, items: [{ id: calendarId }] }),
  });
  const data = await response.json();
  const calendar = data?.calendars?.[calendarId];
  if (!response.ok || calendar?.errors?.length) {
    console.error('calendar_freebusy_error', JSON.stringify({ status: response.status, error: calendar?.errors || data?.error || null }));
    throw new Error('Não foi possível confirmar a disponibilidade no calendário.');
  }
  return { available: !(calendar?.busy || []).length, duration, start, end };
}
