import PDFDocument from 'pdfkit';

const COLORS = { navy: '#173D58', teal: '#24565D', gold: '#B9954F', ink: '#17201F', muted: '#64716E', line: '#D8E0DD', wash: '#F2F5F3', paleGold: '#F5F0E5' };
const FOOTER_Y = 762;
// Reserva espaço para o aviso legal imediatamente antes da linha do rodapé.
const CONTENT_END_Y = 724;
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

function drawHeader(doc, documentLabel = 'PRÉ-ANÁLISE URBANÍSTICA') {
  doc.image(Buffer.from(LOGO_PNG, 'base64'), 22, 16, { fit: [72, 72] });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text('Arq. Leonel Mendes', 97, 45);
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text('ARQUITETURA + INTELIGÊNCIA', 97, 59);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gold).text(documentLabel, 360, 48, { width: 188, align: 'right' });
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
  const width = Math.min(235, doc.font('Helvetica-Bold').fontSize(8.5).widthOfString(label) + 22);
  const y = doc.y;
  doc.roundedRect(47, y, width, 22, 11).fill(COLORS.paleGold);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.navy).text(label, 58, y + 7, { width: width - 20, align: 'center' });
  doc.y = y + 31;
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 34);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.navy).text(title.replace(/^\d+\.\s*/, ''), 47, doc.y);
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
  const drawRow = (cells, isHeader = false) => {
    const values = widths.map((_, index) => String(cells[index] || '-'));
    const heights = values.map((value, index) => textHeight(doc, value, widths[index] - 10, isHeader ? 7.6 : 8.5));
    const height = Math.max(...heights, isHeader ? 20 : 24) + 10;
    ensureSpace(doc, height + 4);
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
  drawRow(header, true);
  data.forEach((row) => drawRow(row));
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

function drawFooter(doc, pageNumber, disclaimer = 'Pré-análise assistida por IA. Não constitui parecer municipal nem decisão de licenciamento.') {
  doc.save();
  // O aviso integra o conteúdo do relatório, não o rodapé administrativo.
  doc.font('Helvetica-Oblique').fontSize(6.7).fillColor(COLORS.muted)
    .text(disclaimer, 47, FOOTER_Y - 15, { width: 501, align: 'center' });
  doc.strokeColor(COLORS.line).lineWidth(0.8).moveTo(47, FOOTER_Y).lineTo(548, FOOTER_Y).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
    .text('Morada: Av. José da Costa Mealha, n.º 133, 8100-500 Loulé - Telefone: 96 0010 870 - E-mail: geral@leonelmendes.com', 47, FOOTER_Y + 9, { width: 501, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.navy).text(`PÁGINA ${pageNumber}`, 470, FOOTER_Y + 20, { width: 78, align: 'right' });
  doc.restore();
}

function locationPoints(location = {}) {
  const geometry = location?.parcela?.geometria?.geometry || location?.parcela?.geometria;
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
  const url = new URL('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export');
  url.search = new URLSearchParams({ bbox: bbox.join(','), bboxSR: '4326', imageSR: '4326', size: '1200,760', format: 'png32', transparent: 'false', f: 'image' }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const image = Buffer.from(await response.arrayBuffer());
    if (!image.length) throw new Error('imagem vazia');
    return { image, bbox, points };
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
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return { x, y, image: Buffer.from(await response.arrayBuffer()) };
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
  };
}

function drawLocationMap(doc, aerial, location) {
  if (!aerial) return;
  ensureSpace(doc, 360);
  drawSectionTitle(doc, 'Localização analisada');
  const x = 47; const y = doc.y; const width = 501; const height = 300;
  if (aerial.image) {
    doc.image(aerial.image, x, y, { width, height });
  } else {
    const tileWidth = width / 3; const tileHeight = height / 3;
    aerial.tiles.forEach((tile) => {
      const tileX = x + (tile.x - aerial.tileOrigin.x) * tileWidth;
      const tileY = y + (tile.y - aerial.tileOrigin.y) * tileHeight;
      doc.image(tile.image, tileX, tileY, { width: tileWidth + 0.4, height: tileHeight + 0.4 });
    });
  }
  const [minLon, minLat, maxLon, maxLat] = aerial.bbox;
  const toPoint = ([lon, lat]) => [x + ((lon - minLon) / (maxLon - minLon)) * width, y + height - ((lat - minLat) / (maxLat - minLat)) * height];
  if (aerial.points.length > 1) {
    const [startX, startY] = toPoint(aerial.points[0]);
    doc.save().opacity(0.18).fillColor(COLORS.gold).moveTo(startX, startY);
    aerial.points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().fill().restore();
    doc.save().lineWidth(2.3).strokeColor(COLORS.gold).moveTo(startX, startY);
    aerial.points.slice(1).forEach((point) => { const [px, py] = toPoint(point); doc.lineTo(px, py); });
    doc.closePath().stroke().restore();
  } else if (aerial.points.length === 1) {
    const [px, py] = toPoint(aerial.points[0]);
    doc.circle(px, py, 6).fillAndStroke(COLORS.gold, '#FFFFFF');
  }
  doc.rect(x, y, width, height).lineWidth(0.8).strokeColor(COLORS.line).stroke();
  doc.y = y + height + 7;
  const reference = location?.parcela?.declaracao || location?.parcela?.referencia || 'localização selecionada';
  doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.muted).text(`Delimitação analisada: ${reference}. Vista aérea: Esri World Imagery; limite/seleção cadastral DGT, de caráter preliminar.`, x, doc.y, { width });
  doc.moveDown(1.15);
}

function drawCartographicEvidence(doc, location) {
  const layers = Array.isArray(location?.pdm) ? location.pdm : [];
  const useful = layers
    .map((item) => ({ label: String(item?.camada || '').trim(), value: String(item?.valor || '').trim() }))
    .filter((item) => item.label && item.value)
    // Códigos numéricos isolados não são compreensíveis para o cliente sem legenda oficial.
    .filter((item) => !(/regime de uso do solo \(dgt\)/i.test(item.label) && /^\d+$/.test(item.value)))
    .slice(0, 5);
  if (!useful.length) return;
  drawSectionTitle(doc, 'Enquadramento cartográfico disponível');
  useful.forEach((item) => {
    const line = `${item.label}: ${item.value}`;
    ensureSpace(doc, textHeight(doc, line, 470, 8.5) + 11);
    doc.circle(53, doc.y + 5, 1.7).fill(COLORS.gold);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(line, 63, doc.y - 2, { width: 470, lineGap: 1.7 });
    doc.moveDown(0.5);
  });
  doc.font('Helvetica-Oblique').fontSize(7.2).fillColor(COLORS.muted).text('Informação cartográfica de apoio; os parâmetros urbanísticos concretos constam da secção seguinte e exigem confirmação pelo regulamento e pelas plantas oficiais em vigor.', 47, doc.y + 1, { width: 501, lineGap: 1.5 });
  doc.moveDown(1.1);
}

export async function createProfessionalPdf({
  reportHtml,
  reportText,
  location = null,
  documentTitle = 'Relatório de Pré-Análise Urbanística',
  documentLabel = 'PRÉ-ANÁLISE URBANÍSTICA',
  disclaimer = 'Pré-análise assistida por IA. Não constitui parecer municipal nem decisão de licenciamento.',
}) {
  const aerial = await aerialContext(location);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 47, bufferPages: true, info: { Title: `${documentTitle} - Leonel Mendes` } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('pageAdded', () => drawHeader(doc, documentLabel));

    const report = parseReport(reportHtml, reportText, documentTitle);
    drawHeader(doc, documentLabel);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.navy).text(report.title, 47, doc.y);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`Gerado em ${new Date().toLocaleString('pt-PT')}`, 47, doc.y + 5);
    doc.moveDown(1.4);
    const status = report.summary.find((line) => /^Resultado preliminar:/i.test(line))?.replace(/^Resultado preliminar:\s*/i, '');
    drawStatus(doc, status);
    report.summary.filter((line) => !/^Resultado preliminar:/i.test(line)).forEach((line) => {
      ensureSpace(doc, textHeight(doc, line, 501, 10) + 12);
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(line, 47, doc.y, { width: 501, lineGap: 2.5 });
      doc.moveDown(0.9);
    });

    drawLocationMap(doc, aerial, location);
    drawCartographicEvidence(doc, location);

    if (!report.sections.length && report.fallback) {
      drawSectionTitle(doc, 'Conteúdo da pré-análise');
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
      drawFooter(doc, index + 1, disclaimer);
    }
    doc.end();
  });
}
