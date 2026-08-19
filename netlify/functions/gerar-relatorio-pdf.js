import { hasProfessionalAccess } from './lib/access.js';
import { createProfessionalPdf } from './lib/report-pdf.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método não permitido.' };
  const professionalAccess = hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '');
  if (process.env.ALLOW_DIRECT_ANALYSIS !== 'true' && !professionalAccess) return { statusCode: 403, body: 'Valide o acesso profissional antes de gerar o PDF.' };
  try {
    const { reportText, reportHtml } = JSON.parse(event.body || '{}');
    if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) return { statusCode: 400, body: 'Relatório inválido.' };
    const pdf = await createProfessionalPdf({ reportHtml, reportText });
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="relatorio-tecnico-preliminar-pdm-loule.pdf"', 'Cache-Control': 'no-store' },
      body: pdf.toString('base64'),
    };
  } catch (error) {
    console.error('report_pdf_error', error);
    return { statusCode: 500, body: 'Não foi possível gerar o PDF.' };
  }
};
