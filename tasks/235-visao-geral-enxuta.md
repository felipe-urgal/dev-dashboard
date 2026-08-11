# Task 235 — Visão geral enxuta

**Status:** concluída em 2026-08-11.

## Objetivo

Reduzir a densidade da Visão geral e deixar a landing focada na identificação
e no acesso aos projetos.

## Resultado

- removida a busca textual da lista de projetos na Visão geral;
- removido o filtro por tipo (Todos/Rails/Node);
- removidos o título **Projetos detectados** e a contagem de projetos;
- removidos os badges de tipo e recência da listagem;
- removidas as ações individuais de favorito, exclusão e o rótulo **Abrir**;
- cada projeto mantém apenas o indicador de estado do servidor e a ação de
  desativar/reativar;
- a ação de desativar/reativar possui nome acessível e `title` no hover;
- projetos desativados não recebem o efeito de hover do card e usam cursor
  padrão;
- removidas da Visão geral as ações globais de iniciar todos e parar todos os
  servidores;
- escanear novamente e remover workspace permanecem no cabeçalho de
  Repositórios;
- testes unitários e E2E foram atualizados para refletir a interface atual.

## Validação

A validação completa fica a cargo do CI do pull request. Os testes de regressão
da Visão geral e de navegação foram reconciliados com a remoção dos elementos
anteriores.

`tasks/PENDENCIAS.md` não possui item aberto específico para essas simplificações,
portanto não houve item a remover do backlog.
