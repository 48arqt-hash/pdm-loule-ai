# Custos operacionais por análise

Este protótipo regista nos logs o modelo e os tokens de cada análise. Antes de lançar, copie esses números para uma folha de cálculo e calcule o custo real. Não fixe o preço com base em estimativas de marketing.

## Fórmula

`custo por pedido = IA + armazenamento + transferência + email + geração de PDF + comissão de pagamento + suporte + impostos não recuperáveis`

`preço mínimo sem IVA = custo por pedido / (1 - margem alvo)`

Exemplo: se o custo total for 1,20 EUR e a margem alvo for 80%, o preço mínimo sem IVA é 6,00 EUR. A 10,00 EUR, ainda há margem para suporte, reanálises e revisão humana.

## Registo recomendado

| Campo | Medir em cada pedido |
|---|---|
| Modelo | Variável `GEMINI_MODEL` |
| Tokens de entrada e saída | Log `analysis_usage` |
| Nº de páginas e tamanho dos PDFs | No pedido |
| Custo do modelo | Tabela do fornecedor no dia da medição |
| Comissão do pagamento | Contrato do operador |
| Reanálises e tempo de suporte | Registo mensal |

## Regras comerciais iniciais

- Cobrar apenas depois de o pagamento estar confirmado; o ZIP atual não contém essa integração.
- O proprietário pode usar o botão **Acesso profissional** com um código guardado apenas nas variáveis do Netlify. Esse acesso cria uma sessão de oito horas e não expõe o código no browser.
- Limitar a quatro documentos e 10 MB por ficheiro, como já faz a função.
- A consulta de mapa/cadastro não chama o modelo de IA; use-a como etapa de qualificação de baixo custo. A pré-análise redigida pelo modelo só deve avançar após pagamento ou acesso profissional.
- Cobrar suplementarmente por revisão humana, urgência ou documentação adicional.
- Definir uma retenção curta para os documentos e informar o cliente antes do upload.
