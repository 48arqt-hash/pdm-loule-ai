const DGT_API = 'https://ogcapi.dgterritorio.gov.pt';
const ALGARVE = { minLat: 36.8, maxLat: 37.75, minLng: -9.2, maxLng: -7.05 };
const SOURCE_TIMEOUT_MS = 3_500;
let cadastralCollectionPromise;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=45, s-maxage=45',
    },
    body: JSON.stringify(payload),
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/geo+json, application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Fonte indisponível (${response.status})`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cadastralCollection() {
  if (!cadastralCollectionPromise) {
    cadastralCollectionPromise = fetchJson(`${DGT_API}/collections?f=json`)
      .then(({ collections = [] }) => {
        const item = collections.find((collection) => `${collection.id || ''} ${collection.title || ''} ${collection.description || ''}`.toLowerCase().includes('cadastro') && `${collection.id || ''} ${collection.title || ''} ${collection.description || ''}`.toLowerCase().includes('predial'));
        if (!item?.id) throw new Error('Coleção cadastral indisponível');
        return item.id;
      })
      .catch((error) => { cadastralCollectionPromise = null; throw error; });
  }
  return cadastralCollectionPromise;
}

function validBounds(value) {
  const south = Number(value?.south), west = Number(value?.west), north = Number(value?.north), east = Number(value?.east);
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) return null;
  if (south < ALGARVE.minLat || north > ALGARVE.maxLat || west < ALGARVE.minLng || east > ALGARVE.maxLng) return null;
  // Evita pedidos demasiado extensos à fonte pública. A interface pede zoom
  // próximo antes de chamar esta função; este limite é uma segunda barreira.
  if ((north - south) > 0.045 || (east - west) > 0.06) return null;
  return { south, west, north, east };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const body = JSON.parse(event.body || '{}');
    const bounds = validBounds(body.bounds);
    if (!bounds) return json(400, { error: 'Aproxime o mapa para consultar os limites cadastrais.' });
    const collection = await cadastralCollection();
    const params = new URLSearchParams({
      bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
      limit: '650',
      f: 'json',
    });
    const data = await fetchJson(`${DGT_API}/collections/${encodeURIComponent(collection)}/items?${params}`);
    const features = Array.isArray(data.features) ? data.features.filter((feature) => feature?.geometry) : [];
    return json(200, { type: 'FeatureCollection', features, truncated: features.length >= 650 });
  } catch (error) {
    console.warn('cadastre_view_unavailable', error?.message || 'unavailable');
    return json(503, { error: 'Os limites cadastrais estão temporariamente indisponíveis. Pode continuar a localizar ou desenhar o limite aproximado do terreno.' });
  }
}
