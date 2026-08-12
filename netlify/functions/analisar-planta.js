import { GoogleGenAI } from "@google/genai";

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: "Chave GEMINI_API_KEY não encontrada no Netlify." }) 
    };
  }

  try {
    const { prompt, fileData, mimeType, duvida } = JSON.parse(event.body || "{}");
    const textPrompt = prompt || duvida || "Analisa esta planta e indica a viabilidade preliminar do PDM de Loulé.";

    const ai = new GoogleGenAI({ apiKey });

    const contents = [{ text: textPrompt }];

    if (fileData && mimeType) {
      contents.push({
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        temperature: 0.7,
        systemInstruction: `És o Arquiteto e Agente de Inteligência Estratégica Sénior do portal leonelmendes.com. O teu objetivo supremo é analisar plantas arquitetónicas, extratos de PDM ou layouts enviados pelos utilizadores, avaliando com rigor absoluto:
1. Ergonomia e Fluxo de Circulação / Enquadramento de Solo PDM
2. Aproveitamento de Espaço e Funcionalidade
3. Conformidade com Boas Práticas de Design/Arquitetura
4. Oportunidades de Otimização e Valorização

Formata a resposta de forma altamente profissional, usando tópicos claros e recomendações acionáveis.`
      }
    });

    const aiText = response.text || "Sem resposta gerada pelo modelo.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        resultado: aiText, 
        relatorio: aiText, 
        resposta: aiText 
      })
    };

  } catch (error) {
    console.error("Erro na Function:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Erro ao processar a planta com a IA: " + error.message })
    };
  }
}
