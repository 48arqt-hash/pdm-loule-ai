import { hasProfessionalAccess } from './lib/access.js';
import { createProfessionalPdf } from './lib/report-pdf.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Método não permitido.' };
  const professionalAccess = hasProfessionalAccess(event.headers?.cookie || event.headers?.Cookie || '');
  if (process.env.ALLOW_DIRECT_ANALYSIS === 'false' && !professionalAccess) return { statusCode: 403, body: 'Valide o acesso profissional antes de gerar o PDF.' };
  try {
    const { reportText, reportHtml, location, documentPlan, language } = JSON.parse(event.body || '{}');
    if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) return { statusCode: 400, body: 'Relatório inválido.' };
    const validPlan = documentPlan?.base64 && ['image/jpeg', 'image/png'].includes(documentPlan.mimeType)
      && documentPlan.base64.length <= 2_500_000
      ? { image: Buffer.from(documentPlan.base64, 'base64'), source: String(documentPlan.source || 'Planta de Localização oficial') }
      : null;
    const locale = {
      en: { title: 'Urban Planning Pre-Assessment Report', label: 'URBAN PLANNING PRE-ASSESSMENT', filename: 'urban-planning-pre-assessment.pdf' },
      fr: { title: 'Rapport de Pré-Analyse Urbanistique', label: 'PRÉ-ANALYSE URBANISTIQUE', filename: 'rapport-pre-analyse-urbanistique.pdf' },
      de: { title: 'Städtebaulicher Voranalysebericht', label: 'STÄDTEBAULICHE VORANALYSE', filename: 'staedtebaulicher-voranalysebericht.pdf' },
      es: { title: 'Informe de Preanálisis Urbanístico', label: 'PREANÁLISIS URBANÍSTICO', filename: 'informe-preanalisis-urbanistico.pdf' },
      pt: { title: 'Relatório de Pré-Análise Urbanística', label: 'PRÉ-ANÁLISE URBANÍSTICA', filename: 'relatorio-pre-analise-urbanistica.pdf' },
    }[language] || { title: 'Relatório de Pré-Análise Urbanística', label: 'PRÉ-ANÁLISE URBANÍSTICA', filename: 'relatorio-pre-analise-urbanistica.pdf' };
    const pdf = await createProfessionalPdf({ reportHtml, reportText, location, documentPlan: validPlan, language, documentTitle: locale.title, documentLabel: locale.label });
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${locale.filename}"`, 'Cache-Control': 'no-store' },
      body: pdf.toString('base64'),
    };
  } catch (error) {
    console.error('report_pdf_error', error);
    return { statusCode: 500, body: 'Não foi possível gerar o PDF.' };
  }
};
