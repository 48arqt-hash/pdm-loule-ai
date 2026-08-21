# Camadas oficiais e base territorial

O relatório só pode aplicar regras quantitativas quando a categoria de solo for devolvida por uma camada vetorial oficial. Uma imagem, um PDF ou uma camada WMS servem para consulta visual, mas não devem determinar automaticamente uma regra urbanística.

## Arquitetura

1. A função `consultar-parcela` identifica a parcela no cadastro DGT e o concelho na CAOP.
2. Consulta a camada vetorial municipal de ordenamento por ponto, quando estiver configurada.
3. Guarda a designação da classe/categoria, o identificador da feição, a fonte e a data de consulta.
4. A biblioteca `netlify/functions/lib/territorial-data.js` associa essa categoria às regras curadas do regulamento, sempre com artigo, página, versão e URL oficiais.
5. A IA recebe apenas os dados já cruzados; não deve escolher a categoria por inferência.

## Faro — primeira integração regional

Base regulamentar preparada a partir da Revisão do PDM de Faro, Aviso n.º 20948/2024/2, publicado em 20-09-2024:

- Regulamento: <https://mapas.cm-faro.pt/docs/pdm_2024/Regulamento.pdf>
- Organização do modelo territorial: <https://mapas.cm-faro.pt/geoportal/docs/pdm_2024/1_1.pdf>
- Geoportal: <https://mapas.cm-faro.pt/geoportal/mapa/pmot>

Para ativar o cruzamento automático, configurar na Netlify a variável `FARO_PDM_ORDERING_QUERY_URL` com o URL completo do endpoint `query` da camada de ordenamento (ArcGIS Feature/Map Service). A função acrescenta os parâmetros de consulta espacial necessários. O URL deve permitir `POST`/`GET` público, devolver JSON e disponibilizar os atributos da categoria de solo.

### Estado de confirmação — 21-08-2026

O geoportal municipal disponibiliza a Planta 1.1 — Modelo de Organização do Território como WMS `pdm2024:1_1_P_Ordenamento_MOT`, no endereço `https://mapas.cm-faro.pt/geoserver/wms`. A integração consulta agora o WMS por ponto (`GetFeatureInfo`) antes de recorrer a uma fonte externa. Quando a camada devolver a classe/categoria, o relatório associa-a às regras da base regulamentar e identifica o resultado como **interpretação cartográfica preliminar**. A confirmação vetorial continua a exigir uma camada WFS/GeoPackage/Shapefile/Feature Service do Município de Faro.

Exemplo de formato esperado:

`https://servidor.exemplo.pt/arcgis/rest/services/PDM/MapServer/0/query`

Antes de publicar, validar um conjunto de 10 localizações contra o geoportal e plantas oficiais, incluindo situações em fronteira e zonas abrangidas por PU/PP. A camada municipal tem de indicar versão/diploma e data de vigência.

## IDEAlg / condicionantes regionais

A IDEAlg é uma fonte de referência para condicionantes regionais. Deve ser integrada por tema (REN, RAN, risco, património, orla costeira) apenas por serviços ou ficheiros oficiais que permitam consulta de atributos. Para cada tema guardar: entidade produtora, diploma, data, licença e precisão/escala.

Uma coincidência de fronteira ou uma camada digitalizada a partir de carta analógica deve continuar marcada como `Necessita validação técnica`.
# Leitura da Planta de Ordenamento de Faro

O geoportal de Faro disponibiliza a Planta 1.1 - Modelo de Organização do Território por WMS, mas não expõe atributos consultáveis de forma fiável para todas as manchas. Quando a parcela está em Faro, a pré-análise obtém dois excertos oficiais dessa planta, centrados no ponto selecionado: um excerto muito aproximado para leitura da assinatura cartográfica central e outro de enquadramento, juntamente com a legenda oficial. A categoria resultante é sempre apresentada como **interpretação por cor/legenda - necessita verificação**, nunca como atributo vetorial confirmado.

As regras reproduzidas no relatório são limitadas à categoria identificada e à biblioteca regulamentar com artigo e página do Regulamento do PDM de Faro (Aviso n.º 20948/2024/2, 20-09-2024). A análise deve assinalar quando uma fronteira de mancha, a escala ou a legibilidade da legenda impedem essa leitura.
