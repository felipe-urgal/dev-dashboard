# Próxima atividade — 033: Command palette (navegação, primeira fatia)

## Contexto

Com a task 032, a frente "Rails de baixo risco" do Horizonte 2 está
concluída (migrations status/routes, operações mutáveis, diagnóstico
Bundler — Sidekiq/Webpack/generators/credenciais ficam como itens
separados, sem escopo definido ainda). O próximo item do roadmap
(`docs/roadmap.md`, Horizonte 2) é o command palette: "busca e navegação
por teclado, restrita a ações já autorizadas em suas telas".

Este é um recurso maior — vale entregar em fatias. Esta task cobre só
**navegação** (workspaces, projetos, páginas globais); busca por
ações/comandos executáveis (rodar teste, iniciar servidor, etc.) fica para
uma entrega seguinte, depois que o padrão de navegação estiver validado.

## Objetivo

Um atalho de teclado global (`Cmd/Ctrl+K`) abre uma paleta de busca que
permite navegar rapidamente para: qualquer projeto detectado (por nome ou
caminho), as páginas globais (Visão geral, Atividade, Processos,
Configurações se existir) e as abas do projeto atualmente aberto (Git,
Testes, Banco, Scripts). Sem executar nenhuma ação — apenas roteamento
client-side para rotas já existentes.

## Plano detalhado

1. Componente `CommandPalette.vue` (overlay modal, fecha com `Esc` ou clique
   fora), montado uma vez no shell principal (`App.vue`), não por página.
2. Fonte de dados: reaproveitar o estado já carregado no
   `dashboardStore` (workspaces e projetos já detectados) — sem nova
   chamada à API só para a paleta. Filtro incremental client-side por
   substring (nome/caminho do projeto), sem busca fuzzy sofisticada nesta
   primeira fatia.
3. Navegação por teclado dentro da lista (setas para cima/baixo, `Enter`
   para selecionar, respeitando o item já em foco visualmente) — auditoria
   de foco/teclado já é um item do roadmap ("Base de testes da interface"),
   então validar que o padrão aqui é acessível (foco visível, sem trap de
   teclado) desde já, em vez de deixar para depois.
4. Registrar o atalho global sem conflitar com atalhos nativos do navegador
   nem com campos de texto focados (não abrir a paleta se o usuário estiver
   digitando em um input/textarea).
5. Testes montados do componente (abre/fecha, filtro por texto, navegação
   por teclado, seleção navega para a rota esperada) e um teste E2E de
   smoke cobrindo abrir a paleta e navegar até um projeto.

## Fora do escopo

- Busca ou execução de ações/comandos (rodar teste, iniciar servidor,
  commit, etc.) — fatia seguinte, e precisa decidir como refletir risco
  (read-only vs. mutável) dentro da paleta antes de implementar.
- Histórico de itens recentes/favoritos na paleta.
- Busca fuzzy ou ranqueamento sofisticado de resultados.
- Atalhos de teclado adicionais além do `Cmd/Ctrl+K` de abertura.

## Critérios de aceite

- `Cmd/Ctrl+K` abre a paleta de qualquer tela (exceto com um campo de texto
  focado); `Esc` fecha;
- busca por nome/caminho encontra projetos e navega para o detalhe correto
  ao selecionar;
- navegação por teclado (setas + Enter) funciona sem exigir o mouse;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de componente e ao menos um smoke E2E da paleta.
