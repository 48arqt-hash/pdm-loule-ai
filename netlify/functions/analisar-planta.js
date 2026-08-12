export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método não permitido.' })
    };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("ERRO: GEMINI_API_KEY ausente.");
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Chave GEMINI_API_KEY não configurada na Netlify.' })
      };
    }

    const { pdfBase64, userMessage } = JSON.parse(event.body || '{}');

    const contents = [];
    
    if (pdfBase64) {
      contents.push({
        parts: [
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: pdfBase64
            }
          },
          { text: userMessage || "Analise este extrato do PDM de Loulé." }
        ]
      });
    } else {
      contents.push({
        parts: [{ text: userMessage || "Olá" }]
      });
    }

    const systemInstruction = {
      parts: [{
        text: "Você é um assistente técnico especializado em urbanismo do concelho de Loulé, Portugal. Analise o extrato do PDM fornecido em PDF com precisão e clareza em português europeu."
      }]
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: systemInstruction,
        generationConfig: { temperature: 0.2 }
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("Erro devolvido pela API Gemini:", data);
      return {
        statusCode: apiResponse.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'Erro na API da Gemini.' })
      };
    }

    const textReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta do modelo.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: textReply })
    };

  } catch (error) {
    console.error("Erro interno na Netlify Function:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Erro interno no servidor.' })
    };
  }
};
