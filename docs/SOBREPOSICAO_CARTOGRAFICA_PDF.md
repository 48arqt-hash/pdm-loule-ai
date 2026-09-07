# Sobreposição cartográfica no relatório PDF

## Finalidade

O relatório inclui a vista aérea com o limite analisado. Quando existe uma fonte de imagem oficial do plano territorial aplicável, inclui também uma imagem dessa planta com o mesmo limite destacado e uma lista das interações territoriais devolvidas na consulta.

## Implementação atual

- **Loulé:** é usada prioritariamente a OrtoSAT 2023 publicada pela Câmara/DGT, uma ortofoto vertical. A Carta de Ordenamento do PDM é obtida no serviço ArcGIS municipal e recebe o limite cadastral DGT ou o limite manual assinalado a vermelho. A legenda textual indica apenas plano, classificação, uso do solo e condicionantes efetivamente devolvidos para a área.
- **Faro:** é consultada a Planta 1.1 — Modelo de Organização do Território do PDM, publicada pelo Município em WMS. A função consulta primeiro o WMS direto e usa o proxy municipal apenas como alternativa. O limite cadastral DGT ou o limite manual é desenhado a vermelho sobre a imagem oficial; a legenda oficial WMS é incluída quando o serviço a devolve. A legenda textual indica apenas plano, classificação, uso do solo e condicionantes efetivamente devolvidos para a área.
- **Outros concelhos:** a fotografia aérea e o limite analisado continuam a constar do PDF. Sem um serviço de imagem oficial confirmado, não é criada uma falsa planta PDM por cor ou inferência. A evidência disponível é apresentada na secção de enquadramento cartográfico, com a respetiva limitação.

## Leitura correta

A imagem é um apoio à pré-análise. Não confirma, por si só, extremos, área, titularidade, artigo matricial nem dispensa a consulta das plantas e regulamentos oficiais em vigor.
