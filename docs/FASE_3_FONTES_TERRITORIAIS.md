# Fase 3 — rigor das fontes territoriais

## O que esta versão passa a fazer

- Distingue no resultado o que é devolvido por uma feição vetorial municipal,
  o que é leitura visual e o que é enquadramento nacional da DGT.
- Em Loulé, consulta os planos eficazes, o zonamento do PU de Quarteira
  Norte-Nordeste e duas áreas vetoriais de medidas preventivas de Quarteira.
- Em Faro, mantém a leitura visual oficial da Planta 1.1 como apoio ao técnico,
  mas bloqueia automaticamente índices, pisos, cérceas e áreas máximas enquanto
  não existir um atributo vetorial público confirmado.
- Mantém as regras regulamentares com artigo e página apenas quando a respetiva
  classe chega à função por fonte apta para esse efeito.

## Regra de comunicação com o cliente

O relatório deve usar uma destas designações:

1. **Confirmado por camada vetorial municipal** — pode apresentar o atributo e
   as regras diretamente ligadas a esse atributo;
2. **Referência regulamentar a confirmar** — aplicável em Loulé quando a CRUS
   apresenta uma designação compatível, mas a Carta de Ordenamento do PDM geral
   não é publicada como feição vetorial com atributo de zona;
3. **Leitura cartográfica preliminar** — visualização WMS/PDF. Nunca é usada
   para calcular automaticamente parâmetros urbanísticos.

## Configuração futura de Faro

Só quando o Município de Faro ou outra entidade pública disponibilizar uma
camada vetorial com atributos textuais de classe/categoria, preencher na Netlify
as variáveis `FARO_PDM_WFS_URL` e `FARO_PDM_WFS_TYPENAME` (preferencial), ou
`FARO_PDM_ORDERING_QUERY_URL`. Antes disso, deixá-las vazias. Não usar URLs
inferidas, cópias não oficiais, nem códigos sem legenda publicada.

## Validação antes de anunciar parâmetros automáticos

1. Escolher 10 prédios, incluindo fronteiras de classe e zonas com PU/PP.
2. Comparar o resultado da ferramenta com a planta, legenda e regulamento em
   vigor no geoportal municipal.
3. Registar a versão/diploma da camada e a data da validação.
4. Só depois ativar regras quantitativas para essa fonte e concelho.
