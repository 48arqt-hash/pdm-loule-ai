# Validação da pré-análise urbanística

Use esta grelha antes de considerar uma versão pronta para clientes. Cada teste
deve ser feito no site publicado, aguardando o fim do deploy da Netlify.

## O que tem de acontecer em qualquer análise

1. O limite selecionado no mapa deve surgir na vista aérea do relatório.
2. Quando exista uma carta municipal configurada, deve surgir uma segunda
   imagem da planta de ordenamento com o mesmo limite desenhado a vermelho.
3. A secção **Zona e enquadramento territorial identificado** deve indicar a
   fonte da classificação, sem códigos numéricos isolados.
4. A secção **Regras aplicáveis à pretensão** deve começar pela conclusão
   direta sobre a intenção do cliente e, abaixo, indicar artigos/fontes quando
   existirem dados suficientes.
5. Se uma parcela cruzar mais de uma classe e não houver ponto de implantação,
   o relatório deve dizer que a conclusão depende da zona de implantação -
   nunca pode aplicar um índice a todo o prédio.

## Casos prioritários

### 1. Loulé - solo agrícola/RAN

Use uma parcela já conhecida no concelho, por exemplo a localização próxima de
**37.146439, -8.039698**, apenas para controlo interno.

Confirme:

- concelho identificado como Loulé pela CAOP;
- segunda imagem: Carta de Ordenamento do PDM de Loulé;
- polígono vermelho visível nas duas imagens;
- se a fonte indicar RAN/solo agrícola e o pedido for uma moradia nova, a
  conclusão deve dizer que não existe direito automático a construir;
- se houver ruína/preexistência comprovada, deve abrir um cenário separado de
  reconstrução, alteração ou ampliação, sem a tratar como confirmada sem prova.

### 2. Faro - zona urbana e zona rústica

Faça dois ensaios em parcelas com cadastro visível: um urbano e outro rústico.

Confirme:

- concelho Faro e Planta 1.1 do PDM no relatório;
- polígono destacado na carta PDM;
- regras quantitativas apenas quando a camada municipal devolver atributo
  textual ou quando o regulamento aplicável estiver identificado;
- nenhuma categoria pode ser deduzida só por cor, sem legenda ou atributo.

### 3. Albufeira - loteamento conhecido

Selecione um lote cujo alvará seja conhecido e teste uma intenção de moradia.

Confirme:

- referência cadastral e classificação CRUS quando disponíveis;
- aviso claro de que o alvará/loteamento prevalece para os parâmetros concretos;
- o sistema nunca deve afirmar o número do alvará sem camada municipal ou
  documento que o identifique.

## Como registar uma falha

Guarde o PDF, uma captura do mapa e indique: pesquisa/coordenadas, município,
pretensão escolhida e hora aproximada. Isto permite corrigir a fonte certa
(cadastro, limite administrativo, carta PDM ou regulamento) sem introduzir uma
regra por suposição.
