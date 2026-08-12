exports.handler = async (event) => {
  // Configuração dos cabeçalhos CORS
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
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Método não permitido." }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: "Variável GEMINI_API_KEY não configurada no Netlify." }) 
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const promptText = body.prompt || body.duvida || "Analise a viabilidade preliminar do PDM de Loulé para esta submissão.";

    // Chamada direta à API do Gemini via fetch nativo
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptText }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || "Erro de resposta da API Google");
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta gerada.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ relatorio: aiText, resposta: aiText })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
