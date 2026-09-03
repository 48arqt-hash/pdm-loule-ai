# Operação do trial e rentabilidade

## O que é registado

Quando `NETLIFY_DATABASE_URL` está configurada, cada pré-análise guarda apenas:

- identificador técnico do pedido;
- data, concelho, estado e número de documentos;
- modelo, tokens de entrada/saída e duração;
- hash não reversível do e-mail, usado apenas para contar utilizações distintas.

Não são guardados nesta tabela o e-mail em claro, textos do cliente, conteúdo dos documentos ou o relatório.

## Ativação inicial

1. Na Netlify, confirme que a integração **Database / Neon** está ativa no projeto.
2. Confirme que a variável `NETLIFY_DATABASE_URL` existe em Production.
3. Faça deploy deste código.
4. Entre no painel **Acesso profissional** no site e escolha **Ver métricas do trial**.

O código cria automaticamente a tabela de métricas no primeiro pedido. Não é necessário executar uma migração manual.

## Durante a fase gratuita

Mantenha:

```text
ENFORCE_TRIAL_LIMIT=false
```

Assim mede procura e custo sem bloquear clientes. Reveja semanalmente análises concluídas, tokens médios e duração média.

## Antes de cobrar

Depois de ter dados suficientes, ative:

```text
ENFORCE_TRIAL_LIMIT=true
TRIAL_MAX_ANALYSES=3
```

O limite é por e-mail em períodos de 30 dias. O acesso profissional do Atelier não fica limitado.

O preço deve ser definido depois de observar o custo médio real por análise: tokens, tempo de função, PDF, e-mail e tempo técnico humano. O limite não é um sistema de pagamento; a integração de pagamento só deve ser adicionada quando o relatório e as fontes territoriais estiverem estabilizados.
