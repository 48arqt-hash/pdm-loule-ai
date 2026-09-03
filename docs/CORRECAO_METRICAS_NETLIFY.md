# Correção de métricas da Netlify Database

## Se aparecer "Não foi possível consultar as métricas"

1. Na Netlify, abrir o projeto correto;
2. Na barra lateral do projeto, procurar **Data & Storage → Database**. Em
   algumas contas esta área aparece simplesmente como **Database**, fora de
   “Project configuration”;
3. Se a opção não aparecer, a Netlify Database ainda não está disponível nessa
   equipa/plano ou a conta não tem permissões de Developer/Owner. Neste caso,
   a funcionalidade de métricas fica desativada sem afetar o site;
4. Confirmar em **Environment variables** uma das variáveis de ligação no
   contexto **Production**: `NETLIFY_DB_URL` (base nativa atual) ou
   `NETLIFY_DATABASE_URL` (integração Neon anterior);
5. Abrir **Deploys** e usar **Trigger deploy → Clear cache and deploy site**;
6. Depois do deploy terminar, abrir o site, validar o acesso profissional e
   voltar a carregar em **Ver métricas do trial**.

Se continuar a falhar, abrir **Logs & metrics → Functions**, escolher a função
`metricas-operacao` e copiar apenas a linha que começa por
`operation_metrics_error`. Essa linha não deve conter chaves, passwords ou
e-mails e permite identificar se o problema é ligação, permissões ou esquema.
