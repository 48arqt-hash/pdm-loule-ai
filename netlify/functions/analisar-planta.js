exports.handler = async (event) => {
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
    const body = JSON.parse(event.body || "{}");
    const textPrompt = body.prompt || body.duvida || "Analisa esta planta e indica a viabilidade preliminar do PDM de Loulé.";
    const fileData = body.fileData;
    const mimeType = body.mimeType;

    // Monta a estrutura de parts esperada pela API
    const parts = [{ text: textPrompt }];

    if (fileData && mimeType) {
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: fileData
        }
      });
    }

    const systemInstructionText = `És o Arquiteto e Agente de Inteligência Estratégica Sénior do portal leonelmendes.com. O teu objetivo supremo é analisar plantas arquitetónicas, extratos de PDM ou layouts enviados pelos utilizadores, avaliando com rigor absoluto:
1. Ergonomia e Fluxo de Circulação / Enquadramento de Solo PDM
2. Aproveitamento de Espaço e Funcionalidade
3. Conformidade com Boas Práticas de Design/Arquitetura
4. Oportunidades de Otimização e Valorização

Formata a resposta de forma altamente profissional, usando tópicos claros e recomendações acionáveis.`;

    // Chamada REST limpa e compatível
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.7
        }
      })
    });

    const responseText = await response.text();
    
    if (!responseText) {
      throw new Error("A API da Google devolveu uma resposta vazia.");
    }

    const data = JSON.parse(responseText);

    if (data.error) {
      throw new Error(data.error.message || "Erro retornado pela API Gemini.");
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta gerada pelo modelo.";

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
};
