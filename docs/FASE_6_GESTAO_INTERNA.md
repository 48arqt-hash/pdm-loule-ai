# Fase 6 — gestão interna

## Painel profissional

Depois de validar o acesso profissional, o botão **Ver métricas do trial**
mostra a atividade agregada dos últimos 30 dias:

- pré-análises iniciadas e concluídas;
- contactos distintos em pré-análises;
- consumo médio de tokens e tempo médio;
- pedidos de reunião;
- pedidos de orçamento;
- estimativas de custo enviadas;
- reenvios de relatórios.

## Privacidade

A base guarda apenas o tipo de evento, data, estado, concelho quando aplicável,
contagem de documentos e um identificador criptográfico de e-mail. Não guarda
nome, telefone, e-mail em claro, documentos, texto do pedido, relatório ou
valor estimado. Os pedidos completos continuam a chegar ao e-mail do atelier,
que é o canal de tratamento operacional.

## Necessário na Netlify

A variável `NETLIFY_DATABASE_URL` tem de estar ativa para o painel apresentar
dados. Enquanto não estiver, o site e os e-mails funcionam normalmente; apenas
o painel mostrará que as métricas ainda não estão disponíveis.
