# Guia da aba Variáveis de ambiente

> Parte do [Guia passo a passo do dashboard web](README.md).

Aba **somente leitura** — existe para conferir rapidamente quais variáveis de ambiente um projeto
espera, sem precisar abrir os arquivos `.env` no editor (e sem correr o risco de editar algo por
engano).

## O que aparece na tela

Um aviso fixo de "Somente leitura" no topo, seguido de uma tabela por arquivo de ambiente
encontrado, com duas colunas: **Variável** e **Valor**. Quando o nome de uma variável indica que
ela é sensível, o valor começa oculto com o badge **"Oculto (segredo)"** e um botão **Exibir**.
Depois de exibir, o botão muda para **Ocultar**, removendo novamente o valor da tela.

## Como funciona por trás

- O dashboard só olha para um conjunto fechado de arquivos: `.env`, `.env.local`,
  `.env.development`, `.env.test` e `.env.production`. Nenhum outro nome de arquivo é lido.
- Cada arquivo é resolvido e confirmado como estando dentro da pasta do projeto antes de ser
  aberto.
- O conteúdo é interpretado com um parser simples de "chave=valor", removendo aspas quando
  presentes.
- Para cada variável, o **nome** é comparado contra um padrão de palavras que costumam indicar
  segredo (`SECRET`, `TOKEN`, `PASSWORD`, `CREDENTIAL`, `PRIVATE`, nomes terminados em `_KEY`,
  `APIKEY`, etc.). Se bater, o valor real não faz parte da listagem inicial.
- Ao clicar em **Exibir**, o navegador solicita somente o arquivo e a variável escolhidos. O valor
  fica apenas no estado temporário da tela e é descartado ao clicar em **Ocultar**, atualizar a
  listagem, trocar de projeto ou sair da aba.

## Limites

- Não existe edição por aqui — é leitura pura, mesmo quando um segredo é exibido.
- Nenhum comando é executado.
- A opção **Exibir** deve ser usada com cuidado em compartilhamento de tela ou gravações.
- Se um projeto não tiver nenhum dos cinco arquivos reconhecidos, a aba simplesmente não mostra
  nenhuma tabela.

## Quando usar

Para conferir se uma variável esperada realmente existe configurada localmente, revisar rapidamente
um valor durante o desenvolvimento ou relembrar o nome de uma variável sem abrir o arquivo no
editor.
