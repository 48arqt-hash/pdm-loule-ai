import { sendReportEmail, validEmail } from './lib/report-email.js';

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

const rates = {
  economica: [1800, 2200], media: [2100, 2600], media_alta: [2400, 3200], superior: [3100, 4300], luxo: [4200, 6000],
};
const labels = {
  nova: 'Construção nova', ampliacao: 'Ampliação', reabilitacao: 'Reabilitação',
  economica: 'Económico', media: 'Médio', media_alta: 'Médio-alto', superior: 'Superior', luxo: 'Luxo',
};
const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const limited = (value, min = 0, max = 100000) => Math.min(max, Math.max(min, number(value)));
const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const data = JSON.parse(event.body || '{}');
    if (data.company) return json(200, { sent: true });
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim();
    const location = String(data.location || '').trim();
    const habitable = limited(data.habitable, 0, 3000); const terraces = limited(data.terraces, 0, 1500);
    const garage = limited(data.garage, 0, 1000); const basement = limited(data.basement, 0, 1500);
    const technical = limited(data.technical, 0, 1000); const pool = limited(data.pool, 0, 1000);
    const exterior = limited(data.exterior, 0, 20000); const walls = limited(data.walls, 0, 10000);
    const area = habitable + terraces + garage + basement + technical;
    const floors = limited(data.floors || 1, 1, 8);
    if (!name || !validEmail(email) || !location || area < 30 || floors < 1 || data.consent !== true || data.taxResponsibility !== true) {
      return json(400, { error: 'Preencha corretamente os campos obrigatórios e confirme as declarações.' });
    }
    const quality = Object.hasOwn(rates, data.quality) ? data.quality : 'media_alta';
    const workType = Object.hasOwn(labels, data.workType) ? data.workType : 'nova';
    const [baseLow, baseHigh] = rates[quality];
    const typeFactor = workType === 'reabilitacao' ? 1.15 : workType === 'ampliacao' ? 1.08 : 1;
    const complexity = 1 + (floors - 1) * 0.025 + (data.slope ? 0.06 : 0) + (data.difficultAccess ? 0.04 : 0);
    const plotArea = limited(data.plotArea);
    const qualityFactor = quality === 'economica' ? 0.82 : quality === 'media' ? 0.94 : quality === 'media_alta' ? 1 : quality === 'superior' ? 1.22 : 1.55;
    const coreLow = (habitable * baseLow + terraces * baseLow * 0.45 + garage * baseLow * 0.55 + technical * baseLow * 0.60) * typeFactor * complexity;
    const coreHigh = (habitable * baseHigh + terraces * baseHigh * 0.45 + garage * baseHigh * 0.55 + technical * baseHigh * 0.60) * typeFactor * complexity;
    const extrasLow = (basement * 900 + pool * 1050 + exterior * 140 + walls * 280) * qualityFactor;
    const extrasHigh = (basement * 1400 + pool * 1600 + exterior * 240 + walls * 480) * qualityFactor;
    const worksLow = coreLow + extrasLow;
    const worksHigh = coreHigh + extrasHigh;
    const feesLow = worksLow * 0.08; const feesHigh = worksHigh * 0.13;
    const contingencyLow = worksLow * 0.08; const contingencyHigh = worksHigh * 0.15;
    const netLow = worksLow + feesLow + contingencyLow; const netHigh = worksHigh + feesHigh + contingencyHigh;
    const vatMode = ['none', 'vat6', 'vat23', 'mixed'].includes(data.vatMode) ? data.vatMode : 'none';
    const reducedShare = limited(data.reducedShare, 0, 100);
    const vatRate = vatMode === 'vat23' ? 0.23 : vatMode === 'vat6' ? 0.06 : vatMode === 'mixed' ? (reducedShare / 100) * 0.06 + (1 - reducedShare / 100) * 0.23 : 0;
    const totalLow = netLow * (1 + vatRate); const totalHigh = netHigh * (1 + vatRate);
    const vatLabel = vatMode === 'vat6' ? 'IVA a 6%' : vatMode === 'vat23' ? 'IVA a 23%' : vatMode === 'mixed' ? `Repartição: ${reducedShare}% a 6% e ${100 - reducedShare}% a 23%` : 'Sem IVA - custo-base';
    const program = `Habitação interior: ${habitable} m²\nTerraços/alpendres cobertos: ${terraces} m²\nGaragem coberta: ${garage} m²\nCave: ${basement} m²\nÁreas técnicas/arrumos: ${technical} m²\nPiscina: ${pool} m²\nArranjos exteriores: ${exterior} m²\nMuros/vedações: ${walls} ml`;
    const reportText = `ESTIMATIVA INDICATIVA DE CUSTO DE OBRA\nGerada em ${new Date().toLocaleString('pt-PT')}\n\nCUSTO ESTIMADO SEM IVA: ${euro.format(netLow)} a ${euro.format(netHigh)}\n${vatMode === 'none' ? '' : `TOTAL COM A SIMULAÇÃO DE IVA: ${euro.format(totalLow)} a ${euro.format(totalHigh)}\n`}\nDADOS DO PEDIDO\nCliente: ${name}\nLocalização: ${location}\nIntervenção: ${labels[workType]}\nPadrão: ${labels[quality]}\nÁrea do terreno: ${plotArea.toLocaleString('pt-PT')} m²\nÁrea construída descrita: ${area.toLocaleString('pt-PT')} m²\nPisos: ${floors}\n\nPROGRAMA DE ÁREAS\n${program}\n\nBASE DE CÁLCULO\nHabitação interior: ${euro.format(baseLow)} a ${euro.format(baseHigh)}/m²\nTerraços: 45% da banda; garagem: 55%; áreas técnicas: 60%.\nCave: 900-1.400 €/m²; piscina: 1.050-1.600 €/m²; exteriores: 140-240 €/m²; muros: 280-480 €/ml.\n\nCOMPOSIÇÃO SEM IVA\nExecução da obra: ${euro.format(worksLow)} a ${euro.format(worksHigh)}\nProjetos e acompanhamento: ${euro.format(feesLow)} a ${euro.format(feesHigh)}\nReserva para imprevistos: ${euro.format(contingencyLow)} a ${euro.format(contingencyHigh)}\n\nSIMULAÇÃO FISCAL\n${vatLabel}\n\nLIMITES DA ESTIMATIVA\nAs bases são definidas pelo atelier e não são editáveis. Esta estimativa é indicativa e não substitui medições, projeto, consulta a empreiteiros, proposta contratual, licenças, taxas, impostos, aquisição do terreno ou validação fiscal.`;
    const reportHtml = `<p><strong>Custo estimado sem IVA:</strong> ${euro.format(netLow)} a ${euro.format(netHigh)}</p><p>Intervalo indicativo para ${escapeHtml(labels[workType].toLowerCase())}, composto a partir do programa de áreas introduzido.</p><h5>Dados do pedido</h5><table><tr><th>Elemento</th><th>Indicação</th></tr><tr><td>Cliente</td><td>${escapeHtml(name)}</td></tr><tr><td>Localização</td><td>${escapeHtml(location)}</td></tr><tr><td>Intervenção / padrão</td><td>${escapeHtml(labels[workType])} / ${escapeHtml(labels[quality])}</td></tr><tr><td>Área construída / pisos</td><td>${area.toLocaleString('pt-PT')} m² / ${floors}</td></tr></table><h5>Programa de áreas</h5><table><tr><th>Elemento</th><th>Quantidade</th></tr><tr><td>Habitação interior</td><td>${habitable} m²</td></tr><tr><td>Terraços, garagem e áreas técnicas</td><td>${terraces + garage + technical} m²</td></tr><tr><td>Cave / piscina / exteriores / muros</td><td>${basement} m² / ${pool} m² / ${exterior} m² / ${walls} ml</td></tr></table><h5>Composição da estimativa sem IVA</h5><table><tr><th>Componente</th><th>Intervalo</th></tr><tr><td>Execução da obra</td><td>${euro.format(worksLow)} a ${euro.format(worksHigh)}</td></tr><tr><td>Projetos e acompanhamento</td><td>${euro.format(feesLow)} a ${euro.format(feesHigh)}</td></tr><tr><tr><td>Reserva para imprevistos</td><td>${euro.format(contingencyLow)} a ${euro.format(contingencyHigh)}</td></tr><tr><td><strong>Custo estimado sem IVA</strong></td><td><strong>${euro.format(netLow)} a ${euro.format(netHigh)}</strong></td></tr></table><h5>Base de cálculo e limites</h5><p>Terraços/alpendres são ponderados a 45% da banda principal, garagem a 55% e áreas técnicas a 60%. Cave: 900-1.400 €/m²; piscina: 1.050-1.600 €/m²; exteriores: 140-240 €/m²; muros: 280-480 €/ml. Esta estimativa é indicativa e não substitui medições, projeto, consulta a empreiteiros, proposta contratual ou validação fiscal.</p>`;
    const normalizedReportHtml = reportHtml.replace('<tr><tr><td>Reserva para imprevistos</td>', '<tr><td>Reserva para imprevistos</td>');
    await sendReportEmail({
      to: email, reportText, reportHtml: normalizedReportHtml,
      documentTitle: 'Estimativa Indicativa de Custo de Obra',
      documentLabel: 'ESTIMATIVA DE CUSTO DE OBRA',
      attachmentFilename: 'estimativa-indicativa-custo-obra.pdf',
      disclaimer: 'Estimativa indicativa. Não constitui orçamento, proposta contratual ou determinação fiscal.',
      emailIntro: 'O intervalo apresentado é uma estimativa indicativa, com base nos elementos introduzidos. Para uma proposta de obra rigorosa são necessários projeto, medições e consulta ao mercado.',
    });
    return json(200, { sent: true, low: Math.round(netLow), high: Math.round(netHigh), totalLow: Math.round(totalLow), totalHigh: Math.round(totalHigh) });
  } catch (error) {
    console.error('cost_estimate_error', error);
    return json(500, { error: error instanceof Error ? error.message : 'Não foi possível gerar a estimativa.' });
  }
};
