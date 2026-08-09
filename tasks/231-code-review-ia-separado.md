# Task 231 — Code review IA separado da Pull Request

**Status:** concluída em 2026-08-09.

## Objetivo

Separar a revisão de código assistida por IA do fluxo de criação de Pull
Request, deixando a comparação e os comentários mais fáceis de consultar.

## Resultado

- foi criada a sub-aba **Code review IA**, posicionada antes de
  **Histórico**;
- a sub-aba escolhe remoto/base e modelo local do Ollama;
- após a análise, ela mostra todos os arquivos incluídos na comparação e os
  comentários da IA individualmente, com severidade, arquivo, linha,
  explicação e recomendação;
- a revisão foi removida do formulário de Pull Request, que voltou a focar em
  abrir, criar, fechar e mesclar PRs;
- a resposta da revisão agora informa os arquivos comparados;
- o texto de timeout passou a informar o limite real de 300 segundos;
- a documentação de Git e os testes da navegação foram atualizados.

## Limitações

A análise continua consultiva e depende de um modelo disponível no Ollama
local. Diffs muito extensos são limitados antes de serem enviados ao modelo;
o diff completo permanece disponível na sub-aba **Diff**.

## Validação

- `npx vitest run --coverage.enabled=false test/project-git-panel.test.ts`
  (15 testes);
- `node --import=tsx --test apps/api/test/git-pull-request-service.test.ts`
  (9 testes);
- `npm run typecheck`;
- `npm run lint`;
- `npm run format:check`;
- `npm run build`;
- `npm run docs:api:check`.
