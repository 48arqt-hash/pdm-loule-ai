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
