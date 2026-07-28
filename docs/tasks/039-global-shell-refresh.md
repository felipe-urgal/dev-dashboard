# Task 039 — Reforma da sidebar e topbar

## Status

Concluída.

## Objetivo

Melhorar o shell persistente do dashboard para tornar workspace,
navegação, tema, busca rápida e estado da API mais claros sem alterar o
conteúdo das páginas.

## Escopo entregue

- Sidebar compacta de 232 px com identidade refinada e maior área útil.
- Workspace ativo e ação de adição organizados na mesma linha.
- Nova entrada explícita de Visão geral na navegação principal.
- Ícones Heroicons consistentes para todas as rotas e ações do shell.
- Estado ativo com trilho lateral azul e superfície suave.
- Rodapé da sidebar com conexão e contexto de ambiente local.
- Topbar mais compacta, com tema, navegação rápida e status alinhados.
- Busca rápida com ícone, rótulo e atalho de teclado.
- Controle de tema com ícones de lua e sol, preservando os nomes
  acessíveis.
- Drawer funcional para a navegação em telas abaixo de 760 px, com
  backdrop, fechamento e retorno de foco por rota.

## Decisões

- O conteúdo das páginas, a listagem de projetos, a command palette e o
  modal de workspace permaneceram fora desta task.
- O monograma existente `DD` foi preservado como identidade do produto.
- A topbar manteve o contexto de rota provido pelo router e não passou a
  duplicar dados do workspace.
- A navegação móvel reutiliza as mesmas rotas e o mesmo estado ativo da
  sidebar desktop.

## Testes e verificação

- `npm --workspace @dev-dashboard/web run typecheck`: concluído.
- `npm --workspace @dev-dashboard/web test`: 81 testes concluídos.
- Build de produção concluído com diretórios temporários de configuração
  e estado.
- Navegação entre Visão geral e Processos verificada no navegador.
- Alternância entre tema claro e escuro verificada.
- Abertura e fechamento da navegação rápida verificados.
- Nenhum erro ou aviso originado pela aplicação foi encontrado no
  console.
- O smoke responsivo foi atualizado para abrir o drawer e verificar
  seus links na largura móvel. A execução local do projeto E2E ficou
  bloqueada porque `@playwright/test` não está resolvido no ambiente.

## Limitações

- A lista de projetos, a navegação rápida e o modal de workspace serão
  tratados nas próximas etapas visuais.
