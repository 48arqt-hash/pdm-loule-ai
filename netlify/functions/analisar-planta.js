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
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Chave GEMINI_API_KEY não configurada no Netlify." }) };
  }

  try {
    const { prompt, fileData, mimeType, duvida } = JSON.parse(event.body || "{}");
    const textPrompt = prompt || duvida || "Analisa esta planta e indica a viabilidade preliminar do PDM de Loulé.";

    // Monta os conteúdos para o formato suportado
    const inputContents = [];
    
    if (fileData && mimeType) {
      inputContents.push({
        inlineData: { mimeType, data: fileData }
      });
    }
    inputContents.push({ text: textPrompt });

    const systemInstruction = `És o Arquiteto e Agente de Inteligência Estratégica Sénior do portal leonelmendes.com. O teu objetivo supremo é analisar plantas arquitetónicas, extratos de PDM ou layouts enviados pelos utilizadores, avaliando com rigor absoluto:
1. Ergonomia e Fluxo de Circulação / Enquadramento de Solo PDM
2. Aproveitamento de Espaço e Funcionalidade
3. Conformidade com Boas Práticas de Design/Arquitetura
4. Oportunidades de Otimização e Valorização

Formata a resposta de forma altamente profissional, usando tópicos claros e recomendações acionáveis.`;

    // Chamada à nova Interactions API do Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1alpha/interactions:generate?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-2.5-flash",
        systemInstruction: { parts: [{ text: systemInstruction }] },
        input: {
          parts: inputContents
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      // Tenta fallback para o modelo padrão se a Interactions API requerer estrutura simplificada
      const fallbackResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: textPrompt }] }]
        })
      });
      const fallbackData = await fallbackResponse.json();
      if (fallbackData.error) throw new Error(data.error.message || fallbackData.error.message);
      
      const text = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";
      return { statusCode: 200, headers, body: JSON.stringify({ resultado: text, relatorio: text, resposta: text }) };
    }

    // Extrai o texto da resposta da Interactions API
    const aiText = data.output?.flatMap(o => o.parts || []).map(p => p.text).join('') 
                || data.candidates?.[0]?.content?.parts?.[0]?.text 
                || "Análise concluída sem texto gerado.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ resultado: aiText, relatorio: aiText, resposta: aiText })
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Erro ao processar a planta com a IA: " + error.message })
    };
  }
};
