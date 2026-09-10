# Dossier Digital privado

Cada pré-análise pode criar um dossier com o relatório, localização, estimativa opcional e documentos acrescentados posteriormente. O cliente recebe um link privado no e-mail; não existe uma lista pública de dossiers.

## Ativação na Netlify

1. No projeto, abra **Data & Storage → Database** e crie/associe a Netlify Database. A Netlify cria `NETLIFY_DB_URL`; não deve copiar nem publicar esse valor.
2. Em **Project configuration → Environment variables**, crie `DOSSIER_ACCESS_SECRET` como **secret** e use uma frase aleatória com pelo menos 32 caracteres.
3. Confirme `PUBLIC_SITE_URL=https://leonelmendes.com`.
4. Faça novo deploy após gravar as variáveis.

Se a base ainda não estiver ligada, as pré-análises e os e-mails continuam a funcionar; apenas não é criado o dossier nem o link privado.

## Segurança e conservação

- O token do link é aleatório; na base apenas é guardado o seu hash.
- Os documentos são guardados num armazenamento privado da Netlify e só a função os associa ao dossier autenticado por token.
- O link é uma credencial: o cliente não o deve reencaminhar.
- A política de privacidade do site prevê conservação até 24 meses, salvo pedido de eliminação, relação profissional ou obrigação legal.
- Antes de tornar o Dossier disponível em outro domínio, esse domínio deve chamar funções privadas com autenticação própria; não criar uma cópia pública da base de dados.
