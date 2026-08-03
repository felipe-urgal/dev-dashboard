# Task 077 — Escrita segura no editor

## Status

Planejada para depois da fundação somente leitura da task 076.

## Objetivo

Habilitar edição, salvamento e operações estruturais sem permitir sobrescrita
silenciosa, arquivo parcial ou caminho fora do projeto.

## Escopo proposto

- dirty state por aba;
- salvamento com `expectedVersion`;
- conflito `FILE_CHANGED_EXTERNALLY` com diff;
- gravação atômica por arquivo temporário e `rename`;
- criação de arquivo e diretório;
- rename e exclusão com confirmação;
- watcher limitado dos arquivos abertos;
- serviço central de `WorkspaceEdit` reutilizável por LSP e IA;
- testes de concorrência, symlink, TOCTOU e falha intermediária.

## Fora desta task

- terminal livre;
- LSP;
- assistência de IA;
- edição de arquivos sensíveis por padrão;
- alterações autônomas sem preview.
