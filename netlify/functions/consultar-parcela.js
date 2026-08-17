const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

async function requestJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Fonte oficial indisponível (${response.status}).`);
  return response.json();
}

function wmsParcelUrl(lat, lng) {
  const delta = 0.00015;
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo',
    layers: 'cadastralparcel', query_layers: 'cadastralparcel', info_format: 'application/json',
    crs: 'EPSG:4326', bbox: `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`,
    width: '101', height: '101', i: '50', j: '50', feature_count: '1',
  });
  return `https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows?${params}`;
}

function pdmIdentifyUrl(lat, lng) {
  const geometry = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
  const params = new URLSearchParams({
    f: 'json', geometry, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:0,1,3',
    tolerance: '3', mapExtent: `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`,
    imageDisplay: '800,600,96', returnGeometry: 'false',
  });
  return `https://geoloule.cm-loule.pt/arcgisnprot/rest/services/Siteadmin/Base_PDM/MapServer/identify?${params}`;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const { latitude, longitude } = JSON.parse(event.body || '{}');
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 36.9 || lat > 37.5 || lng < -8.6 || lng > -7.7) {
      return json(400, { error: 'Selecione uma localização dentro do concelho de Loulé.' });
    }

    const [parcelResult, pdmResult] = await Promise.allSettled([
      requestJson(wmsParcelUrl(lat, lng)),
      requestJson(pdmIdentifyUrl(lat, lng)),
    ]);
    const parcel = parcelResult.status === 'fulfilled' ? parcelResult.value.features?.[0] || null : null;
    const pdm = pdmResult.status === 'fulfilled' ? pdmResult.value.results || [] : [];

    return json(200, {
      coordenadas: { latitude: lat, longitude: lng },
      parcela: parcel ? { id: parcel.id || null, propriedades: parcel.properties || {}, geometria: parcel.geometry || null } : null,
      pdm: pdm.map((item) => ({ camada: item.layerName, valor: item.value || null, atributos: item.attributes || {} })),
      avisos: [
        ...(parcel ? [] : ['Não foi possível identificar automaticamente uma parcela cadastral neste ponto. Confirme a localização ou use os documentos do prédio.']),
        ...(pdm.length ? [] : ['Não foi obtida leitura automática das camadas PDM. Consulte o Geoportal e peça validação técnica.']),
        'Resultado geográfico preliminar; não substitui confirmação municipal, registo predial ou levantamento topográfico.',
      ],
      fontes: [
        'Carta Cadastral Digital — Sistema Nacional de Informação Cadastral / Direção-Geral do Território',
        'Câmara Municipal de Loulé — PDM: Carta de Ordenamento, Condicionantes e REN',
      ],
      consultadoEm: new Date().toISOString(),
    });
  } catch (error) {
    console.error('parcel_lookup_error', error);
    return json(502, { error: 'Não foi possível consultar as fontes geográficas oficiais neste momento.' });
  }
};
