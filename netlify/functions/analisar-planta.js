import { GoogleGenAI } from '@google/genai';

export const handler = async (event) => {
  // Configuração dos cabeçalhos CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Tratar requisição OPTIONS (Pre-flight do navegador)
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
        body: JSON.stringify({ error: 'GEMINI_API_KEY não configurada no Netlify.' })
      };
    }

    const { pdfBase64, userMessage, chatHistory } = JSON.parse(event.body || '{}');

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `Você é um assistente técnico especializado em urbanismo do concelho de Loulé, Portugal. Analise o extrato do PDM fornecido em PDF com precisão e clareza.`;

    let contents = [];

    if (pdfBase64) {
      contents.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64
        }
      });
      contents.push({ text: userMessage || "Analise este extrato do PDM de Loulé." });
    } else if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
      contents.push({ role: 'user', parts: [{ text: userMessage }] });
    } else {
      contents.push({ text: userMessage });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction,
        temperature: 0.2
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: response.text })
    };

  } catch (error) {
    console.error("Erro na execução da função:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Erro ao processar o ficheiro.' })
    };
  }
};
