const DGT_API = 'https://ogcapi.dgterritorio.gov.pt';
const LOULÉ_PLANS = 'https://geoloule.cm-loule.pt/arcgisnprot/rest/services/Siteadmin/eploc_pmots_vigor/MapServer/15/query';
let collectionsCache;

const json = (statusCode, payload) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(payload) });
async function fetchJson(url) { const response = await fetch(url, { headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error(`Fonte oficial indisponível (${response.status}).`); return response.json(); }

async function findCollection(...terms) {
  if (!collectionsCache) collectionsCache = fetchJson(`${DGT_API}/collections?f=json`);
  const { collections = [] } = await collectionsCache;
  const required = terms.map((term) => term.toLowerCase());
  const collection = collections.find((item) => required.every((term) => `${item.id || ''} ${item.title || ''} ${item.description || ''}`.toLowerCase().includes(term)));
  if (!collection?.id) throw new Error(`Coleção DGT não encontrada: ${terms.join(' ')}.`);
  return collection.id;
}

async function featuresNear(collectionId, lat, lng) {
  const delta = 0.00035;
  const params = new URLSearchParams({ bbox: `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`, limit: '100', f: 'json' });
  return (await fetchJson(`${DGT_API}/collections/${encodeURIComponent(collectionId)}/items?${params}`)).features || [];
}

function insideRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index]; const [xj, yj] = ring[previous];
    if (((yi > point[1]) !== (yj > point[1])) && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function containsPoint(feature, point) {
  if (feature?.geometry?.type === 'Polygon') return insideRing(point, feature.geometry.coordinates[0]);
  if (feature?.geometry?.type === 'MultiPolygon') return feature.geometry.coordinates.some((polygon) => insideRing(point, polygon[0]));
  return false;
}

function readableValue(properties = {}) {
  const preferred = ['designacao', 'designação', 'descricao', 'descrição', 'classe', 'categoria', 'uso', 'nome', 'name', 'tipologia', 'codigo', 'code'];
  const entries = Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]);
  const match = preferred.map((key) => entries.find(([property]) => property === key)).find(Boolean);
  return match?.[1] ? String(match[1]) : null;
}

async function municipalPlans(lat, lng) {
  const params = new URLSearchParams({ f: 'json', geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'NOME,FREGUESIA,REGULAMENTO,CONDICIONANTES,TIPO,DATAVIGOR', returnGeometry: 'false' });
  return (await fetchJson(`${LOULÉ_PLANS}?${params}`)).features || [];
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const { latitude, longitude } = JSON.parse(event.body || '{}'); const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 36.9 || lat > 37.5 || lng < -8.6 || lng > -7.7) return json(400, { error: 'Selecione uma localização dentro do concelho de Loulé.' });
    const [cadastre, landUse, plans] = await Promise.allSettled([
      findCollection('cadastro', 'predial').then((id) => featuresNear(id, lat, lng)),
      findCollection('crus').then((id) => featuresNear(id, lat, lng)), municipalPlans(lat, lng),
    ]);
    const point = [lng, lat];
    const parcel = (cadastre.status === 'fulfilled' ? cadastre.value : []).find((feature) => containsPoint(feature, point)) || null;
    const use = (landUse.status === 'fulfilled' ? landUse.value : []).find((feature) => containsPoint(feature, point)) || null;
    const planFeatures = plans.status === 'fulfilled' ? plans.value : [];
    const results = [
      ...(use ? [{ camada: 'Carta do Regime de Uso do Solo (DGT)', valor: readableValue(use.properties), atributos: use.properties || {} }] : []),
      ...planFeatures.map((feature) => ({ camada: 'Plano municipal em vigor (CML)', valor: feature.attributes?.NOME || feature.attributes?.TIPO || null, atributos: feature.attributes || {} })),
    ];
    return json(200, {
      coordenadas: { latitude: lat, longitude: lng }, parcela: parcel ? { id: parcel.id || null, propriedades: parcel.properties || {}, geometria: parcel.geometry || null } : null, pdm: results,
      avisos: [
        ...(parcel ? [] : ['A Carta Cadastral Digital não devolveu uma parcela para este ponto. Pode tratar-se de cobertura incompleta, limite impreciso ou de prédio não representado na fonte pública.']),
        ...(use ? [] : ['Não foi possível obter uma classificação de uso do solo vetorial neste ponto.']),
        'A Carta do Regime de Uso do Solo não substitui a classificação detalhada do PDM nem a confirmação municipal.',
        'O resultado é preliminar e deve ser confirmado pelos diplomas, regulamentos e representações gráficas oficiais.',
      ],
      fontes: ['Direção-Geral do Território — OGC API: Cadastro Predial e Carta do Regime de Uso do Solo (CC-BY 4.0)', 'Câmara Municipal de Loulé — Planos Municipais em Vigor'], consultadoEm: new Date().toISOString(),
    });
  } catch (error) { console.error('parcel_lookup_error', error); return json(502, { error: 'Não foi possível consultar as fontes geográficas oficiais neste momento.' }); }
};
