# Envio de relatórios por e-mail

O site envia o relatório em PDF através do Resend. A chave nunca é colocada no `index.html` nem no GitHub.

## Configuração de teste

1. Criar conta em https://resend.com e criar uma API key.
2. Na Netlify, em **Project configuration > Environment variables**, criar:
   - `RESEND_API_KEY` - a chave iniciada por `re_`;
   - `REPORT_FROM_EMAIL` - para teste, usar o remetente autorizado indicado pelo Resend; em produção, usar por exemplo `Relatórios PDM <relatorios@seudominio.pt>`;
   - `REPORT_OWNER_EMAIL` - e-mail que recebe cópia oculta de cada envio (opcional, mas recomendado).
3. Fazer novo deploy na Netlify.
4. Gerar uma análise e clicar em **Enviar PDF por e-mail**.

## Produção

Antes de enviar para clientes, verificar o domínio no Resend e configurar os registos DNS solicitados. Sem domínio verificado, o Resend pode limitar o envio de teste.

## Segurança

- O envio requer o mesmo acesso profissional usado na análise.
- O relatório é enviado ao e-mail preenchido no formulário; a cópia oculta só é enviada se `REPORT_OWNER_EMAIL` estiver configurado.
- Não usar o endereço pessoal de um cliente como remetente.
