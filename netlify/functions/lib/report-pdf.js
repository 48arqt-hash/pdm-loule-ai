import PDFDocument from 'pdfkit';

const COLORS = { navy: '#173D58', teal: '#24565D', gold: '#B9954F', ink: '#17201F', muted: '#64716E', line: '#D8E0DD', wash: '#F2F5F3', paleGold: '#F5F0E5' };
const FOOTER_Y = 762;
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

function parseReport(reportHtml = '', reportText = '') {
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
    title: 'Relatório de Pré-Análise Urbanística',
    summary: paragraphs.slice(0, 2),
    sections,
    fallback: decodeHtml(reportText),
  };
}

function drawHeader(doc) {
  doc.image(Buffer.from(LOGO_PNG, 'base64'), 22, 16, { fit: [72, 72] });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text('Arq. Leonel Mendes', 97, 45);
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text('ARQUITETURA + INTELIGÊNCIA', 97, 59);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.gold).text('PRÉ-ANÁLISE URBANÍSTICA', 398, 48, { width: 150, align: 'right' });
  doc.strokeColor(COLORS.line).lineWidth(1).moveTo(47, 82).lineTo(548, 82).stroke();
  doc.y = 104;
}

function ensureSpace(doc, height) {
  if (doc.y + height > FOOTER_Y) doc.addPage();
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
    let cursor = x;
    values.forEach((value, index) => {
      doc.save().rect(cursor, doc.y, widths[index], height).fillAndStroke(isHeader ? COLORS.navy : '#FFFFFF', COLORS.line).restore();
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 7.6 : 8.5).fillColor(isHeader ? '#FFFFFF' : COLORS.ink)
        .text(value, cursor + 5, doc.y + 5, { width: widths[index] - 10, lineGap: 1.5 });
      cursor += widths[index];
    });
    doc.y += height;
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

function drawFooter(doc, pageNumber) {
  doc.save();
  doc.strokeColor(COLORS.line).lineWidth(0.8).moveTo(47, FOOTER_Y).lineTo(548, FOOTER_Y).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
    .text('Morada: Av. José da Costa Mealha, n.º 133, 8100-500 Loulé - Telefone: 96 0010 870 - E-mail: geral@leonelmendes.com', 47, FOOTER_Y + 9, { width: 501, align: 'center' });
  doc.font('Helvetica').fontSize(6.7).fillColor(COLORS.muted)
    .text('Pré-análise assistida por IA. Não constitui parecer municipal nem decisão de licenciamento.', 47, FOOTER_Y + 20, { width: 415 });
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.navy).text(`PÁGINA ${pageNumber}`, 470, FOOTER_Y + 20, { width: 78, align: 'right' });
  doc.restore();
}

export function createProfessionalPdf({ reportHtml, reportText }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 47, bufferPages: true, info: { Title: 'Relatório de Pré-Análise Urbanística - Leonel Mendes' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('pageAdded', () => drawHeader(doc));

    const report = parseReport(reportHtml, reportText);
    drawHeader(doc);
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
      drawFooter(doc, index + 1);
    }
    doc.end();
  });
}
