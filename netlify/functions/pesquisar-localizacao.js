const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  body: JSON.stringify(body),
});

const ALGARVE_BOUNDS = { minLat: 36.8, maxLat: 37.75, minLon: -9.2, maxLon: -7.05 };
const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const insideAlgarve = (latitude, longitude) => latitude >= ALGARVE_BOUNDS.minLat && latitude <= ALGARVE_BOUNDS.maxLat && longitude >= ALGARVE_BOUNDS.minLon && longitude <= ALGARVE_BOUNDS.maxLon;

// Centros aproximados apenas para enquadrar o mapa. A parcela é sempre
// escolhida pelo utilizador no passo seguinte, nunca por esta tabela.
const LOCALITIES = [
  ['Boliqueime', 37.1292, -8.1584], ['Loulé', 37.1376, -8.0197], ['Quarteira', 37.0695, -8.1018], ['Vilamoura', 37.0807, -8.1179], ['Almancil', 37.0867, -8.0324],
  ['Faro', 37.0194, -7.9304], ['Olhão', 37.0286, -7.8411], ['Tavira', 37.1250, -7.6483], ['Vila Real de Santo António', 37.1957, -7.4177], ['Albufeira', 37.0891, -8.2479],
  ['Silves', 37.1892, -8.4386], ['Portimão', 37.1366, -8.5376], ['Lagos', 37.1028, -8.6742], ['Monchique', 37.3177, -8.5553], ['Aljezur', 37.3192, -8.8033], ['São Brás de Alportel', 37.1531, -7.8877],
];

function coordinateQuery(query) {
  const match = String(query).trim().match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,2}(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]); const longitude = Number(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && insideAlgarve(latitude, longitude)
    ? { latitude, longitude, displayName: `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (coordenadas indicadas)` }
    : null;
}

function localFallback(query) {
  const key = normalize(query);
  const match = LOCALITIES.find(([name]) => {
    const locality = normalize(name);
    return key === locality || key.startsWith(`${locality} `) || locality.startsWith(key);
  });
  return match ? { latitude: match[1], longitude: match[2], displayName: `${match[0]}, Algarve`, source: 'referência local' } : null;
}

async function nominatimSearch(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ format: 'jsonv2', limit: '5', countrycodes: 'pt', q: `${query}, Portugal` }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'LeonelMendesUrbanismo/1.0 (geographic-search)', 'Accept-Language': 'pt-PT,pt;q=0.9' },
    signal: AbortSignal.timeout(4_500),
  });
  if (!response.ok) throw new Error(`geocoder HTTP ${response.status}`);
  const entries = await response.json();
  const result = Array.isArray(entries) ? entries.find((entry) => insideAlgarve(Number(entry.lat), Number(entry.lon))) : null;
  return result ? { latitude: Number(result.lat), longitude: Number(result.lon), displayName: result.display_name, source: 'OpenStreetMap' } : null;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const { query } = JSON.parse(event.body || '{}');
    const text = String(query || '').trim();
    if (text.length < 2 || text.length > 160) return json(400, { error: 'Indique uma localidade, rua ou coordenadas.' });
    const coordinates = coordinateQuery(text);
    if (coordinates) return json(200, coordinates);
    const local = localFallback(text);
    if (local) return json(200, local);
    try {
      const result = await nominatimSearch(text);
      if (result) return json(200, result);
    } catch (error) {
      console.warn('geocoder_unavailable', error.message);
    }
    return json(404, { error: 'Localização não encontrada. Experimente uma rua, localidade ou coordenadas dentro do Algarve.' });
  } catch (error) {
    console.error('location_search_error', error);
    return json(500, { error: 'Não foi possível pesquisar a localização neste momento.' });
  }
};
