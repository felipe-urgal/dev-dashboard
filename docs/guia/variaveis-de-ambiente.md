# Guia da aba Variáveis de ambiente

> Parte do [Guia passo a passo do dashboard web](README.md).

Aba **somente leitura** — existe para conferir rapidamente quais variáveis de ambiente um projeto
espera, sem precisar abrir os arquivos `.env` no editor (e sem correr o risco de editar algo por
engano).

## O que aparece na tela

Um aviso fixo de "Somente leitura" no topo, seguido de uma tabela por arquivo de ambiente
encontrado, com duas colunas: **Variável** e **Valor**. Quando o nome de uma variável indica que
ela é sensível, o valor não é mostrado — aparece um badge **"Oculto (segredo)"** no lugar.

## Como funciona por trás

- O dashboard só olha para um conjunto fechado de arquivos: `.env`, `.env.local`,
  `.env.development`, `.env.test` e `.env.production`. Nenhum outro nome de arquivo é lido.
- Cada arquivo é resolvido e confirmado como estando dentro da pasta do projeto antes de ser
  aberto (proteção contra links simbólicos apontando para fora).
- O conteúdo é interpretado com um parser simples de "chave=valor", removendo aspas quando
  presentes.
- Para cada variável, o **nome** é comparado contra um padrão de palavras que costumam indicar
  segredo (`SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL`, `PRIVATE`, nomes terminados em `_KEY`,
  `APIKEY`, etc.). Se bater, o valor real **nunca é enviado para o navegador** — só o nome da
  variável e a marcação de que é sensível.

## Limites

- Não existe edição por aqui — é leitura pura, mesmo para valores considerados não sensíveis.
- Nenhum comando é executado.
- Se um projeto não tiver nenhum dos cinco arquivos reconhecidos, a aba simplesmente não mostra
  nenhuma tabela.

## Quando usar

Para conferir de forma segura (sem vazar segredos para a tela) se uma variável esperada por um
`.env.example` realmente existe configurada localmente, ou para relembrar rapidamente o nome de
uma variável sem abrir o arquivo no editor.
