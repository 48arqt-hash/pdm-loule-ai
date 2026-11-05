import { hasProfessionalAccess } from './lib/access.js';
import { createHmac } from 'node:crypto';
import { sendReportEmail, validEmail } from './lib/report-email.js';
import { preexistenceRulesFor, regulatoryRuleCatalogFor, regulatoryRulesFor } from './lib/territorial-data.js';
import { beginAnalysis, finishAnalysis } from './lib/operation-metrics.js';
import { addDossierDocuments, createDossier } from './lib/dossier-store.js';

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
// O modelo pode precisar de mais de 16 s quando cruza localização, regras e
// documentos. Mantemos margem antes do limite da função, sem deixar o cliente
// preso numa espera excessiva.
const MAX_GEMINI_WAIT_MS = 40_000;
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

function table(rows, empty = 'Sem parâmetros confirmados nesta fase.', language = 'pt') {
  if (!Array.isArray(rows) || !rows.length) return `<p>${escapeHtml(empty)}</p>`;
  const headers = { pt:['Elemento','Resultado','Estado','Fonte'], en:['Item','Result','Status','Source'], fr:['Élément','Résultat','Statut','Source'], de:['Element','Ergebnis','Status','Quelle'], es:['Elemento','Resultado','Estado','Fuente'] }[language] || ['Elemento','Resultado','Estado','Fonte'];
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.elemento)}</td><td>${escapeHtml(row.resultado)}</td><td>${escapeHtml(row.estado)}</td><td>${escapeHtml(row.fonte)}</td></tr>`).join('')}</tbody></table>`;
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

function renderCostEstimateSection(estimate, language = 'pt') {
  if (!estimate) return '';
  const copy = {
    pt: { input:'7. Estimativa indicativa de custo de obra - dados indicados', inputIntro:'Programa introduzido pelo cliente para esta simulação. Não confirma a viabilidade urbanística, as áreas licenciáveis ou o orçamento final.', intervention:'Intervenção / padrão', programme:'Programa de áreas', conditions:'Condições assinaladas', calculation:'7.1 Estimativa indicativa de custo de obra - cálculo do atelier', calculationIntro:'Intervalo calculado pelo atelier a partir do programa acima, sem IVA.', works:'Execução da obra', fees:'Projetos e acompanhamento', minimum:'(mínimo de 8.000 €)', contingency:'Reserva para imprevistos', total:'Custo global estimado sem IVA', item:'Elemento', clientInput:'Indicação do cliente', component:'Componente', range:'Intervalo indicativo', note:'O custo final depende do projeto, medições, condições do local, especialidades, licenças, enquadramento fiscal e propostas de empreiteiros. A viabilidade urbanística indicada nas secções anteriores deve ser confirmada antes de assumir qualquer investimento.' },
    en: { input:'7. Indicative construction cost estimate - client inputs', inputIntro:'Programme provided by the client for this simulation. It does not confirm planning feasibility, licensable areas or the final quotation.', intervention:'Work / standard', programme:'Area programme', conditions:'Selected conditions', calculation:'7.1 Indicative construction cost estimate - studio calculation', calculationIntro:'Range calculated by the studio from the programme above, excluding VAT.', works:'Construction works', fees:'Design and site supervision', minimum:'(minimum €8,000)', contingency:'Contingency allowance', total:'Estimated total cost excluding VAT', item:'Item', clientInput:'Client input', component:'Component', range:'Indicative range', note:'The final cost depends on the design, measurements, site conditions, specialist work, permits, tax treatment and contractors’ quotations. Planning feasibility must be confirmed before making any investment decision.' },
    fr: { input:'7. Estimation indicative du coût des travaux - données du client', inputIntro:'Programme indiqué par le client pour cette simulation. Il ne confirme ni la faisabilité urbanistique, ni les surfaces autorisables, ni le devis final.', intervention:'Intervention / niveau', programme:'Programme des surfaces', conditions:'Conditions indiquées', calculation:'7.1 Estimation indicative du coût des travaux - calcul de l’atelier', calculationIntro:'Fourchette calculée par l’atelier à partir du programme ci-dessus, hors TVA.', works:'Exécution des travaux', fees:'Études et suivi de chantier', minimum:'(minimum 8 000 €)', contingency:'Réserve pour imprévus', total:'Coût global estimé hors TVA', item:'Élément', clientInput:'Indication du client', component:'Composant', range:'Fourchette indicative', note:'Le coût final dépend du projet, des métrés, des conditions du site, des spécialités, des autorisations, du régime fiscal et des devis des entreprises. La faisabilité urbanistique doit être confirmée avant toute décision d’investissement.' },
    de: { input:'7. Unverbindliche Baukostenschätzung - Angaben des Kunden', inputIntro:'Vom Kunden angegebenes Bauprogramm. Es bestätigt weder die planungsrechtliche Zulässigkeit noch genehmigungsfähige Flächen oder den endgültigen Kostenvoranschlag.', intervention:'Maßnahme / Standard', programme:'Flächenprogramm', conditions:'Ausgewählte Bedingungen', calculation:'7.1 Unverbindliche Baukostenschätzung - Berechnung des Büros', calculationIntro:'Vom Büro auf Grundlage des obigen Programms berechnete Spanne, ohne Mehrwertsteuer.', works:'Bauausführung', fees:'Planung und Bauleitung', minimum:'(mindestens 8.000 €)', contingency:'Reserve für Unvorhergesehenes', total:'Geschätzte Gesamtkosten ohne Mehrwertsteuer', item:'Element', clientInput:'Angabe des Kunden', component:'Komponente', range:'Unverbindliche Spanne', note:'Die Endkosten hängen von Planung, Mengen, Standortbedingungen, Fachplanungen, Genehmigungen, Steuern und Angeboten der Auftragnehmer ab. Die planungsrechtliche Zulässigkeit muss vor jeder Investitionsentscheidung bestätigt werden.' },
    es: { input:'7. Estimación indicativa del coste de obra - datos del cliente', inputIntro:'Programa indicado por el cliente para esta simulación. No confirma la viabilidad urbanística, las superficies autorizables ni el presupuesto final.', intervention:'Intervención / nivel', programme:'Programa de superficies', conditions:'Condiciones seleccionadas', calculation:'7.1 Estimación indicativa del coste de obra - cálculo del estudio', calculationIntro:'Intervalo calculado por el estudio a partir del programa anterior, sin IVA.', works:'Ejecución de la obra', fees:'Proyectos y dirección de obra', minimum:'(mínimo 8.000 €)', contingency:'Reserva para imprevistos', total:'Coste global estimado sin IVA', item:'Elemento', clientInput:'Indicación del cliente', component:'Componente', range:'Intervalo indicativo', note:'El coste final depende del proyecto, las mediciones, las condiciones del terreno, las especialidades, las licencias, el tratamiento fiscal y las ofertas de los contratistas. La viabilidad urbanística debe confirmarse antes de asumir cualquier inversión.' },
  }[language] || null;
  const c = copy || { input:'7. Estimativa indicativa de custo de obra - dados indicados', inputIntro:'Programa introduzido pelo cliente para esta simulação.', intervention:'Intervenção / padrão', programme:'Programa de áreas', conditions:'Condições assinaladas', calculation:'7.1 Estimativa indicativa de custo de obra - cálculo do atelier', calculationIntro:'Intervalo calculado pelo atelier a partir do programa acima, sem IVA.', works:'Execução da obra', fees:'Projetos e acompanhamento', minimum:'(mínimo de 8.000 €)', contingency:'Reserva para imprevistos', total:'Custo global estimado sem IVA', item:'Elemento', clientInput:'Indicação do cliente', component:'Componente', range:'Intervalo indicativo', note:'' };
  const programmeCopy = {
    pt: { interior:'Área interior prevista', floors:'Pisos', terraces:'Terraços e alpendres', garage:'Garagem coberta', basement:'Cave', technical:'Áreas técnicas e arrumos', pool:'Piscina', exterior:'Arranjos exteriores', walls:'Muros e vedações', slope:'terreno inclinado', difficultAccess:'acesso difícil', none:'sem condicionantes adicionais indicadas', work:{ nova:'Construção nova', ampliacao:'Ampliação', reabilitacao:'Reabilitação' }, quality:{ economica:'Económico', media:'Médio', media_alta:'Médio-alto', superior:'Superior', luxo:'Luxo' } },
    en: { interior:'Planned internal area', floors:'Storeys', terraces:'Terraces and covered porches', garage:'Covered garage', basement:'Basement', technical:'Technical and storage areas', pool:'Swimming pool', exterior:'External works', walls:'Walls and fencing', slope:'sloping site', difficultAccess:'difficult access', none:'no additional conditions indicated', work:{ nova:'New construction', ampliacao:'Extension', reabilitacao:'Refurbishment' }, quality:{ economica:'Economy', media:'Medium', media_alta:'Medium-high', superior:'Superior', luxo:'Luxury' } },
    fr: { interior:'Surface intérieure prévue', floors:'Niveaux', terraces:'Terrasses et porches couverts', garage:'Garage couvert', basement:'Sous-sol', technical:'Locaux techniques et rangements', pool:'Piscine', exterior:'Aménagements extérieurs', walls:'Murs et clôtures', slope:'terrain en pente', difficultAccess:'accès difficile', none:'aucune condition supplémentaire indiquée', work:{ nova:'Construction neuve', ampliacao:'Extension', reabilitacao:'Réhabilitation' }, quality:{ economica:'Économique', media:'Moyen', media_alta:'Moyen-haut', superior:'Supérieur', luxo:'Luxe' } },
    de: { interior:'Geplante Innenfläche', floors:'Geschosse', terraces:'Terrassen und überdachte Veranden', garage:'Überdachte Garage', basement:'Kellergeschoss', technical:'Technik- und Abstellflächen', pool:'Schwimmbad', exterior:'Außenanlagen', walls:'Mauern und Einfriedungen', slope:'Hanggrundstück', difficultAccess:'schwierige Zufahrt', none:'keine zusätzlichen Bedingungen angegeben', work:{ nova:'Neubau', ampliacao:'Erweiterung', reabilitacao:'Sanierung' }, quality:{ economica:'Einfach', media:'Mittel', media_alta:'Mittel-gehoben', superior:'Hochwertig', luxo:'Luxus' } },
    es: { interior:'Superficie interior prevista', floors:'Plantas', terraces:'Terrazas y porches cubiertos', garage:'Garaje cubierto', basement:'Sótano', technical:'Áreas técnicas y almacenes', pool:'Piscina', exterior:'Urbanización exterior', walls:'Muros y cerramientos', slope:'terreno inclinado', difficultAccess:'acceso difícil', none:'sin condiciones adicionales indicadas', work:{ nova:'Construcción nueva', ampliacao:'Ampliación', reabilitacao:'Rehabilitación' }, quality:{ economica:'Económico', media:'Medio', media_alta:'Medio-alto', superior:'Superior', luxo:'Lujo' } },
  }[language] || null;
  const pc = programmeCopy || programmeCopy?.pt || { interior:'Área interior prevista', floors:'Pisos', terraces:'Terraços e alpendres', garage:'Garagem coberta', basement:'Cave', technical:'Áreas técnicas e arrumos', pool:'Piscina', exterior:'Arranjos exteriores', walls:'Muros e vedações', slope:'terreno inclinado', difficultAccess:'acesso difícil', none:'sem condicionantes adicionais indicadas', work:COST_WORK_LABELS, quality:COST_QUALITY_LABELS };
  const programme = [
    `${pc.interior}: ${estimate.habitable} m²`, `${pc.floors}: ${estimate.floors}`,
    estimate.terraces ? `${pc.terraces}: ${estimate.terraces} m²` : '', estimate.garage ? `${pc.garage}: ${estimate.garage} m²` : '',
    estimate.basement ? `${pc.basement}: ${estimate.basement} m²` : '', estimate.technical ? `${pc.technical}: ${estimate.technical} m²` : '',
    estimate.pool ? `${pc.pool}: ${estimate.pool} m²` : '', estimate.exterior ? `${pc.exterior}: ${estimate.exterior} m²` : '', estimate.walls ? `${pc.walls}: ${estimate.walls} ml` : '',
  ].filter(Boolean).join(' · ');
  const conditions = [estimate.slope ? pc.slope : '', estimate.difficultAccess ? pc.difficultAccess : ''].filter(Boolean).join(' · ') || pc.none;
  return `<h5>${c.input}</h5>
    <p>${c.inputIntro}</p>
    <table><thead><tr><th>${c.item}</th><th>${c.clientInput}</th></tr></thead><tbody>
      <tr><td>${c.intervention}</td><td>${escapeHtml(pc.work[estimate.workType])} / ${escapeHtml(pc.quality[estimate.quality])}</td></tr>
      <tr><td>${c.programme}</td><td>${escapeHtml(programme)}</td></tr>
      <tr><td>${c.conditions}</td><td>${escapeHtml(conditions)}</td></tr>
    </tbody></table>
    <h5>${c.calculation}</h5>
    <p>${c.calculationIntro}</p>
    <table><thead><tr><th>${c.component}</th><th>${c.range}</th></tr></thead><tbody>
      <tr><td>${c.works}</td><td>${COST_EURO.format(estimate.worksLow)} a ${COST_EURO.format(estimate.worksHigh)}</td></tr>
      <tr><td>${c.fees} <small>${c.minimum}</small></td><td>${COST_EURO.format(estimate.feesLow)} a ${COST_EURO.format(estimate.feesHigh)}</td></tr>
      <tr><td>${c.contingency}</td><td>${COST_EURO.format(estimate.contingencyLow)} a ${COST_EURO.format(estimate.contingencyHigh)}</td></tr>
      <tr><td><strong>${c.total}</strong></td><td><strong>${COST_EURO.format(estimate.netLow)} a ${COST_EURO.format(estimate.netHigh)}</strong></td></tr>
    </tbody></table>
    <p><small>${c.note}</small></p>`;
}

function renderReport(report, language = 'pt') {
  const chrome = {
    pt:['Conclusão da pré-análise:','1. Localização e elementos disponíveis','Localização / freguesia','Artigo matricial','Área indicada','Coordenadas','2. Zona e enquadramento territorial identificado','3. Regras aplicáveis à pretensão','4. O que precisa de validação','5. Informação ainda em falta','6. Próximo passo recomendado','Não confirmada','Não identificado','Não identificadas'],
    en:['Pre-assessment conclusion:','1. Location and available information','Location / parish','Property tax reference','Stated area','Coordinates','2. Identified territorial zone and context','3. Rules applicable to the proposal','4. What requires validation','5. Information still missing','6. Recommended next step','Not confirmed','Not identified','Not identified'],
    fr:['Conclusion de la pré-analyse :','1. Localisation et éléments disponibles','Localisation / paroisse','Référence fiscale du bien','Surface indiquée','Coordonnées','2. Zone et contexte territorial identifiés','3. Règles applicables au projet','4. Éléments à valider','5. Informations encore manquantes','6. Prochaine étape recommandée','Non confirmée','Non identifiée','Non identifiées'],
    de:['Ergebnis der Voranalyse:','1. Standort und verfügbare Angaben','Standort / Gemeinde','Steuerliche Grundstücksreferenz','Angegebene Fläche','Koordinaten','2. Identifizierte Gebietskategorie und Einordnung','3. Für das Vorhaben geltende Regeln','4. Was geprüft werden muss','5. Noch fehlende Angaben','6. Empfohlener nächster Schritt','Nicht bestätigt','Nicht identifiziert','Nicht identifiziert'],
    es:['Conclusión del preanálisis:','1. Ubicación y elementos disponibles','Ubicación / parroquia','Referencia fiscal del inmueble','Superficie indicada','Coordenadas','2. Zona y encuadre territorial identificados','3. Reglas aplicables a la propuesta','4. Lo que requiere validación','5. Información pendiente','6. Próximo paso recomendado','No confirmada','No identificado','No identificadas'],
  }[language] || null;
  const c = chrome || ['Conclusão da pré-análise:','1. Localização e elementos disponíveis','Localização / freguesia','Artigo matricial','Área indicada','Coordenadas','2. Zona e enquadramento territorial identificado','3. Regras aplicáveis à pretensão','4. O que precisa de validação','5. Informação ainda em falta','6. Próximo passo recomendado','Não confirmada','Não identificado','Não identificadas'];
  const identificacao = report.identificacao || {};
  const conclusao = report.conclusao || {};
  return `
    <section>
      <p><strong>${c[0]}</strong> ${escapeHtml(conclusao.estado || (language === 'en' ? 'Technical validation required' : language === 'fr' ? 'Validation technique requise' : language === 'de' ? 'Technische Prüfung erforderlich' : language === 'es' ? 'Requiere validación técnica' : 'Necessita validação técnica'))}</p>
      <p>${escapeHtml(conclusao.resumo || (language === 'en' ? 'The assessment was limited to the documents and geographic information available.' : language === 'fr' ? 'L’analyse a été limitée aux documents et informations géographiques disponibles.' : language === 'de' ? 'Die Bewertung war auf die verfügbaren Unterlagen und geografischen Informationen beschränkt.' : language === 'es' ? 'El análisis se limitó a los documentos y la información geográfica disponibles.' : 'A análise foi limitada à informação documental fornecida.'))}</p>
    </section>
    <h5>${c[1]}</h5>
    <table><tbody>
      <tr><th>${c[2]}</th><td>${escapeHtml(identificacao.localizacao || c[11])}</td></tr>
      <tr><th>${c[3]}</th><td>${escapeHtml(identificacao.artigo_matricial || c[12])}</td></tr>
      <tr><th>${c[4]}</th><td>${escapeHtml(identificacao.area || c[11])}</td></tr>
      <tr><th>${c[5]}</th><td>${escapeHtml(identificacao.coordenadas || c[13])}</td></tr>
    </tbody></table>
    <h5>${c[6]}</h5>
    ${table(report.parametros, language === 'en' ? 'No parameters were confirmed at this stage.' : language === 'fr' ? 'Aucun paramètre n’a été confirmé à ce stade.' : language === 'de' ? 'In dieser Phase wurden keine Parameter bestätigt.' : language === 'es' ? 'No se confirmaron parámetros en esta fase.' : 'Sem parâmetros confirmados nesta fase.', language)}
    <h5>${c[7]}</h5>
    ${table(report.regras_aplicaveis, language === 'en' ? 'No quantitative rules were confirmed in the regulations or analysed documents.' : language === 'fr' ? 'Aucune règle quantitative n’a été confirmée dans le règlement ou les documents analysés.' : language === 'de' ? 'In den Regelwerken oder analysierten Unterlagen wurden keine quantitativen Regeln bestätigt.' : language === 'es' ? 'No se confirmaron reglas cuantitativas en la normativa ni en los documentos analizados.' : 'Não foram confirmadas regras quantitativas no regulamento ou documentos analisados.', language)}
    <h5>${c[8]}</h5>
    ${itemList(report.divergencias, language === 'en' ? 'No clear discrepancies were identified in the information provided.' : language === 'fr' ? 'Aucune divergence évidente n’a été détectée dans les informations fournies.' : language === 'de' ? 'In den bereitgestellten Informationen wurden keine eindeutigen Abweichungen festgestellt.' : language === 'es' ? 'No se detectaron discrepancias evidentes en la información proporcionada.' : 'Não foram detetadas divergências evidentes nos documentos fornecidos.')}
    <h5>${c[9]}</h5>
    ${itemList(report.nao_confirmado, language === 'en' ? 'Not identified in the information analysed.' : language === 'fr' ? 'Non identifié dans les informations analysées.' : language === 'de' ? 'In den analysierten Informationen nicht identifiziert.' : language === 'es' ? 'No identificado en la información analizada.' : 'Não identificado nos documentos analisados.')}
    <h5>${c[10]}</h5>
    ${itemList(report.proximos_passos, language === 'en' ? 'No further action has been defined at this stage.' : language === 'fr' ? 'Aucune autre action n’a été définie à ce stade.' : language === 'de' ? 'In dieser Phase wurde kein weiterer Schritt festgelegt.' : language === 'es' ? 'No se ha definido ninguna otra actuación en esta fase.' : 'Não foi definido outro passo nesta fase.')}
    <p><small>${language === 'en' ? 'This report is a document pre-assessment and does not replace prior information, a municipal opinion, a topographic survey or validation by a qualified professional.' : language === 'fr' ? 'Ce rapport constitue une pré-analyse documentaire et ne remplace ni une information préalable, ni un avis municipal, ni un relevé topographique, ni une validation par un professionnel qualifié.' : language === 'de' ? 'Dieser Bericht ist eine dokumentarische Voranalyse und ersetzt weder eine Vorabinformation noch eine kommunale Stellungnahme, eine topografische Vermessung oder die Prüfung durch eine qualifizierte Fachperson.' : language === 'es' ? 'Este informe es un preanálisis documental y no sustituye información previa, un informe municipal, un levantamiento topográfico ni la validación de un profesional cualificado.' : 'Este relatório é uma pré-análise documental e não substitui informação prévia, parecer municipal, levantamento topográfico ou validação por técnico habilitado.'}</small></p>`;
}

const IMMEDIATE_REPORT_COPY = {
  pt: {
    municipalityPending: 'Concelho a confirmar', cadastralReference: 'referência cadastral', manualBoundary: 'limite aproximado desenhado pelo utilizador', mapLocation: 'localização selecionada no mapa',
    confirmed: 'Confirmado', verification: 'Necessita verificação', technicalValidation: 'Necessita validação técnica', insufficientData: 'Dados territoriais insuficientes',
    officialQuery: 'Consulta geográfica oficial disponível', municipalRegulation: 'Regulamento municipal', page: 'p.', preliminaryFeasibility: 'Viabilidade preliminar da pretensão',
    multipleZones: 'Dados insuficientes para uma conclusão única: o limite analisado intersecta mais do que uma classe territorial e não foi indicado ponto de implantação. A viabilidade depende da zona exata onde se pretende construir ou intervir.',
    multipleZonesSource: 'Interseção territorial da parcela - implantação ainda não indicada',
    newHomeRural: 'Nova moradia não demonstrada nesta fase. A integração em Reserva Agrícola Nacional/solo agrícola não confere, por si só, direito a construir; só poderá ser apreciada nas exceções legais e regulamentares aplicáveis, incluindo as condições de habitação do agricultor quando relevantes.',
    preexistenceRural: 'Reconstrução, alteração ou ampliação de preexistência: potencialmente admissível apenas se a construção existente e a sua legalidade forem comprovadas. A área, a volumetria, a implantação e as condicionantes territoriais têm de ser validadas.', legalisationPre1951: 'A legalização da ampliação de uma casa declarada como anterior a 1951 pode ser apreciada como intervenção sobre preexistência, e não como nova moradia, apenas após prova documental da construção original, da sua volumetria e da data da ampliação. A alegada antiguidade não legaliza automaticamente obras posteriores nem elimina as condicionantes RAN/PDM.',
    urban: 'Possibilidade em princípio, sujeita à confirmação da implantação, dos parâmetros da categoria de solo, das servidões e de eventual loteamento ou plano territorial mais detalhado.',
    officialRegulation: 'Classificação territorial oficial disponível e regulamento municipal aplicável',
    conclusionZone: 'Zona territorial identificada em', rulesBelow: 'As regras regulamentares aplicáveis estão identificadas abaixo e exigem confirmação técnica.', noQuantitativeRules: 'Ainda não foi possível associar parâmetros urbanísticos quantitativos a esta zona.',
    noZone: 'A localização foi registada em {municipality}, mas ainda não foi confirmada a categoria de solo do PDM. Por esse motivo, não são apresentados índices nem capacidade construtiva.',
    notIdentified: 'Não identificado', notConfirmed: 'Não confirmada', coordinatesMissing: 'Não identificadas',
    boundaryValidation: 'A delimitação e os parâmetros concretos carecem de validação técnica.', proposalFeasibility: 'Viabilidade concreta da pretensão:', proposal: 'Pretensão urbanística concreta.', ownership: 'Delimitação rigorosa, titularidade e artigo matricial, quando não constem de documentos oficiais.',
    detailedByEmail: 'O relatório técnico aprofundado será preparado e enviado por e-mail.', meeting: 'Agendar uma reunião de consultoria com o Arq. Leonel Mendes para confirmar a estratégia do processo.',
  },
  en: {
    municipalityPending: 'Municipality to be confirmed', cadastralReference: 'cadastral reference', manualBoundary: 'approximate boundary drawn by the user', mapLocation: 'location selected on the map',
    confirmed: 'Confirmed', verification: 'Requires verification', technicalValidation: 'Technical validation required', insufficientData: 'Insufficient territorial data',
    officialQuery: 'Official geographic query available', municipalRegulation: 'Municipal regulations', page: 'p.', preliminaryFeasibility: 'Preliminary feasibility of the proposal',
    multipleZones: 'There is insufficient information for one overall conclusion: the analysed boundary intersects more than one territorial class and no building location was provided. Feasibility depends on the exact area where construction or other work is intended.',
    multipleZonesSource: 'Parcel territorial intersection - building location not yet provided',
    newHomeRural: 'A new dwelling is not demonstrated at this stage. Inclusion in the National Agricultural Reserve or agricultural land does not, by itself, create a right to build; it can only be assessed under the applicable legal and planning exceptions, including farmer housing conditions where relevant.',
    preexistenceRural: 'Reconstruction, alteration or extension of an existing building: potentially admissible only if the existing construction and its legality are evidenced. Area, volume, siting and territorial constraints must be validated.', legalisationPre1951: 'The regularisation of an extension to a house stated to pre-date 1951 may be assessed as work to an existing building, rather than as a new dwelling, only after documentary evidence of the original construction, its volume and the date of the extension. The claimed age does not automatically regularise later works or remove RAN/PDM constraints.',
    urban: 'Possible in principle, subject to confirmation of the building location, the parameters of the land-use category, easements and any subdivision or more detailed territorial plan.',
    officialRegulation: 'Official territorial classification available and applicable municipal regulations',
    conclusionZone: 'Territorial zone identified in', rulesBelow: 'The applicable regulatory rules are set out below and require technical confirmation.', noQuantitativeRules: 'Quantitative planning parameters could not yet be associated with this zone.',
    noZone: 'The location was recorded in {municipality}, but the PDM land-use category has not yet been confirmed. For that reason, no indices or building capacity are stated.',
    notIdentified: 'Not identified', notConfirmed: 'Not confirmed', coordinatesMissing: 'Not identified',
    boundaryValidation: 'The boundary and the specific parameters require technical validation.', proposalFeasibility: 'Specific feasibility of the proposal:', proposal: 'Specific planning proposal.', ownership: 'Exact boundary, ownership and property tax reference, where these do not appear in official documents.',
    detailedByEmail: 'A detailed technical report will be prepared and sent by email.', meeting: 'Book a consultation with Architect Leonel Mendes to confirm the process strategy.',
  },
  fr: { municipalityPending:'Municipalité à confirmer', cadastralReference:'référence cadastrale', manualBoundary:'limite approximative dessinée par l’utilisateur', mapLocation:'localisation sélectionnée sur la carte', confirmed:'Confirmé', verification:'À vérifier', technicalValidation:'Validation technique requise', insufficientData:'Données territoriales insuffisantes', officialQuery:'Consultation géographique officielle disponible', municipalRegulation:'Règlement municipal', page:'p.', preliminaryFeasibility:'Faisabilité préliminaire du projet', multipleZones:'Les données sont insuffisantes pour une conclusion unique : la limite analysée recoupe plusieurs catégories territoriales et aucun point d’implantation n’a été indiqué. La faisabilité dépend de la zone exacte de l’intervention.', multipleZonesSource:'Intersection territoriale de la parcelle - implantation non indiquée', newHomeRural:'Une nouvelle habitation n’est pas établie à ce stade. L’inclusion dans la Réserve agricole nationale ou un sol agricole ne crée pas, à elle seule, un droit à construire ; elle ne peut être appréciée que dans le cadre des exceptions légales et réglementaires applicables.', preexistenceRural:'Reconstruction, modification ou extension d’une construction existante : potentiellement admissible uniquement si la construction existante et sa légalité sont prouvées. La surface, le volume, l’implantation et les contraintes territoriales doivent être validés.', legalisationPre1951:'La régularisation d’une extension d’une maison déclarée antérieure à 1951 ne peut être examinée comme intervention sur une construction existante qu’après preuve documentaire de la construction d’origine, de son volume et de la date de l’extension. L’ancienneté invoquée ne régularise pas automatiquement les travaux ultérieurs.', urban:'Possible en principe, sous réserve de confirmer l’implantation, les paramètres de la catégorie de sol, les servitudes et tout lotissement ou plan territorial plus détaillé.', officialRegulation:'Classification territoriale officielle disponible et règlement municipal applicable', conclusionZone:'Zone territoriale identifiée à', rulesBelow:'Les règles réglementaires applicables figurent ci-dessous et nécessitent une validation technique.', noQuantitativeRules:'Il n’a pas encore été possible d’associer des paramètres urbanistiques quantitatifs à cette zone.', noZone:'La localisation a été enregistrée à {municipality}, mais la catégorie de sol du PDM n’a pas encore été confirmée. Aucun indice ni capacité constructive n’est donc indiqué.', notIdentified:'Non identifié', notConfirmed:'Non confirmée', coordinatesMissing:'Non identifiées', boundaryValidation:'La délimitation et les paramètres précis nécessitent une validation technique.', proposalFeasibility:'Faisabilité concrète du projet :', proposal:'Projet urbanistique concret.', ownership:'Délimitation exacte, titularité et référence fiscale, lorsqu’elles ne figurent pas dans les documents officiels.', detailedByEmail:'Un rapport technique détaillé sera préparé et envoyé par e-mail.', meeting:'Planifier une consultation avec l’architecte Leonel Mendes afin de confirmer la stratégie du dossier.' },
  de: { municipalityPending:'Gemeinde noch zu bestätigen', cadastralReference:'Katasterreferenz', manualBoundary:'vom Nutzer gezeichnete ungefähre Grenze', mapLocation:'auf der Karte ausgewählter Standort', confirmed:'Bestätigt', verification:'Prüfung erforderlich', technicalValidation:'Technische Prüfung erforderlich', insufficientData:'Unzureichende Gebietsdaten', officialQuery:'Amtliche geografische Abfrage verfügbar', municipalRegulation:'Kommunale Vorschriften', page:'S.', preliminaryFeasibility:'Vorläufige Zulässigkeit des Vorhabens', multipleZones:'Für eine eindeutige Schlussfolgerung reichen die Daten nicht aus: Die analysierte Grenze schneidet mehrere Gebietskategorien und es wurde kein Baupunkt angegeben. Die Zulässigkeit hängt vom genauen Ort der Maßnahme ab.', multipleZonesSource:'Gebietsüberschneidung des Grundstücks - Baupunkt noch nicht angegeben', newHomeRural:'Ein neues Wohnhaus ist in dieser Phase nicht nachgewiesen. Die Einbeziehung in die Nationale Landwirtschaftsreserve oder in landwirtschaftliche Flächen begründet für sich allein kein Baurecht; eine Prüfung ist nur nach den anwendbaren gesetzlichen und planungsrechtlichen Ausnahmen möglich.', preexistenceRural:'Wiederaufbau, Änderung oder Erweiterung eines Bestandsgebäudes: potenziell zulässig nur, wenn das Bestandsgebäude und seine Rechtmäßigkeit nachgewiesen werden. Fläche, Volumen, Standort und Gebietsbeschränkungen müssen geprüft werden.', urban:'Grundsätzlich möglich, vorbehaltlich der Bestätigung des Baupunkts, der Parameter der Flächenkategorie, von Dienstbarkeiten und einer möglichen Parzellierung oder eines detaillierteren Raumplans.', officialRegulation:'Amtliche Gebietsklassifizierung verfügbar und anwendbare kommunale Vorschriften', conclusionZone:'Gebietskategorie identifiziert in', rulesBelow:'Die anwendbaren Regelungen sind unten aufgeführt und müssen technisch geprüft werden.', noQuantitativeRules:'Für diese Gebietskategorie konnten noch keine quantitativen Planungsparameter zugeordnet werden.', noZone:'Der Standort wurde in {municipality} erfasst, aber die PDM-Flächenkategorie wurde noch nicht bestätigt. Deshalb werden keine Kennwerte oder Bebauungsmöglichkeiten angegeben.', notIdentified:'Nicht identifiziert', notConfirmed:'Nicht bestätigt', coordinatesMissing:'Nicht identifiziert', boundaryValidation:'Grenze und konkrete Parameter müssen technisch geprüft werden.', proposalFeasibility:'Konkrete Zulässigkeit des Vorhabens:', proposal:'Konkretes Planungsvorhaben.', ownership:'Genaue Grenze, Eigentümerschaft und steuerliche Grundstücksreferenz, soweit diese nicht aus amtlichen Dokumenten hervorgehen.', detailedByEmail:'Ein ausführlicher technischer Bericht wird vorbereitet und per E-Mail versandt.', meeting:'Vereinbaren Sie ein Beratungsgespräch mit Architekt Leonel Mendes, um die Vorgehensweise zu bestätigen.' },
  es: { municipalityPending:'Municipio por confirmar', cadastralReference:'referencia catastral', manualBoundary:'límite aproximado dibujado por el usuario', mapLocation:'ubicación seleccionada en el mapa', confirmed:'Confirmado', verification:'Requiere verificación', technicalValidation:'Requiere validación técnica', insufficientData:'Datos territoriales insuficientes', officialQuery:'Consulta geográfica oficial disponible', municipalRegulation:'Normativa municipal', page:'p.', preliminaryFeasibility:'Viabilidad preliminar de la propuesta', multipleZones:'Los datos son insuficientes para una conclusión única: el límite analizado intersecta más de una categoría territorial y no se indicó un punto de implantación. La viabilidad depende de la zona exacta donde se pretende intervenir.', multipleZonesSource:'Intersección territorial de la parcela - implantación aún no indicada', newHomeRural:'Una vivienda nueva no queda demostrada en esta fase. La inclusión en la Reserva Agrícola Nacional o en suelo agrícola no otorga por sí sola derecho a construir; solo podrá valorarse dentro de las excepciones legales y normativas aplicables.', preexistenceRural:'Reconstrucción, modificación o ampliación de una construcción existente: potencialmente admisible solo si se acredita la construcción existente y su legalidad. Deben validarse la superficie, el volumen, la implantación y las restricciones territoriales.', urban:'Posible en principio, sujeto a la confirmación de la implantación, los parámetros de la categoría de suelo, las servidumbres y cualquier parcelación o plan territorial más detallado.', officialRegulation:'Clasificación territorial oficial disponible y normativa municipal aplicable', conclusionZone:'Zona territorial identificada en', rulesBelow:'Las reglas aplicables se exponen a continuación y requieren validación técnica.', noQuantitativeRules:'Todavía no ha sido posible asociar parámetros urbanísticos cuantitativos a esta zona.', noZone:'La ubicación se registró en {municipality}, pero aún no se ha confirmado la categoría de suelo del PDM. Por ello no se indican índices ni capacidad edificatoria.', notIdentified:'No identificado', notConfirmed:'No confirmada', coordinatesMissing:'No identificadas', boundaryValidation:'La delimitación y los parámetros concretos requieren validación técnica.', proposalFeasibility:'Viabilidad concreta de la propuesta:', proposal:'Propuesta urbanística concreta.', ownership:'Delimitación exacta, titularidad y referencia fiscal, cuando no consten en documentos oficiales.', detailedByEmail:'Se preparará y enviará por correo electrónico un informe técnico detallado.', meeting:'Solicite una reunión de consultoría con el arquitecto Leonel Mendes para confirmar la estrategia del proceso.' },
};

function immediateCopy(language = 'pt') { return IMMEDIATE_REPORT_COPY[language] || IMMEDIATE_REPORT_COPY.pt; }

function translateImmediateLabel(value, language = 'pt') {
  if (language === 'pt') return value;
  const labels = {
    en: [['Classificação do solo — PDM', 'Land-use classification - PDM'], ['Classificação do solo', 'Land-use classification'], ['Regime de uso do solo', 'Land-use regime'], ['Plano municipal em vigor', 'Municipal plan in force'], ['Concelho identificado', 'Municipality identified'], ['Condicionante RAN', 'National Agricultural Reserve (RAN) constraint'], ['Condicionante territorial', 'Territorial constraint'], ['Cobertura da pré-análise', 'Pre-assessment coverage']],
    fr: [['Classificação do solo — PDM', 'Classification du sol - PDM'], ['Classificação do solo', 'Classification du sol'], ['Regime de uso do solo', 'Régime d’utilisation du sol'], ['Plano municipal em vigor', 'Plan municipal en vigueur'], ['Concelho identificado', 'Municipalité identifiée'], ['Condicionante RAN', 'Contrainte de Réserve agricole nationale (RAN)'], ['Condicionante territorial', 'Contrainte territoriale'], ['Cobertura da pré-análise', 'Couverture de la pré-analyse']],
    de: [['Classificação do solo — PDM', 'Flächenklassifizierung - PDM'], ['Classificação do solo', 'Flächenklassifizierung'], ['Regime de uso do solo', 'Flächennutzungsregime'], ['Plano municipal em vigor', 'Geltender kommunaler Plan'], ['Concelho identificado', 'Identifizierte Gemeinde'], ['Condicionante RAN', 'Beschränkung Nationale Landwirtschaftsreserve (RAN)'], ['Condicionante territorial', 'Gebietsbeschränkung'], ['Cobertura da pré-análise', 'Abdeckung der Voranalyse']],
    es: [['Classificação do solo — PDM', 'Clasificación del suelo - PDM'], ['Classificação do solo', 'Clasificación del suelo'], ['Regime de uso do solo', 'Régimen de uso del suelo'], ['Plano municipal em vigor', 'Plan municipal vigente'], ['Concelho identificado', 'Municipio identificado'], ['Condicionante RAN', 'Limitación de Reserva Agrícola Nacional (RAN)'], ['Condicionante territorial', 'Limitación territorial'], ['Cobertura da pré-análise', 'Cobertura del preanálisis']],
  };
  return (labels[language] || []).reduce((text, [from, to]) => String(text).replaceAll(from, to), value);
}

// A cartografia e o catálogo regulamentar são mantidos internamente na língua
// oficial portuguesa. Antes de os mostrar a um cliente estrangeiro, esta
// tradução cobre as regras e alertas que a aplicação introduz localmente. Os
// artigos, diplomas e nomes oficiais continuam reconhecíveis como referência.
function translateImmediateText(value, language = 'pt') {
  if (language === 'pt' || value == null) return value;
  let text = String(value);
  const translations = {
    en: [
      ['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Agricultural land - National Agricultural Reserve area'],
      ['A utilização não agrícola de solos integrados na RAN só pode ser admitida nos termos do Regime Jurídico da RAN. Não decorre da classificação uma autorização automática para construir.', 'Non-agricultural use of land within the National Agricultural Reserve (RAN) may only be permitted under the RAN legal regime. This classification does not automatically authorise construction.'],
      ['A edificação em solo rural é proibida, exceto nas situações expressamente previstas no regulamento; as condições abaixo são cumulativas e mantêm-se sujeitas ao regime da RAN.', 'Building in rural land is prohibited except in the situations expressly provided for in the regulations; the conditions below are cumulative and remain subject to the RAN regime.'],
      ['Uma moradia isolada só pode enquadrar-se como habitação do agricultor, integrada numa exploração agrícola ou agroflorestal economicamente viável, comprovada pela entidade competente. Não é admissível como moradia comum apenas pela área ou pela existência de acesso.', 'A detached dwelling may only qualify as farmer housing, integrated in an economically viable agricultural or agroforestry holding and evidenced by the competent authority. It is not admissible as an ordinary dwelling solely because of the area or access.'],
      ['Exige propriedade com pelo menos 10 ha na Unidade Territorial Litoral Sul e Barrocal, ou 5 ha nas restantes Unidades Territoriais. A área cadastral isolada inferior a estes limiares não demonstra o cumprimento da condição.', 'It requires a property of at least 10 ha in the Litoral Sul and Barrocal Territorial Unit, or 5 ha in the remaining Territorial Units. A cadastral area below these thresholds does not demonstrate compliance.'],
      ['Área máxima de construção 500 m²; cércea máxima 7,5 m; máximo 2 pisos, incluindo semienterrados; acesso público e afastamento mínimo de 5 m aos extremos da parcela, sem prejuízo de outras servidões.', 'Maximum construction area of 500 m²; maximum building height of 7.5 m; maximum 2 storeys including semi-basements; public access and a minimum 5 m setback from the parcel boundaries, without prejudice to other easements.'],
      ['A fonte complementar de morada devolveu Faro, mas a delimitação administrativa oficial (CAOP) identifica Loulé. A pré-análise utiliza Loulé; confirme o limite e a morada nos documentos do prédio antes de qualquer pedido formal.', 'The supplementary address source returned Faro, but the official administrative boundary (CAOP) identifies Loulé. This pre-assessment uses Loulé; confirm the boundary and address in the property documents before any formal application.'],
      ['No PDM geral de Loulé, a carta de ordenamento publicada pelo Município é raster. As regras associadas à CRUS são uma referência regulamentar e não confirmam, por si só, a mancha do PDM; índices só são apresentados quando uma zona específica vetorial os devolver.', 'In Loulé’s general PDM, the municipal zoning map is published as a raster image. Rules associated with CRUS are regulatory guidance and do not by themselves confirm the PDM zone; indices are only shown when a specific vector zone provides them.'],
      ['Regra geral de edificação em solo rural', 'General rural building rule'], ['Moradia nova - condição de princípio', 'New dwelling - basic condition'], ['Moradia nova - área mínima da propriedade', 'New dwelling - minimum property area'], ['Parâmetros da habitação do agricultor', 'Farmer housing parameters'], ['Condicionante RAN', 'National Agricultural Reserve (RAN) constraint'], ['Regulamento do Plano Diretor Municipal de Loulé', 'Loulé Municipal Master Plan Regulations'], ['Carta de Ordenamento do PDM de Loulé, serviço cartográfico municipal (vista vertical; polígono assinalado a vermelho)', 'Loulé PDM zoning map, municipal cartographic service (vertical view; polygon marked in red)'], ['Guarde esta pré-análise e contacte-nos para validação técnica, pedido de informação prévia ou projeto.', 'Keep this pre-assessment and contact us for technical validation, a prior information request or a design project.'],
    ],
    fr: [['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Espace agricole - zone de Réserve agricole nationale'], ['Condicionante RAN', 'Contrainte de Réserve agricole nationale (RAN)'], ['Regra geral de edificação em solo rural', 'Règle générale de construction en sol rural'], ['Guarde esta pré-análise e contacte-nos para validação técnica, pedido de informação prévia ou projeto.', 'Conservez cette pré-analyse et contactez-nous pour une validation technique, une demande d’information préalable ou un projet.']],
    de: [['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Landwirtschaftsfläche - Gebiet der Nationalen Landwirtschaftsreserve'], ['Condicionante RAN', 'Beschränkung Nationale Landwirtschaftsreserve (RAN)'], ['Regra geral de edificação em solo rural', 'Allgemeine Regel für Bauen im Außenbereich'], ['Guarde esta pré-análise e contacte-nos para validação técnica, pedido de informação prévia ou projeto.', 'Bewahren Sie diese Voranalyse auf und kontaktieren Sie uns für eine technische Prüfung, eine Bauvoranfrage oder ein Projekt.']],
    es: [['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Espacio agrícola - zona de Reserva Agrícola Nacional'], ['Condicionante RAN', 'Limitación de Reserva Agrícola Nacional (RAN)'], ['Regra geral de edificação em solo rural', 'Regla general de edificación en suelo rústico'], ['Guarde esta pré-análise e contacte-nos para validação técnica, pedido de informação prévia ou projeto.', 'Guarde este preanálisis y contáctenos para validación técnica, una consulta previa o un proyecto.']],
  };
  (translations[language] || []).forEach(([from, to]) => { text = text.replaceAll(from, to); });
  return translateImmediateLabel(text, language);
}

function immediateAnalysisReport(localizacao = {}, objetivo = '', costEstimate = null, language = 'pt') {
  const c = immediateCopy(language);
  const parcel = localizacao.parcela || {};
  const municipality = localizacao.municipio?.nome || c.municipalityPending;
  const coordinates = localizacao.coordenadas || {};
  const location = [municipality, parcel.referencia ? `${c.cadastralReference} ${parcel.referencia}` : parcel.manual ? c.manualBoundary : c.mapLocation].filter(Boolean).join(' · ');
  const spatial = Array.isArray(localizacao.pdm) ? localizacao.pdm : [];
  const parameters = spatial.filter((item) => /regime de uso|classificação do solo|plano municipal|condicionante territorial|concelho identificado/i.test(item?.camada || '') && item?.valor)
    .slice(0, 7).map((item) => ({ elemento: translateImmediateLabel(item.camada, language), resultado: translateImmediateText(item.valor, language), estado: /classificação do solo|plano municipal|concelho identificado/i.test(item.camada) ? c.confirmed : c.verification, fonte: translateImmediateText(item.fonte || c.officialQuery, language) }));
  const rules = spatial.filter((item) => /^Regra urbanística/i.test(item?.camada || '') && item?.valor)
    .slice(0, 8).map((item) => ({ elemento: translateImmediateText(translateImmediateLabel(String(item.camada).replace(/^Regra urbanística\s*[—-]\s*/i, ''), language), language), resultado: translateImmediateText(item.valor, language), estado: c.verification, fonte: translateImmediateText([item.fonte || c.municipalRegulation, item.artigo, item.pagina ? `${c.page} ${item.pagina}` : ''].filter(Boolean).join(' · '), language) }));
  // Quando existe uma classificação municipal/PDM, ela prevalece sobre a
  // designação genérica de uso do solo da DGT. Isto evita uma conclusão
  // baseada numa condicionante quando já existe uma classe de plano mais
  // específica para a localização.
  const primaryIndex = spatial.findIndex((item) => /classificação do solo\s*[—-]\s*pdm|classificação.*pdm/i.test(item?.camada || ''));
  const fallbackPrimaryIndex = primaryIndex >= 0 ? primaryIndex : spatial.findIndex((item) => /classificação do solo|regime de uso/i.test(item?.camada || ''));
  const primary = fallbackPrimaryIndex >= 0 ? parameters.find((item) => item.resultado === translateImmediateText(spatial[fallbackPrimaryIndex]?.valor, language)) : null;
  const territorialClasses = parameters.filter((item) => /classificação do solo|regime de uso|land-use classification|land-use regime|classification du sol|régime d’utilisation|flächenklassifizierung|flächennutzungsregime|clasificación del suelo|régimen de uso/i.test(item.elemento)).map((item) => item.resultado);
  const multipleClasses = new Set(territorialClasses).size > 1 && !localizacao?.implantacao?.confirmada;
  const normalizedObjective = String(objetivo || '').toLowerCase();
  const normalizedClass = String(primary?.resultado || '').toLowerCase();
  const isNewHome = /moradia|habita[cç][aã]o|construir|nova constru[cç][aã]o|new dwelling|new home|new construction/.test(normalizedObjective);
  const mentionsPreexistence = /ru[ií]na|preexist|reconstru[cç][aã]o|amplia[cç][aã]o|altera[cç][aã]o|existing building|extension|extend|alteration|legalisation|legalization|regulari[sz]/.test(normalizedObjective);
  const mentionsPre1951 = /\b1951\b|anterior\s+a\s+1951|before\s+1951|pré[-\s]?1951|pre[-\s]?1951/.test(normalizedObjective);
  const legalisationIntent = /legaliza[cç][aã]o|regulari[sz]a(?:tion|ção)|legalisation|legalization/.test(normalizedObjective);
  const ruralOrRan = /reserva agr[ií]cola|\bran\b|solo r[uú]stico|espa[cç]o agr[ií]cola|agr[ií]cola|national agricultural reserve|agricultural land|rural land|landwirtschaft|réserve agricole|suelo agr[ií]cola/.test(normalizedClass);
  const urban = /solo urbano|espa[cç]o urbano|urbaniz[aá]vel|habitacional/.test(normalizedClass);
  let viability = null;
  if (primary && objetivo) {
    if (multipleClasses) {
      viability = {
        elemento: c.preliminaryFeasibility, resultado: c.multipleZones, estado: c.verification, fonte: c.multipleZonesSource,
      };
    } else if (ruralOrRan && isNewHome && !mentionsPreexistence) {
      viability = {
        elemento: c.preliminaryFeasibility, resultado: c.newHomeRural, estado: c.verification, fonte: c.officialRegulation,
      };
    } else if (ruralOrRan && mentionsPreexistence) {
      viability = {
        elemento: c.preliminaryFeasibility, resultado: (mentionsPre1951 || legalisationIntent) ? (c.legalisationPre1951 || c.preexistenceRural) : c.preexistenceRural, estado: c.verification, fonte: c.officialRegulation,
      };
    } else if (urban) {
      viability = {
        elemento: c.preliminaryFeasibility, resultado: c.urban, estado: c.verification, fonte: c.officialRegulation,
      };
    }
  }
  // Em Loulé, uma pretensão de legalização/ampliação sobre construção anterior
  // não deve ser analisada como moradia nova. Acrescentamos as regras do
  // Artigo 88.º-B apenas como enquadramento condicionado: nunca como prova da
  // existência, legalidade ou data da construção.
  if (ruralOrRan && mentionsPreexistence && localizacao?.municipio?.nome === 'Loulé') {
    const preexistenceRules = preexistenceRulesFor('Loulé').map((rule) => ({
      elemento: translateImmediateText(rule.elemento, language), resultado: translateImmediateText(rule.resultado, language), estado: c.verification,
      fonte: translateImmediateText([rule.fonte, rule.artigo, rule.pagina ? `${c.page} ${rule.pagina}` : ''].filter(Boolean).join(' · '), language),
    }));
    rules.push(...preexistenceRules);
  }
  if (viability) rules.unshift(viability);
  const conclusion = primary
    ? `${c.conclusionZone} ${municipality}: ${primary.resultado}. ${viability ? viability.resultado : rules.length ? c.rulesBelow : c.noQuantitativeRules}`
    : c.noZone.replace('{municipality}', municipality);
  return {
    identificacao: { localizacao: location, artigo_matricial: parcel.declaracao || c.notIdentified, area: parcel.propriedades?.area || parcel.propriedades?.area_m2 || c.notConfirmed, coordenadas: Number.isFinite(Number(coordinates.latitude)) ? `${coordinates.latitude}, ${coordinates.longitude}` : c.coordinatesMissing },
    parametros: parameters,
    regras_aplicaveis: rules,
    divergencias: localizacao.avisos?.slice(0, 2).map((item) => translateImmediateText(item, language)) || [c.boundaryValidation],
    nao_confirmado: [objetivo ? `${c.proposalFeasibility} ${objetivo}.` : c.proposal, c.ownership],
    proximos_passos: [c.detailedByEmail, c.meeting],
    conclusao: { estado: primary ? c.technicalValidation : c.insufficientData, resumo: conclusion },
    costEstimate,
  };
}

function localizeImmediateReport(html, language = 'pt') {
  const copy = {
    en: [['Conclusão da pré-análise:', 'Pre-assessment conclusion:'], ['Zona e enquadramento territorial identificado', 'Identified territorial zone and context'], ['Zona territorial identificada em', 'Territorial zone identified in'], ['As regras regulamentares aplicáveis estão identificadas abaixo e exigem confirmação técnica.', 'The applicable regulatory rules are identified below and require technical confirmation.'], ['Localização e elementos disponíveis', 'Location and available information'], ['Localização / freguesia', 'Location / parish'], ['Artigo matricial', 'Property tax reference'], ['Área indicada', 'Stated area'], ['Coordenadas', 'Coordinates'], ['Regras aplicáveis à pretensão', 'Rules applicable to the proposal'], ['O que precisa de validação', 'What requires validation'], ['Informação ainda em falta', 'Information still missing'], ['Próximo passo recomendado', 'Recommended next step'], ['Necessita validação técnica', 'Technical validation required'], ['Dados territoriais insuficientes', 'Insufficient territorial data'], ['Não há regra urbanística confirmada para a localização.', 'No planning rule has been confirmed for this location.'], ['Não identificado', 'Not identified'], ['Não confirmada', 'Not confirmed'], ['Não identificadas', 'Not identified'], ['Viabilidade preliminar da pretensão', 'Preliminary feasibility of the proposal'], ['Regime de uso do solo (DGT)', 'Land-use regime (DGT)'], ['Concelho identificado (CAOP)', 'Municipality identified (CAOP)'], ['Cobertura da pré-análise', 'Pre-assessment coverage'], ['Regra urbanística', 'Planning rule'], ['Condicionante RAN', 'RAN constraint'], ['Direção-Geral do Território — CRUS oficial', 'Directorate-General for Territory — official CRUS'], ['Consulta geográfica oficial disponível', 'Official geographic query available'], ['O relatório técnico aprofundado será preparado e enviado por e-mail.', 'A detailed technical report will be prepared and sent by email.'], ['Agendar uma reunião de consultoria com o Arq. Leonel Mendes para confirmar a estratégia do processo.', 'Book a consultation with Architect Leonel Mendes to confirm the process strategy.'], ['Este relatório é uma pré-análise documental e não substitui informação prévia, parecer municipal, levantamento topográfico ou validação por técnico habilitado.', 'This report is a document pre-assessment and does not replace prior information, a municipal opinion, a topographic survey or validation by a qualified professional.']],
    fr: [['Conclusão da pré-análise:', 'Conclusion de la pré-analyse :'], ['Zona e enquadramento territorial identificado', 'Zone et contexte territorial identifiés'], ['Localização e elementos disponíveis', 'Localisation et éléments disponibles'], ['Localização / freguesia', 'Localisation / paroisse'], ['Artigo matricial', 'Référence fiscale du bien'], ['Área indicada', 'Surface indiquée'], ['Coordenadas', 'Coordonnées'], ['Regras aplicáveis à pretensão', 'Règles applicables au projet'], ['O que precisa de validação', 'Éléments à valider'], ['Informação ainda em falta', 'Informations encore manquantes'], ['Próximo passo recomendado', 'Prochaine étape recommandée'], ['Necessita validação técnica', 'Validation technique requise'], ['Dados territoriais insuficientes', 'Données territoriales insuffisantes'], ['Não identificado', 'Non identifié'], ['Não confirmada', 'Non confirmée'], ['Não identificadas', 'Non identifiées'], ['Viabilidade preliminar da pretensão', 'Faisabilité préliminaire du projet'], ['Direção-Geral do Território — CRUS oficial', 'Direction générale du territoire — CRUS officiel'], ['Consulta geográfica oficial disponível', 'Consultation géographique officielle disponible'], ['O relatório técnico aprofundado será preparado e enviado por e-mail.', 'Un rapport technique détaillé sera préparé et envoyé par e-mail.'], ['Agendar uma reunião de consultoria com o Arq. Leonel Mendes para confirmar a estratégia do processo.', 'Planifier une réunion de consultation avec l’architecte Leonel Mendes afin de confirmer la stratégie du dossier.']],
    de: [['Conclusão da pré-análise:', 'Ergebnis der Voranalyse:'], ['Zona e enquadramento territorial identificado', 'Identifizierte Gebietskategorie und Einordnung'], ['Localização e elementos disponíveis', 'Standort und verfügbare Angaben'], ['Localização / freguesia', 'Standort / Gemeinde'], ['Artigo matricial', 'Steuerliche Grundstücksreferenz'], ['Área indicada', 'Angegebene Fläche'], ['Coordenadas', 'Koordinaten'], ['Regras aplicáveis à pretensão', 'Für das Vorhaben geltende Regeln'], ['O que precisa de validação', 'Was geprüft werden muss'], ['Informação ainda em falta', 'Noch fehlende Angaben'], ['Próximo passo recomendado', 'Empfohlener nächster Schritt'], ['Necessita validação técnica', 'Technische Prüfung erforderlich'], ['Dados territoriais insuficientes', 'Unzureichende Gebietsdaten'], ['Não identificado', 'Nicht identifiziert'], ['Não confirmada', 'Nicht bestätigt'], ['Não identificadas', 'Nicht identifiziert'], ['Viabilidade preliminar da pretensão', 'Vorläufige Zulässigkeit des Vorhabens'], ['Direção-Geral do Território — CRUS oficial', 'Generaldirektion für Raumordnung — amtliches CRUS'], ['Consulta geográfica oficial disponível', 'Amtliche geografische Abfrage verfügbar'], ['O relatório técnico aprofundado será preparado e enviado por e-mail.', 'Ein ausführlicher technischer Bericht wird vorbereitet und per E-Mail versandt.'], ['Agendar uma reunião de consultoria com o Arq. Leonel Mendes para confirmar a estratégia do processo.', 'Vereinbaren Sie ein Beratungsgespräch mit Architekt Leonel Mendes, um die Vorgehensweise zu bestätigen.']],
    es: [['Conclusão da pré-análise:', 'Conclusión del preanálisis:'], ['Zona e enquadramento territorial identificado', 'Zona y encuadre territorial identificados'], ['Localização e elementos disponíveis', 'Ubicación y elementos disponibles'], ['Localização / freguesia', 'Ubicación / parroquia'], ['Artigo matricial', 'Referencia fiscal del inmueble'], ['Área indicada', 'Superficie indicada'], ['Coordenadas', 'Coordenadas'], ['Regras aplicáveis à pretensão', 'Reglas aplicables a la propuesta'], ['O que precisa de validação', 'Lo que requiere validación'], ['Informação ainda em falta', 'Información pendiente'], ['Próximo passo recomendado', 'Próximo paso recomendado'], ['Necessita validação técnica', 'Requiere validación técnica'], ['Dados territoriais insuficientes', 'Datos territoriales insuficientes'], ['Não identificado', 'No identificado'], ['Não confirmada', 'No confirmada'], ['Não identificadas', 'No identificadas'], ['Viabilidade preliminar da pretensão', 'Viabilidad preliminar de la propuesta'], ['Direção-Geral do Território — CRUS oficial', 'Dirección General del Territorio — CRUS oficial'], ['Consulta geográfica oficial disponível', 'Consulta geográfica oficial disponible'], ['O relatório técnico aprofundado será preparado e enviado por e-mail.', 'Se preparará y enviará por correo electrónico un informe técnico detallado.'], ['Agendar uma reunião de consultoria com o Arq. Leonel Mendes para confirmar a estratégia do processo.', 'Solicite una reunión de consultoría con el arquitecto Leonel Mendes para confirmar la estrategia del proceso.']],
  };
  return (copy[language] || []).reduce((text, [from, to]) => text.replaceAll(from, to), html);
}

function dispatchSecret() { return process.env.DOSSIER_ACCESS_SECRET || process.env.ANALYSIS_SESSION_SECRET || ''; }
function dispatchSignature(payload) { return createHmac('sha256', dispatchSecret()).update(payload).digest('hex'); }

async function queueDetailedAnalysis(body, cookie = '') {
  if (!dispatchSecret()) throw new Error('missing_dispatch_secret');
  const payload = JSON.stringify(body);
  const baseUrl = String(process.env.URL || process.env.PUBLIC_SITE_URL || 'https://leonelmendes.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/.netlify/functions/analisar-planta-background`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-LM-Analysis-Dispatch': dispatchSignature(payload), ...(cookie ? { Cookie: cookie } : {}) }, body: payload,
  });
  if (!response.ok && response.status !== 202) throw new Error(`background_dispatch_${response.status}`);
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

function buildPrompt({ objetivo, descricao, documents, localizacao, regulationSources = [], officialRegulations = [], cartographicLayers = [], costEstimate = null, language = 'pt' }) {
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
6. Quando o cliente declarar uma pretensão, abre a secção "regras_aplicaveis" com a linha "Viabilidade preliminar da pretensão". Responde diretamente à pretensão, mas sem emitir decisão de licenciamento: "Viável em princípio, sujeito a confirmação" quando os usos e regras recebidos forem compatíveis; "Não demonstrada / não viável como apresentada" quando as regras recebidas exigirem condições que os dados da consulta não demonstram; ou "Dados insuficientes" quando não existir classificação aplicável. Se a parcela intersectar mais de uma classe e não existir "implantacao.confirmada", não apresentes uma conclusão única para todo o prédio: escreve "Dados insuficientes - depende da zona de implantação" e explica os cenários separadamente. Se existir "implantacao.confirmada", relaciona as regras apenas com a classe do ponto de implantação indicado; não mistures regras de outras zonas da parcela. Se "parcela.manual" for verdadeiro, chama sempre à geometria "limite aproximado desenhado pelo utilizador", nunca "parcela cadastral"; assinala que o cruzamento territorial é indicativo e que ficam por confirmar estremas, área, titularidade e artigo matricial. Em particular, para "Construir uma moradia" em RAN ou em solo rural agrícola de Loulé, esclarece que uma moradia NOVA comum não é viável apenas pela seleção do terreno: só pode haver enquadramento nas condições cumulativas da habitação do agricultor e, quando haja RAN, no respetivo regime jurídico. Quando a pretensão mencionar legalização/regularização de ampliação ou construção existente, incluindo uma casa declarada anterior a 1951, NÃO a avalies como moradia nova. Cria obrigatoriamente a linha "Legalização de ampliação sobre preexistência"; explica que a data anterior a 1951 é uma alegação a comprovar e não legaliza automaticamente a ampliação posterior. Para Loulé em solo rural, aplica exclusivamente as regras em "regrasPreexistencia", cita artigo e página, indica especificamente os limites de área/pisos quando estejam nessa biblioteca e conclui "Potencialmente apreciável como intervenção sobre preexistência, sujeito a prova documental e validação municipal". Exige como prova mínima: documento municipal/fiscal ou outro elemento idóneo da construção original, plantas/fotografias que permitam comparar volumetria, e identificação da data/área da ampliação. Nunca trates a ruína, a data anterior a 1951 ou a preexistência como confirmada sem prova documental, fotográfica ou levantamento; explica os elementos em falta e não transformes uma exceção em autorização.
7. Distingue sempre: confirmado, necessita verificação, não identificado.
8. Não apresentes aconselhamento jurídico nem uma decisão de licenciamento.
9. Escreve na língua escolhida pelo cliente (${language === 'en' ? 'inglês' : language === 'fr' ? 'francês' : language === 'de' ? 'alemão' : language === 'es' ? 'espanhol' : 'português europeu'}), com tom profissional e direto para um proprietário não técnico. Traduz títulos, estados, tabelas, conclusão, próximos passos e avisos; mantém apenas os nomes oficiais dos planos, diplomas, artigos e categorias territoriais na sua designação oficial portuguesa, acrescentando uma tradução explicativa entre parênteses se isso ajudar. A conclusão deve ter no máximo 3 frases e começar pelo que foi efetivamente confirmado. Não escrevas “a análise não pôde ser concluída” apenas porque não foram anexados PDFs: se existir localização ou PDM, explica antes o que foi possível apurar no mapa e depois o que falta confirmar. Evita repetir a mesma limitação em várias secções. Nas tabelas, usa frases curtas; não juntes palavras nem cabeçalhos, e não devolvas códigos técnicos sem uma designação legível. Em “próximos_passos”, indica no máximo 3 ações concretas e ordenadas.

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

export const detailedAnalysisHandler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  const professionalAccess = hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '');
  if (process.env.ALLOW_DIRECT_ANALYSIS === 'false' && !professionalAccess) {
    return json(503, { error: 'A análise direta está temporariamente desativada.' });
  }
  if (!process.env.GEMINI_API_KEY) return json(503, { error: 'O serviço de pré-análise está temporariamente indisponível. Tente novamente dentro de alguns minutos.' });

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
            { text: buildPrompt({ objetivo: body.objetivo, descricao: body.descricao, documents, localizacao: body.localizacao, regulationSources, officialRegulations: regulations, cartographicLayers: visualLayers, costEstimate, language: body.language }) },
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
    // Estes enriquecimentos foram inicialmente escritos em português. Em
    // línguas estrangeiras, mantém-se a resposta integralmente na língua
    // pedida, sem acrescentar frases portuguesas após a geração.
    if (!body.language || body.language === 'pt') {
      report = enrichLouleDispersedBuildingRules(report, body.localizacao);
      report = clarifyReportForAvailableEvidence(report, body.localizacao, documents);
      report = prioritizeArchitectMeeting(report);
    }
    const usage = responseBody.usageMetadata || {};
    console.info('analysis_usage', JSON.stringify({
      model,
      promptTokens: usage.promptTokenCount || null,
      outputTokens: usage.candidatesTokenCount || null,
      documents: documents.length,
    }));
    await finishAnalysis(trackingRequestId, { status: 'completed', model, promptTokens: usage.promptTokenCount || null, outputTokens: usage.candidatesTokenCount || null, durationMs: Date.now() - startedAt }).catch((error) => console.warn('analysis_tracking_finish_unavailable', error.message));

    const reply = `${renderReport(report, body.language)}${renderCostEstimateSection(costEstimate, body.language)}`;
    const reportText = reply.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>|<\/li>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\n\s*/g, '\n').trim();
    let dossier = null;
    try {
      dossier = await createDossier({ email: body.email, location: body.localizacao || null, reportHtml: reply, reportText, costEstimate });
      if (dossier?.available && documents.length) await addDossierDocuments({ id: dossier.id, token: dossier.token, documents });
    } catch (dossierError) {
      // O dossier é complementar: uma indisponibilidade nunca pode impedir a
      // entrega da pré-análise nem expor dados do pedido no log.
      console.warn('dossier_create_unavailable', dossierError?.message || 'unknown');
      dossier = null;
    }
    const siteUrl = String(process.env.PUBLIC_SITE_URL || 'https://leonelmendes.com').replace(/\/$/, '');
    const dossierLink = dossier?.available ? `${siteUrl}/dossier.html?id=${encodeURIComponent(dossier.id)}&token=${encodeURIComponent(dossier.token)}` : null;
    let emailSent = false;
    let emailError = null;
    try {
      const orderingPlan = documents.find((document) => document.origem === 'planta_localizacao_compactada' && /PDM\s*-\s*Ordenamento/i.test(document.paginaOriginal || document.nome || ''));
      const documentPlan = orderingPlan?.base64 && ['image/jpeg', 'image/png'].includes(orderingPlan.mimeType)
        ? { image: Buffer.from(orderingPlan.base64, 'base64'), source: 'Planta de Localização oficial — PDM / Ordenamento; polígono assinalado pelo requerente' }
        : null;
      await sendReportEmail({ to: body.email, reportText, reportHtml: reply, location: body.localizacao || null, privacyPolicyVersion: body.privacyPolicyVersion || null, documentPlan, dossierLink, reportReference: dossier?.reportReference || null, language: body.language });
      emailSent = true;
    } catch (emailFailure) {
      console.error('automatic_report_email_error', emailFailure);
      emailError = 'A análise foi concluída, mas não foi possível enviar automaticamente o relatório por e-mail.';
    }
    return json(200, { reply, resumo: report.conclusao?.estado || 'Concluído', emailSent, emailError, dossierAvailable: Boolean(dossier?.available), dossierLink, reportReference: dossier?.reportReference || null });
  } catch (error) {
    console.error('analysis_error', error);
    if (error?.code === 'GEMINI_TIMEOUT') return json(503, { error: error.message });
    return json(500, { error: 'Não foi possível processar a análise neste momento. Tente novamente dentro de alguns minutos.' });
  }
};

// A resposta pública não espera pelo modelo. Entrega o enquadramento já
// apurado pelo cadastro/PDM e coloca o relatório técnico completo em segundo
// plano, para ser remetido por e-mail e associado ao Dossier Digital.
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  const professionalAccess = hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '');
  if (process.env.ALLOW_DIRECT_ANALYSIS === 'false' && !professionalAccess) return json(503, { error: 'A análise direta está temporariamente desativada.' });
  try {
    const body = JSON.parse(event.body || '{}');
    const documents = Array.isArray(body.documentos) ? body.documentos : [];
    const hasLocation = body.localizacao?.coordenadas && Number.isFinite(Number(body.localizacao.coordenadas.latitude)) && Number.isFinite(Number(body.localizacao.coordenadas.longitude));
    if (body.privacyConsent !== true || !validEmail(body.email)) return json(400, { error: 'Indique um e-mail válido e aceite a Política de Privacidade para pedir a pré-análise.' });
    if (!hasLocation && !documents.some((document) => document.tipo === 'planta_localizacao')) return json(400, { error: 'Selecione uma localização no mapa ou anexe a Planta de Localização.' });
    if (documents.length > MAX_DOCUMENTS) return json(400, { error: `Pode anexar até ${MAX_DOCUMENTS} documentos.` });
    const totalBytes = documents.reduce((total, document) => total + Math.floor((String(document?.base64 || '').length * 3) / 4), 0);
    if (totalBytes > MAX_TOTAL_DOCUMENT_BYTES) return json(413, { error: 'Os documentos selecionados excedem o limite técnico de 4 MB para envio online.' });
    const costEstimate = calculateRequestedCostEstimate(body.estimativaCusto);
    const immediate = immediateAnalysisReport(body.localizacao || {}, body.objetivo || '', costEstimate, body.language);
    const reply = localizeImmediateReport(`${renderReport(immediate, body.language)}${renderCostEstimateSection(costEstimate, body.language)}`, body.language);
    try { await queueDetailedAnalysis(body, event.headers?.cookie || event.headers?.Cookie || ''); } catch (error) { console.error('analysis_background_dispatch_error', error.message); }
    return json(202, { reply, resumo: immediate.conclusao.estado, detailedReportQueued: true, emailSent: false });
  } catch (error) {
    console.error('analysis_immediate_error', error);
    return json(500, { error: 'Não foi possível preparar o enquadramento imediato. Tente novamente.' });
  }
};
