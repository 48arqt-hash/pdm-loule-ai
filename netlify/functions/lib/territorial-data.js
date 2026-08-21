// Biblioteca regulamentar curada. Cada regra tem fonte, versão e artigo para
// que o relatório nunca apresente um parâmetro sem origem verificável.
const faroSource = {
  documento: 'Revisão do Plano Diretor Municipal de Faro — Aviso n.º 20948/2024/2',
  versao: '20-09-2024',
  url: 'https://mapas.cm-faro.pt/docs/pdm_2024/Regulamento.pdf',
};

export const MUNICIPAL_DATA = {
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

export function regulatoryRuleCatalogFor(municipalityName) {
  const municipality = MUNICIPAL_DATA[municipalityKey(municipalityName)];
  if (!municipality) return [];
  return Object.entries(municipality.regras).map(([categoria, rules]) => ({
    categoria,
    regras: rules.map((rule) => ({ elemento: rule.elemento, resultado: rule.resultado, artigo: rule.artigo, pagina: rule.pagina })),
    fonte: municipality.fontes[0],
  }));
}
