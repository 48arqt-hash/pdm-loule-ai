import { regulatoryContextFor } from './lib/territorial-data.js';

const DGT_API = 'https://ogcapi.dgterritorio.gov.pt';
// Camada vetorial municipal de planos eficazes. É consultada antes do PDM,
// pois um PU ou PP pode prevalecer sobre o regulamento geral do PDM.
const LOULÉ_PLANS = 'https://geoloule.cm-loule.pt/arcgisnprot/rest/services/Siteadmin/eploc_pmots_vigor/MapServer/0/query';
const LOULÉ_ZONING = 'https://geoloule.cm-loule.pt/arcgisnprot/rest/services/MapasOnline/PMOT_vigor_ZONAM_MO/MapServer';
// Áreas municipais publicadas como feições, distintas da carta raster do PDM.
// São condicionantes territoriais a assinalar, não categorias de solo.
const LOULÉ_PREVENTIVE_AREAS = [
  { id: 5, nome: 'Medidas preventivas — Quarteira Nascente' },
  { id: 8, nome: 'Medidas preventivas — Mercado da Fruta (Quarteira)' },
];
const FARO_WMS = 'https://mapas.cm-faro.pt/geoserver/wms';
const FARO_ORDERING_LAYER = 'pdm2024:1_1_P_Ordenamento_MOT';
let collectionsCache;

const ALGARVE = { minLat: 36.8, maxLat: 37.75, minLng: -9.2, maxLng: -7.05 };
const MUNICIPAL_PROFILES = {
  'loule': { nome: 'Loulé', estado: 'Planos eficazes e zonas específicas por fonte vetorial; PDM geral publicado como carta raster, a confirmar pela planta de ordenamento', geoportal: 'https://geoloule.cm-loule.pt/', regulamentos: [{ nome: 'Regulamento oficial do PDM de Loulé', url: 'https://geoloule.cm-loule.pt/docs/regulamentos/pmots/PDM_Regulamento.pdf' }, { nome: 'RMUE de Loulé', url: 'https://files.diariodarepublica.pt/2s/2024/08/155000000/0034300423.pdf' }], capacidade: 'Parâmetros quantitativos apenas quando a zona específica/PU/PP for devolvida pela fonte vetorial municipal.' },
  'faro': { nome: 'Faro', estado: 'Regulamento e cartografia oficiais disponíveis; parâmetros automáticos apenas após atributo vetorial confirmado da Planta 1.1', geoportal: 'https://mapas.cm-faro.pt/geoportal/mapa/pmot', regulamentos: [{ nome: 'Regulamento do PDM de Faro', url: 'https://mapas.cm-faro.pt/geoportal/docs/pdm_2024/Regulamento.pdf' }], capacidade: 'Consulta visual WMS ativa; a associação automática de índices exige uma camada vetorial municipal com designação textual.' },
  'olhao': { nome: 'Olhão', estado: 'Perfil prioritário - cartografia e planos disponíveis', geoportal: 'https://mapas.cm-olhao.pt/geoportal/webforms/menu_territorio.aspx?separador=&xml=menu_webpdm.xml', regulamentos: [{ nome: 'PDM de Olhão e alterações em vigor', url: 'https://cm-olhao.pt/areas-de-atuacao/urbanismo/planeamento-urbanistico/planos-municipais-de-ordenamento-do-territorio/planos-municipais-em-vigor/pdm-plano-diretor-municipal' }], capacidade: 'PDM, condicionantes, RAN, REN, ortofoto e planos de pormenor disponíveis no geoportal.' },
  'alcoutim': { nome: 'Alcoutim', estado: 'Perfil prioritário - cartografia georreferenciada disponível', geoportal: 'https://geoportal.cm-alcoutim.pt/mapa/cartomapas', regulamentos: [{ nome: 'PDM de Alcoutim', url: 'https://cm-alcoutim.pt/pt/areas-de-atuacao/planeamento-e-urbanismo/planeamento-e-ordenamento-do-territorio/plano-diretor-municipal' }], capacidade: 'PDM, REN e extratos de PDM, PU e PP disponíveis no CartoMapas municipal.' },
  'lagos': { nome: 'Lagos', estado: 'Perfil prioritário - planos municipais disponíveis', geoportal: 'https://lagos.city-platform.com/', regulamentos: [{ nome: 'Planos territoriais municipais de Lagos', url: 'https://www.cm-lagos.pt/index.php?Itemid=139&cid=80%3Aurbanismo&id=496%3Aplanos-municipais-de-ordenamento-do-territorio-496&lang=pt&option=com_flexicontent&view=item' }], capacidade: 'PDM, PU e diversos PP com regulamentos, zonamento/implantação e condicionantes.' },
  'albufeira': { nome: 'Albufeira', estado: 'Perfil em validação técnica', geoportal: 'https://plantas.cm-albufeira.pt/', regulamentos: [{ nome: 'Planos municipais de Albufeira', url: 'https://www.cm-albufeira.pt/planos-municipais-de-ordenamento-do-territorio' }], capacidade: 'Geoportal e emissão de plantas publicados; ligação vetorial a validar antes de apresentar parâmetros.' },
  'lagoa': { nome: 'Lagoa', estado: 'Perfil em validação técnica', geoportal: 'https://www.cm-lagoa.pt/investir/plano-diretor-municipal-pdm', regulamentos: [{ nome: 'PDM de Lagoa', url: 'https://www.cm-lagoa.pt/investir/plano-diretor-municipal-pdm' }], capacidade: 'PDM de 2021 disponível; integração cartográfica municipal em validação.' },
};
const MUNICIPALITY_CODES = { '0801': 'albufeira', '0802': 'alcoutim', '0803': 'aljezur', '0804': 'castromarim', '0805': 'faro', '0806': 'lagoa', '0807': 'lagos', '0808': 'loule', '0809': 'monchique', '0810': 'olhao', '0811': 'portimao', '0812': 'saobrasdealportel', '0813': 'silves', '0814': 'tavira', '0815': 'viladobispo', '0816': 'vilarealdesantoantonio' };

const json = (statusCode, payload) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(payload) });
async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Fonte oficial indisponível (${response.status}).`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function findCollection(...terms) {
  if (!collectionsCache) collectionsCache = fetchJson(`${DGT_API}/collections?f=json`);
  let collections;
  try {
    ({ collections = [] } = await collectionsCache);
  } catch (error) {
    // Não manter em memória uma promessa rejeitada: uma indisponibilidade breve
    // da DGT não pode impedir todas as consultas seguintes desta função.
    collectionsCache = null;
    throw error;
  }
  const required = terms.map((term) => term.toLowerCase());
  const collection = collections.find((item) => required.every((term) => `${item.id || ''} ${item.title || ''} ${item.description || ''}`.toLowerCase().includes(term)));
  if (!collection?.id) throw new Error(`Coleção DGT não encontrada: ${terms.join(' ')}.`);
  return collection.id;
}

async function featuresNear(collectionId, lat, lng, delta = 0.00035) {
  const params = new URLSearchParams({ bbox: `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`, limit: '200', f: 'json' });
  return (await fetchJson(`${DGT_API}/collections/${encodeURIComponent(collectionId)}/items?${params}`)).features || [];
}

function ringsFromGeometry(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates.filter((ring) => ring.length > 2);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap((polygon) => polygon.filter((ring) => ring.length > 2));
  return [];
}

function geometryBounds(geometry) {
  const points = ringsFromGeometry(geometry).flat();
  if (!points.length) return null;
  return points.reduce((bounds, [x, y]) => ({
    minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x), maxY: Math.max(bounds.maxY, y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function orientation([ax, ay], [bx, by], [cx, cy]) { return (by - ay) * (cx - bx) - (bx - ax) * (cy - by); }
function pointOnSegment([ax, ay], [bx, by], [cx, cy]) {
  return Math.abs(orientation([ax, ay], [bx, by], [cx, cy])) < 1e-12 && cx >= Math.min(ax, bx) && cx <= Math.max(ax, bx) && cy >= Math.min(ay, by) && cy <= Math.max(ay, by);
}
function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c); const o2 = orientation(a, b, d); const o3 = orientation(c, d, a); const o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return pointOnSegment(a, b, c) || pointOnSegment(a, b, d) || pointOnSegment(c, d, a) || pointOnSegment(c, d, b);
}

function geometriesIntersect(first, second) {
  const firstRings = ringsFromGeometry(first); const secondRings = ringsFromGeometry(second);
  if (!firstRings.length || !secondRings.length) return false;
  if (firstRings.some((ring) => ring.some((point) => insideRing(point, secondRings[0]))) || secondRings.some((ring) => ring.some((point) => insideRing(point, firstRings[0])))) return true;
  return firstRings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return secondRings.some((otherRing) => otherRing.some((otherPoint, otherIndex) => segmentsIntersect(point, next, otherPoint, otherRing[(otherIndex + 1) % otherRing.length])));
  }));
}

async function featuresIntersectingGeometry(collectionId, geometry) {
  const bounds = geometryBounds(geometry);
  if (!bounds) return [];
  const params = new URLSearchParams({ bbox: `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`, limit: '200', f: 'json' });
  const features = (await fetchJson(`${DGT_API}/collections/${encodeURIComponent(collectionId)}/items?${params}`)).features || [];
  return features.filter((feature) => geometriesIntersect(geometry, feature.geometry));
}

async function featureAt(collectionId, lat, lng) {
  // A primeira consulta é muito localizada. A segunda apenas amplia a janela
  // de pesquisa; a seleção continua a exigir que o ponto esteja dentro do polígono.
  for (const delta of [0.00035, 0.0015]) {
    const features = await featuresNear(collectionId, lat, lng, delta);
    const match = features.find((feature) => containsPoint(feature, [lng, lat]));
    if (match) return match;
  }
  return null;
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
  // A CRUS e os serviços municipais não usam todos o mesmo nome de campo.
  // Privilegia-se sempre uma designação textual e nunca se apresenta ao cliente
  // um código isolado (por exemplo 9998) como se fosse uma classe urbanística.
  const preferred = ['designacao', 'designação', 'descricao', 'descrição', 'classe_designacao', 'categoria_designacao', 'subcategoria_designacao', 'uso_designacao', 'nome', 'name', 'tipologia'];
  const entries = Object.entries(properties).map(([key, value]) => [normalizedKey(key).replace(/[^a-z0-9]/g, ''), value]);
  const exact = preferred.map((key) => entries.find(([property]) => property === normalizedKey(key).replace(/[^a-z0-9]/g, ''))).find(Boolean);
  const descriptive = entries.find(([property, value]) => /design|descr|denomin|classe|categoria|subcategoria|tipologia|usosolo|uso/.test(property) && value !== null && value !== undefined && !/^\d+$/.test(String(value).trim()));
  const value = (exact || descriptive)?.[1];
  const text = value === undefined || value === null ? null : String(value).trim();
  return text && !/^\d+$/.test(text) ? text : null;
}

function technicalCode(properties = {}) {
  const entries = Object.entries(properties);
  const match = entries.find(([key, value]) => /cod|code|idclasse|idcategoria|iduso|classeid|categoriaid/.test(normalizedKey(key)) && value !== null && value !== undefined && String(value).trim());
  return match ? { campo: match[0], valor: String(match[1]).trim() } : null;
}

function cadastralIdentification(properties = {}, fallbackId = null) {
  return {
    declaracao: propertyValue(properties, ['numero_declaracao', 'n_declaracao', 'declaracao_cadastral', 'numero_da_declaracao']),
    referencia: propertyValue(properties, ['inspire:inspireid', 'inspireid', 'referencia_cadastral', 'identificador']) || fallbackId,
  };
}

function municipalityName(properties = {}) {
  return propertyValue(properties, ['municipio', 'município', 'concelho', 'nome_municipio', 'nome_concelho', 'dtmn', 'nome']);
}

function municipalityProfile(name = '') {
  const key = normalizedKey(name).replace(/[^a-z]/g, '');
  return MUNICIPAL_PROFILES[key] || MUNICIPAL_PROFILES[MUNICIPALITY_CODES[String(name).match(/^\d{4}/)?.[0]]] || null;
}

async function municipalityAt(lat, lng) {
  const caop = await findCollection('caop');
  const feature = await featureAt(caop, lat, lng);
  const rawName = municipalityName(feature?.properties || {});
  const code = propertyValue(feature?.properties || {}, ['dtmn', 'codigo_municipio', 'código_município', 'dicofre']);
  const profile = municipalityProfile(rawName) || municipalityProfile(code);
  return profile ? { ...profile, fonte: 'Direção-Geral do Território - CAOP', propriedades: feature?.properties || {} } : rawName ? { nome: rawName, estado: 'Concelho do Algarve sem perfil municipal configurado', geoportal: null, regulamentos: [], capacidade: 'Aplicam-se apenas as camadas regionais e nacionais até validação do perfil municipal.', fonte: 'Direção-Geral do Território - CAOP', propriedades: feature?.properties || {} } : null;
}

async function municipalPlans(lat, lng) {
  const params = new URLSearchParams({ f: 'json', geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'NOME,FREGUESIA,REGULAMENTO,CONDICIONANTES,TIPO,DATAVIGOR', returnGeometry: 'false' });
  return (await fetchJson(`${LOULÉ_PLANS}?${params}`)).features || [];
}

async function municipalPreventiveArea(layerId, lat, lng) {
  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'DESIG,DATAVIGOR,FREG,REGULAMENTO,OBS,AREA_M2,LOCAL', returnGeometry: 'false',
  });
  return (await fetchJson(`${LOULÉ_ZONING}/${layerId}/query?${params}`)).features || [];
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

async function municipalOrderingFeatures(queryUrl, lat, lng) {
  if (!queryUrl) return [];
  const params = new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: '*', returnGeometry: 'false',
  });
  const separator = queryUrl.includes('?') ? '&' : '?';
  const response = await fetchJson(`${queryUrl}${separator}${params}`);
  return response.features || [];
}

async function municipalWfsFeatures(serviceUrl, typeName, lat, lng) {
  if (!serviceUrl || !typeName) return [];
  const delta = 0.00002;
  const separator = serviceUrl.includes('?') ? '&' : '?';
  const params = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: typeName, outputFormat: 'application/json', srsName: 'EPSG:4326',
    bbox: `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`, count: '20',
  });
  const payload = await fetchJson(`${serviceUrl}${separator}${params}`);
  const features = payload.features || [];
  // Em caso de limites de geometria, dá-se preferência ao polígono que contém o ponto.
  return features.filter((feature) => !feature.geometry || containsPoint(feature, [lng, lat]));
}

function textFromHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function featureInfoProperties(payload) {
  if (Array.isArray(payload?.features) && payload.features.length) return payload.features[0]?.properties || {};
  if (payload?.properties && typeof payload.properties === 'object') return payload.properties;
  return {};
}

async function faroVisualOrderingAt(lat, lng) {
  // A planta municipal é disponibilizada como WMS. Primeiro tentamos obter a
  // identificação da feição pelo GetFeatureInfo; a leitura por legenda só é
  // usada como interpretação cartográfica preliminar, nunca como confirmação vetorial.
  const delta = 0.00018;
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
    LAYERS: FARO_ORDERING_LAYER, QUERY_LAYERS: FARO_ORDERING_LAYER,
    CRS: 'EPSG:4326', BBOX: `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`,
    WIDTH: '101', HEIGHT: '101', I: '50', J: '50', INFO_FORMAT: 'application/json', FEATURE_COUNT: '5',
  });
  const response = await fetch(`${FARO_WMS}?${params}`, { headers: { Accept: 'application/json, text/html;q=0.8, text/plain;q=0.7' } });
  if (!response.ok) throw new Error(`WMS Faro indisponível (${response.status}).`);
  const raw = await response.text();
  let properties = {};
  try { properties = featureInfoProperties(raw ? JSON.parse(raw) : {}); } catch { properties = { descricao_wms: textFromHtml(raw) }; }
  const label = officialClassification(properties);
  return { label, properties, raw: raw.slice(0, 1500) };
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

function officialClassification(attributes = {}) {
  const value = readableValue(attributes) || propertyValue(attributes, ['categoria', 'subcategoria', 'classe', 'designacao', 'designação', 'uso_solo', 'uso do solo']);
  return value && !/^\d+$/.test(String(value).trim()) ? String(value).trim() : null;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const { latitude, longitude, implantationLatitude, implantationLongitude } = JSON.parse(event.body || '{}'); const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < ALGARVE.minLat || lat > ALGARVE.maxLat || lng < ALGARVE.minLng || lng > ALGARVE.maxLng) return json(400, { error: 'Selecione uma localização dentro do Algarve.' });
    const requestedImplantation = Number.isFinite(Number(implantationLatitude)) && Number.isFinite(Number(implantationLongitude))
      ? { latitude: Number(implantationLatitude), longitude: Number(implantationLongitude) } : null;
    const [cadastre, municipalityResult] = await Promise.allSettled([
      findCollection('cadastro', 'predial').then((id) => featureAt(id, lat, lng)),
      municipalityAt(lat, lng),
    ]);
    const municipality = municipalityResult.status === 'fulfilled' ? municipalityResult.value : null;
    const parcel = cadastre.status === 'fulfilled' ? cadastre.value : null;
    if (requestedImplantation && (!parcel?.geometry || !containsPoint(parcel, [requestedImplantation.longitude, requestedImplantation.latitude]))) {
      return json(400, { error: 'O ponto de implantação deve estar dentro da parcela cadastral selecionada.' });
    }
    const analysisLat = requestedImplantation?.latitude || lat;
    const analysisLng = requestedImplantation?.longitude || lng;
    const plans = municipality?.nome === 'Loulé' ? await Promise.allSettled([municipalPlans(analysisLat, analysisLng)]).then(([result]) => result.status === 'fulfilled' ? result.value : []) : [];
    // A classificação CRUS deixa de ser escolhida apenas pelo pixel onde o
    // utilizador carregou. Quando existe parcela cadastral, pesquisamos todas
    // as feições que intersectam o seu polígono. Assim uma zona RAN parcial
    // não desaparece quando o clique é feito alguns metros ao lado.
    const [landUse] = await Promise.allSettled([
      findCollection('crus').then(async (id) => {
        if (parcel?.geometry) return featuresIntersectingGeometry(id, parcel.geometry);
        const pointFeature = await featureAt(id, lat, lng);
        return pointFeature ? [pointFeature] : [];
      }),
    ]);
    const useFeatures = landUse.status === 'fulfilled' ? landUse.value : [];
    const labelledUses = useFeatures.map((feature) => ({ feature, label: readableValue(feature.properties || {}) })).filter((item) => item.label);
    const landUseLabels = [...new Set(labelledUses.map((item) => item.label))];
    const implantationUse = requestedImplantation
      ? await findCollection('crus').then((id) => featureAt(id, analysisLat, analysisLng)).catch((error) => { console.warn('implantation_land_use_unavailable', error.message); return null; })
      : null;
    const implantationUseLabel = implantationUse ? readableValue(implantationUse.properties || {}) : null;
    const planFeatures = plans;
    const hasQuarteiraNorthEastPlan = planFeatures.some((feature) => /quarteira.*norte|norte.*nordeste/i.test(`${feature.attributes?.NOME || ''} ${feature.attributes?.TIPO || ''}`));
    const zoning = hasQuarteiraNorthEastPlan ? await quarteiraNorthEastRules(analysisLat, analysisLng) : [];
    const preventiveAreas = municipality?.nome === 'Loulé'
      ? (await Promise.allSettled(LOULÉ_PREVENTIVE_AREAS.map(async (area) => ({ ...area, features: await municipalPreventiveArea(area.id, analysisLat, analysisLng) })))).flatMap((result) => result.status === 'fulfilled' ? result.value.features.map((feature) => ({ ...result.value, attributes: feature.attributes || {} })) : [])
      : [];
    const faroOrdering = municipality?.nome === 'Faro'
      ? await municipalOrderingFeatures(process.env.FARO_PDM_ORDERING_QUERY_URL, analysisLat, analysisLng).catch((error) => { console.warn('faro_ordering_unavailable', error.message); return []; })
      : [];
    const faroWfsOrdering = municipality?.nome === 'Faro'
      ? await municipalWfsFeatures(process.env.FARO_PDM_WFS_URL, process.env.FARO_PDM_WFS_TYPENAME, analysisLat, analysisLng).catch((error) => { console.warn('faro_wfs_ordering_unavailable', error.message); return []; })
      : [];
    const faroVisualOrdering = municipality?.nome === 'Faro'
      ? await faroVisualOrderingAt(analysisLat, analysisLng).catch((error) => { console.warn('faro_visual_ordering_unavailable', error.message); return null; })
      : null;
    const faroVectorFeature = faroOrdering[0] || faroWfsOrdering[0] || null;
    const faroVectorClassification = officialClassification(faroVectorFeature?.attributes || faroVectorFeature?.properties || {});
    const faroVisualClassification = faroVisualOrdering?.label || null;
    const faroClassification = faroVectorClassification || faroVisualClassification || null;
    const faroClassificationMethod = faroOrdering.length ? 'camada vetorial oficial ArcGIS' : faroWfsOrdering.length ? 'camada vetorial oficial WFS' : faroVisualOrdering?.label ? 'leitura por ponto da planta de ordenamento WMS' : null;
    const landUseLabel = landUseLabels[0] || null;
    // Em Loulé, a CRUS da DGT devolve designações coincidentes com as
    // subcategorias do PDM em vigor. A regra é apresentada como pré-análise
    // e mantém a ressalva de confirmação pela planta de ordenamento.
    // Uma leitura WMS pode ser útil ao técnico como enquadramento visual, mas
    // não pode desbloquear índices ou regras quantitativas: falta-lhe o
    // atributo vetorial e a respetiva rastreabilidade de feição.
    const regulatoryClassifications = faroVectorClassification ? [faroVectorClassification] : municipality?.nome === 'Loulé' ? (implantationUseLabel ? [implantationUseLabel] : landUseLabels) : [];
    const regulatoryContexts = regulatoryClassifications.map((classification) => regulatoryContextFor(municipality?.nome, classification));
    const regulatoryRules = regulatoryContexts.flatMap((context) => context.rules).filter((rule, index, rules) => rules.findIndex((other) => `${other.camada}|${other.valor}` === `${rule.camada}|${rule.valor}`) === index);
    const regulatorySources = regulatoryContexts.flatMap((context) => context.sources).filter((source, index, sources) => sources.findIndex((other) => other.url === source.url) === index);
    const parcelArea = propertyValue(parcel?.properties || {}, ['area', 'area_m2', 'area_ha', 'area_parcela']);
    const results = [
      ...(municipality ? [{ camada: 'Concelho identificado (CAOP)', valor: municipality.nome, atributos: municipality.propriedades || {} }] : []),
      ...(municipality ? [{ camada: 'Cobertura da pré-análise', valor: municipality.estado }] : []),
      ...(landUseLabels.length === 1 ? [{ camada: parcel ? 'Regime de uso do solo (DGT) — interseção com a parcela' : 'Regime de uso do solo (DGT) — ponto selecionado', valor: landUseLabel, atributos: labelledUses[0].feature.properties || {} }] : []),
      ...(landUseLabels.length > 1 ? landUseLabels.map((label) => ({ camada: 'Regime de uso do solo (DGT) — classe que intersecta a parcela', valor: label, atributos: labelledUses.find((item) => item.label === label)?.feature.properties || {} })) : []),
      ...(implantationUseLabel ? [{ camada: 'Regime de uso do solo (DGT) — ponto de implantação indicado', valor: implantationUseLabel, atributos: implantationUse.properties || {} }] : []),
      ...(faroClassification ? [{ camada: `Classificação do solo — PDM de Faro (${faroClassificationMethod})`, valor: faroClassification, atributos: faroVectorFeature?.attributes || faroVectorFeature?.properties || faroVisualOrdering?.properties || {} }] : []),
      ...regulatoryRules.map((rule) => ({ camada: rule.camada, valor: rule.valor, artigo: rule.artigo, pagina: rule.pagina, fonte: rule.fonte?.documento || 'Regulamento municipal' })),
      ...planFeatures.map((feature) => ({ camada: 'Plano municipal em vigor (CML)', valor: feature.attributes?.NOME || feature.attributes?.TIPO || null, atributos: feature.attributes || {} })),
      ...zoning.flatMap(zoningResult),
      ...preventiveAreas.map((area) => ({ camada: `Condicionante territorial municipal (CML) — ${area.nome}`, valor: area.attributes.DESIG || 'Área abrangida', atributos: area.attributes, fonte: area.attributes.REGULAMENTO || 'Camada vetorial municipal' })),
    ];
    return json(200, {
      coordenadas: { latitude: lat, longitude: lng }, implantacao: requestedImplantation ? { ...requestedImplantation, confirmada: true, metodo: 'Ponto aproximado indicado pelo utilizador dentro da parcela cadastral' } : null, parcela: parcel ? { id: parcel.id || null, ...cadastralIdentification(parcel.properties || {}, parcel.id || null), propriedades: parcel.properties || {}, geometria: parcel.geometry || null } : null, pdm: results,
      avisos: [
        ...(cadastre.status === 'rejected' ? ['A fonte do Cadastro Predial da DGT não respondeu nesta tentativa. Tente novamente dentro de alguns segundos; não foi selecionado qualquer polígono por aproximação.'] : []),
        ...(cadastre.status === 'fulfilled' && !parcel ? ['A Carta Cadastral Digital não devolveu uma parcela para este ponto. Pode tratar-se de cobertura incompleta, limite impreciso ou de prédio não representado na fonte pública.'] : []),
        ...(!useFeatures.length ? ['Não foi possível obter uma classificação de uso do solo vetorial para esta localização.'] : []),
        ...(useFeatures.length && !landUseLabels.length ? [`O regime de uso do solo foi encontrado, mas a fonte pública devolveu apenas ${technicalCode(useFeatures[0].properties || {}) ? `o código técnico ${technicalCode(useFeatures[0].properties || {}).valor}` : 'um código técnico'} sem designação legível. Esse código não é apresentado ao cliente como classificação urbanística.`] : []),
        ...(parcel && landUseLabels.length > 1 ? ['A parcela intersecta mais do que uma classe de uso do solo. As regras e condicionantes são apresentadas para todas as classes identificadas; uma zona RAN ou outra condicionante parcial não pode ser excluída apenas pelo local do clique.'] : []),
        ...(requestedImplantation ? ['A classificação do plano e as regras apresentadas foram relacionadas com o ponto de implantação indicado. O ponto é aproximado e deve ser confirmado por levantamento, projeto e cartografia oficial em vigor.'] : []),
        ...(!parcel && landUseLabels.length ? ['Sem polígono cadastral disponível, a classe apresentada resulta apenas do ponto selecionado e não confirma a totalidade do prédio.'] : []),
        ...(municipality?.nome === 'Faro' && faroClassificationMethod === 'leitura por ponto da planta de ordenamento WMS' ? ['A classe foi obtida por consulta da planta de ordenamento visual publicada pelo Município de Faro. A categoria e as regras são uma interpretação cartográfica preliminar e exigem confirmação municipal ou acesso à camada vetorial oficial.'] : []),
        ...(municipality?.nome === 'Faro' && faroVisualClassification && !faroVectorClassification ? ['Por não existir atributo vetorial confirmado nesta consulta, não são calculados índices, pisos ou áreas máximas a partir desta leitura visual.'] : []),
        ...(municipality?.nome === 'Loulé' && !hasQuarteiraNorthEastPlan ? ['No PDM geral de Loulé, a carta de ordenamento publicada pelo Município é raster. As regras associadas à CRUS são uma referência regulamentar e não confirmam, por si só, a mancha do PDM; índices só são apresentados quando uma zona específica vetorial os devolver.'] : []),
        ...(municipality?.nome === 'Faro' && !faroClassification ? ['Ainda não está configurado um serviço vetorial com atributos da Planta 1.1 do PDM de Faro. A aplicação não inventa uma categoria por cor; a análise fica limitada à CRUS e às restantes condicionantes oficiais até ser registado o WFS/ArcGIS oficial.'] : []),
        ...(municipality?.geoportal ? [`Consulte também o geoportal municipal de ${municipality.nome} para confirmação das plantas e legendas em vigor: ${municipality.geoportal}`] : []),
        'A classificação cartográfica do plano é cruzada automaticamente quando a camada vetorial oficial estiver disponível. A aplicação final do regulamento depende da geometria exata da propriedade e da pretensão apresentada.',
        'O resultado é preliminar e deve ser confirmado pelos diplomas, regulamentos e representações gráficas oficiais.',
      ],
      municipio: municipality,
      fontes: ['Direção-Geral do Território — OGC API: Cadastro Predial, CAOP e Carta do Regime de Uso do Solo (CC-BY 4.0)', ...(municipality?.geoportal ? [`Município de ${municipality.nome} — Geoportal/planos municipais`] : []), ...(faroWfsOrdering.length ? ['Município de Faro — Planta 1.1 do PDM, serviço vetorial WFS'] : []), ...(faroOrdering.length ? ['Município de Faro — Planta 1.1 do PDM, serviço vetorial ArcGIS'] : []), ...regulatorySources.map((source) => `${source.documento} (${source.versao}) — ${source.url}`), ...(hasQuarteiraNorthEastPlan ? ['Câmara Municipal de Loulé — PU de Quarteira Norte-Nordeste: categorias de espaço e parâmetros cartográficos'] : [])], consultadoEm: new Date().toISOString(),
    });
  } catch (error) { console.error('parcel_lookup_error', error); return json(502, { error: 'Não foi possível consultar as fontes geográficas oficiais neste momento.' }); }
};
