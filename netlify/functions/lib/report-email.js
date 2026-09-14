import { createProfessionalPdf } from './report-pdf.js';

const OWNER_EMAIL = 'geral@leonelmendes.com';
const EMAIL_COPY = {
  pt: { title:'Relatório de Pré-Análise Urbanística', label:'PRÉ-ANÁLISE URBANÍSTICA', greeting:'Exmo.(a) Cliente,', attached:'Segue em anexo o seu', intro:'Este documento foi produzido com apoio de inteligência artificial e dados geográficos oficiais. É uma pré-análise e requer validação técnica antes de qualquer decisão, projeto ou licenciamento.', available:'O seu Dossier Digital está disponível', availableText:'Este espaço privado permite acompanhar o processo, consultar a pré-análise, confirmar a localização analisada e enviar documentos complementares quando necessário.', open:'Abrir o meu Dossier Digital', unavailable:'O Dossier Digital ainda não ficou disponível neste envio. O relatório PDF mantém-se válido; o atelier está a preparar o acesso privado para acompanhamento do processo e troca segura de documentos.', important:'Informação importante', importantText:'O documento é uma pré-análise técnica. Antes de qualquer compra, projeto, obra ou pedido de licenciamento, o enquadramento deve ser validado por técnico habilitado e, quando aplicável, pelas entidades competentes.', registered:'Para sua segurança, este pedido foi registado pelo atelier', closing:'Sem mais a acrescentar, com os melhores cumprimentos.', subject:'Segue em anexo o seu' },
  en: { title:'Urban Planning Pre-Assessment Report', label:'URBAN PLANNING PRE-ASSESSMENT', greeting:'Dear Client,', attached:'Please find attached your', intro:'This document was produced with the support of artificial intelligence and official geographic data. It is a preliminary assessment and requires technical validation before any decision, design or licensing step.', available:'Your Digital Dossier is available', availableText:'This private space lets you follow the process, consult the pre-assessment, confirm the analysed location and send supporting documents when necessary.', open:'Open my Digital Dossier', unavailable:'The Digital Dossier was not available for this delivery. The PDF report remains valid; the studio is preparing private access for process follow-up and secure document exchange.', important:'Important information', importantText:'This document is a technical pre-assessment. Before any purchase, design, construction or licensing request, the planning context must be validated by a qualified professional and, where applicable, the competent authorities.', registered:'For your security, this request was registered by the studio', closing:'Kind regards,', subject:'Please find attached your' },
  fr: { title:'Rapport de Pré-Analyse Urbanistique', label:'PRÉ-ANALYSE URBANISTIQUE', greeting:'Madame, Monsieur,', attached:'Veuillez trouver ci-joint votre', intro:'Ce document a été produit avec l’appui de l’intelligence artificielle et de données géographiques officielles. Il s’agit d’une pré-analyse qui exige une validation technique avant toute décision, projet ou démarche d’autorisation.', available:'Votre Dossier Numérique est disponible', availableText:'Cet espace privé permet de suivre le dossier, consulter la pré-analyse, confirmer la localisation analysée et envoyer des documents complémentaires.', open:'Ouvrir mon Dossier Numérique', unavailable:'Le Dossier Numérique n’était pas disponible pour cet envoi. Le rapport PDF reste valable ; l’atelier prépare l’accès privé pour le suivi du dossier et l’échange sécurisé de documents.', important:'Information importante', importantText:'Ce document est une pré-analyse technique. Avant tout achat, projet, travaux ou demande d’autorisation, le contexte urbanistique doit être validé par un professionnel qualifié et, le cas échéant, par les autorités compétentes.', registered:'Pour votre sécurité, cette demande a été enregistrée par l’atelier', closing:'Avec nos meilleures salutations,', subject:'Veuillez trouver ci-joint votre' },
  de: { title:'Städtebaulicher Voranalysebericht', label:'STÄDTEBAULICHE VORANALYSE', greeting:'Sehr geehrte Damen und Herren,', attached:'Anbei erhalten Sie Ihren', intro:'Dieses Dokument wurde mit Unterstützung künstlicher Intelligenz und offizieller Geodaten erstellt. Es ist eine Voranalyse und muss vor jeder Entscheidung, Planung oder Genehmigung technisch geprüft werden.', available:'Ihr digitales Dossier ist verfügbar', availableText:'In diesem privaten Bereich können Sie den Vorgang verfolgen, die Voranalyse einsehen, den analysierten Standort bestätigen und Unterlagen nachreichen.', open:'Mein digitales Dossier öffnen', unavailable:'Das digitale Dossier war für diese Zustellung noch nicht verfügbar. Der PDF-Bericht bleibt gültig; das Büro bereitet den privaten Zugang für die Vorgangsbegleitung und den sicheren Dokumentenaustausch vor.', important:'Wichtige Information', importantText:'Dieses Dokument ist eine technische Voranalyse. Vor Kauf, Planung, Bau oder Genehmigungsantrag muss die planungsrechtliche Einordnung durch eine qualifizierte Fachperson und gegebenenfalls die zuständigen Stellen bestätigt werden.', registered:'Zu Ihrer Sicherheit wurde diese Anfrage vom Büro registriert', closing:'Mit freundlichen Grüßen,', subject:'Anbei erhalten Sie Ihren' },
  es: { title:'Informe de Preanálisis Urbanístico', label:'PREANÁLISIS URBANÍSTICO', greeting:'Estimado/a cliente:', attached:'Adjuntamos su', intro:'Este documento se elaboró con apoyo de inteligencia artificial y datos geográficos oficiales. Es un preanálisis y requiere validación técnica antes de cualquier decisión, proyecto o trámite de licencia.', available:'Su Dossier Digital está disponible', availableText:'Este espacio privado permite seguir el proceso, consultar el preanálisis, confirmar la ubicación analizada y enviar documentos complementarios cuando sea necesario.', open:'Abrir mi Dossier Digital', unavailable:'El Dossier Digital no estuvo disponible para este envío. El informe PDF sigue siendo válido; el estudio está preparando el acceso privado para el seguimiento del proceso y el intercambio seguro de documentos.', important:'Información importante', importantText:'Este documento es un preanálisis técnico. Antes de cualquier compra, proyecto, obra o solicitud de licencia, el encuadre urbanístico debe ser validado por un profesional cualificado y, cuando corresponda, por las entidades competentes.', registered:'Para su seguridad, esta solicitud fue registrada por el estudio', closing:'Atentamente,', subject:'Adjuntamos su' },
};

export function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function dossierBlock(dossierLink, copy) {
  if (dossierLink) {
    return `<div style="margin:22px 0;padding:16px 18px;background:#edf5f4;border-left:4px solid #1d7673;color:#173e5b"><strong>${escapeHtml(copy.available)}</strong><br>${escapeHtml(copy.availableText)}<br><a href="${escapeHtml(dossierLink)}" style="display:inline-block;margin-top:11px;padding:9px 13px;background:#173e5b;color:#fff;text-decoration:none;font-weight:700;border-radius:4px">${escapeHtml(copy.open)}</a></div>`;
  }
  return `<div style="margin:22px 0;padding:16px 18px;background:#f4f6f5;border-left:4px solid #8099a5;color:#29485b"><strong>Dossier Digital</strong><br>${escapeHtml(copy.unavailable)}</div>`;
}

export async function sendReportEmail({
  to,
  reportText,
  reportHtml,
  location = null,
  documentTitle = null,
  documentLabel = null,
  attachmentFilename = 'relatorio-pre-analise-urbanistica.pdf',
  disclaimer = 'Pré-análise assistida por IA. Não constitui parecer municipal nem decisão de licenciamento.',
  emailIntro = 'Este documento foi produzido com apoio de inteligência artificial e dados geográficos oficiais. É uma pré-análise e requer validação técnica antes de qualquer decisão, projeto ou licenciamento.',
  privacyPolicyVersion = null,
  documentPlan = null,
  dossierLink = null,
  reportReference = null,
  language = 'pt',
}) {
  const copy = EMAIL_COPY[language] || EMAIL_COPY.pt;
  documentTitle ||= copy.title;
  documentLabel ||= copy.label;
  if (language !== 'pt' && emailIntro === 'Este documento foi produzido com apoio de inteligência artificial e dados geográficos oficiais. É uma pré-análise e requer validação técnica antes de qualquer decisão, projeto ou licenciamento.') emailIntro = copy.intro;
  const recipient = String(to || '').trim();
  if (!validEmail(recipient)) throw new Error('Indique um e-mail de destino válido.');
  if (!reportText || typeof reportText !== 'string' || reportText.length > 70000) throw new Error('O relatório a enviar é inválido ou demasiado extenso.');
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) throw new Error('O envio por e-mail ainda não está configurado.');

  const owner = validEmail(process.env.REPORT_OWNER_EMAIL || '') ? process.env.REPORT_OWNER_EMAIL.trim() : OWNER_EMAIL;
  const pdf = await createProfessionalPdf({ reportHtml, reportText, location, documentTitle, documentLabel, disclaimer, documentPlan, reportReference });
  const siteUrl = String(process.env.PUBLIC_SITE_URL || 'https://leonelmendes.com').replace(/\/$/, '');
  const logoUrl = `${siteUrl}/images/logo.png`;
  const reference = reportReference ? ` <strong>n.º ${escapeHtml(reportReference)}</strong>` : '';
  const privacy = privacyPolicyVersion ? ` (${escapeHtml(privacyPolicyVersion)})` : '';
  const html = `<div style="max-width:620px;margin:0 auto;font-family:Arial,sans-serif;color:#183e5a;line-height:1.55"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #d8e0df;margin:0 0 26px"><tr><td width="58" style="padding:0 12px 14px 0;vertical-align:middle"><img src="${escapeHtml(logoUrl)}" width="50" height="50" alt="Arq. Leonel Mendes" style="display:block;width:50px;height:50px;object-fit:contain;border:0"></td><td style="padding:0 0 14px;vertical-align:middle;line-height:1.1"><span style="display:block;font-size:18px;line-height:20px;font-weight:700;color:#183e5a">Arq. Leonel Mendes</span><span style="display:block;margin-top:2px;font-size:11px;line-height:13px;letter-spacing:.55px;color:#687775;text-transform:uppercase">Arquitetura + Inteligência</span></td></tr></table><p>${escapeHtml(copy.greeting)}</p><p>${escapeHtml(copy.attached)} <strong>${escapeHtml(documentTitle)}</strong>${reference}.</p><p>${escapeHtml(emailIntro)}</p>${dossierBlock(dossierLink, copy)}<div style="margin:22px 0;padding:16px 18px;background:#f3f5f3;border-left:4px solid #bd8b37;color:#273238"><strong>${escapeHtml(copy.important)}</strong><br>${escapeHtml(copy.importantText)}</div><p>${escapeHtml(copy.registered)}${privacy}.</p><p>${escapeHtml(copy.closing)}</p><p style="margin:0 0 2px"><strong>Leonel Mendes</strong><br>Arquiteto</p><p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#57645f">Morada/Address: Av. José da Costa Mealha n.º 133, 8100-500 Loulé<br>Tel: <a href="tel:+351960010870" style="color:#183e5a;text-decoration:none">(+351) 960 010 870</a><br>E-mail: <a href="mailto:geral@leonelmendes.com" style="color:#183e5a">geral@leonelmendes.com</a><br><a href="https://www.leonelmendes.com/" style="color:#183e5a">www.leonelmendes.com</a></p></div>`;
  const payload = {
    from: process.env.REPORT_FROM_EMAIL,
    to: [recipient],
    subject: `${reportReference ? `n.º ${reportReference} - ` : ''}${copy.subject} ${documentTitle} - Arq. Leonel Mendes`,
    html,
    attachments: [{ filename: attachmentFilename, content: pdf.toString('base64') }],
  };
  if (owner.toLowerCase() !== recipient.toLowerCase()) payload.bcc = [owner];

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `pdm-report-${crypto.randomUUID()}` },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw.slice(0, 300) }; }
  if (!response.ok) {
    console.error('email_provider_error', JSON.stringify({ status: response.status, error: data?.message || data?.name || null }));
    throw new Error('O serviço de e-mail recusou o envio. Verifique as variáveis Resend e o domínio remetente.');
  }
  return { id: data?.id || null, recipient, owner };
}
