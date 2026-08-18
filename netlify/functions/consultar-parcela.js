const DGT_API = 'https://ogcapi.dgterritorio.gov.pt';
const LOULÉ_PLANS = 'https://geoloule.cm-loule.pt/arcgisnprot/rest/services/Siteadmin/eploc_pmots_vigor/MapServer/15/query';
const LOULÉ_ZONING = 'https://geoloule.cm-loule.pt/arcgisnprot/rest/services/MapasOnline/PMOT_vigor_ZONAM_MO/MapServer';
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

function normalizedKey(value = '') { return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function propertyValue(properties = {}, names = []) {
  const entries = Object.entries(properties);
  const match = names.map((name) => entries.find(([key]) => normalizedKey(key) === normalizedKey(name))).find(Boolean);
  return match?.[1] !== undefined && match?.[1] !== null && String(match[1]).trim() ? String(match[1]).trim() : null;
}

function readableValue(properties = {}) {
  const preferred = ['designacao', 'designação', 'descricao', 'descrição', 'classe_designacao', 'categoria_designacao', 'uso_designacao', 'nome', 'name', 'tipologia'];
  const entries = Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value]);
  const match = preferred.map((key) => entries.find(([property]) => property === key)).find(Boolean);
  const value = match?.[1] ? String(match[1]).trim() : null;
  return value && !/^\d+$/.test(value) ? value : null;
}

function cadastralIdentification(properties = {}, fallbackId = null) {
  return {
    declaracao: propertyValue(properties, ['numero_declaracao', 'n_declaracao', 'declaracao_cadastral', 'numero_da_declaracao']),
    referencia: propertyValue(properties, ['inspire:inspireid', 'inspireid', 'referencia_cadastral', 'identificador']) || fallbackId,
  };
}

async function municipalPlans(lat, lng) {
  const params = new URLSearchParams({ f: 'json', geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'NOME,FREGUESIA,REGULAMENTO,CONDICIONANTES,TIPO,DATAVIGOR', returnGeometry: 'false' });
  return (await fetchJson(`${LOULÉ_PLANS}?${params}`)).features || [];
}

async function zoningFeatures(layerId, lat, lng) {
  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'ID_SECC,CAT,SUB_CAT,SUB_CAT_UE,SUB_CAT_UP,DENS,NMAX_PISOS,CERCEA_MAX,ICM,CCM', returnGeometry: 'false',
  });
  return (await fetchJson(`${LOULÉ_ZONING}/${layerId}/query?${params}`)).features || [];
}

async function quarteiraNorthEastRules(lat, lng) {
  const responses = await Promise.allSettled([231, 232, 233].map((layerId) => zoningFeatures(layerId, lat, lng)));
  return responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []).map((feature) => feature.attributes || {});
}

function zoningResult(attributes) {
  const category = [attributes.CAT, attributes.SUB_CAT || attributes.SUB_CAT_UP || attributes.SUB_CAT_UE].filter(Boolean).join(' — ');
  const hasNumber = (value) => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
  const values = [
    category ? { camada: 'Classificação e uso dominante (PUQNNE)', valor: category } : null,
    attributes.ID_SECC ? { camada: 'Secção do plano (PUQNNE)', valor: attributes.ID_SECC } : null,
    hasNumber(attributes.NMAX_PISOS) ? { camada: 'Pisos máximos cartografados (PUQNNE)', valor: String(attributes.NMAX_PISOS) } : null,
    hasNumber(attributes.CERCEA_MAX) ? { camada: 'Cércea máxima cartografada (PUQNNE)', valor: `${attributes.CERCEA_MAX} m` } : null,
    hasNumber(attributes.ICM) ? { camada: 'Índice de construção (ICM, PUQNNE)', valor: String(attributes.ICM) } : null,
    hasNumber(attributes.CCM) ? { camada: 'Coeficiente de cobertura (CCM, PUQNNE)', valor: String(attributes.CCM) } : null,
  ];
  return values.filter(Boolean);
}

function pdmRulesForLandUse(landUseLabel, parcelArea) {
  const label = String(landUseLabel || '').toLowerCase();
  const area = Number(parcelArea);
  if (!/aglomerado urbano\s*-?\s*tipo c/.test(label)) return [];
  const theoreticalArea = Number.isFinite(area) && area > 0 ? `${(area * 0.30).toFixed(1).replace('.', ',')} m² (estimativa sobre ${area} m²)` : null;
  return [
    { camada: 'Usos admissíveis se a classe PDM se confirmar (art. 14.º)', valor: 'Habitação, comércio, serviços, equipamentos, restauração/bebidas e empreendimentos turísticos compatíveis' },
    { camada: 'Densidade máxima se a classe PDM se confirmar (art. 14.º)', valor: '75 habitantes por hectare' },
    { camada: 'COS se a classe PDM se confirmar (art. 14.º)', valor: '≤ 0,30' },
    ...(theoreticalArea ? [{ camada: 'Área de construção máxima teórica pelo COS', valor: `${theoreticalArea}; exige confirmação da classe PDM e da área do prédio` }] : []),
    { camada: 'Pisos máximos se a classe PDM se confirmar (art. 14.º)', valor: '3 pisos acima da cota de soleira' },
    { camada: 'Cércea e afastamentos', valor: 'A confirmar pela envolvente, regulamentos aplicáveis e condicionantes; não há valor automático nesta classificação' },
  ];
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
    const hasQuarteiraNorthEastPlan = planFeatures.some((feature) => /quarteira.*norte|norte.*nordeste/i.test(`${feature.attributes?.NOME || ''} ${feature.attributes?.TIPO || ''}`));
    const zoning = hasQuarteiraNorthEastPlan ? await quarteiraNorthEastRules(lat, lng) : [];
    const landUseLabel = use ? readableValue(use.properties) : null;
    const parcelArea = propertyValue(parcel?.properties || {}, ['area', 'area_m2', 'area_ha', 'area_parcela']);
    const results = [
      ...(landUseLabel ? [{ camada: 'Regime de uso do solo (DGT)', valor: landUseLabel, atributos: use.properties || {} }] : []),
      ...pdmRulesForLandUse(landUseLabel, parcelArea),
      ...planFeatures.map((feature) => ({ camada: 'Plano municipal em vigor (CML)', valor: feature.attributes?.NOME || feature.attributes?.TIPO || null, atributos: feature.attributes || {} })),
      ...zoning.flatMap(zoningResult),
    ];
    return json(200, {
      coordenadas: { latitude: lat, longitude: lng }, parcela: parcel ? { id: parcel.id || null, ...cadastralIdentification(parcel.properties || {}, parcel.id || null), propriedades: parcel.properties || {}, geometria: parcel.geometry || null } : null, pdm: results,
      avisos: [
        ...(parcel ? [] : ['A Carta Cadastral Digital não devolveu uma parcela para este ponto. Pode tratar-se de cobertura incompleta, limite impreciso ou de prédio não representado na fonte pública.']),
        ...(!use ? ['Não foi possível obter uma classificação de uso do solo vetorial neste ponto.'] : []),
        ...(use && !landUseLabel ? ['O regime de uso do solo foi encontrado, mas a fonte pública devolveu apenas um código técnico sem designação legível. Esse código não é apresentado ao cliente.'] : []),
        'A classificação cartográfica do plano é cruzada automaticamente quando a camada vetorial oficial estiver disponível. A aplicação final do regulamento depende da geometria exata da propriedade e da pretensão apresentada.',
        'O resultado é preliminar e deve ser confirmado pelos diplomas, regulamentos e representações gráficas oficiais.',
      ],
      fontes: ['Direção-Geral do Território — OGC API: Cadastro Predial e Carta do Regime de Uso do Solo (CC-BY 4.0)', 'Câmara Municipal de Loulé — Planos Municipais em Vigor', ...(hasQuarteiraNorthEastPlan ? ['Câmara Municipal de Loulé — PU de Quarteira Norte-Nordeste: categorias de espaço e parâmetros cartográficos'] : [])], consultadoEm: new Date().toISOString(),
    });
  } catch (error) { console.error('parcel_lookup_error', error); return json(502, { error: 'Não foi possível consultar as fontes geográficas oficiais neste momento.' }); }
};
