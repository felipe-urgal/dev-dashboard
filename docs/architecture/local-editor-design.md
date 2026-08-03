# Abertura do editor local

## Objetivo

Permitir que o dashboard abra o projeto atual em um editor gráfico já
instalado no computador, preservando o modelo local e o catálogo fechado de
ações da API.

Esta entrega não lê nem escreve arquivos pelo navegador. A IDE embutida é uma
capacidade separada, planejada em
[`embedded-ide-ai-design.md`](./embedded-ide-ai-design.md), com Monaco, LSP e
assistência de IA local.

## Relação com a IDE embutida

A abertura externa continua sendo mantida mesmo depois da implementação da IDE:

- o botão atual permanece no cabeçalho do projeto;
- a futura aba **Editor** também oferece **Abrir no editor local**;
- Monaco cobre o fluxo integrado de arquivos, LSP e IA;
- o editor externo continua indicado para extensões, depuração e ferramentas
  que não façam parte do dashboard;
- nenhuma das duas opções transforma o navegador em um terminal livre.

A implementação da IDE foi dividida nas tasks 076–081. A IA gratuita padrão
será local e opcional, mediada pela API do dashboard; a ausência do runtime de
IA não bloqueia o editor nem o LSP.

## Contrato

- `GET /api/projects/:projectId/editors` lista somente os editores conhecidos
  cujo executável está disponível no `PATH` da API;
- `POST /api/projects/:projectId/editor` recebe apenas `editorId`;
- os IDs aceitos são `vscode`, `cursor`, `vscodium`, `sublime` e `zed`;
- o caminho do projeto nunca vem do navegador: a API o recupera do
  `ProjectStore`;
- `DEV_EDITOR` pode priorizar um item do catálogo pelo ID ou pelo nome do
  comando, sem autorizar um executável novo.

## Execução

A API resolve o executável no `PATH` e cria um processo destacado com:

```ts
spawn(executable, [project.path], {
  cwd: project.path,
  detached: true,
  shell: false,
  stdio: 'ignore',
});
```

Não há concatenação de shell, argumento adicional vindo do navegador,
terminal genérico, leitura de saída nem processo gerenciado de longa duração.
Falhas internas do processo são traduzidas para erros públicos sem expor
detalhes do ambiente.

## Interface

O cabeçalho do projeto mostra uma ação compacta. Com um único editor, o botão
abre diretamente nele; com mais de um, aparece um seletor. Sem editor
compatível, a ação permanece desabilitada e informa que o comando deve estar
no `PATH` da API.

## Limitações

- a detecção considera executáveis disponíveis no `PATH` do processo da API;
- aliases, funções de shell e comandos configurados livremente não são
  aceitos;
- a compatibilidade oficial permanece Linux; macOS e Windows continuam
  dependentes de uma estratégia de distribuição e processo própria;
- abrir o editor externo não fornece arquivos, LSP ou contexto à futura IA do
  dashboard; esses recursos pertencem exclusivamente à IDE embutida.
