// Biblioteca regulamentar curada. Cada regra tem fonte, versão e artigo para
// que o relatório nunca apresente um parâmetro sem origem verificável.
const faroSource = {
  documento: 'Revisão do Plano Diretor Municipal de Faro — Aviso n.º 20948/2024/2',
  versao: '20-09-2024',
  url: 'https://mapas.cm-faro.pt/docs/pdm_2024/Regulamento.pdf',
};
const louleSource = {
  documento: 'Regulamento do Plano Diretor Municipal de Loulé — Aviso n.º 7430/2017',
  versao: '03-07-2017',
  url: 'https://geoloule.cm-loule.pt/docs/regulamentos/pmots/PDM_Regulamento.pdf',
};

export const MUNICIPAL_DATA = {
  loule: {
    nome: 'Loulé',
    estado: 'Base regulamentar ativa para classes CRUS compatíveis; a delimitação PDM deve ser confirmada na planta de ordenamento em vigor.',
    fontes: [louleSource],
    regras: {
      'espaco urbano - aglomerado urbano - tipo a': [
        { elemento: 'Usos e infraestruturação', resultado: 'São admitidos loteamento urbano e construção para habitação, comércio, serviços, equipamentos, restauração e bebidas e empreendimentos turísticos. As infraestruturas de água e drenagem de esgotos devem ligar às redes públicas.', artigo: 'Artigo 14.º, corpo do artigo', pagina: '13' },
        { elemento: 'Densidade populacional máxima', resultado: '200 habitantes por hectare.', artigo: 'Artigo 14.º, n.º 1', pagina: '13' },
        { elemento: 'Coeficiente de ocupação do solo (COS) máximo', resultado: '0,70.', artigo: 'Artigo 14.º, n.º 1', pagina: '13' },
        { elemento: 'Número máximo de pisos', resultado: '6 pisos acima do nível da cota de soleira.', artigo: 'Artigo 14.º, n.º 1', pagina: '13' },
        { elemento: 'Forma de execução', resultado: 'Fora da renovação e preenchimento de espaços intersticiais, as intervenções são em geral definidas por loteamento, empreendimento turístico ou plano territorial municipal.', artigo: 'Artigo 14.º, corpo do artigo', pagina: '13' },
      ],
      'espaco urbano - aglomerado urbano - tipo b': [
        { elemento: 'Usos e infraestruturação', resultado: 'São admitidos loteamento urbano e construção para habitação, comércio, serviços, equipamentos, restauração e bebidas e empreendimentos turísticos. As infraestruturas de água e drenagem de esgotos devem ligar às redes públicas.', artigo: 'Artigo 14.º, corpo do artigo', pagina: '13' },
        { elemento: 'Densidade populacional máxima', resultado: '125 habitantes por hectare.', artigo: 'Artigo 14.º, n.º 2', pagina: '13' },
        { elemento: 'Coeficiente de ocupação do solo (COS) máximo', resultado: '0,50.', artigo: 'Artigo 14.º, n.º 2', pagina: '13' },
        { elemento: 'Número máximo de pisos', resultado: '3 pisos acima do nível da cota de soleira.', artigo: 'Artigo 14.º, n.º 2', pagina: '13' },
      ],
      'espaco urbano - aglomerado urbano - tipo c': [
        { elemento: 'Usos e infraestruturação', resultado: 'São admitidos loteamento urbano e construção para habitação, comércio, serviços, equipamentos, restauração e bebidas e empreendimentos turísticos. As infraestruturas de água e drenagem de esgotos devem ligar às redes públicas.', artigo: 'Artigo 14.º, corpo do artigo', pagina: '13' },
        { elemento: 'Densidade populacional máxima', resultado: '75 habitantes por hectare.', artigo: 'Artigo 14.º, n.º 3', pagina: '13' },
        { elemento: 'Coeficiente de ocupação do solo (COS) máximo', resultado: '0,30.', artigo: 'Artigo 14.º, n.º 3', pagina: '13' },
        { elemento: 'Número máximo de pisos', resultado: '3 pisos acima do nível da cota de soleira.', artigo: 'Artigo 14.º, n.º 3', pagina: '13' },
      ],
      'area de reserva agricola nacional': [
        { elemento: 'Condicionante RAN', resultado: 'A utilização não agrícola de solos integrados na RAN só pode ser admitida nos termos do Regime Jurídico da RAN. Não decorre da classificação uma autorização automática para construir.', artigo: 'Artigos 38.º, n.os 1 e 2, e 67.º', pagina: '17 e 22' },
        { elemento: 'Regra geral de edificação em solo rural', resultado: 'A edificação em solo rural é proibida, exceto nas situações expressamente previstas no regulamento; as condições abaixo são cumulativas e mantêm-se sujeitas ao regime da RAN.', artigo: 'Artigo 88.º, n.os 1 e 2', pagina: '25' },
        { elemento: 'Moradia nova - condição de princípio', resultado: 'Uma moradia isolada só pode enquadrar-se como habitação do agricultor, integrada numa exploração agrícola ou agroflorestal economicamente viável, comprovada pela entidade competente. Não é admissível como moradia comum apenas pela área ou pela existência de acesso.', artigo: 'Artigo 88.º-A, alíneas a), b) e e)', pagina: '25-26' },
        { elemento: 'Moradia nova - área mínima da propriedade', resultado: 'Exige propriedade com pelo menos 10 ha na Unidade Territorial Litoral Sul e Barrocal, ou 5 ha nas restantes Unidades Territoriais. A área cadastral isolada inferior a estes limiares não demonstra o cumprimento da condição.', artigo: 'Artigo 88.º-A, alínea a)', pagina: '25-26' },
        { elemento: 'Parâmetros da habitação do agricultor', resultado: 'Área máxima de construção 500 m²; cércea máxima 7,5 m; máximo 2 pisos, incluindo semienterrados; acesso público e afastamento mínimo de 5 m aos extremos da parcela, sem prejuízo de outras servidões.', artigo: 'Artigo 88.º-A, alíneas f), g) e h)', pagina: '25-26' },
      ],
      'area de agricultura condicionada i': [
        { elemento: 'Uso e salvaguarda hidrogeológica', resultado: 'Área destinada sobretudo a culturas arvenses de sequeiro, devendo os aquíferos subterrâneos ser salvaguardados. Aterros, escavações ou despedregas que possam comprometer o regime hídrico subterrâneo não são permitidos; os restantes casos exigem análise específica.', artigo: 'Artigo 40.º, n.os 1 e 2', pagina: '17' },
        { elemento: 'Regra geral de edificação em solo rural', resultado: 'A edificação só é admitida nas exceções previstas para solo rural. Uma moradia nova não resulta automaticamente desta categoria agrícola.', artigo: 'Artigos 40.º, n.º 3, e 88.º', pagina: '17 e 25' },
        { elemento: 'Moradia nova - condições cumulativas', resultado: 'A habitação isolada só se enquadra como habitação do agricultor, integrada numa exploração agrícola ou agroflorestal economicamente viável e comprovada, sem alternativa aceitável em solo urbano e sem outra habitação na mesma exploração.', artigo: 'Artigo 88.º-A, alíneas b) e e)', pagina: '25-26' },
        { elemento: 'Moradia nova - área mínima e parâmetros', resultado: 'Exige propriedade com pelo menos 10 ha no Litoral Sul e Barrocal ou 5 ha nas restantes Unidades Territoriais; área máxima de construção 500 m², cércea 7,5 m e máximo 2 pisos, incluindo semienterrados.', artigo: 'Artigo 88.º-A, alíneas a) e f)', pagina: '25-26' },
        { elemento: 'Acesso e afastamentos', resultado: 'Exige acesso público e afastamento mínimo de 5 m aos extremos da parcela, sem prejuízo de afastamentos a vias e outras servidões aplicáveis.', artigo: 'Artigo 88.º-A, alíneas g) e h)', pagina: '25-26' },
      ],
      'area de agricultura condicionada ii': [
        { elemento: 'Condicionantes cumulativas', resultado: 'Área RAN coincidente com zonas ameaçadas pelas cheias; uso, ocupação e transformação do solo ficam sujeitos aos regimes legais específicos aplicáveis.', artigo: 'Artigo 41.º, n.º 1', pagina: '17' },
        { elemento: 'Moradia nova', resultado: 'Não é admissível concluir viabilidade para nova moradia apenas pela categoria. Aplicam-se cumulativamente o Regime Jurídico da RAN, as restrições de cheia e as exceções de edificação em solo rural.', artigo: 'Artigos 38.º, 41.º e 88.º', pagina: '17 e 25' },
      ],
      'area de uso predominantemente agricola': [
        { elemento: 'Regra de edificabilidade', resultado: 'A edificação, quando permitida, obedece ao regime de edificação em solo rural; esta categoria não confere por si só direito a nova moradia.', artigo: 'Artigo 39.º, n.º 3, e Artigo 88.º', pagina: '17 e 25' },
        { elemento: 'Moradia nova - condições cumulativas', resultado: 'Para habitação do agricultor, exige-se propriedade com área mínima aplicável, exploração agrícola ou agroflorestal economicamente viável comprovada, inexistência de alternativa aceitável em solo urbano e inexistência de outra habitação na mesma exploração.', artigo: 'Artigo 88.º-A, alíneas a), b) e e)', pagina: '25-26' },
      ],
    },
  },
  faro: {
    nome: 'Faro',
    estado: 'Base regulamentar ativa; aguarda ligação à camada vetorial oficial de ordenamento.',
    fontes: [faroSource],
    // A chave é o valor que deverá ser devolvido pela camada oficial de ordenamento.
    regras: {
      'espacos habitacionais — area urbana consolidada': [
        { elemento: 'Uso dominante', resultado: 'Função residencial, admitindo usos complementares e compatíveis e equipamentos coletivos necessários.', artigo: 'Artigos 92.º e 93.º', pagina: '55-56' },
        { elemento: 'Índice de utilização — novos PU/PP, unidades de execução ou loteamentos', resultado: 'Faro: 1,5; Montenegro: 1,0.', artigo: 'Artigo 94.º, n.º 1, alínea a), i1)', pagina: '55' },
        { elemento: 'Nota de aplicação', resultado: 'Os parâmetros dependem da subcategoria, localidade, operação urbanística e eventual plano de hierarquia superior.', artigo: 'Artigo 94.º', pagina: '55-57' },
      ],
      'espacos habitacionais — area de consolidacao urbana': [
        { elemento: 'Uso dominante', resultado: 'Função residencial, admitindo usos complementares e compatíveis e equipamentos coletivos necessários.', artigo: 'Artigos 92.º e 93.º', pagina: '55-56' },
        { elemento: 'Índice de utilização — novos PU/PP, unidades de execução ou loteamentos', resultado: 'Faro: 1,0; Montenegro/Gambelas: 0,6; Estoi, Conceição, Santa Bárbara de Nexe, Patacão, Bordeira e Arneiro: 0,5; Quinta do Eucalipto e Raposeiras: 0,3.', artigo: 'Artigo 94.º, n.º 1, alínea b), i1)', pagina: '56' },
        { elemento: 'Pisos e altura máxima de fachada', resultado: 'Montenegro/Gambelas: 4 pisos e 13,4 m; Patacão: 3 pisos e 10,7 m; Quinta do Eucalipto, Estoi, Conceição, Santa Bárbara de Nexe, Bordeira, Raposeiras e Arneiro: 2 pisos e 8,0 m.', artigo: 'Artigo 94.º, n.º 1, alínea b), i3)', pagina: '56' },
      ],
      'espacos habitacionais — area de reconversao urbana': [
        { elemento: 'Regime de execução', resultado: 'A reconversão urbana é desenvolvida através de Plano de Pormenor.', artigo: 'Artigo 94.º, n.º 1, alínea c)', pagina: '57' },
        { elemento: 'Índice de utilização de referência', resultado: '0,6; pode acrescer 0,2 exclusivamente destinado a caves e/ou varandas.', artigo: 'Artigo 94.º, n.º 1, alínea c), i1)', pagina: '57' },
        { elemento: 'Índice de ocupação', resultado: '40 %.', artigo: 'Artigo 94.º, n.º 1, alínea c), i2)', pagina: '57' },
      ],
      'espaco urbano de baixa densidade': [
        { elemento: 'Uso dominante', resultado: 'Habitacional; pode acolher uso turístico e outros usos complementares ou compatíveis.', artigo: 'Artigo 96.º', pagina: '58' },
        { elemento: 'Operações de loteamento', resultado: 'Índice de utilização 0,4, acrescível em 0,2 exclusivamente para caves e/ou varandas; máximo de 2 fogos/lote; máximo de 2 pisos; altura máxima de fachada 8,0 m.', artigo: 'Artigo 97.º, n.º 2', pagina: '58' },
        { elemento: 'Construção, reconstrução, alteração e ampliação em prédios urbanos', resultado: 'Índice de utilização 0,8 aplicável a uma profundidade de 30 m a partir do arruamento confinante; máximo de 2 fogos/parcela, 2 pisos e altura de fachada de 8,0 m.', artigo: 'Artigo 97.º, n.º 3', pagina: '58' },
      ],
      'espacos verdes': [
        { elemento: 'Regime de edificabilidade', resultado: 'Nas áreas integradas em PP, PU, unidade de execução ou projeto municipal aprovado aplica-se o respetivo regime; nos restantes casos, índice de utilização máximo de 5 %.', artigo: 'Artigo 103.º, n.os 1 e 2', pagina: '60-61' },
        { elemento: 'Ampliação/alteração/reconstrução', resultado: 'Admitida até ao máximo de 10 % da área de construção existente em situação legal.', artigo: 'Artigo 103.º, n.º 3', pagina: '61' },
      ],
      'areas de edificacao dispersa do barrocal': [
        { elemento: 'Uso dominante', resultado: 'Habitação (máximo de 2 fogos, incluindo anexos) e instalações de apoio à atividade agrícola e florestal. Admite complementarmente comércio e serviços de escala local, equipamentos, recreio/lazer e determinadas tipologias de turismo.', artigo: 'Artigo 86.º', pagina: '49-50' },
        { elemento: 'Habitação - área de construção máxima', resultado: '300 m² para alteração/ampliação de habitação existente ou nova habitação, incluindo anexos; 400 m² quando inclua comércio/serviços local compatível. Se a preexistência tiver área superior, esse valor constitui o máximo.', artigo: 'Artigo 87.º, n.º 2, alínea a)', pagina: '50' },
        { elemento: 'Habitação - pisos e altura', resultado: 'Máximo de 2 pisos, incluindo semienterrados, e altura máxima de fachada de 7,0 m; se a preexistência tiver valor superior, esse valor constitui o máximo.', artigo: 'Artigo 87.º, n.º 2, alínea a)', pagina: '50' },
        { elemento: 'Apoio agrícola/florestal', resultado: 'Área máxima de construção de 200 m²; altura máxima de fachada 9,0 m. Quando articulado com habitação, área máxima conjunta de 500 m², salvo preexistência superior.', artigo: 'Artigo 87.º, n.º 2, alínea b)', pagina: '50' },
      ],
      'espacos agricolas de producao': [
        { elemento: 'Enquadramento', resultado: 'Áreas de elevada capacidade de uso e aptidão agrícola, afetas ou não à RAN. Aplicam-se cumulativamente as condicionantes da RAN quando incidirem.', artigo: 'Artigos 65.º e 66.º', pagina: '41' },
        { elemento: 'Regra geral de nova edificação isolada', resultado: 'A edificação dispersa é proibida, exceto nos casos previstos. Para habitação do agricultor e usos associados à exploração, exige-se, entre outras condições, propriedade com pelo menos 10 ha e exploração economicamente viável comprovada.', artigo: 'Artigos 47.º e 48.º, n.º 1', pagina: '31-33' },
        { elemento: 'Novas edificações isoladas admitidas', resultado: 'Habitação do agricultor: área máxima de construção 500 m²; outros usos, incluindo TER/TH: 2 000 m²; altura máxima de fachada 7,5 m; máximo 2 pisos, incluindo semienterrados.', artigo: 'Artigo 48.º, n.º 1, alínea g)', pagina: '32' },
      ],
      'espacos florestais de conservacao — protecao parcial': [
        { elemento: 'Uso e restrições', resultado: 'Admite usos florestais, agrícolas e pecuários extensivos nos termos do regulamento, mas a conservação dos valores naturais e as regras de gestão florestal condicionam a intervenção.', artigo: 'Artigos 70.º e 71.º', pagina: '42-43' },
        { elemento: 'Regime de edificabilidade', resultado: 'Aplica-se o regime geral do solo rústico; novas edificações isoladas só nas exceções regulamentares e legais, com controlo de condicionantes ambientais e de incêndio.', artigo: 'Artigos 47.º, 48.º e 71.º', pagina: '31-33, 43' },
      ],
      'espacos de atividades industriais': [
        { elemento: 'Uso dominante', resultado: 'Atividades industriais ligadas exclusivamente à atividade agrícola, pecuária e florestal, para aproveitamento dos respetivos produtos. Não é permitido uso habitacional, salvo o preexistente e apoio indispensável à vigilância/segurança.', artigo: 'Artigos 72.º e 73.º', pagina: '43-44' },
        { elemento: 'Edificabilidade', resultado: 'Operações urbanísticas integradas em plano de intervenção no espaço rústico: índice de utilização 0,2; índice de ocupação 20 %; altura máxima de fachada 10,0 m; máximo 2 pisos acima da cota de soleira.', artigo: 'Artigo 74.º', pagina: '44' },
      ],
      'espacos naturais e paisagisticos': [
        { elemento: 'Regime de proteção', resultado: 'Área costeira e lagunar terrestre integrada no Parque Natural da Ria Formosa, com proteção total, parcial I ou parcial II. A edificação é, em regra, interdita, com exceções muito limitadas para atividades e infraestruturas legalmente admitidas.', artigo: 'Artigos 75.º e 76.º', pagina: '44-45' },
      ],
    },
  },
};

function normalize(value = '') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function municipalityKey(name = '') { return normalize(name).replace(/[^a-z]/g, ''); }

export function regulatorySourceFor(municipalityName) {
  return MUNICIPAL_DATA[municipalityKey(municipalityName)]?.fontes || [];
}

export function regulatoryRulesFor(municipalityName, officialClassification) {
  const municipality = MUNICIPAL_DATA[municipalityKey(municipalityName)];
  if (!municipality || !officialClassification) return [];
  const classification = normalize(officialClassification);
  const matchedKey = Object.keys(municipality.regras).find((key) => classification.includes(key) || key.includes(classification));
  if (!matchedKey) return [];
  return municipality.regras[matchedKey].map((rule) => ({
    camada: `Regra urbanística — ${rule.elemento}`,
    valor: rule.resultado,
    artigo: rule.artigo,
    pagina: rule.pagina,
    fonte: municipality.fontes[0],
  }));
}

export function regulatoryContextFor(municipalityName, officialClassification) {
  const sources = regulatorySourceFor(municipalityName);
  const rules = regulatoryRulesFor(municipalityName, officialClassification);
  return { sources, rules };
}

// Regime transversal do solo rural de Loulé. Não prova que uma ruína exista
// ou que seja legal: apenas impede que a pré-análise confunda construção nova
// com a reabilitação/ampliação de uma preexistência documentalmente comprovada.
export function preexistenceRulesFor(municipalityName) {
  if (municipalityKey(municipalityName) !== 'loule') return [];
  return [
    { elemento: 'Preexistência - regime de princípio', resultado: 'Em solo rural, não se deve confundir uma nova habitação isolada com obras sobre construção existente. São admitidas obras de conservação, reconstrução, alteração e ampliação de construções existentes para fins habitacionais, nos termos e limites regulamentares.', artigo: 'Artigo 88.º-B, n.º 1', pagina: '26', fonte: louleSource },
    { elemento: 'Preexistência - prova necessária', resultado: 'A admissibilidade depende de demonstrar a preexistência e a respetiva situação legal. A edificação deve apresentar estrutura edificada e volumetricamente definida; uma simples referência cadastral, ruína sem comprovação ou vestígio não basta para concluir viabilidade.', artigo: 'Artigo 88.º-B, n.º 4, alínea f)', pagina: '26', fonte: louleSource },
    { elemento: 'Preexistência - limites de ampliação habitacional', resultado: 'O total edificado, incluindo a ampliação, não pode exceder 300 m² de área de construção para fins habitacionais; se a preexistência tiver área superior, essa área constitui o máximo. Não pode aumentar o número de pisos pré-existentes.', artigo: 'Artigo 88.º-B, n.º 4, alíneas b) e d)', pagina: '26', fonte: louleSource },
    { elemento: 'Preexistência - condições complementares', resultado: 'Exige integração paisagística, salvaguarda da segurança, manutenção da traça arquitetónica quando adequada, acesso público e respeito pelos afastamentos e demais condicionantes aplicáveis.', artigo: 'Artigo 88.º-B, n.º 4, alíneas a), e), g) e h)', pagina: '26', fonte: louleSource },
  ];
}

export function regulatoryRuleCatalogFor(municipalityName) {
  const municipality = MUNICIPAL_DATA[municipalityKey(municipalityName)];
  if (!municipality) return [];
  return Object.entries(municipality.regras).map(([categoria, rules]) => ({
    categoria,
    regras: rules.map((rule) => ({ elemento: rule.elemento, resultado: rule.resultado, artigo: rule.artigo, pagina: rule.pagina })),
    fonte: municipality.fontes[0],
  }));
}
