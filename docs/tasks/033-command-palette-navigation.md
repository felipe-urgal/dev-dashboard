# Task 033 — Command palette de navegação

## Status

Concluída.

## Objetivo

Adicionar uma paleta global, aberta por `Cmd/Ctrl+K`, para localizar e
navegar por páginas, workspaces, projetos detectados e áreas do projeto
atual sem executar ações privilegiadas.

## Escopo entregue

- `CommandPalette.vue` montado uma única vez em `App.vue`, com abertura pelo
  atalho global ou pelo botão da barra superior, fechamento por `Esc` e por
  clique no fundo do overlay.
- Catálogo client-side de Visão geral, Atividade, Processos, workspaces,
  todos os projetos já conhecidos pelo `dashboardStore` e, quando há um
  projeto aberto, suas áreas Visão geral, Git, Testes, Banco de dados e
  Scripts.
- Busca incremental por substring, sem distinção de maiúsculas ou acentos,
  incluindo nome e caminho de workspaces e projetos.
- Navegação circular com setas, seleção com `Enter`, indicação visual e
  semântica de opção ativa, foco inicial na busca e devolução do foco ao
  elemento anterior ao fechar.
- Proteção para não capturar `Cmd/Ctrl+K` enquanto o usuário escreve em
  `input`, `textarea`, `select` ou elemento editável.
- `knownProjects` no store para a paleta enxergar projetos já descobertos em
  qualquer workspace, não somente a lista do workspace selecionado.
- Testes montados de abertura/fechamento, conflito com campo de texto,
  filtro, teclado, roteamento e áreas do projeto; smoke E2E da navegação até
  o projeto de fixture.

## Decisões e limitações

- A paleta somente chama o Vue Router. Nenhuma chamada à API ou execução de
  comando foi adicionada nesta fatia.
- Um workspace leva à seção Repositórios do dashboard. Não há hoje uma rota
  exclusiva por workspace; trocar o workspace ativo dentro da paleta
  exigiria misturar navegação com uma operação de estado/scan e ficou fora
  desta entrega.
- A lista contém projetos que o store já conhece. A paleta não dispara scans
  adicionais, preservando o requisito de não criar requisições só para a
  busca.
- Não há busca fuzzy, favoritos nem recentes. A revisão da task 034 corrigiu o
  comportamento modal: `Tab` agora permanece dentro da paleta enquanto ela
  está aberta.

## Verificação

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e --workspace=@dev-dashboard/web
```

## Fora do escopo

- Executar ações ou comandos a partir da paleta.
- Ranqueamento fuzzy e histórico de uso.
- Novos atalhos globais.
