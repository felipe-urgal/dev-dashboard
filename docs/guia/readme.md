# Guia da aba README

> Parte do [Guia passo a passo do dashboard web](README.md).

Mostra a documentação Markdown que já existe dentro do próprio projeto, sem precisar abrir o
editor de código ou um terminal.

## O que aparece na tela

A aba usa um workspace de documentação com três áreas:

- **Arquivos**, à esquerda: lista vertical dos Markdown encontrados. Arquivos do projeto ficam em
  destaque e caminhos sob `node_modules`, quando retornados pela leitura atual, aparecem agrupados
  em **Dependências**.
- **Documento**, ao centro: exibe o caminho do arquivo selecionado e renderiza títulos,
  parágrafos, listas, citações, divisores, tabelas e blocos de código com botão **Copiar**.
- **Neste documento**, à direita: índice gerado a partir dos headings do Markdown. Selecionar um
  item leva diretamente ao título correspondente no documento.

O botão de atualização fica junto ao explorador de arquivos e relê a documentação do disco sem
recarregar a aplicação inteira. Em larguras menores o índice lateral é ocultado primeiro; no modo
compacto, o explorador fica acima do documento para preservar a área de leitura.

## Como funciona por trás

1. O dashboard solicita ao backend a lista de arquivos Markdown reconhecidos para o projeto.
2. O primeiro arquivo retornado é aberto automaticamente; selecionar outro item apenas troca o
   documento em leitura.
3. O conteúdo é interpretado localmente pelo parser já usado pela aba. O mesmo resultado do parser
   alimenta o documento e o índice lateral de headings, sem um segundo contrato de API.
4. Links externos seguros continuam abrindo fora do dashboard; esquemas não permitidos não são
   transformados em links clicáveis.
5. Estados de loading, erro/retry, lista truncada e ausência de arquivos continuam explícitos na
   própria superfície.

A aba **nunca executa nenhum comando nem edita o arquivo**. O caminho e o conteúdo continuam vindo
das APIs existentes de documentação do projeto; o redesign altera apenas a organização e a
navegação da interface.

## Quando usar

Para consultar rapidamente instruções de setup, convenções do projeto ou notas de arquitetura que
a equipe já documentou, navegando entre arquivos e seções sem sair do dashboard.
