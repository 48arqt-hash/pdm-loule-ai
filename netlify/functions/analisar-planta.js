import { hasProfessionalAccess } from './lib/access.js';
import { sendReportEmail } from './lib/report-email.js';

const MAX_DOCUMENTS = 4;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_OFFICIAL_REGULATION_BYTES = 5 * 1024 * 1024;
// Deixa margem antes do limite de execução da Netlify, evitando uma página 504.
const MAX_GEMINI_WAIT_MS = 14_000;
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetchGeminiWithDeadline(url, requestBody);
    const raw = await response.text();
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { error: { message: `Resposta não-JSON do fornecedor (HTTP ${response.status})` } };
    }
    if (response.ok || response.status !== 503 || attempt === 2) return { response, payload };
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
  const plans = Array.isArray(localizacao?.pdm) ? localizacao.pdm.map((item) => `${item?.valor || ''} ${item?.atributos?.NOME || ''}`).join(' ').toLowerCase() : '';
  const sources = [];
  if (plans.includes('quarteira') && (plans.includes('norte') || plans.includes('nordeste'))) {
    sources.push({ nome: 'Regulamento oficial do PU de Quarteira Norte-Nordeste', url: 'https://geoloule.cm-loule.pt/docs/regulamentos/pmots/PU_Quarteira_Nordeste_Regulamento.pdf' });
  }
  sources.push({ nome: 'Regulamento oficial do PDM de Loulé', url: 'https://geoloule.cm-loule.pt/docs/regulamentos/pmots/PDM_Regulamento.pdf' });
  sources.push({ nome: 'Regulamento Municipal de Urbanização e Edificação de Loulé (RMUE)', url: 'https://files.diariodarepublica.pt/2s/2024/08/155000000/0034300423.pdf' });
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

function buildPrompt({ objetivo, descricao, documents, localizacao, regulationSources = [], officialRegulations = [] }) {
  const inventory = documents.length ? documents.map((doc) => `- ${doc.tipo}: ${doc.nome}`).join('\n') : '- Sem documentos PDF anexados.';
  const mapEvidence = localizacao ? JSON.stringify({
    coordenadas: localizacao.coordenadas,
    parcela: { referencia: localizacao.parcela?.referencia || null, declaracao: localizacao.parcela?.declaracao || null, propriedades: localizacao.parcela?.propriedades || null, geometria: localizacao.parcela?.geometria || null },
    pdm: localizacao.pdm || [],
    fontes: localizacao.fontes || [],
    consultadoEm: localizacao.consultadoEm,
  }) : 'Sem consulta geográfica do mapa.';
  const regulations = regulationSources.length ? regulationSources.map((item) => `- ${item.nome}: ${item.url}`).join('\n') : '- Não foi identificado automaticamente um regulamento específico para esta localização.';
  return `És o módulo de pré-análise documental de um serviço de urbanismo para o Município de Loulé, Portugal.

Objetivo declarado pelo cliente: ${objetivo || 'Não indicado'}
Descrição do cliente: ${descricao || 'Não indicada'}
Documentos recebidos:\n${inventory}
Consulta geográfica recebida (dados preliminares de fontes oficiais):\n${mapEvidence}
Regulamentos oficiais relevantes identificados:\n${regulations}

Tarefa:
1. Classifica e extrai apenas informação diretamente visível nos PDFs.
2. Confronta área, artigo matricial, freguesia, localização e coordenadas entre documentos e, quando existir, a consulta geográfica.
3. Quando existir Planta de Localização oficial, identifica o polígono/área delimitada na planta e confronta-a com a parcela e coordenadas da consulta geográfica. Regista expressamente no relatório se a coincidência é aparente, divergente ou não verificável, indicando a fonte e o grau de confiança. Nunca apresentes uma sobreposição visual como georreferenciação rigorosa se o PDF não tiver elementos suficientes.
4. Se a Planta de Localização incluir peças de ordenamento, condicionantes ou REN, descreve somente o que seja legível nessa peça e indica-a como evidência gráfica, não como confirmação normativa autónoma.
5. Na secção "regras_aplicaveis", apresenta regras, artigos, índices, cérceas, pisos, afastamentos, usos ou condicionantes que estejam literalmente legíveis nos PDFs enviados. Cruza a delimitação aparente da planta com a parcela selecionada e com os elementos PDM/PUQNNE da consulta geográfica; reproduz esses parâmetros cartográficos explicitamente e identifica o plano aplicável. Os elementos da consulta geográfica cuja classificação venha de fonte de apoio DGT têm estado "Necessita verificação". Os regulamentos identificados servem para referência e validação posterior; não inventes o respetivo conteúdo. Identifica sempre a página e o artigo, quando constarem. Se a categoria exata de solo não for devolvida pela cartografia vetorial, explica quais as regras que dependem dessa categoria, sem escolher uma categoria por suposição. Nunca inventes valores ou artigos.
6. Distingue sempre: confirmado, necessita verificação, não identificado.
7. Não apresentes aconselhamento jurídico nem uma decisão de licenciamento.

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
    const documents = Array.isArray(body.documentos) ? body.documentos : [];
    const hasLocation = body.localizacao?.coordenadas && Number.isFinite(Number(body.localizacao.coordenadas.latitude)) && Number.isFinite(Number(body.localizacao.coordenadas.longitude));
    if (documents.length > MAX_DOCUMENTS) {
      return json(400, { error: `Pode anexar até ${MAX_DOCUMENTS} documentos.` });
    }
    if (!hasLocation && !documents.some((doc) => doc.tipo === 'planta_localizacao')) {
      return json(400, { error: 'Selecione uma localização no mapa ou anexe a Planta de Localização.' });
    }

    for (const document of documents) {
      if (!ALLOWED_TYPES.has(document.tipo) || !document.base64 || !document.nome) {
        return json(400, { error: 'Foi recebido um documento inválido.' });
      }
      const estimatedBytes = Math.floor((document.base64.length * 3) / 4);
      if (estimatedBytes > MAX_DOCUMENT_BYTES) {
        return json(413, { error: `${document.nome} excede o limite de 10 MB.` });
      }
    }

    const regulationSources = officialRegulationSources(body.localizacao);
    // PDFs completos de regulamentos podem ultrapassar o tempo máximo da função.
    // Só são anexados se esta opção for ligada expressamente na Netlify.
    const regulations = process.env.ATTACH_OFFICIAL_REGULATIONS === 'true'
      ? await officialRegulationDocuments(body.localizacao)
      : [];
    if (body.localizacao && process.env.ATTACH_OFFICIAL_REGULATIONS === 'true' && !regulations.length) console.warn('official_regulations_unavailable');
    if (body.localizacao && !regulations.length) console.info('official_regulations_not_attached_for_speed');
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const requestBody = {
        contents: [{
          role: 'user',
          parts: [
            { text: buildPrompt({ objetivo: body.objetivo, descricao: body.descricao, documents, localizacao: body.localizacao, regulationSources, officialRegulations: regulations }) },
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
    const report = parseModelJson(modelText);
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
    return json(500, { error: 'Não foi possível processar a análise. Verifique os documentos e tente novamente.' });
  }
};
