import { GoogleGenAI } from "@google/genai";

export async function handler(event) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { prompt, fileData, mimeType } = JSON.parse(event.body);
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // Prepara o objeto da imagem/ficheiro para o Gemini processar visualmente
        const imagePart = {
            inlineData: {
                data: fileData,
                mimeType: mimeType
            },
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Modelo multimodal excelente para análise de imagens/plantas
            contents: [prompt, imagePart],
            config: {
                temperature: 0.7,
                systemInstruction: `És o Arquiteto e Agente de Inteligência Estratégica Sénior do portal leonelmendes.com. O teu objetivo supremo é analisar plantas arquitetónicas ou layouts enviados pelos utilizadores, avaliando com rigor absoluto:
1. Ergonomia e Fluxo de Circulação
2. Aproveitamento de Espaço e Funcionalidade
3. Conformidade com Boas Práticas de Design/Arquitetura
4. Oportunidades de Otimização e Valorização

Formata a resposta de forma altamente profissional, usando tópicos claros e recomendações acionáveis.`
            }
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resultado: response.text })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Erro ao processar a planta com a IA." })
        };
    }
};
