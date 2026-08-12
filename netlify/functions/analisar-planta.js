import { GoogleGenAI } from '@google/genai';

export async function handler(event, context) {
  // Permitir apenas requisições POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método não permitido.' })
    };
  }

  try {
    // 1. Verificar a chave da API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("ERRO: GEMINI_API_KEY não configurada nas Environment Variables.");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chave de API não configurada no servidor Netlify.' })
      };
    }

    // 2. Extrair dados da requisição
    const { pdfBase64, userMessage, chatHistory } = JSON.parse(event.body || '{}');

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash';

    const systemInstruction = `Você é um assistente técnico especializado em urbanismo e arquitetura do concelho de Loulé, Portugal.
Sua função é analisar extratos do PDM (Plano Director Municipal) de Loulé fornecidos em formato PDF e emitir análises preliminares informativas.
Responda sempre com clareza, em português europeu, destacando as condicionantes urbanísticas, classificação do solo e orientações preliminares.`;

    let contents = [];

    // 3. Montar a estrutura de conteúdos
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

    // 4. Chamada à API da Gemini
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: response.text })
    };

  } catch (error) {
    console.error("Erro interno na Netlify Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message || 'Erro ao comunicar com o modelo Gemini.' 
      })
    };
  }
}
