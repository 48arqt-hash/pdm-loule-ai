import { google } from 'googleapis';

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { 
      servico,
      nome, 
      email, 
      telefone,
      nif, 
      morada_faturacao, 
      dataAgendamento, 
      pdfBase64 
    } = JSON.parse(event.body || '{}');

    const MORADA_REUNIAO = "Av. José da Costa Mealha n.º133, 8100-500 Loulé";
    let agendamentoSucesso = false;

    // 1. Processar Agendamento no Google Calendar APENAS se for Reunião Presencial
    if (servico === 'reuniao_presencial' && dataAgendamento) {
      const auth = new google.auth.JWT(
        process.env.GOOGLE_CLIENT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/calendar']
      );

      const calendar = google.calendar({ version: 'v3', auth });
      const calendarId = 'geral@leonelmendes.com';

      const inicioSlot = new Date(dataAgendamento);
      const fimSlot = new Date(inicioSlot.getTime() + 60 * 60 * 1000);

      // Consulta de disponibilidade
      const checkBusy = await calendar.freebusy.query({
        requestBody: {
          timeMin: inicioSlot.toISOString(),
          timeMax: fimSlot.toISOString(),
          items: [{ id: calendarId }]
        }
      });

      if (checkBusy.data.calendars[calendarId].busy.length > 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'O horário selecionado para a reunião com o Arq. Leonel Mendes já está ocupado. Escolha outro horário.' })
        };
      }

      // Criar evento pendente
      const eventResource = {
        summary: `[PENDENTE APROVAÇÃO] Reunião Presencial - Arq. Leonel Mendes / ${nome}`,
        location: MORADA_REUNIAO,
        description: `
SERVIÇO: Reunião Presencial de Consulta Técnica
CLIENTE: ${nome} | E-mail: ${email} | Tel: ${telefone}
FATURAÇÃO: NIF: ${nif} | Morada: ${morada_faturacao}

LOCAL: ${MORADA_REUNIAO}
        `,
        start: { dateTime: inicioSlot.toISOString() },
        end: { dateTime: fimSlot.toISOString() },
        attendees: [
          { email: 'geral@leonelmendes.com', responseStatus: 'accepted' },
          { email: email, responseStatus: 'needsAction' }
        ],
        status: 'tentative'
      };

      await calendar.events.insert({
        calendarId: calendarId,
        requestBody: eventResource,
        sendUpdates: 'all'
      });

      agendamentoSucesso = true;
    }

    // 2. Análise do PDF via Gemini 3.6 Flash (Executa para ambos os serviços)
    const apiKey = process.env.GEMINI_API_KEY;
    let analiseIA = "Análise em processamento.";

    if (apiKey && pdfBase64) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
      
      const promptText = `Você é um arquiteto e consultor urbanístico sénior especialista em Loulé. Analise este extrato do PDM focando na VIABILIDADE CONSTRUTIVA: o que se pode construir, índices, cércea, pisos e condicionantes.`;

      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
              { text: promptText }
            ]
          }],
          generationConfig: { temperature: 0.2 }
        })
      });

      const data = await apiResponse.json();
      if (apiResponse.ok) {
        analiseIA = data.candidates?.[0]?.content?.parts?.[0]?.text || analiseIA;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: servico === 'reuniao_presencial' 
          ? 'Pedido de reunião com o Arq. Leonel Mendes submetido com sucesso. Os detalhes do custo e pagamento foram associados ao seu NIF.'
          : 'Análise do PDM concluída com sucesso.',
        reuniaoAgendada: agendamentoSucesso,
        reply: analiseIA
      })
    };

  } catch (error) {
    console.error("Erro interno:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Erro ao processar o pedido.' })
    };
  }
};
