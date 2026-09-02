import { hasProfessionalAccess } from './lib/access.js';
import { sendReportEmail } from './lib/report-email.js';
import { regulatoryRuleCatalogFor } from './lib/territorial-data.js';

const MAX_DOCUMENTS = 4;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
// O pedido completo passa pela Netlify em base64. O limite efetivo para os
// documentos é inferior ao limite por ficheiro, para não provocar HTTP 413.
const MAX_TOTAL_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_OFFICIAL_REGULATION_BYTES = 5 * 1024 * 1024;
const MAX_CARTOGRAPHIC_EVIDENCE_BYTES = 1_200_000;
// Deixa margem antes do limite de execução da Netlify, evitando uma página 504.
const MAX_GEMINI_WAIT_MS = 11_000;
const ALLOWED_TYPES = new Set([
  'planta_localizacao',
  'caderneta_predial',
  'registo_predial',
  'levantamento_topografico',
]);

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

function providerMessage(status, payload = {}) {
  const reason = String(payload?.error?.message || '').toLowerCase();
  if (status === 400) return 'A Gemini recusou o pedido. Confirme se os PDFs são legíveis e volte a tentar com apenas a Planta de Localização.';
  if (status === 401 || status === 403 || reason.includes('api key')) return 'A chave da Gemini não foi aceite. Verifique a variável GEMINI_API_KEY na Netlify e faça novo deploy.';
  if (status === 503 || reason.includes('high demand')) return 'A Gemini está temporariamente com procura elevada. O sistema tentou novamente; aguarde alguns minutos e repita a análise.';
  if (status === 404 || reason.includes('not found') || reason.includes('no longer available')) return 'O modelo configurado não está disponível. Na Netlify, defina GEMINI_MODEL como gemini-3.6-flash e faça novo deploy.';
  if (status === 429 || reason.includes('quota') || reason.includes('rate')) return 'O limite de utilização da Gemini foi atingido. Verifique a quota/faturação no Google AI Studio e tente novamente mais tarde.';
  return 'O fornecedor de IA não conseguiu concluir a análise. Consulte os Function logs da Netlify para ver o motivo técnico.';
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
      const timeoutError = new Error('A Gemini não respondeu dentro do tempo previsto. Tente novamente dentro de alguns minutos.');
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

function renderReport(report) {
  const identificacao = report.identificacao || {};
  const conclusao = report.conclusao || {};
  return `
    <section>
      <p><strong>Resultado preliminar:</strong> ${escapeHtml(conclusao.estado || 'Necessita validação técnica')}</p>
      <p>${escapeHtml(conclusao.resumo || 'A análise foi limitada à informação documental fornecida.')}</p>
    </section>
    <h5>1. Documentação e identificação</h5>
    <table><tbody>
      <tr><th>Localização / freguesia</th><td>${escapeHtml(identificacao.localizacao || 'Não confirmada')}</td></tr>
      <tr><th>Artigo matricial</th><td>${escapeHtml(identificacao.artigo_matricial || 'Não identificado')}</td></tr>
      <tr><th>Área indicada</th><td>${escapeHtml(identificacao.area || 'Não confirmada')}</td></tr>
      <tr><th>Coordenadas</th><td>${escapeHtml(identificacao.coordenadas || 'Não identificadas')}</td></tr>
    </tbody></table>
    <h5>2. Elementos extraídos e parâmetros</h5>
    ${table(report.parametros)}
    <h5>3. Regime e regras urbanísticas aplicáveis</h5>
    ${table(report.regras_aplicaveis, 'Não foram confirmadas regras quantitativas no regulamento ou documentos analisados.')}
    <h5>4. Divergências e verificações necessárias</h5>
    ${itemList(report.divergencias, 'Não foram detetadas divergências evidentes nos documentos fornecidos.')}
    <h5>5. Informação não confirmada</h5>
    ${itemList(report.nao_confirmado)}
    <h5>6. Próximos passos recomendados</h5>
    ${itemList(report.proximos_passos)}
    <p><small>Este relatório é uma pré-análise documental e não substitui informação prévia, parecer municipal, levantamento topográfico ou validação por técnico habilitado.</small></p>`;
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

function buildPrompt({ objetivo, descricao, documents, localizacao, regulationSources = [], officialRegulations = [], cartographicLayers = [] }) {
  const inventory = documents.length ? documents.map((doc) => `- ${doc.tipo}: ${doc.nome}`).join('\n') : '- Sem documentos PDF anexados.';
  const mapEvidence = localizacao ? JSON.stringify({
    coordenadas: localizacao.coordenadas,
    municipio: { nome: localizacao.municipio?.nome || null, estado: localizacao.municipio?.estado || null, capacidade: localizacao.municipio?.capacidade || null, geoportal: localizacao.municipio?.geoportal || null },
    parcela: { referencia: localizacao.parcela?.referencia || null, declaracao: localizacao.parcela?.declaracao || null, propriedades: localizacao.parcela?.propriedades || null, geometria: localizacao.parcela?.geometria || null },
    pdm: localizacao.pdm || [],
    regrasBase: (localizacao.pdm || []).filter((item) => /^Regra urbanística/.test(item?.camada || '')).map((item) => ({ elemento: item.camada, resultado: item.valor, artigo: item.artigo || null, pagina: item.pagina || null, fonte: item.fonte || null })),
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
Documentos recebidos:\n${inventory}
Consulta geográfica recebida (dados preliminares de fontes oficiais):\n${mapEvidence}
Regulamentos oficiais relevantes identificados:\n${regulations}
Biblioteca regulamentar interna, transcrita do diploma identificado (só aplicável depois de identificares a categoria):\n${JSON.stringify(rulesCatalog)}
Evidência cartográfica visual: ${cartographicInstruction}

Tarefa:
1. Classifica e extrai apenas informação diretamente visível nos PDFs.
2. Confronta área, artigo matricial, freguesia, localização e coordenadas entre documentos e, quando existir, a consulta geográfica.
3. Quando existir Planta de Localização oficial, identifica o polígono/área delimitada na planta e confronta-a com a parcela e coordenadas da consulta geográfica. Regista expressamente no relatório se a coincidência é aparente, divergente ou não verificável, indicando a fonte e o grau de confiança. Nunca apresentes uma sobreposição visual como georreferenciação rigorosa se o PDF não tiver elementos suficientes.
4. Se a Planta de Localização incluir peças de ordenamento, condicionantes ou REN, descreve somente o que seja legível nessa peça e indica-a como evidência gráfica, não como confirmação normativa autónoma.
5. Na secção "regras_aplicaveis", inclui todas as regras já presentes em "regrasBase" da consulta geográfica, mantendo artigo, página, fonte e estado "Necessita verificação". Estas regras resultam de cruzamento automático com fontes oficiais: no caso de Loulé, a designação devolvida pela CRUS/DGT é associada ao Regulamento do PDM e tem sempre de ser confirmada na planta de ordenamento; no caso de Faro, regras quantitativas só podem resultar de camada vetorial municipal configurada. Se a evidência cartográfica visual permitir identificar uma categoria, acrescenta primeiro uma linha "Categoria PDM interpretada" com estado "Necessita verificação" e fonte "Planta 1.1 - Modelo de Organização do Território, PDM de Faro (leitura por cor/legenda)". Depois reproduz somente as regras da mesma categoria presentes na Biblioteca regulamentar interna, conservando artigo e página e com estado "Necessita verificação". Acrescenta regras, artigos, índices, cérceas, pisos, afastamentos, usos ou condicionantes literalmente legíveis nos PDFs enviados. Nunca inventes valores ou artigos. Se a categoria não for legível, explica quais as regras que dependem dela, sem escolher uma categoria por suposição.
6. Quando o cliente declarar uma pretensão, abre a secção "regras_aplicaveis" com a linha "Viabilidade preliminar da pretensão". Responde diretamente à pretensão, mas sem emitir decisão de licenciamento: "Viável em princípio, sujeito a confirmação" quando os usos e regras recebidos forem compatíveis; "Não demonstrada / não viável como apresentada" quando as regras recebidas exigirem condições que os dados da consulta não demonstram; ou "Dados insuficientes" quando não existir classificação aplicável. Em particular, para "Construir uma moradia" em RAN ou em solo rural agrícola de Loulé, esclarece que não é possível considerar uma moradia comum viável apenas pela seleção do terreno: só pode haver enquadramento nas condições cumulativas da habitação do agricultor e, quando haja RAN, no respetivo regime jurídico. Indica quais as provas em falta e não transformes uma exceção em autorização.
7. Distingue sempre: confirmado, necessita verificação, não identificado.
8. Não apresentes aconselhamento jurídico nem uma decisão de licenciamento.

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
      if (!ALLOWED_TYPES.has(document.tipo) || !document.base64 || !document.nome) {
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

    const regulationSources = officialRegulationSources(body.localizacao);
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
            { text: buildPrompt({ objetivo: body.objetivo, descricao: body.descricao, documents, localizacao: body.localizacao, regulationSources, officialRegulations: regulations, cartographicLayers: visualLayers }) },
            ...visualLayers.flatMap((layer) => [
              { text: layer.tipo },
              { inlineData: { mimeType: layer.mimeType, data: layer.base64 } },
            ]),
            ...documents.map((document) => ({ inlineData: { mimeType: 'application/pdf', data: document.base64 } })),
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
      return json(502, { error: providerMessage(response.status, responseBody) });
    }

    const modelText = responseBody.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    if (!modelText.trim()) {
      console.error('provider_empty_response', JSON.stringify({ finishReason: responseBody.candidates?.[0]?.finishReason || null, promptFeedback: responseBody.promptFeedback || null }));
      return json(502, { error: 'A Gemini devolveu uma resposta vazia. Tente novamente dentro de alguns minutos.' });
    }
    let report;
    try {
      report = parseModelJson(modelText);
    } catch (parseFailure) {
      console.error('provider_invalid_json', JSON.stringify({ message: parseFailure.message, excerpt: modelText.slice(0, 300) }));
      return json(502, { error: 'A Gemini concluiu a resposta, mas o formato do relatório foi inválido. Tente novamente.' });
    }
    const usage = responseBody.usageMetadata || {};
    console.info('analysis_usage', JSON.stringify({
      model,
      promptTokens: usage.promptTokenCount || null,
      outputTokens: usage.candidatesTokenCount || null,
      documents: documents.length,
    }));

    const reply = renderReport(report);
    const reportText = reply.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>|<\/li>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\n\s*/g, '\n').trim();
    let emailSent = false;
    let emailError = null;
    try {
      await sendReportEmail({ to: body.email, reportText, reportHtml: reply, location: body.localizacao || null });
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
