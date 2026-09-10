import { hasProfessionalAccess } from './lib/access.js';
import { sendReportEmail, validEmail } from './lib/report-email.js';
import { preexistenceRulesFor, regulatoryRuleCatalogFor, regulatoryRulesFor } from './lib/territorial-data.js';
import { beginAnalysis, finishAnalysis } from './lib/operation-metrics.js';

// Uma Planta de Localização grande pode originar duas imagens leves (PDM e
// legenda), mantendo os quatro documentos originais indicados ao utilizador.
const MAX_DOCUMENTS = 5;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
// O pedido completo passa pela Netlify em base64. O limite efetivo para os
// documentos é inferior ao limite por ficheiro, para não provocar HTTP 413.
const MAX_TOTAL_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_OFFICIAL_REGULATION_BYTES = 5 * 1024 * 1024;
const MAX_CARTOGRAPHIC_EVIDENCE_BYTES = 1_200_000;
// Deixa margem antes do limite de execução da Netlify, evitando uma página 504.
// Alguns pedidos sem PDFs, mas com contexto territorial, podem demorar mais
// do que 11 segundos. Mantemos margem para gerar/enviar o PDF, mas damos ao
// agente tempo suficiente para responder antes de mostrar erro ao cliente.
const MAX_GEMINI_WAIT_MS = 16_000;
const ALLOWED_TYPES = new Set([
  'planta_localizacao',
  'caderneta_predial',
  'registo_predial',
  'levantamento_topografico',
]);
const ALLOWED_DOCUMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(payload),
});

const escapeHtml = (value = '') => String(value)
  .replace(/\b(\d{3})\d{3}(\d{3})\b/g, '$1***$2')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function parseModelJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function enrichLouleDispersedBuildingRules(report, localizacao) {
  const reportedLocation = normalizeText(report?.identificacao?.localizacao || '');
  if (localizacao?.municipio?.nome !== 'Loulé' && !reportedLocation.includes('loule')) return report;
  const wholeReport = normalizeText(JSON.stringify(report || {}));
  if (!wholeReport.includes('area de edificacao dispersa a estruturar')) return report;
  const rules = regulatoryRulesFor('Loulé', 'Área de edificação dispersa a estruturar');
  if (!rules.length) return report;
  const current = Array.isArray(report.regras_aplicaveis) ? report.regras_aplicaveis : [];
  const existing = new Set(current.map((item) => normalizeText(item?.elemento)));
  rules.forEach((rule) => {
    const elemento = String(rule.camada || '').replace(/^Regra urbanística\s*—\s*/i, '');
    if (!existing.has(normalizeText(elemento))) {
      current.push({
        elemento,
        resultado: rule.valor,
        estado: 'Necessita verificação',
        fonte: `Planta de Localização CML + Regulamento do PDM de Loulé (${rule.artigo}, p. ${rule.pagina}; leitura gráfica a confirmar)`,
      });
    }
  });
  report.regras_aplicaveis = current;
  return report;
}

function providerMessage(status, payload = {}) {
  const reason = String(payload?.error?.message || '').toLowerCase();
  if (status === 400) return 'O agente de análise não conseguiu ler o pedido. Confirme se os PDFs são legíveis e volte a tentar apenas com a Planta de Localização.';
  if (status === 401 || status === 403 || reason.includes('api key')) return 'O serviço de análise não está configurado corretamente. O atelier foi avisado para verificar a configuração.';
  if (status === 503 || reason.includes('high demand')) return 'O agente de análise está temporariamente com elevada procura. Aguarde alguns minutos e repita a análise.';
  if (status === 404 || reason.includes('not found') || reason.includes('no longer available')) return 'O agente de análise está temporariamente indisponível. Tente novamente dentro de alguns minutos.';
  if (status === 429 || reason.includes('quota') || reason.includes('rate')) return 'O agente de análise atingiu temporariamente o limite de pedidos. Tente novamente mais tarde.';
  return 'O agente de análise não conseguiu concluir o pedido neste momento. Tente novamente dentro de alguns minutos.';
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchGeminiWithDeadline(url, requestBody) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_GEMINI_WAIT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('O agente de análise não conseguiu responder dentro do tempo previsto. Tente novamente dentro de alguns minutos.');
      timeoutError.code = 'GEMINI_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGemini(url, requestBody) {
  let response;
  let payload;
  // Uma única repetição mantém a função dentro do tempo da Netlify. Três
  // tentativas podiam transformar uma indisponibilidade temporária numa 504.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetchGeminiWithDeadline(url, requestBody);
    const raw = await response.text();
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { error: { message: `Resposta não-JSON do fornecedor (HTTP ${response.status})` } };
    }
    if (response.ok || response.status !== 503 || attempt === 1) return { response, payload };
    await wait(900 * (attempt + 1));
  }
  return { response, payload };
}

function itemList(items, empty = 'Não identificado nos documentos analisados.') {
  if (!Array.isArray(items) || !items.length) return `<p>${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function table(rows, empty = 'Sem parâmetros confirmados nesta fase.') {
  if (!Array.isArray(rows) || !rows.length) return `<p>${escapeHtml(empty)}</p>`;
  return `<table><thead><tr><th>Elemento</th><th>Resultado</th><th>Estado</th><th>Fonte</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.elemento)}</td><td>${escapeHtml(row.resultado)}</td><td>${escapeHtml(row.estado)}</td><td>${escapeHtml(row.fonte)}</td></tr>`).join('')}</tbody></table>`;
}

const COST_RATES = {
  economica: [1700, 2100], media: [2100, 2400], media_alta: [2400, 3200], superior: [3100, 4300], luxo: [4200, 6000],
};
const COST_WORK_LABELS = { nova: 'Construção nova', ampliacao: 'Ampliação', reabilitacao: 'Reabilitação' };
const COST_QUALITY_LABELS = { economica: 'Económico', media: 'Médio', media_alta: 'Médio-alto', superior: 'Superior', luxo: 'Luxo' };
const COST_EURO = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const costValue = (value, minimum = 0, maximum = 100000) => Math.min(maximum, Math.max(minimum, Number.isFinite(Number(value)) ? Number(value) : 0));

function calculateRequestedCostEstimate(request) {
  if (!request?.enabled) return null;
  const workType = Object.hasOwn(COST_WORK_LABELS, request.workType) ? request.workType : 'nova';
  const quality = Object.hasOwn(COST_RATES, request.quality) ? request.quality : 'media_alta';
  const habitable = costValue(request.habitable, 0, 3000);
  if (habitable < 30) return null;
  const terraces = costValue(request.terraces, 0, 1500);
  const garage = costValue(request.garage, 0, 1000);
  const technical = costValue(request.technical, 0, 1000);
  const basement = costValue(request.basement, 0, 1500);
  const pool = costValue(request.pool, 0, 1000);
  const exterior = costValue(request.exterior, 0, 20000);
  const walls = costValue(request.walls, 0, 10000);
  const floors = costValue(request.floors || 1, 1, 8);
  const [baseLow, baseHigh] = COST_RATES[quality];
  const typeFactor = workType === 'reabilitacao' ? 1.15 : workType === 'ampliacao' ? 1.06 : 1;
  const complexity = 1 + (floors - 1) * 0.025 + (request.slope ? 0.04 : 0) + (request.difficultAccess ? 0.03 : 0);
  const coreLow = (habitable * baseLow + terraces * baseLow * 0.40 + garage * baseLow * 0.50 + technical * baseLow * 0.55) * typeFactor * complexity;
  const coreHigh = (habitable * baseHigh + terraces * baseHigh * 0.40 + garage * baseHigh * 0.50 + technical * baseHigh * 0.55) * typeFactor * complexity;
  const worksLow = coreLow + basement * 900 + pool * 900 + exterior * 140 + walls * 250;
  const worksHigh = coreHigh + basement * 1400 + pool * 1600 + exterior * 240 + walls * 400;
  const feesLow = Math.max(8000, worksLow * 0.05);
  const feesHigh = Math.max(8000, worksHigh * 0.08);
  const contingencyLow = worksLow * 0.08;
  const contingencyHigh = worksHigh * 0.15;
  return { workType, quality, habitable, terraces, garage, technical, basement, pool, exterior, walls, floors, slope: Boolean(request.slope), difficultAccess: Boolean(request.difficultAccess), worksLow, worksHigh, feesLow, feesHigh, contingencyLow, contingencyHigh, netLow: worksLow + feesLow + contingencyLow, netHigh: worksHigh + feesHigh + contingencyHigh };
}

function renderCostEstimateSection(estimate) {
  if (!estimate) return '';
  const programme = [
    `Área interior prevista: ${estimate.habitable} m²`,
    `Pisos: ${estimate.floors}`,
    estimate.terraces ? `Terraços e alpendres: ${estimate.terraces} m²` : '',
    estimate.garage ? `Garagem coberta: ${estimate.garage} m²` : '',
    estimate.basement ? `Cave: ${estimate.basement} m²` : '',
    estimate.technical ? `Áreas técnicas e arrumos: ${estimate.technical} m²` : '',
    estimate.pool ? `Piscina: ${estimate.pool} m²` : '',
    estimate.exterior ? `Arranjos exteriores: ${estimate.exterior} m²` : '',
    estimate.walls ? `Muros e vedações: ${estimate.walls} ml` : '',
  ].filter(Boolean).join(' · ');
  const conditions = [estimate.slope ? 'terreno inclinado' : '', estimate.difficultAccess ? 'acesso difícil' : ''].filter(Boolean).join(' · ') || 'sem condicionantes adicionais indicadas';
  return `<h5>7. Estimativa indicativa de custo de obra - dados indicados</h5>
    <p>Programa introduzido pelo cliente para esta simulação. Não confirma a viabilidade urbanística, as áreas licenciáveis ou o orçamento final.</p>
    <table><thead><tr><th>Elemento</th><th>Indicação do cliente</th></tr></thead><tbody>
      <tr><td>Intervenção / padrão</td><td>${escapeHtml(COST_WORK_LABELS[estimate.workType])} / ${escapeHtml(COST_QUALITY_LABELS[estimate.quality])}</td></tr>
      <tr><td>Programa de áreas</td><td>${escapeHtml(programme)}</td></tr>
      <tr><td>Condições assinaladas</td><td>${escapeHtml(conditions)}</td></tr>
    </tbody></table>
    <h5>7.1 Estimativa indicativa de custo de obra - cálculo do atelier</h5>
    <p>Intervalo calculado pelo atelier a partir do programa acima, sem IVA.</p>
    <table><thead><tr><th>Componente</th><th>Intervalo indicativo</th></tr></thead><tbody>
      <tr><td>Execução da obra</td><td>${COST_EURO.format(estimate.worksLow)} a ${COST_EURO.format(estimate.worksHigh)}</td></tr>
      <tr><td>Projetos e acompanhamento <small>(mínimo de 8.000 €)</small></td><td>${COST_EURO.format(estimate.feesLow)} a ${COST_EURO.format(estimate.feesHigh)}</td></tr>
      <tr><td>Reserva para imprevistos</td><td>${COST_EURO.format(estimate.contingencyLow)} a ${COST_EURO.format(estimate.contingencyHigh)}</td></tr>
      <tr><td><strong>Custo global estimado sem IVA</strong></td><td><strong>${COST_EURO.format(estimate.netLow)} a ${COST_EURO.format(estimate.netHigh)}</strong></td></tr>
    </tbody></table>
    <p><small>O custo final depende do projeto, medições, condições do local, especialidades, licenças, enquadramento fiscal e propostas de empreiteiros. A viabilidade urbanística indicada nas secções anteriores deve ser confirmada antes de assumir qualquer investimento.</small></p>`;
}

function renderReport(report) {
  const identificacao = report.identificacao || {};
  const conclusao = report.conclusao || {};
  return `
    <section>
      <p><strong>Conclusão da pré-análise:</strong> ${escapeHtml(conclusao.estado || 'Necessita validação técnica')}</p>
      <p>${escapeHtml(conclusao.resumo || 'A análise foi limitada à informação documental fornecida.')}</p>
    </section>
    <h5>1. Localização e elementos disponíveis</h5>
    <table><tbody>
      <tr><th>Localização / freguesia</th><td>${escapeHtml(identificacao.localizacao || 'Não confirmada')}</td></tr>
      <tr><th>Artigo matricial</th><td>${escapeHtml(identificacao.artigo_matricial || 'Não identificado')}</td></tr>
      <tr><th>Área indicada</th><td>${escapeHtml(identificacao.area || 'Não confirmada')}</td></tr>
      <tr><th>Coordenadas</th><td>${escapeHtml(identificacao.coordenadas || 'Não identificadas')}</td></tr>
    </tbody></table>
    <h5>2. Enquadramento territorial confirmado</h5>
    ${table(report.parametros)}
    <h5>3. Regras aplicáveis à pretensão</h5>
    ${table(report.regras_aplicaveis, 'Não foram confirmadas regras quantitativas no regulamento ou documentos analisados.')}
    <h5>4. O que precisa de validação</h5>
    ${itemList(report.divergencias, 'Não foram detetadas divergências evidentes nos documentos fornecidos.')}
    <h5>5. Informação ainda em falta</h5>
    ${itemList(report.nao_confirmado)}
    <h5>6. Próximo passo recomendado</h5>
    ${itemList(report.proximos_passos)}
    <p><small>Este relatório é uma pré-análise documental e não substitui informação prévia, parecer municipal, levantamento topográfico ou validação por técnico habilitado.</small></p>`;
}

function coordinateLabel(localizacao) {
  const latitude = Number(localizacao?.coordenadas?.latitude);
  const longitude = Number(localizacao?.coordenadas?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (WGS84)`
    : 'Não identificadas';
}

function clarifyReportForAvailableEvidence(report, localizacao, documents) {
  const hasMunicipality = Boolean(localizacao?.municipio?.nome);
  const hasManualBoundary = Boolean(localizacao?.parcela?.manual);
  const hasDocuments = Array.isArray(documents) && documents.length > 0;
  const fallbackIdentification = {
    localizacao: hasMunicipality
      ? `${localizacao.municipio.nome}${hasManualBoundary ? ' (limite aproximado desenhado no mapa)' : ''}`
      : hasManualBoundary ? 'Limite aproximado desenhado no mapa - município ainda não confirmado' : 'Localização ainda não confirmada',
    artigo_matricial: localizacao?.parcela?.declaracao || 'Não identificado',
    area: 'Não confirmada',
    coordenadas: coordinateLabel(localizacao),
  };
  const result = { ...(report || {}), identificacao: { ...fallbackIdentification, ...(report?.identificacao || {}) } };

  // Se nenhuma fonte conseguiu identificar o concelho, a resposta deve ser
  // clara e honesta. Este texto determinístico evita relatórios longos e
  // contraditórios produzidos a partir da ausência de dados.
  if (!hasMunicipality) {
    return {
      identificacao: fallbackIdentification,
      parametros: [],
      regras_aplicaveis: [{
        elemento: 'Viabilidade preliminar da pretensão',
        resultado: 'Ainda não pode ser avaliada: nesta tentativa não foi possível associar o limite desenhado a um município e à respetiva carta PDM.',
        estado: 'Necessita verificação',
        fonte: 'Consulta geográfica - município/PDM não identificado',
      }],
      divergencias: ['O limite foi desenhado de forma aproximada e não foi possível relacioná-lo, nesta consulta, com uma parcela cadastral ou com o município aplicável.'],
      nao_confirmado: ['Delimitação rigorosa da propriedade', 'Artigo matricial, área e titularidade', 'Concelho, freguesia e enquadramento PDM aplicável'],
      proximos_passos: ['Tente novamente selecionando um ponto dentro do terreno ou ajustando o limite desenhado.', ...(hasDocuments ? [] : ['Se disponível, anexe a Planta de Localização, caderneta predial ou certidão do registo para reforçar a identificação.'])],
      conclusao: {
        estado: 'Necessita validação técnica',
        resumo: 'Foi registada uma localização aproximada no mapa, mas não foi possível confirmar o concelho nem obter a camada territorial aplicável. Por esse motivo, este relatório não apresenta regras do PDM ou índices urbanísticos.',
      },
    };
  }
  return result;
}

function prioritizeArchitectMeeting(report) {
  const meeting = 'Agendar uma reunião de consultoria com o Arq. Leonel Mendes para aprofundar a viabilidade, confirmar os elementos em falta e definir a estratégia do processo.';
  const existing = Array.isArray(report?.proximos_passos) ? report.proximos_passos : [];
  const remaining = existing.filter((item) => !/reuni[aã]o.*leonel mendes|arq\.?\s*leonel mendes/i.test(String(item)));
  return { ...report, proximos_passos: [meeting, ...remaining] };
}

function officialRegulationSources(localizacao) {
  const municipalSources = Array.isArray(localizacao?.municipio?.regulamentos) ? localizacao.municipio.regulamentos.filter((item) => item?.nome && item?.url) : [];
  const plans = Array.isArray(localizacao?.pdm) ? localizacao.pdm.map((item) => `${item?.valor || ''} ${item?.atributos?.NOME || ''}`).join(' ').toLowerCase() : '';
  const sources = [...municipalSources];
  if (plans.includes('quarteira') && (plans.includes('norte') || plans.includes('nordeste'))) {
    sources.push({ nome: 'Regulamento oficial do PU de Quarteira Norte-Nordeste', url: 'https://geoloule.cm-loule.pt/docs/regulamentos/pmots/PU_Quarteira_Nordeste_Regulamento.pdf' });
  }
  if (sources.length) return sources;
  sources.push({ nome: 'Regulamento municipal aplicável - confirmação necessária', url: localizacao?.municipio?.geoportal || 'https://www.ccdr-alg.pt/site/info/mapa-interativo' });
  return sources;
}

async function officialRegulationDocuments(localizacao) {
  const results = await Promise.allSettled(officialRegulationSources(localizacao).map(async (source) => {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`${source.nome}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_OFFICIAL_REGULATION_BYTES) throw new Error(`${source.nome}: dimensão não suportada`);
    return { nome: source.nome, fonte: source.url, base64: bytes.toString('base64') };
  }));
  return results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
}

function faroWmsProxyUrl(query) {
  return `https://mapas.cm-faro.pt/geoportal/map/proxy?url=${encodeURIComponent(`http://mapas.cm-faro.pt/geoserver/wms?${query}`)}`;
}

async function fetchCartographicImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_CARTOGRAPHIC_EVIDENCE_BYTES) throw new Error('imagem com dimensão não suportada');
    return { base64: bytes.toString('base64'), mimeType: response.headers.get('content-type')?.split(';')[0] || 'image/png' };
  } finally {
    clearTimeout(timeout);
  }
}

async function cartographicEvidence(localizacao) {
  if (localizacao?.municipio?.nome !== 'Faro') return [];
  const lat = Number(localizacao?.coordenadas?.latitude);
  const lng = Number(localizacao?.coordenadas?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  // Dois excertos: um muito próximo para leitura da cor no ponto selecionado e
  // outro de enquadramento. O anterior (c. 260 m) era demasiado amplo e levava
  // o modelo a confundir a mancha central com as categorias vizinhas.
  const makeMapQuery = ({ delta, width, height }) => {
    const query = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', FORMAT: 'image/png', TRANSPARENT: 'false' });
    query.set('REQUEST', 'GetMap'); query.set('LAYERS', 'pdm2024:1_1_P_Ordenamento_MOT');
    query.set('CRS', 'EPSG:4326'); query.set('BBOX', `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`);
    query.set('WIDTH', String(width)); query.set('HEIGHT', String(height)); query.set('STYLES', '');
    return query;
  };
  const legendQuery = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetLegendGraphic', LAYER: 'pdm2024:1_1_P_Ordenamento_MOT', FORMAT: 'image/png' });
  const [closeMap, contextMap, legend] = await Promise.allSettled([
    fetchCartographicImage(faroWmsProxyUrl(makeMapQuery({ delta: 0.00022, width: 420, height: 420 }).toString())),
    fetchCartographicImage(faroWmsProxyUrl(makeMapQuery({ delta: 0.0012, width: 600, height: 600 }).toString())),
    fetchCartographicImage(faroWmsProxyUrl(legendQuery.toString())),
  ]);
  return [
    ...(closeMap.status === 'fulfilled' ? [{ tipo: 'LEITURA PRIORITÁRIA: excerto muito aproximado da Planta 1.1 - Modelo de Organização do Território. A localização selecionada é exatamente o centro da imagem; identifica a cor/padrão no centro antes de consultar o enquadramento.', ...closeMap.value }] : []),
    ...(contextMap.status === 'fulfilled' ? [{ tipo: 'Excerto de enquadramento da Planta 1.1 - Modelo de Organização do Território; o centro da imagem é a localização selecionada.', ...contextMap.value }] : []),
    ...(legend.status === 'fulfilled' ? [{ tipo: 'Legenda oficial da Planta 1.1 - Modelo de Organização do Território.', ...legend.value }] : []),
  ];
}

function buildPrompt({ objetivo, descricao, documents, localizacao, regulationSources = [], officialRegulations = [], cartographicLayers = [], costEstimate = null }) {
  const inventory = documents.length ? documents.map((doc) => `- ${doc.tipo}: ${doc.nome}${doc.origem === 'planta_localizacao_compactada' ? ' (imagem preparada localmente a partir da Planta de Localização oficial)' : ''}`).join('\n') : '- Sem documentos PDF anexados.';
  const preexistenceRules = preexistenceRulesFor(localizacao?.municipio?.nome);
  const mapEvidence = localizacao ? JSON.stringify({
    coordenadas: localizacao.coordenadas,
    municipio: { nome: localizacao.municipio?.nome || null, estado: localizacao.municipio?.estado || null, capacidade: localizacao.municipio?.capacidade || null, geoportal: localizacao.municipio?.geoportal || null },
    parcela: { referencia: localizacao.parcela?.referencia || null, declaracao: localizacao.parcela?.declaracao || null, manual: Boolean(localizacao.parcela?.manual), propriedades: localizacao.parcela?.propriedades || null, geometria: localizacao.parcela?.geometria || null },
    implantacao: localizacao.implantacao || null,
    pdm: localizacao.pdm || [],
    regrasBase: (localizacao.pdm || []).filter((item) => /^Regra urbanística/.test(item?.camada || '')).map((item) => ({ elemento: item.camada, resultado: item.valor, artigo: item.artigo || null, pagina: item.pagina || null, fonte: item.fonte || null })),
    regrasPreexistencia: preexistenceRules,
    fontes: localizacao.fontes || [],
    consultadoEm: localizacao.consultadoEm,
  }) : 'Sem consulta geográfica do mapa.';
  const regulations = regulationSources.length ? regulationSources.map((item) => `- ${item.nome}: ${item.url}`).join('\n') : '- Não foi identificado automaticamente um regulamento específico para esta localização.';
  const rulesCatalog = regulatoryRuleCatalogFor(localizacao?.municipio?.nome);
  const cartographicInstruction = cartographicLayers.length
    ? 'Foram anexados dois excertos WMS oficiais e a legenda. Usa primeiro o excerto marcado LEITURA PRIORITÁRIA: o ponto selecionado coincide exatamente com o pixel central. Compara a cor/padrão desse centro com a legenda; usa o segundo excerto apenas para confirmar continuidade da mancha. Se o centro estiver na linha divisória ou a assinatura não for legível, não escolhas uma categoria.'
    : 'Não foram obtidas imagens cartográficas adicionais para esta consulta.';
  return `És o módulo de pré-análise documental de um serviço de urbanismo para municípios do Algarve, Portugal. O concelho e o nível de cobertura técnica constam na consulta geográfica recebida.

Objetivo declarado pelo cliente: ${objetivo || 'Não indicado'}
Descrição do cliente: ${descricao || 'Não indicada'}
${costEstimate ? `Programa de obra declarado para estimativa: ${COST_WORK_LABELS[costEstimate.workType]}, padrão ${COST_QUALITY_LABELS[costEstimate.quality]}, ${costEstimate.habitable} m² de área interior e ${costEstimate.floors} piso(s). Usa este programa apenas para enquadrar a pretensão urbanística; não apresentes custos, porque a estimativa é inserida separadamente no relatório.` : 'Não foi pedida estimativa de custo de obra.'}
Documentos recebidos:\n${inventory}
Consulta geográfica recebida (dados preliminares de fontes oficiais):\n${mapEvidence}
Regulamentos oficiais relevantes identificados:\n${regulations}
Biblioteca regulamentar interna, transcrita do diploma identificado (só aplicável depois de identificares a categoria):\n${JSON.stringify(rulesCatalog)}
Evidência cartográfica visual: ${cartographicInstruction}

Tarefa:
1. Classifica e extrai apenas informação diretamente visível nos PDFs.
2. Confronta área, artigo matricial, freguesia, localização e coordenadas entre documentos e, quando existir, a consulta geográfica.
3. Quando existir Planta de Localização oficial, identifica o polígono/área delimitada na planta e confronta-a com a parcela e coordenadas da consulta geográfica. Regista expressamente no relatório se a coincidência é aparente, divergente ou não verificável, indicando a fonte e o grau de confiança. Nunca apresentes uma sobreposição visual como georreferenciação rigorosa se o PDF não tiver elementos suficientes.
4. Se a Planta de Localização incluir peças de ordenamento, condicionantes ou REN, descreve somente o que seja legível nessa peça e indica-a como evidência gráfica, não como confirmação normativa autónoma. Para Loulé, quando receberes uma imagem com o nome “PDM - Ordenamento” e outra “Legenda da Planta de Ordenamento”, compara expressamente o polígono assinalado com a trama da legenda. Se for legível que todo ou parte do polígono incide em “Área de edificação dispersa a estruturar”, cria em “parametros” uma linha com esse nome, indica “interseção gráfica total” ou “interseção gráfica parcial” e usa o estado “Necessita verificação”. Se a incidência for parcial e não existir ponto de implantação, nunca atribuas a regra a todo o prédio: explica que a viabilidade depende da localização da implantação dentro da zona.
5. Na secção "regras_aplicaveis", inclui todas as regras já presentes em "regrasBase" da consulta geográfica, mantendo artigo, página, fonte e estado "Necessita verificação". Estas regras resultam de cruzamento automático com fontes oficiais: no caso de Loulé, uma designação devolvida pela CRUS/DGT é apenas associada ao Regulamento do PDM e tem sempre de ser confirmada na planta de ordenamento; no caso de Faro, regras quantitativas só podem resultar de camada vetorial municipal configurada. Quando uma Planta de Localização de Loulé, juntamente com a sua legenda, tornar legível a categoria “Área de edificação dispersa a estruturar”, acrescenta as regras do Artigo 26.º e Artigo 27.º presentes na biblioteca regulamentar interna, com fonte “Planta de Localização CML + Regulamento do PDM de Loulé (leitura gráfica a confirmar)”. Se a interseção for parcial, identifica sempre que os parâmetros apenas se aplicam à área dessa categoria e que a implantação precisa de ser confirmada. Se a evidência cartográfica visual de Faro permitir identificar uma categoria, acrescenta apenas uma linha "Categoria PDM interpretada" com estado "Necessita verificação" e fonte "Planta 1.1 - Modelo de Organização do Território, PDM de Faro (leitura visual)". NÃO reproduzas índices, cérceas, pisos, áreas máximas ou regras quantitativas a partir de uma leitura WMS/por cor sem uma legenda legível. Acrescenta regras, artigos, índices, cérceas, pisos, afastamentos, usos ou condicionantes apenas quando constem em regrasBase, numa camada vetorial confirmada ou literalmente legíveis nos PDFs enviados. Nunca inventes valores ou artigos. Se a categoria não for legível ou não for vetorialmente confirmada, explica quais as regras que dependem dela, sem escolher uma categoria por suposição.
6. Quando o cliente declarar uma pretensão, abre a secção "regras_aplicaveis" com a linha "Viabilidade preliminar da pretensão". Responde diretamente à pretensão, mas sem emitir decisão de licenciamento: "Viável em princípio, sujeito a confirmação" quando os usos e regras recebidos forem compatíveis; "Não demonstrada / não viável como apresentada" quando as regras recebidas exigirem condições que os dados da consulta não demonstram; ou "Dados insuficientes" quando não existir classificação aplicável. Se a parcela intersectar mais de uma classe e não existir "implantacao.confirmada", não apresentes uma conclusão única para todo o prédio: escreve "Dados insuficientes - depende da zona de implantação" e explica os cenários separadamente. Se existir "implantacao.confirmada", relaciona as regras apenas com a classe do ponto de implantação indicado; não mistures regras de outras zonas da parcela. Se "parcela.manual" for verdadeiro, chama sempre à geometria "limite aproximado desenhado pelo utilizador", nunca "parcela cadastral"; assinala que o cruzamento territorial é indicativo e que ficam por confirmar estremas, área, titularidade e artigo matricial. Em particular, para "Construir uma moradia" em RAN ou em solo rural agrícola de Loulé, esclarece que uma moradia NOVA comum não é viável apenas pela seleção do terreno: só pode haver enquadramento nas condições cumulativas da habitação do agricultor e, quando haja RAN, no respetivo regime jurídico. Contudo, se os PDFs ou a descrição demonstrarem uma construção pré-existente/ruína com estrutura e volumetria definida, apresenta obrigatoriamente um cenário separado: "Reconstrução, alteração ou ampliação de preexistência". Aplica exclusivamente as regras em "regrasPreexistencia", cita artigo e página, e conclui "Potencialmente admissível, sujeito a prova da preexistência e validação municipal". Nunca trates a ruína como confirmada sem prova documental, fotográfica ou levantamento; explica os elementos em falta. Indica quais as provas em falta e não transformes uma exceção em autorização.
7. Distingue sempre: confirmado, necessita verificação, não identificado.
8. Não apresentes aconselhamento jurídico nem uma decisão de licenciamento.
9. Escreve em português europeu, com tom profissional e direto para um proprietário não técnico. A conclusão deve ter no máximo 3 frases e começar pelo que foi efetivamente confirmado. Não escrevas “a análise não pôde ser concluída” apenas porque não foram anexados PDFs: se existir localização ou PDM, explica antes o que foi possível apurar no mapa e depois o que falta confirmar. Evita repetir a mesma limitação em várias secções. Nas tabelas, usa frases curtas; não juntes palavras nem cabeçalhos, e não devolvas códigos técnicos sem uma designação legível. Em “próximos_passos”, indica no máximo 3 ações concretas e ordenadas.

Responde exclusivamente com JSON válido, sem markdown, neste formato:
{
  "identificacao": {"localizacao":"", "artigo_matricial":"", "area":"", "coordenadas":""},
  "parametros": [{"elemento":"", "resultado":"", "estado":"Confirmado|Necessita verificação|Não identificado", "fonte":""}],
  "regras_aplicaveis": [{"elemento":"", "resultado":"", "estado":"Confirmado|Necessita verificação|Não identificado", "fonte":""}],
  "divergencias": [""],
  "nao_confirmado": [""],
  "proximos_passos": [""],
  "conclusao": {"estado":"Documentação coerente|Necessita validação técnica|Divergência documental detetada", "resumo":""}
}`;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  const professionalAccess = hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '');
  if (process.env.ALLOW_DIRECT_ANALYSIS === 'false' && !professionalAccess) {
    return json(503, { error: 'A análise direta está temporariamente desativada.' });
  }
  if (!process.env.GEMINI_API_KEY) return json(503, { error: 'O serviço de análise não está configurado.' });

  try {
    const body = JSON.parse(event.body || '{}');
    let trackingRequestId = null;
    const startedAt = Date.now();
    if (body.privacyConsent !== true || !validEmail(body.email)) {
      return json(400, { error: 'Indique um e-mail válido e aceite a Política de Privacidade para pedir a pré-análise.' });
    }
    console.info('privacy_consent_recorded', JSON.stringify({ service: 'pre-analise', policyVersion: body.privacyPolicyVersion || 'não indicado', at: new Date().toISOString() }));
    const documents = Array.isArray(body.documentos) ? body.documentos : [];
    const hasLocation = body.localizacao?.coordenadas && Number.isFinite(Number(body.localizacao.coordenadas.latitude)) && Number.isFinite(Number(body.localizacao.coordenadas.longitude));
    if (documents.length > MAX_DOCUMENTS) {
      return json(400, { error: `Pode anexar até ${MAX_DOCUMENTS} documentos.` });
    }
    if (!hasLocation && !documents.some((doc) => doc.tipo === 'planta_localizacao')) {
      return json(400, { error: 'Selecione uma localização no mapa ou anexe a Planta de Localização.' });
    }

    let totalDocumentBytes = 0;
    for (const document of documents) {
      if (!ALLOWED_TYPES.has(document.tipo) || !document.base64 || !document.nome || !ALLOWED_DOCUMENT_MIMES.has(document.mimeType || 'application/pdf')) {
        return json(400, { error: 'Foi recebido um documento inválido.' });
      }
      const estimatedBytes = Math.floor((document.base64.length * 3) / 4);
      totalDocumentBytes += estimatedBytes;
      if (estimatedBytes > MAX_DOCUMENT_BYTES) {
        return json(413, { error: `${document.nome} excede o limite de 10 MB.` });
      }
    }
    if (totalDocumentBytes > MAX_TOTAL_DOCUMENT_BYTES) {
      return json(413, { error: 'Os documentos selecionados excedem o limite técnico de 4 MB para envio online. Remova-os e faça a pré-análise diretamente pelo terreno selecionado no mapa, cadastro e camadas do PDM.' });
    }
    try {
      const tracking = await beginAnalysis({
        email: body.email,
        municipality: body.localizacao?.municipio?.nome || null,
        documentsCount: documents.length,
        professionalAccess,
      });
      trackingRequestId = tracking.requestId;
    } catch (trackingError) {
      if (trackingError?.code === 'TRIAL_LIMIT_REACHED') return json(429, { error: trackingError.message });
      // O registo operacional não deve interromper o trial enquanto o limite
      // estiver desligado; a falha fica visível apenas nos Function logs.
      console.warn('analysis_tracking_unavailable', trackingError.message);
    }

    const regulationSources = officialRegulationSources(body.localizacao);
    const costEstimate = calculateRequestedCostEstimate(body.estimativaCusto);
    // PDFs completos de regulamentos podem ultrapassar o tempo máximo da função.
    // Só são anexados se esta opção for ligada expressamente na Netlify.
    const regulations = process.env.ATTACH_OFFICIAL_REGULATIONS === 'true'
      ? await officialRegulationDocuments(body.localizacao)
      : [];
    if (body.localizacao && process.env.ATTACH_OFFICIAL_REGULATIONS === 'true' && !regulations.length) console.warn('official_regulations_unavailable');
    if (body.localizacao && !regulations.length) console.info('official_regulations_not_attached_for_speed');
    const visualLayers = await cartographicEvidence(body.localizacao);
    if (body.localizacao?.municipio?.nome === 'Faro' && !visualLayers.length) console.warn('faro_cartographic_evidence_unavailable');
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const requestBody = {
        contents: [{
          role: 'user',
          parts: [
            { text: buildPrompt({ objetivo: body.objetivo, descricao: body.descricao, documents, localizacao: body.localizacao, regulationSources, officialRegulations: regulations, cartographicLayers: visualLayers, costEstimate }) },
            ...visualLayers.flatMap((layer) => [
              { text: layer.tipo },
              { inlineData: { mimeType: layer.mimeType, data: layer.base64 } },
            ]),
            ...documents.flatMap((document) => [
              { text: `Documento anexo: ${document.nome}${document.origem === 'planta_localizacao_compactada' ? '. Imagem obtida localmente da Planta de Localização; lê a categoria do PDM e a legenda em conjunto.' : ''}` },
              { inlineData: { mimeType: document.mimeType || 'application/pdf', data: document.base64 } },
            ]),
            ...regulations.flatMap((regulation) => [
              { text: `Documento oficial anexo: ${regulation.nome} (${regulation.fonte})` },
              { inlineData: { mimeType: 'application/pdf', data: regulation.base64 } },
            ]),
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      };
    const { response, payload: responseBody } = await requestGemini(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, requestBody);
    if (!response.ok) {
      console.error('provider_error', JSON.stringify({ status: response.status, error: responseBody?.error || null }));
      await finishAnalysis(trackingRequestId, { status: `provider_${response.status}`, model, durationMs: Date.now() - startedAt }).catch(() => {});
      return json(502, { error: providerMessage(response.status, responseBody) });
    }

    const modelText = responseBody.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    if (!modelText.trim()) {
      console.error('provider_empty_response', JSON.stringify({ finishReason: responseBody.candidates?.[0]?.finishReason || null, promptFeedback: responseBody.promptFeedback || null }));
      await finishAnalysis(trackingRequestId, { status: 'provider_empty', model, durationMs: Date.now() - startedAt }).catch(() => {});
      return json(502, { error: 'O agente de análise devolveu uma resposta incompleta. Tente novamente dentro de alguns minutos.' });
    }
    let report;
    try {
      report = parseModelJson(modelText);
    } catch (parseFailure) {
      console.error('provider_invalid_json', JSON.stringify({ message: parseFailure.message, excerpt: modelText.slice(0, 300) }));
      await finishAnalysis(trackingRequestId, { status: 'invalid_json', model, durationMs: Date.now() - startedAt }).catch(() => {});
      return json(502, { error: 'O agente de análise concluiu a resposta, mas o relatório não ficou num formato válido. Tente novamente.' });
    }
    report = enrichLouleDispersedBuildingRules(report, body.localizacao);
    report = clarifyReportForAvailableEvidence(report, body.localizacao, documents);
    report = prioritizeArchitectMeeting(report);
    const usage = responseBody.usageMetadata || {};
    console.info('analysis_usage', JSON.stringify({
      model,
      promptTokens: usage.promptTokenCount || null,
      outputTokens: usage.candidatesTokenCount || null,
      documents: documents.length,
    }));
    await finishAnalysis(trackingRequestId, { status: 'completed', model, promptTokens: usage.promptTokenCount || null, outputTokens: usage.candidatesTokenCount || null, durationMs: Date.now() - startedAt }).catch((error) => console.warn('analysis_tracking_finish_unavailable', error.message));

    const reply = `${renderReport(report)}${renderCostEstimateSection(costEstimate)}`;
    const reportText = reply.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>|<\/li>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\n\s*/g, '\n').trim();
    let emailSent = false;
    let emailError = null;
    try {
      const orderingPlan = documents.find((document) => document.origem === 'planta_localizacao_compactada' && /PDM\s*-\s*Ordenamento/i.test(document.paginaOriginal || document.nome || ''));
      const documentPlan = orderingPlan?.base64 && ['image/jpeg', 'image/png'].includes(orderingPlan.mimeType)
        ? { image: Buffer.from(orderingPlan.base64, 'base64'), source: 'Planta de Localização oficial — PDM / Ordenamento; polígono assinalado pelo requerente' }
        : null;
      await sendReportEmail({ to: body.email, reportText, reportHtml: reply, location: body.localizacao || null, privacyPolicyVersion: body.privacyPolicyVersion || null, documentPlan });
      emailSent = true;
    } catch (emailFailure) {
      console.error('automatic_report_email_error', emailFailure);
      emailError = 'A análise foi concluída, mas não foi possível enviar automaticamente o relatório por e-mail.';
    }
    return json(200, { reply, resumo: report.conclusao?.estado || 'Concluído', emailSent, emailError });
  } catch (error) {
    console.error('analysis_error', error);
    if (error?.code === 'GEMINI_TIMEOUT') return json(503, { error: error.message });
    return json(500, { error: 'Não foi possível processar a análise. Tente novamente; se persistir, consulte os Function logs da Netlify.' });
  }
};
