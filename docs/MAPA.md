# Consulta por mapa e cadastro

O primeiro resultado é geográfico e preliminar. O utilizador seleciona um ponto; o sistema consulta a Carta Cadastral Digital e a Carta do Regime de Uso do Solo da DGT, bem como os planos municipais em vigor publicados pela Câmara Municipal de Loulé.

## Fontes configuradas

- Cadastro e regime do solo: OGC API da Direção-Geral do Território, coleções vetoriais descobertas pelo serviço em tempo de execução.
- Planos municipais: ArcGIS REST da Câmara Municipal de Loulé, serviço `eploc_pmots_vigor`, camada 15.
- As cartas PDM `Base_PDM` da Câmara são raster; não são usadas para inventar classificações sem atributos vetoriais.

## Cobertura Algarve

A aplicação reconhece os 16 concelhos do Algarve através da CAOP e, como segunda fonte, consulta a CRUS vetorial da Direção-Geral do Território. Quando a CRUS devolve uma designação legível, o relatório mostra-a como **Classificação do solo — PDM de [concelho] (CRUS oficial DGT)**, sem expor códigos técnicos isolados ao cliente.

Esta cobertura identifica a classe no mapa. A apresentação de índices, cérceas, usos, loteamentos, planos de urbanização e planos de pormenor é deliberadamente separada: só é ativada após validação do respetivo regulamento e camada municipal. Atualmente, Loulé, Faro e Albufeira têm integrações regulamentares/camadas específicas; os restantes concelhos ficam preparados para integração progressiva, sem inferir parâmetros a partir de cor ou de um código.

## Limites importantes

- A seleção no mapa não confirma titularidade nem substitui registo predial.
- A geometria apresentada depende da disponibilidade e atualização da fonte pública.
- A aplicação apresenta sempre fontes, data da consulta e aviso de pré-análise.
- Antes de lançamento comercial, confirmar com a Câmara/DGT as condições de reutilização, disponibilidade e limites de uso dos serviços.
