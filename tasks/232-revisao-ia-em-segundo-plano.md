# Task 232 — Revisão IA em segundo plano

**Status:** concluída em 2026-08-10.

## Objetivo

Manter a revisão de código com IA em execução quando a pessoa sai da sua
sub-aba, sem perder o progresso nem os comentários recebidos.

## Resultado

- a API passou a criar e manter uma execução de revisão por projeto;
- a execução processa os arquivos de forma sequencial e registra progresso,
  falhas pontuais e resultado agregado;
- a web consulta o estado da execução ao abrir a sub-aba e acompanha somente
  enquanto ela está visível;
- a revisão não possui mais timeout fixo por arquivo: o Ollama local pode
  responder no tempo necessário;
- falhar em um arquivo não cancela a análise dos próximos;
- os contratos, a referência de API, o guia de Git e os testes foram
  atualizados.

## Limitações

O estado vive na API local em execução. Reiniciar o Dev Dashboard encerra uma
revisão ainda ativa e não restaura execuções anteriores.

## Validação

- `node --import=tsx --test apps/api/test/git-ai-code-review-service.test.ts`;
- `npm run test --workspace=@dev-dashboard/web -- --coverage.enabled=false test/project-git-panel.test.ts`;
- `npm run typecheck --workspace=@dev-dashboard/api --workspace=@dev-dashboard/web`;
- verificações completas registradas no PR.
