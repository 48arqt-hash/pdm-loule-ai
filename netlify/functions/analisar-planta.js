exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userMessage, pdfBase64, email } = JSON.parse(event.body);

    // Prompt estritamente focado no enquadramento legal e índices urbanísticos
    const promptSystem = `
Atua como um Técnico de Urbanismo e Arquiteto especialista no PDM e Planos de Urbanização da Câmara Municipal de Loulé.
Analisa a Planta de Localização Oficial enviada (PDF/visão) e gera um relatório rigoroso focado no ENQUADRAMENTO LEGAL URBANÍSTICO. Ignora o histórico de antecedentes processuais ou sobreposições de processos.

O relatório deve ter:
1. IDENTIFICAÇÃO E CARACTERIZAÇÃO DA PARCELA (Área, Freguesia e Plano Aplicável).
2. CLASSIFICAÇÃO E QUALIFICAÇÃO DO SOLO (Solo Urbano/Rural, Categoria do solo e Usos dominantes).
3. QUADRO DE PARÂMETROS E ÍNDICES URBANÍSTICOS (Tabela com Índice de Utilização, Pisos, Cércea e Afastamentos).
4. SERVIDÕES E CONDICIONANTES AMBIENTAIS/LEGAIS (RAN, REN, Ruído, Afastamento a vias).
5. PARECER TÉCNICO E PRÓXIMOS PASSOS (Recomendações para viabilização e licenciamento).

Usa linguagem técnica, clara, estruturada com formatação HTML simples (<strong>, <table>, <ul>, <li>, <br>).
`;

    // Chamada à API da IA (OpenAI / Gemini / Anthropic)
    // ...

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: aiReply })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erro ao processar a análise." })
    };
  }
};
