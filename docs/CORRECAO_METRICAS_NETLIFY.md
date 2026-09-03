# Correção de métricas da Netlify Database

## Se aparecer "Não foi possível consultar as métricas"

1. Na Netlify, abrir o projeto correto;
2. Confirmar em **Project configuration → Database** que existe uma base de
   dados ativa e ligada ao projeto;
3. Confirmar em **Environment variables** a variável
   `NETLIFY_DATABASE_URL` no contexto **Production**;
4. Abrir **Deploys** e usar **Trigger deploy → Clear cache and deploy site**;
5. Depois do deploy terminar, abrir o site, validar o acesso profissional e
   voltar a carregar em **Ver métricas do trial**.

Se continuar a falhar, abrir **Logs & metrics → Functions**, escolher a função
`metricas-operacao` e copiar apenas a linha que começa por
`operation_metrics_error`. Essa linha não deve conter chaves, passwords ou
e-mails e permite identificar se o problema é ligação, permissões ou esquema.
