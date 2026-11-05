import PDFDocument from 'pdfkit';

const COLORS = { navy: '#173D58', teal: '#24565D', gold: '#B9954F', ink: '#17201F', muted: '#64716E', line: '#D8E0DD', wash: '#F2F5F3', paleGold: '#F5F0E5' };
const PDF_COPY = {
  pt:{ generated:'Gerado em', location:'Localização analisada', summary:'Síntese para decisão', summaryHelp:'Leitura rápida da pré-análise. Consulte as secções seguintes para evidência, fontes e condições.', place:'LOCALIZAÇÃO', guidance:'ORIENTAÇÃO', confirm:'A CONFIRMAR', noParcel:'Parcela não identificada', noMunicipality:'Concelho não confirmado', implantation:'Ponto de implantação indicado', noImplantation:'Sem ponto de implantação indicado', noRule:'Ainda não há regra urbanística confirmada para a localização.', pending:'Limites, servidões e parâmetros aplicáveis à operação.', page:'PÁGINA', reportNumber:'RELATÓRIO N.º', address:'Morada', phone:'Telefone', mapOverlay:'Sobreposição com planta territorial aplicável', documentOverlay:'Sobreposição do PDM indicada na Planta de Localização', cartographic:'Enquadramento cartográfico disponível', officialLegend:'Legenda oficial da planta', statusDefault:'Necessita validação técnica', disclaimer:'Pré-análise assistida por IA. Não constitui parecer municipal nem decisão de licenciamento.'},
  en:{ generated:'Generated on', location:'Analysed location', summary:'Decision summary', summaryHelp:'A quick reading of the pre-assessment. See the following sections for evidence, sources and conditions.', place:'LOCATION', guidance:'GUIDANCE', confirm:'TO CONFIRM', noParcel:'Parcel not identified', noMunicipality:'Municipality not confirmed', implantation:'Building point indicated', noImplantation:'No building point indicated', noRule:'No planning rule has yet been confirmed for this location.', pending:'Boundaries, constraints and parameters applicable to the proposal.', page:'PAGE', reportNumber:'REPORT NO.', address:'Address', phone:'Telephone', mapOverlay:'Overlay with applicable territorial plan', documentOverlay:'PDM overlay shown on the location plan', cartographic:'Available cartographic context', officialLegend:'Official plan legend', statusDefault:'Technical validation required', disclaimer:'AI-assisted pre-assessment. It does not constitute a municipal opinion or licensing decision.'},
  fr:{ generated:'Généré le', location:'Localisation analysée', summary:'Synthèse pour la décision', summaryHelp:'Lecture rapide de la pré-analyse. Consultez les sections suivantes pour les éléments, sources et conditions.', place:'LOCALISATION', guidance:'ORIENTATION', confirm:'À CONFIRMER', noParcel:'Parcelle non identifiée', noMunicipality:'Municipalité non confirmée', implantation:'Point d’implantation indiqué', noImplantation:'Aucun point d’implantation indiqué', noRule:'Aucune règle urbanistique n’est encore confirmée pour cette localisation.', pending:'Limites, servitudes et paramètres applicables au projet.', page:'PAGE', reportNumber:'RAPPORT N°', address:'Adresse', phone:'Téléphone', statusDefault:'Validation technique requise', mapOverlay:'Superposition avec le plan territorial applicable', documentOverlay:'Superposition du PDM indiquée dans le plan de localisation', cartographic:'Contexte cartographique disponible', officialLegend:'Légende officielle du plan', disclaimer:'Pré-analyse assistée par IA. Elle ne constitue ni un avis municipal ni une décision d’autorisation.'},
  de:{ generated:'Erstellt am', location:'Analysierter Standort', summary:'Entscheidungsübersicht', summaryHelp:'Kurzübersicht der Voranalyse. In den folgenden Abschnitten finden Sie Nachweise, Quellen und Bedingungen.', place:'STANDORT', guidance:'EINORDNUNG', confirm:'ZU BESTÄTIGEN', noParcel:'Grundstück nicht identifiziert', noMunicipality:'Gemeinde nicht bestätigt', implantation:'Gebäudepunkt angegeben', noImplantation:'Kein Gebäudepunkt angegeben', noRule:'Für diesen Standort wurde noch keine Planungsregel bestätigt.', pending:'Grenzen, Beschränkungen und für das Vorhaben geltende Parameter.', page:'SEITE', reportNumber:'BERICHT NR.', address:'Adresse', phone:'Telefon', statusDefault:'Technische Prüfung erforderlich', mapOverlay:'Überlagerung mit anwendbarem Raumplan', documentOverlay:'Im Lageplan dargestellte PDM-Überlagerung', cartographic:'Verfügbarer kartografischer Kontext', officialLegend:'Offizielle Planlegende', disclaimer:'KI-gestützte Voranalyse. Sie stellt weder eine kommunale Stellungnahme noch eine Genehmigungsentscheidung dar.'},
  es:{ generated:'Generado el', location:'Ubicación analizada', summary:'Resumen para la decisión', summaryHelp:'Lectura rápida del preanálisis. Consulte las secciones siguientes para evidencias, fuentes y condiciones.', place:'UBICACIÓN', guidance:'ORIENTACIÓN', confirm:'POR CONFIRMAR', noParcel:'Parcela no identificada', noMunicipality:'Municipio no confirmado', implantation:'Punto de implantación indicado', noImplantation:'Sin punto de implantación indicado', noRule:'Aún no se ha confirmado una regla urbanística para esta ubicación.', pending:'Límites, servidumbres y parámetros aplicables a la actuación.', page:'PÁGINA', reportNumber:'INFORME N.º', address:'Dirección', phone:'Teléfono', statusDefault:'Requiere validación técnica', mapOverlay:'Superposición con el plan territorial aplicable', documentOverlay:'Superposición del PDM indicada en el plano de localización', cartographic:'Contexto cartográfico disponible', officialLegend:'Leyenda oficial del plano', disclaimer:'Preanálisis asistido por IA. No constituye informe municipal ni decisión de licencia.'},
};
const PDF_EXTRA_COPY = {
  pt: { brandTagline:'ARQUITETURA + INTELIGÊNCIA', requestAnswer:'RESPOSTA AO PEDIDO', boundaryManual:'limite aproximado desenhado pelo utilizador, sem confirmação cadastral', boundaryCadastre:'limite/seleção cadastral DGT, de caráter preliminar', noBuildingPoint:' Sem ponto de implantação indicado.', buildingPoint:' Ponto vermelho: implantação aproximada indicada pelo utilizador.', mapBase:'Base cartográfica', contextImage:'imagem de enquadramento', redBoundaryManual:'Limite aproximado desenhado pelo utilizador', redBoundaryCadastre:'Limite cadastral/seleção DGT', redBoundaryNote:'assinalado a vermelho. Fonte da planta:', mapPreliminary:'Leitura cartográfica preliminar; confirme pelas peças oficiais em vigor.', interactions:'Interações identificadas na consulta', documentNote:'Esta é a carta utilizada para a leitura gráfica; o polígono/limite já assinalado na peça é a base da pré-análise. Confirme a delimitação e a implantação junto da entidade competente.', cartographicNote:'Informação cartográfica de apoio; os parâmetros urbanísticos concretos constam da secção seguinte e exigem confirmação pelo regulamento e pelas plantas oficiais em vigor.' },
  en: { brandTagline:'ARCHITECTURE + INTELLIGENCE', requestAnswer:'RESPONSE TO THE REQUEST', boundaryManual:'approximate boundary drawn by the user, without cadastral confirmation', boundaryCadastre:'DGT cadastral boundary/selection, preliminary in nature', noBuildingPoint:' No approximate building point was provided.', buildingPoint:' Red point: approximate building location provided by the user.', mapBase:'Cartographic base', contextImage:'context image', redBoundaryManual:'Approximate boundary drawn by the user', redBoundaryCadastre:'DGT cadastral boundary/selection', redBoundaryNote:'shown in red. Plan source:', mapPreliminary:'Preliminary cartographic reading; confirm against the official documents in force.', interactions:'Interactions identified in this query', documentNote:'This is the plan used for the graphic reading; the polygon/boundary already marked on the document is the basis of this pre-assessment. Confirm the boundary and building location with the competent authority.', cartographicNote:'Supporting cartographic information; the specific planning parameters appear in the following section and require confirmation against the regulations and official plans in force.' },
  fr: { brandTagline:'ARCHITECTURE + INTELLIGENCE', requestAnswer:'RÉPONSE À LA DEMANDE', boundaryManual:'limite approximative dessinée par l’utilisateur, sans confirmation cadastrale', boundaryCadastre:'limite/sélection cadastrale DGT, à caractère préliminaire', noBuildingPoint:' Aucun point d’implantation approximatif n’a été indiqué.', buildingPoint:' Point rouge : implantation approximative indiquée par l’utilisateur.', mapBase:'Fond cartographique', contextImage:'image de contexte', redBoundaryManual:'Limite approximative dessinée par l’utilisateur', redBoundaryCadastre:'Limite/sélection cadastrale DGT', redBoundaryNote:'indiquée en rouge. Source du plan :', mapPreliminary:'Lecture cartographique préliminaire ; à confirmer par les pièces officielles en vigueur.', interactions:'Interactions identifiées dans cette consultation', documentNote:'Ce plan sert de base à la lecture graphique ; le polygone/la limite déjà indiqué(e) sur le document est la base de cette pré-analyse. Confirmez la délimitation et l’implantation auprès de l’entité compétente.', cartographicNote:'Information cartographique d’appui ; les paramètres urbanistiques précis figurent dans la section suivante et exigent une confirmation par le règlement et les plans officiels en vigueur.' },
  de: { brandTagline:'ARCHITEKTUR + INTELLIGENZ', requestAnswer:'ANTWORT AUF DIE ANFRAGE', boundaryManual:'vom Nutzer gezeichnete ungefähre Grenze ohne Katasterbestätigung', boundaryCadastre:'DGT-Katastergrenze/-auswahl mit vorläufigem Charakter', noBuildingPoint:' Es wurde kein ungefährer Baupunkt angegeben.', buildingPoint:' Roter Punkt: vom Nutzer angegebener ungefährer Baupunkt.', mapBase:'Kartografische Grundlage', contextImage:'Übersichtskarte', redBoundaryManual:'Vom Nutzer gezeichnete ungefähre Grenze', redBoundaryCadastre:'DGT-Katastergrenze/-auswahl', redBoundaryNote:'rot markiert. Planquelle:', mapPreliminary:'Vorläufige kartografische Auslegung; bitte anhand der gültigen amtlichen Unterlagen bestätigen.', interactions:'In dieser Abfrage ermittelte Bezüge', documentNote:'Dieser Plan ist die Grundlage der grafischen Auslegung; das bereits darin markierte Polygon bzw. die Grenze bildet die Basis dieser Voranalyse. Grenze und Baupunkt sind bei der zuständigen Stelle zu bestätigen.', cartographicNote:'Unterstützende kartografische Information; die konkreten Planungsparameter stehen im folgenden Abschnitt und müssen anhand der geltenden Vorschriften und amtlichen Pläne bestätigt werden.' },
  es: { brandTagline:'ARQUITECTURA + INTELIGENCIA', requestAnswer:'RESPUESTA A LA SOLICITUD', boundaryManual:'límite aproximado dibujado por el usuario, sin confirmación catastral', boundaryCadastre:'límite/selección catastral DGT, de carácter preliminar', noBuildingPoint:' No se indicó un punto aproximado de implantación.', buildingPoint:' Punto rojo: implantación aproximada indicada por el usuario.', mapBase:'Base cartográfica', contextImage:'imagen de contexto', redBoundaryManual:'Límite aproximado dibujado por el usuario', redBoundaryCadastre:'Límite/selección catastral DGT', redBoundaryNote:'marcado en rojo. Fuente del plano:', mapPreliminary:'Lectura cartográfica preliminar; confírmela con los documentos oficiales vigentes.', interactions:'Interacciones identificadas en esta consulta', documentNote:'Este plano es la base de la lectura gráfica; el polígono/límite ya señalado en el documento sirve de base para este preanálisis. Confirme la delimitación y la implantación con la entidad competente.', cartographicNote:'Información cartográfica de apoyo; los parámetros urbanísticos concretos figuran en la sección siguiente y requieren confirmación mediante la normativa y los planos oficiales vigentes.' },
};
function pdfCopy(language = 'pt') { return { language: PDF_COPY[language] ? language : 'pt', ...(PDF_COPY[language] || PDF_COPY.pt), ...(PDF_EXTRA_COPY[language] || PDF_EXTRA_COPY.pt) }; }

// Valores de camadas e regras são publicados pelas entidades portuguesas em
// português. Para um relatório internacional mantemos as referências legais
// (PDM, RAN, artigos e avisos), mas traduzimos a explicação para o cliente.
function translatePdfClientText(value, language = 'pt') {
  if (language === 'pt' || value == null) return value;
  let text = String(value);
  const dictionary = {
    en: [
      ['mosaico de enquadramento', 'context imagery'], ['vista aérea de enquadramento', 'aerial context imagery'], ['Carta de Ordenamento do PDM de Loulé, serviço cartográfico municipal (vista vertical; polígono assinalado a vermelho)', 'Loulé PDM zoning map, municipal cartographic service (vertical view; polygon marked in red)'],
      ['Concelho identificado (CAOP)', 'Municipality identified (CAOP)'], ['Cobertura da pré-análise', 'Pre-assessment coverage'], ['Planos eficazes e zonas específicas por fonte vetorial; PDM geral publicado como carta raster, a confirmar pela planta de ordenamento', 'Effective plans and specific zones from vector sources; the general PDM is published as a raster map and must be confirmed against the zoning plan'],
      ['Regime de uso do solo (DGT) - interseção com a parcela', 'Land-use regime (DGT) - intersection with the parcel'], ['Regime de uso do solo (DGT) — interseção com a parcela', 'Land-use regime (DGT) - intersection with the parcel'], ['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Agricultural land - National Agricultural Reserve area'],
      ['Regra urbanística — Condicionante RAN', 'Planning rule - National Agricultural Reserve (RAN) constraint'], ['Regra urbanística — Regra geral de edificação em solo rural', 'Planning rule - General rural building rule'],
      ['A utilização não agrícola de solos integrados na RAN só pode ser admitida nos termos do Regime Jurídico da RAN. Não decorre da classificação uma autorização automática para construir.', 'Non-agricultural use of land within the National Agricultural Reserve (RAN) may only be permitted under the RAN legal regime. This classification does not automatically authorise construction.'],
      ['A edificação em solo rural é proibida, exceto nas situações expressamente previstas no regulamento; as condições abaixo são cumulativas e mantêm-se sujeitas ao regime da RAN.', 'Building in rural land is prohibited except in the situations expressly provided for in the regulations; the conditions below are cumulative and remain subject to the RAN regime.'],
      ['Uma moradia isolada só pode enquadrar-se como habitação do agricultor, integrada numa exploração agrícola ou agroflorestal economicamente viável, comprovada pela entidade competente. Não é admissível como moradia comum apenas pela área ou pela existência de acesso.', 'A detached dwelling may only qualify as farmer housing, integrated in an economically viable agricultural or agroforestry holding and evidenced by the competent authority. It is not admissible as an ordinary dwelling solely because of area or access.'],
      ['Exige propriedade com pelo menos 10 ha na Unidade Territorial Litoral Sul e Barrocal, ou 5 ha nas restantes Unidades Territoriais. A área cadastral isolada inferior a estes limiares não demonstra o cumprimento da condição.', 'It requires a property of at least 10 ha in the Litoral Sul and Barrocal Territorial Unit, or 5 ha in the remaining Territorial Units. A cadastral area below these thresholds does not demonstrate compliance.'],
      ['Área máxima de construção 500 m²; cércea máxima 7,5 m; máximo 2 pisos, incluindo semienterrados; acesso público e afastamento mínimo de 5 m aos extremos da parcela, sem prejuízo de outras servidões.', 'Maximum construction area of 500 m²; maximum building height of 7.5 m; maximum 2 storeys including semi-basements; public access and a minimum 5 m setback from the parcel boundaries, without prejudice to other easements.'],
      ['Moradia nova - condição de princípio', 'New dwelling - basic condition'], ['Moradia nova - área mínima da propriedade', 'New dwelling - minimum property area'], ['Parâmetros da habitação do agricultor', 'Farmer housing parameters'], ['Regra geral de edificação em solo rural', 'General rural building rule'], ['Condicionante RAN', 'National Agricultural Reserve (RAN) constraint'],
      ['Preexistência - regime de princípio', 'Existing building - basic regime'], ['Preexistência - prova necessária', 'Existing building - evidence required'], ['Preexistência - limites de ampliação habitacional', 'Existing dwelling - extension limits'], ['Preexistência - condições complementares', 'Existing building - additional conditions'],
      ['Em solo rural, não se deve confundir uma nova habitação isolada com obras sobre construção existente. São admitidas obras de conservação, reconstrução, alteração e ampliação de construções existentes para fins habitacionais, nos termos e limites regulamentares.', 'In rural land, a new detached dwelling must not be confused with works to an existing building. Conservation, reconstruction, alteration and extension of existing buildings for residential purposes may be permitted within the regulatory terms and limits.'],
      ['A admissibilidade depende de demonstrar a preexistência e a respetiva situação legal. A edificação deve apresentar estrutura edificada e volumetricamente definida; uma simples referência cadastral, ruína sem comprovação ou vestígio não basta para concluir viabilidade.', 'Admissibility depends on evidencing the existing building and its legal status. The building must have a built structure and a defined volume; a cadastral reference, an unproven ruin or a trace alone is not sufficient to conclude feasibility.'],
      ['O total edificado, incluindo a ampliação, não pode exceder 300 m² de área de construção para fins habitacionais; se a preexistência tiver área superior, essa área constitui o máximo. Não pode aumentar o número de pisos pré-existentes.', 'The total built area, including the extension, may not exceed 300 m² for residential purposes; if the existing building has a greater area, that area is the maximum. The number of existing storeys may not be increased.'],
      ['Exige integração paisagística, salvaguarda da segurança, manutenção da traça arquitetónica quando adequada, acesso público e respeito pelos afastamentos e demais condicionantes aplicáveis.', 'It requires landscape integration, safety safeguards, retention of the architectural character where appropriate, public access, and compliance with setbacks and other applicable constraints.'],
      ['A fonte complementar de morada devolveu Faro, mas a delimitação administrativa oficial (CAOP) identifica Loulé. A pré-análise utiliza Loulé; confirme o limite e a morada nos documentos do prédio antes de qualquer pedido formal.', 'The supplementary address source returned Faro, but the official administrative boundary (CAOP) identifies Loulé. This pre-assessment uses Loulé; confirm the boundary and address in the property documents before any formal application.'],
      ['No PDM geral de Loulé, a carta de ordenamento publicada pelo Município é raster. As regras associadas à CRUS são uma referência regulamentar e não confirmam, por si só, a mancha do PDM; índices só são apresentados quando uma zona específica vetorial os devolver.', 'In Loulé’s general PDM, the municipal zoning map is published as a raster image. Rules associated with CRUS are regulatory guidance and do not by themselves confirm the PDM zone; indices are only shown when a specific vector zone provides them.'],
      ['Regulamento do Plano Diretor Municipal de Loulé', 'Loulé Municipal Master Plan Regulations'], ['Planta de Localização oficial — PDM / Ordenamento; polígono assinalado pelo requerente', 'Official location plan - PDM/zoning; polygon marked by the applicant'], ['Guarde esta pré-análise e contacte-nos para validação técnica, pedido de informação prévia ou projeto.', 'Keep this pre-assessment and contact us for technical validation, a prior information request or a design project.'],
    ],
    fr: [['mosaico de enquadramento', 'imagerie de contexte'], ['Concelho identificado (CAOP)', 'Municipalité identifiée (CAOP)'], ['Regime de uso do solo (DGT)', 'Régime d’utilisation du sol (DGT)'], ['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Espace agricole - zone de Réserve agricole nationale'], ['Condicionante RAN', 'Contrainte de Réserve agricole nationale (RAN)'], ['Regra geral de edificação em solo rural', 'Règle générale de construction en sol rural']],
    de: [['mosaico de enquadramento', 'Übersichtsbilder'], ['Concelho identificado (CAOP)', 'Identifizierte Gemeinde (CAOP)'], ['Regime de uso do solo (DGT)', 'Flächennutzungsregime (DGT)'], ['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Landwirtschaftsfläche - Gebiet der Nationalen Landwirtschaftsreserve'], ['Condicionante RAN', 'Beschränkung Nationale Landwirtschaftsreserve (RAN)'], ['Regra geral de edificação em solo rural', 'Allgemeine Regel für Bauen im Außenbereich']],
    es: [['mosaico de enquadramento', 'imágenes de contexto'], ['Concelho identificado (CAOP)', 'Municipio identificado (CAOP)'], ['Regime de uso do solo (DGT)', 'Régimen de uso del suelo (DGT)'], ['Espaço agrícola - Área de Reserva Agrícola Nacional', 'Espacio agrícola - zona de Reserva Agrícola Nacional'], ['Condicionante RAN', 'Limitación de Reserva Agrícola Nacional (RAN)'], ['Regra geral de edificação em solo rural', 'Regla general de edificación en suelo rústico']],
  };
  (dictionary[language] || []).forEach(([from, to]) => { text = text.replaceAll(from, to); });
  return text;
}
const FOOTER_Y = 762;
// Reserva espaço para o aviso legal imediatamente antes da linha do rodapé.
const CONTENT_END_Y = 724;
// As Functions da Netlify usam normalmente UTC. Esta conversão fixa a hora
// legal de Portugal continental e acompanha automaticamente verão/inverno.
function portugalDateTime(value = new Date()) {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(value);
}
const LOGO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAWgAAAFoCAYAAAB65WHVAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA99JREFUeNrs2NFtglAUgGFp2KNuUrsGT92AMIFuQNgAX5gDN8EN3ECPG7TGe2zp9yU3PN6cE/gf2GwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+CUqKyir7ad90lXL0DXHhHne4/GVNNMcM53M9NBMH/HYJc00xkxnX/vz1VZQ3CHrw49zTLhnmzjT/Z6TmR6yS373BLqANysAEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQZAoAEEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgAgQZAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEQaACBBkCgAQQaAIEGEGgABBoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBoAgQYQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBpAoAEQaAAEGkCgARBogFWrrYAfusSZk+5arJv/rLKCstp+uiZdNQ9d82njsB5+cQAINAACDSDQAAg0gEADINAACDSAQAMg0AACDYBAAyDQAAINgEADCDQAAg0g0AAINAACDSDQAAg0gEADINAACDTAH1BZQVltP12TrlrijDbOC4xD15yt4flqK1iNbZyDNfACcxyBLsAvDgCBBkCgAQQaAIEGEGgABBoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBoAgQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgO+7CTAADjYuvdIeZVQAAAAASUVORK5CYII=';

function decodeHtml(value = '') {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>|<\/li>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/[–—]/g, '-')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
}

function cellsFromRow(row) {
  return [...row.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => decodeHtml(match[2]));
}

function parseReport(reportHtml = '', reportText = '', title = 'Relatório de Pré-Análise Urbanística') {
  const html = String(reportHtml || '');
  const beforeFirstSection = html.split(/<h5[^>]*>/i)[0];
  const paragraphs = [...beforeFirstSection.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => decodeHtml(match[1])).filter(Boolean);
  const sections = [...html.matchAll(/<h5[^>]*>([\s\S]*?)<\/h5>([\s\S]*?)(?=<h5|$)/gi)].map((match) => {
    const body = match[2];
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => cellsFromRow(row[1])).filter((row) => row.length);
    const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((item) => decodeHtml(item[1])).filter(Boolean);
    const bodyParagraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((paragraph) => decodeHtml(paragraph[1])).filter(Boolean);
    return { title: decodeHtml(match[1]), rows, items, paragraphs: bodyParagraphs };
  });
  return {
    title,
    summary: paragraphs.slice(0, 2),
    sections,
    fallback: decodeHtml(reportText),
  };
}

function drawHeader(doc, documentLabel = 'PRÉ-ANÁLISE URBANÍSTICA', reportReference = null, copy = pdfCopy('pt')) {
  doc.image(Buffer.from(LOGO_PNG, 'base64'), 22, 16, { fit: [72, 72] });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text('Arq. Leonel Mendes', 97, 45);
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(copy.brandTagline, 97, 59);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gold).text(documentLabel, 360, 48, { width: 188, align: 'right' });
  if (reportReference) doc.font('Helvetica').fontSize(6.8).fillColor(COLORS.muted).text(`${copy.reportNumber || 'REPORT'} ${reportReference}`, 360, 61, { width: 188, align: 'right' });
  doc.strokeColor(COLORS.line).lineWidth(1).moveTo(47, 82).lineTo(548, 82).stroke();
  doc.y = 104;
}

function ensureSpace(doc, height) {
  if (doc.y + height > CONTENT_END_Y) doc.addPage();
}

function textHeight(doc, text, width, size = 9) {
  return doc.font('Helvetica').fontSize(size).heightOfString(text || '-', { width, lineGap: 1.5 });
}

function drawStatus(doc, text) {
  const label = String(text || 'Necessita validação técnica');
  const isFavourable = /coerente|vi[aá]vel em princ/i.test(label);
  const isCritical = /diverg|n[aã]o vi[aá]vel|n[aã]o demonstrada/i.test(label);
  const fill = isFavourable ? '#E7F1EC' : isCritical ? '#F8E9E5' : COLORS.paleGold;
  const color = isFavourable ? '#1E624A' : isCritical ? '#9A3628' : COLORS.navy;
  const width = Math.min(235, doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(label) + 22);
  const y = doc.y;
  doc.roundedRect(47, y, width, 22, 11).fill(fill);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(color).text(label, 58, y + 7, { width: width - 20, align: 'center' });
  doc.y = y + 31;
}

function firstUsefulRule(report) {
  const rules = report.sections.find((section) => /regime|regras urban/i.test(section.title))?.rows?.slice(1) || [];
  const direct = rules.find((row) => /viabilidade preliminar|pretens[aã]o/i.test(row[0] || ''));
  return direct || rules[0] || null;
}

function drawExecutiveSummary(doc, report, location, copy = PDF_COPY.pt) {
  const reference = location?.parcela?.declaracao || location?.parcela?.referencia || copy.noParcel;
  const municipality = location?.municipio?.nome || copy.noMunicipality;
  const implantation = location?.implantacao?.confirmada ? copy.implantation : copy.noImplantation;
  const rule = firstUsefulRule(report);
  // A primeira regra é a conclusão direta preparada para a pretensão. Assim,
  // a síntese mantém a língua do relatório, em vez de introduzir uma frase
  // fixa em português num documento estrangeiro.
  const directAnswer = rule ? String(rule[1] || copy.noRule) : copy.noRule;
  const verification = report.sections.find((section) => /informa[cç][aã]o n[aã]o confirmada|divergências/i.test(section.title));
  const pending = (verification?.items || []).slice(0, 2);
  ensureSpace(doc, 155);
  const y = doc.y;
  doc.roundedRect(47, y, 501, 142, 8).fill(COLORS.wash);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.navy).text(copy.summary, 61, y + 15);
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(copy.summaryHelp, 61, y + 31, { width: 470 });
  const columns = [61, 224, 387];
  const blocks = [
    { title: copy.requestAnswer, value: directAnswer },
    { title: copy.guidance, value: rule ? String(rule[1] || '-').slice(0, 260) : `${municipality}\n${reference}\n${implantation}` },
    { title: copy.confirm, value: pending.length ? pending.join('\n') : copy.pending },
  ];
  blocks.forEach((block, index) => {
    if (index) doc.strokeColor(COLORS.line).lineWidth(.7).moveTo(columns[index] - 13, y + 56).lineTo(columns[index] - 13, y + 126).stroke();
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COLORS.gold).text(block.title, columns[index], y + 57, { width: 135 });
    doc.font('Helvetica').fontSize(7.4).fillColor(COLORS.ink).text(block.value, columns[index], y + 70, { width: 140, height: 53, ellipsis: true, lineGap: 1.4 });
  });
  doc.y = y + 158;
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 34);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.navy).text(title.replace(/^\d+(?:\.\d+)?\.?\s*/, ''), 47, doc.y);
  doc.moveDown(0.32);
  doc.strokeColor(COLORS.gold).lineWidth(1.5).moveTo(47, doc.y).lineTo(548, doc.y).stroke();
  doc.moveDown(0.55);
}

function drawTable(doc, rows) {
  if (!rows.length) return;
  const header = rows[0];
  const data = rows.slice(1);
  const fourColumns = header.length >= 4;
  const widths = fourColumns ? [112, 191, 82, 116] : [152, 349];
  const x = 47;
  const rowHeight = (cells, isHeader = false) => {
    const values = widths.map((_, index) => String(cells[index] || '-'));
    const heights = values.map((value, index) => textHeight(doc, value, widths[index] - 10, isHeader ? 7.6 : 8.5));
    return Math.max(...heights, isHeader ? 20 : 24) + 10;
  };
  const drawRow = (cells, isHeader = false) => {
    const values = widths.map((_, index) => String(cells[index] || '-'));
    const height = rowHeight(cells, isHeader);
    const rowY = doc.y;
    let cursor = x;
    values.forEach((value, index) => {
      doc.save().rect(cursor, rowY, widths[index], height).fillAndStroke(isHeader ? COLORS.navy : '#FFFFFF', COLORS.line).restore();
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 7.6 : 8.5).fillColor(isHeader ? '#FFFFFF' : COLORS.ink)
        .text(value, cursor + 5, rowY + 5, { width: widths[index] - 10, lineGap: 1.5 });
      cursor += widths[index];
    });
    doc.y = rowY + height;
  };
  ensureSpace(rowHeight(header, true) + 28);
  drawRow(header, true);
  data.forEach((row) => {
    const height = rowHeight(row);
    // Mantém o título das colunas quando uma tabela atravessa páginas, evitando
    // que o leitor perca o contexto de "Estado" e "Fonte".
    if (doc.y + height + 4 > CONTENT_END_Y) {
      doc.addPage();
      drawRow(header, true);
    }
    drawRow(row);
  });
  doc.moveDown(0.8);
}

function drawBullets(doc, items) {
  items.forEach((item) => {
    const itemHeight = textHeight(doc, item, 470, 9);
    ensureSpace(doc, itemHeight + 12);
    doc.circle(53, doc.y + 5, 1.7).fill(COLORS.gold);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(item, 63, doc.y - 2, { width: 470, lineGap: 2 });
    doc.moveDown(0.55);
  });
}

function drawFooter(doc, pageNumber, disclaimer = PDF_COPY.pt.disclaimer, copy = PDF_COPY.pt) {
  doc.save();
  // O aviso integra o conteúdo do relatório, não o rodapé administrativo.
  doc.font('Helvetica-Oblique').fontSize(6.7).fillColor(COLORS.muted)
    .text(disclaimer, 47, FOOTER_Y - 15, { width: 501, align: 'center' });
  doc.strokeColor(COLORS.line).lineWidth(0.8).moveTo(47, FOOTER_Y).lineTo(548, FOOTER_Y).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
    .text(`${copy.address || 'Morada'}: Av. José da Costa Mealha, n.º 133, 8100-500 Loulé - ${copy.phone || 'Telefone'}: 96 0010 870 - E-mail: geral@leonelmendes.com`, 47, FOOTER_Y + 9, { width: 501, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.navy).text(`${copy.page} ${pageNumber}`, 470, FOOTER_Y + 20, { width: 78, align: 'right' });
  doc.restore();
}

function locationPoints(location = {}) {
  const supplied = location?.parcela?.geometria || location?.manualGeometry || location?.geometria;
  // Aceita tanto GeoJSON Geometry como Feature. O cliente pode desenhar o
  // polígono no Leaflet, pelo que a imagem do relatório nunca deve depender
  // de uma forma única de encapsular o mesmo GeoJSON.
  const geometry = supplied?.geometry || supplied;
  const points = [];
  const collect = (value) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') points.push(value);
    else value.forEach(collect);
  };
  collect(geometry?.coordinates);
  const latitude = Number(location?.coordenadas?.latitude);
  const longitude = Number(location?.coordenadas?.longitude);
  if (!points.length && Number.isFinite(latitude) && Number.isFinite(longitude)) points.push([longitude, latitude]);
  return points;
}

function implantationPoint(location = {}) {
  const latitude = Number(location?.implantacao?.latitude);
  const longitude = Number(location?.implantacao?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [longitude, latitude] : null;
}

async function imageBufferFromResponse(response, label = 'imagem') {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/^image\//i.test(contentType)) throw new Error(`${label}: HTTP ${response.status} (${contentType || 'sem imagem'})`);
  const image = Buffer.from(await response.arrayBuffer());
  if (!image.length || image.length > 5 * 1024 * 1024) throw new Error(`${label}: imagem indisponível`);
  return image;
}

// Uma fonte cartográfica externa nunca deve impedir a emissão do relatório.
// PDFKit rejeita buffers HTML/JSON como imagem; nestes casos mantém-se o PDF
// sem essa ilustração e fica registado o aviso nos logs técnicos.
function safeImage(doc, image, x, y, options, label = 'imagem') {
  try {
    doc.image(image, x, y, options);
    return true;
  } catch (error) {
    console.warn('pdf_image_skipped', JSON.stringify({ label, error: error.message }));
    return false;
  }
}

async function aerialContext(location) {
  const points = locationPoints(location);
  if (!points.length) return null;
  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  const minLon = Math.min(...longitudes); const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes); const maxLat = Math.max(...latitudes);
  const span = Math.max(maxLon - minLon, maxLat - minLat, 0.00045);
  const padding = span * 0.55;
  const bbox = [minLon - padding, minLat - padding, maxLon + padding, maxLat + padding];
  // Em Loulé, a ortofoto municipal/DGT é ortorretificada e lida verticalmente.
  // É preferível a imagens globais compostas que podem aparentar perspetiva.
  if (location?.municipio?.nome === 'Loulé') {
    const localOrtho = new URL('https://geoloule.cm-loule.pt/arcgisnprot/rest/services/Siteadmin/Base_OrtoSAT2023/ImageServer/exportImage');
    localOrtho.search = new URLSearchParams({ bbox: bbox.join(','), bboxSR: '4326', imageSR: '4326', size: '1200,760', format: 'png32', f: 'image' }).toString();
    try {
      const response = await fetch(localOrtho, { signal: AbortSignal.timeout(6_500) });
      const image = await imageBufferFromResponse(response, 'ortofoto Loulé');
      return { image, bbox, points, source: 'OrtoSAT 2023 - DGT, serviço cartográfico da Câmara Municipal de Loulé (ortofoto vertical)' };
    } catch (error) { console.warn('loule_ortho_context_unavailable', error.message); }
  }
  const url = new URL('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export');
  url.search = new URLSearchParams({ bbox: bbox.join(','), bboxSR: '4326', imageSR: '4326', size: '1200,760', format: 'png32', transparent: 'false', f: 'image' }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
    const image = await imageBufferFromResponse(response, 'vista aérea');
    return { image, bbox, points, source: 'Esri World Imagery (vista aérea de enquadramento)' };
  } catch (error) {
    console.warn('aerial_context_unavailable', error.message);
  }

  // Alguns servidores bloqueiam a exportação estática. Neste caso, monta-se uma
  // vista aérea a partir dos mosaicos oficiais, mantendo a imagem no PDF.
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const zoom = span > 0.025 ? 14 : span > 0.006 ? 16 : 18;
  const n = 2 ** zoom;
  const tileX = (lon) => Math.floor(((lon + 180) / 360) * n);
  const tileY = (lat) => Math.floor((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2 * n);
  const tileLon = (x) => (x / n) * 360 - 180;
  const tileLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const centerX = tileX(centerLon); const centerY = tileY(centerLat);
  const requests = [];
  for (let y = centerY - 1; y <= centerY + 1; y += 1) {
    for (let x = centerX - 1; x <= centerX + 1; x += 1) {
      const safeX = ((x % n) + n) % n;
      const safeY = Math.max(0, Math.min(n - 1, y));
      requests.push(fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${safeY}/${safeX}`, { signal: AbortSignal.timeout(5000) })
        .then(async (response) => {
          return { x, y, image: await imageBufferFromResponse(response, 'mosaico aéreo') };
        }));
    }
  }
  const attempts = await Promise.allSettled(requests);
  const tiles = attempts.filter((attempt) => attempt.status === 'fulfilled' && attempt.value.image.length).map((attempt) => attempt.value);
  if (tiles.length < 5) {
    console.warn('aerial_tiles_unavailable', JSON.stringify({ received: tiles.length }));
    return null;
  }
  return {
    tiles,
    tileOrigin: { x: centerX - 1, y: centerY - 1 },
    bbox: [tileLon(centerX - 1), tileLat(centerY + 2), tileLon(centerX + 2), tileLat(centerY - 1)],
    points,
    source: 'Esri World Imagery (mosaico de enquadramento)',
  };
}

function planBounds(location) {
  const points = locationPoints(location);
  if (!points.length) return null;
  const lons = points.map(([lon]) => lon); const lats = points.map(([, lat]) => lat);
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const latSpanFromParcel = Math.max(...lats) - Math.min(...lats);
  const lonSpanFromParcel = Math.max(...lons) - Math.min(...lons);
  // A carta raster municipal é publicada para leitura a escalas entre 1:999
  // e 1:245 436. Uma janela demasiado aproximada ficava fora dessa escala e
  // devolvia uma imagem aparentemente vazia. Mantemos um enquadramento de
  // cerca de 650 m, suficiente para identificar a mancha PDM e o polígono.
  const latSpan = Math.max(0.006, latSpanFromParcel * 3.4, lonSpanFromParcel * 1.7);
  // Respeita a proporção do quadro do PDF, evitando deformar a carta oficial.
  const mapAspect = 501 / 278;
  const lonSpan = Math.max(lonSpanFromParcel * 3.4, (latSpan * mapAspect) / Math.max(0.25, Math.cos((centerLat * Math.PI) / 180)));
  return {
    minLon: centerLon - lonSpan / 2,
    minLat: centerLat - latSpan / 2,
    maxLon: centerLon + lonSpan / 2,
    maxLat: centerLat + latSpan / 2,
  };
}

async function fetchOfficialMapImage(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !/^image\//i.test(contentType)) throw new Error(`HTTP ${response.status} (${contentType || 'sem imagem'})`);
      const image = Buffer.from(await response.arrayBuffer());
      if (!image.length || image.length > 5 * 1024 * 1024) throw new Error('imagem indisponível');
      return image;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('imagem indisponível');
}

async function officialPlanContext(location) {
  // Apenas é produzida sobreposição quando existe um serviço de imagem oficial
  // identificado e acessível. Não é criada uma planta artificial a partir de
  // nomes de classes ou de cores inferidas.
  if (!['Faro', 'Loulé'].includes(location?.municipio?.nome)) return null;
  const bounds = planBounds(location);
  if (!bounds) return null;
  if (location?.municipio?.nome === 'Loulé') {
    const url = new URL('https://geoloule.cm-loule.pt/arcgisnprot/rest/services/Siteadmin/Base_PDM/MapServer/export');
    url.search = new URLSearchParams({ bbox: `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`, bboxSR: '4326', imageSR: '4326', size: '1500,832', dpi: '150', format: 'png32', transparent: 'false', layers: 'show:0', f: 'image' }).toString();
    try {
      let response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      // Alguns gateways ArcGIS devolvem JSON com uma ligação temporária em vez
      // dos bytes PNG. Seguimos essa ligação para que uma resposta 200 JSON
      // não faça desaparecer silenciosamente a sobreposição PDM do relatório.
      const contentType = response.headers.get('content-type') || '';
      if (/application\/json|text\/plain/i.test(contentType)) {
        const exported = await response.json();
        const href = exported?.href || exported?.imageUrl || exported?.url;
        if (!href) throw new Error('planta PDM Loulé: exportação sem imagem');
        response = await fetch(href, { signal: AbortSignal.timeout(8_000) });
      }
      const image = await imageBufferFromResponse(response, 'planta PDM Loulé');
      return { image, bbox: [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat], source: 'Carta de Ordenamento do PDM de Loulé, serviço cartográfico municipal (vista vertical; polígono assinalado a vermelho)' };
    } catch (error) { console.warn('loule_official_plan_context_unavailable', error.message); return null; }
  }
  const query = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'pdm2024:1_1_P_Ordenamento_MOT', STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'false', CRS: 'EPSG:4326', BBOX: `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`, WIDTH: '900', HEIGHT: '520' });
  const directUrl = `https://mapas.cm-faro.pt/geoserver/wms?${query}`;
  const proxyUrl = `https://mapas.cm-faro.pt/geoportal/map/proxy?url=${encodeURIComponent(`http://mapas.cm-faro.pt/geoserver/wms?${query}`)}`;
  const legendQuery = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetLegendGraphic', LAYER: 'pdm2024:1_1_P_Ordenamento_MOT', FORMAT: 'image/png', LEGEND_OPTIONS: 'fontName:Arial;fontSize:9;dpi:120' });
  const directLegendUrl = `https://mapas.cm-faro.pt/geoserver/wms?${legendQuery}`;
  const proxyLegendUrl = `https://mapas.cm-faro.pt/geoportal/map/proxy?url=${encodeURIComponent(`http://mapas.cm-faro.pt/geoserver/wms?${legendQuery}`)}`;
  try {
    const [image, legend] = await Promise.all([
      fetchOfficialMapImage([directUrl, proxyUrl]),
      fetchOfficialMapImage([directLegendUrl, proxyLegendUrl]).catch(() => null),
    ]);
    return { image, legend, bbox: [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat], source: 'Planta 1.1 — Modelo de Organização do Território, PDM de Faro (WMS municipal)' };
  } catch (error) {
    console.warn('official_plan_context_unavailable', error.message);
    return null;
  }
}

function drawLocationMap(doc, aerial, location, { compact = false, copy = PDF_COPY.pt } = {}) {
  if (!aerial) return;
  ensureSpace(doc, compact ? 238 : 360);
  drawSectionTitle(doc, copy.location);
  const x = 47; const y = doc.y; const width = 501; const height = compact ? 180 : 300;
  if (aerial.image) {
    if (!safeImage(doc, aerial.image, x, y, { width, height }, 'vista aérea')) return;
  } else {
    const tileWidth = width / 3; const tileHeight = height / 3;
    aerial.tiles.forEach((tile) => {
      const tileX = x + (tile.x - aerial.tileOrigin.x) * tileWidth;
      const tileY = y + (tile.y - aerial.tileOrigin.y) * tileHeight;
      safeImage(doc, tile.image, tileX, tileY, { width: tileWidth + 0.4, height: tileHeight + 0.4 }, 'mosaico aéreo');
    });
  }
  const [minLon, minLat, maxLon, maxLat] = aerial.bbox;
  const toPoint = ([lon, lat]) => [x + ((lon - minLon) / (maxLon - minLon)) * width, y + height - ((lat - minLat) / (maxLat - minLat)) * height];
  if (aerial.points.length > 1) {
    const [startX, startY] = toPoint(aerial.points[0]);
    const boundaryColor = location?.parcela?.manual ? '#A13B2B' : COLORS.gold;
    doc.save().opacity(0.22).fillColor(boundaryColor).moveTo(startX, startY);
    aerial.points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().fill().restore();
    // Um halo claro garante leitura sobre ortofoto escura; o traço vermelho
    // identifica inequivocamente o limite aproximado desenhado pelo cliente.
    doc.save().lineWidth(5).strokeColor('#FFFFFF').opacity(.9).moveTo(startX, startY);
    aerial.points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().stroke().restore();
    doc.save().lineWidth(2.8).strokeColor(boundaryColor).moveTo(startX, startY);
    aerial.points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().stroke().restore();
  } else if (aerial.points.length === 1) {
    const [px, py] = toPoint(aerial.points[0]);
    doc.circle(px, py, 6).fillAndStroke(COLORS.gold, '#FFFFFF');
  }
  const implementation = implantationPoint(location);
  if (implementation) {
    const [px, py] = toPoint(implementation);
    doc.save().circle(px, py, 7).fillAndStroke('#A13B2B', '#FFFFFF').circle(px, py, 2.2).fill('#FFFFFF').restore();
    doc.font('Helvetica-Bold').fontSize(6.6).fillColor('#FFFFFF').text(copy.language === 'en' ? 'BUILDING' : copy.language === 'fr' ? 'IMPLANTATION' : copy.language === 'de' ? 'BAUPUNKT' : copy.language === 'es' ? 'IMPLANTACIÓN' : 'IMPLANTAÇÃO', Math.max(x + 4, px - 26), py - 22, { width: 54, align: 'center' });
  }
  // Elementos mínimos de orientação para que a imagem aérea seja interpretável.
  doc.save().roundedRect(x + width - 31, y + 9, 22, 31, 4).fillOpacity(.85).fill('#FFFFFF').restore();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.navy).text('N', x + width - 25, y + 13, { width: 10, align: 'center' });
  doc.save().moveTo(x + width - 20, y + 27).lineTo(x + width - 20, y + 37).lineWidth(1.4).strokeColor(COLORS.navy).stroke(); doc.restore();
  const midLat = (minLat + maxLat) / 2;
  const widthMetres = Math.max(1, (maxLon - minLon) * 111320 * Math.cos((midLat * Math.PI) / 180));
  const scaleMetres = widthMetres > 180 ? 100 : widthMetres > 80 ? 50 : 20;
  const scaleWidth = Math.min(100, Math.max(28, (scaleMetres / widthMetres) * width));
  doc.save().lineWidth(2).strokeColor('#FFFFFF').moveTo(x + 12, y + height - 15).lineTo(x + 12 + scaleWidth, y + height - 15).stroke(); doc.restore();
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#FFFFFF').text(`~${scaleMetres} m`, x + 12, y + height - 29, { width: scaleWidth, align: 'center' });
  doc.rect(x, y, width, height).lineWidth(0.8).strokeColor(COLORS.line).stroke();
  doc.y = y + height + 7;
  const reference = location?.parcela?.declaracao || location?.parcela?.referencia || 'localização selecionada';
  const implantationNote = implementation ? copy.buildingPoint : copy.noBuildingPoint;
  const boundaryNote = location?.parcela?.manual
    ? copy.boundaryManual
    : copy.boundaryCadastre;
  doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.muted).text(`${copy.location}: ${reference}. ${copy.mapBase}: ${aerial.source || copy.contextImage}; ${boundaryNote}.${implantationNote}`, x, doc.y, { width });
  doc.moveDown(1.15);
}

function relevantCartographicLegend(location) {
  const seen = new Set();
  return (Array.isArray(location?.pdm) ? location.pdm : [])
    .map((item) => ({ label: String(item?.camada || '').trim(), value: String(item?.valor || '').trim() }))
    .filter((item) => item.label && item.value && /plano municipal|classifica[cç][aã]o|regime de uso|condicionante|classifica[cç][aã]o e uso dominante/i.test(item.label))
    .filter((item) => !(/regime de uso do solo \(dgt\)/i.test(item.label) && /^\d+$/.test(item.value)))
    .filter((item) => {
      const key = `${item.label}|${item.value}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 6);
}

function drawOfficialPlanOverlay(doc, plan, location, copy = PDF_COPY.pt) {
  if (!plan) return;
  ensureSpace(doc, 320);
  drawSectionTitle(doc, copy.mapOverlay);
  const x = 47; const y = doc.y; const width = 501; const height = 278;
  if (!safeImage(doc, plan.image, x, y, { width, height }, 'planta territorial')) return;
  const [minLon, minLat, maxLon, maxLat] = plan.bbox;
  const toPoint = ([lon, lat]) => [x + ((lon - minLon) / (maxLon - minLon)) * width, y + height - ((lat - minLat) / (maxLat - minLat)) * height];
  const points = locationPoints(location);
  if (points.length > 1) {
    const [startX, startY] = toPoint(points[0]);
    doc.save().opacity(0.16).fillColor('#A13B2B').moveTo(startX, startY);
    points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().fill().restore();
    doc.save().lineWidth(5).strokeColor('#FFFFFF').opacity(.9).moveTo(startX, startY);
    points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().stroke().restore();
    doc.save().lineWidth(2.8).strokeColor('#A13B2B').moveTo(startX, startY);
    points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().stroke().restore();
  }
  const implementation = implantationPoint(location);
  if (implementation) { const [px, py] = toPoint(implementation); doc.save().circle(px, py, 6).fillAndStroke('#A13B2B', '#FFFFFF').restore(); }
  doc.rect(x, y, width, height).lineWidth(.8).strokeColor(COLORS.line).stroke();
  doc.y = y + height + 7;
  const boundary = location?.parcela?.manual ? copy.redBoundaryManual : copy.redBoundaryCadastre;
  doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.muted).text(`${boundary} ${copy.redBoundaryNote} ${translatePdfClientText(plan.source, copy.language)}. ${copy.mapPreliminary}`, x, doc.y, { width });
  if (plan.legend) {
    doc.moveDown(.45);
    ensureSpace(doc, 150);
    const legendY = doc.y;
    doc.font('Helvetica-Bold').fontSize(7.4).fillColor(COLORS.navy).text(copy.officialLegend, x, legendY, { width: 190 });
    safeImage(doc, plan.legend, x, legendY + 12, { fit: [230, 130] }, 'legenda territorial');
    doc.y = legendY + 150;
  }
  const legend = relevantCartographicLegend(location);
  if (legend.length) {
    doc.moveDown(.45);
    doc.font('Helvetica-Bold').fontSize(7.4).fillColor(COLORS.navy).text(copy.interactions, x, doc.y, { width });
    legend.forEach((item) => {
      ensureSpace(doc, 15);
      doc.circle(x + 4, doc.y + 4, 1.5).fill(COLORS.gold);
      doc.font('Helvetica').fontSize(7.3).fillColor(COLORS.ink).text(`${translatePdfClientText(item.label, copy.language)}: ${translatePdfClientText(item.value, copy.language)}`, x + 12, doc.y - 2, { width: width - 12, lineGap: 1.2 });
      doc.moveDown(.38);
    });
  } else doc.moveDown(.7);
}

function drawDocumentPlanOverlay(doc, documentPlan, copy = PDF_COPY.pt) {
  if (!documentPlan?.image) return false;
  ensureSpace(doc, 390);
  drawSectionTitle(doc, copy.documentOverlay);
  const x = 47; const y = doc.y; const maxWidth = 501; const maxHeight = 350;
  let dimensions;
  try {
    const source = doc.openImage(documentPlan.image);
    const ratio = source.width / source.height;
    const width = Math.min(maxWidth, maxHeight * ratio);
    dimensions = { width, height: width / ratio, x: x + (maxWidth - width) / 2 };
  } catch (error) {
    console.warn('document_plan_dimensions_unavailable', error.message);
    return false;
  }
  if (!safeImage(doc, documentPlan.image, dimensions.x, y, { width: dimensions.width, height: dimensions.height }, 'planta de ordenamento anexa')) return false;
  doc.rect(dimensions.x, y, dimensions.width, dimensions.height).lineWidth(.8).strokeColor(COLORS.line).stroke();
  doc.y = y + dimensions.height + 7;
  doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.muted).text(`${translatePdfClientText(documentPlan.source || copy.documentOverlay, copy.language)}. ${copy.documentNote}`, x, doc.y, { width: maxWidth, lineGap: 1.4 });
  doc.moveDown(1);
  return true;
}

function drawCartographicEvidence(doc, location, copy = PDF_COPY.pt) {
  const layers = Array.isArray(location?.pdm) ? location.pdm : [];
  const useful = layers
    .map((item) => ({ label: String(item?.camada || '').trim(), value: String(item?.valor || '').trim() }))
    .filter((item) => item.label && item.value)
    // Códigos numéricos isolados não são compreensíveis para o cliente sem legenda oficial.
    .filter((item) => !(/regime de uso do solo \(dgt\)/i.test(item.label) && /^\d+$/.test(item.value)))
    .slice(0, 5);
  if (!useful.length) return;
  drawSectionTitle(doc, copy.cartographic);
  useful.forEach((item) => {
    const line = `${translatePdfClientText(item.label, copy.language)}: ${translatePdfClientText(item.value, copy.language)}`;
    ensureSpace(doc, textHeight(doc, line, 470, 8.5) + 11);
    doc.circle(53, doc.y + 5, 1.7).fill(COLORS.gold);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(line, 63, doc.y - 2, { width: 470, lineGap: 1.7 });
    doc.moveDown(0.5);
  });
  doc.font('Helvetica-Oblique').fontSize(7.2).fillColor(COLORS.muted).text(copy.cartographicNote, 47, doc.y + 1, { width: 501, lineGap: 1.5 });
  doc.moveDown(1.1);
}

export async function createProfessionalPdf({
  reportHtml,
  reportText,
  location = null,
  documentTitle = 'Relatório de Pré-Análise Urbanística',
  documentLabel = 'PRÉ-ANÁLISE URBANÍSTICA',
  reportReference = null,
  disclaimer = 'Pré-análise assistida por IA. Não constitui parecer municipal nem decisão de licenciamento.',
  documentPlan = null,
  language = 'pt',
}) {
  const copy = pdfCopy(language);
  if (!disclaimer || disclaimer === PDF_COPY.pt.disclaimer) disclaimer = copy.disclaimer;
  const [aerial, plan] = await Promise.all([aerialContext(location), officialPlanContext(location)]);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 47, bufferPages: true, info: { Title: `${documentTitle} - Leonel Mendes` } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('pageAdded', () => drawHeader(doc, documentLabel, reportReference, copy));

    const report = parseReport(translatePdfClientText(reportHtml, language), translatePdfClientText(reportText, language), documentTitle);
    drawHeader(doc, documentLabel, reportReference, copy);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.navy).text(report.title, 47, doc.y);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`${copy.generated} ${portugalDateTime()}`, 47, doc.y + 5);
    doc.moveDown(1.4);
    const status = report.summary.find((line) => /^(Resultado preliminar|Pre-assessment conclusion|Conclusion de la pré-analyse|Ergebnis der Voranalyse|Conclusión del preanálisis)\s*:/i.test(line))?.replace(/^[^:]+:\s*/i, '') || copy.statusDefault;
    drawStatus(doc, status);
    report.summary.filter((line) => !/^(Resultado preliminar|Pre-assessment conclusion|Conclusion de la pré-analyse|Ergebnis der Voranalyse|Conclusión del preanálisis)\s*:/i.test(line)).forEach((line) => {
      ensureSpace(doc, textHeight(doc, line, 501, 10) + 12);
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(line, 47, doc.y, { width: 501, lineGap: 2.5 });
      doc.moveDown(0.9);
    });

    // A fotografia aérea é a referência visual mais importante para o cliente:
    // entra logo na capa, em formato compacto, antes das secções técnicas.
    drawLocationMap(doc, aerial, location, { compact: true, copy });
    drawExecutiveSummary(doc, report, location, copy);
    // A planta entregue pelo cliente tem prioridade: contém a peça emitida
    // pela entidade e o polígono que serviu de base à análise, qualquer que
    // seja o município. Se não existir, usa-se o serviço cartográfico oficial
    // configurado para o município (quando disponível).
    if (!drawDocumentPlanOverlay(doc, documentPlan, copy)) drawOfficialPlanOverlay(doc, plan, location, copy);
    drawCartographicEvidence(doc, location, copy);

    if (!report.sections.length && report.fallback) {
      drawSectionTitle(doc, language === 'en' ? 'Pre-assessment content' : language === 'fr' ? 'Contenu de la pré-analyse' : language === 'de' ? 'Inhalt der Voranalyse' : language === 'es' ? 'Contenido del preanálisis' : 'Conteúdo da pré-análise');
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(report.fallback, 47, doc.y, { width: 501, lineGap: 2 });
    }
    report.sections.forEach((section) => {
      drawSectionTitle(doc, section.title);
      if (section.rows.length) drawTable(doc, section.rows);
      if (section.items.length) drawBullets(doc, section.items);
      section.paragraphs.forEach((paragraph) => {
        if (/^Este relatório é uma pré-análise/i.test(paragraph)) return;
        ensureSpace(doc, textHeight(doc, paragraph, 501, 9) + 10);
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(paragraph, 47, doc.y, { width: 501, lineGap: 2 });
        doc.moveDown(0.65);
      });
    });

    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(index);
      drawFooter(doc, index + 1, disclaimer, copy);
    }
    doc.end();
  });
}
