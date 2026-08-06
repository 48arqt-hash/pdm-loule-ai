const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 1. Processar com Gemini AI
    const systemInstruction = `
Você é um assistente técnico especialista no PDM de Loulé, trabalhando para o gabinete do Arq. Leonel Mendes.
Análise preliminar de extratos de plantas da CM Loulé (Solo Urbano, RAN, REN, Índices urbanísticos).
Responda em português de Portugal. Informe que este relatório é informativo por IA (10€) e recomende a validação presencial com o Arq. Leonel Mendes.
`;

    let parts = [];
    if (data.pdfBase64) {
      parts.push({
        inlineData: { mimeType: "application/pdf", data: data.pdfBase64 }
      });
    }

    if (data.chatHistory && data.chatHistory.length > 0) {
      let contexto = "Histórico:\n";
      data.chatHistory.forEach(m => { contexto += `${m.role}: ${m.text}\n`; });
      parts.push(contexto);
    }

    parts.push(`${systemInstruction}\n\nPergunta: ${data.userMessage}`);

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();

    // 2. Enviar emails de confirmação (Apenas na 1ª análise da sessão)
    if (data.pdfBase64 && data.email) {
      // Email para o Cliente
      await resend.emails.send({
        from: 'Gabinete Arq. Leonel Mendes <geral@leonelmendes.com>',
        to: data.email,
        subject: 'Confirmação de Pedido: Análise PDM Loulé (10€)',
        html: `
          <h3>Olá ${data.nome},</h3>
          <p>Confirmamos a receção do seu pedido de análise automática do PDM de Loulé.</p>
          <p><strong>Dados de Faturação:</strong><br>
          NIF: ${data.nif || 'Consumidor Final'}<br>
          Valor: 10.00€ (IVA incluído)</p>
          <p>A sua fatura simplificada será processada e enviada brevemente.</p>
          <hr>
          <p>Atenciosamente,<br>Arq. Leonel Mendes</p>
        `
      });

      // Email para o Arquiteto (Notificação de Venda)
      await resend.emails.send({
        from: 'Sistema PDM <geral@leonelmendes.com>',
        to: 'geral@leonelmendes.com',
        subject: `⚡ Nova Análise PDM (10€) - ${data.nome}`,
        html: `
          <h3>Nova Transação Efetuada</h3>
          <ul>
            <li><strong>Cliente:</strong> ${data.nome}</li>
            <li><strong>Email:</strong> ${data.email}</li>
            <li><strong>Telemóvel:</strong> ${data.telefone}</li>
            <li><strong>NIF:</strong> ${data.nif || 'Não fornecido'}</li>
            <li><strong>Valor Faturado:</strong> 10.00€</li>
          </ul>
        `
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: text })
    };

  } catch (error) {
    console.error("Erro na função:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erro ao processar o pedido." })
    };
  }
};