# Task 104 — Padronizar lint com ESLint no monorepo

## Status

Concluída.

## Objetivo

Adicionar uma verificação estática compartilhada para os workspaces TypeScript,
os componentes Vue e os scripts Node da raiz, sem introduzir uma reforma de
formatação ou mudanças funcionais em massa.

## Resultado

- ESLint 9 configurado em `eslint.config.js` usando flat config;
- base `@eslint/js` para scripts JavaScript;
- `typescript-eslint` recomendado para `apps/**/*.ts` e `packages/**/*.ts`;
- `eslint-plugin-vue` com o preset essencial e parser TypeScript para SFCs;
- globals explícitos de Node e navegador conforme o contexto;
- scripts raiz `npm run lint` e `npm run lint:fix`;
- `npm run lint` adicionado ao CI depois de `typecheck` e antes de `build`;
- lockfile atualizado com versões fixadas das novas dependências de desenvolvimento;
- sete diretivas `eslint-disable` obsoletas removidas pela limpeza segura inicial.

## Decisões

### Sem Prettier nesta entrega

A task cobre apenas lint de correção. Formatação automática fica separada para
não gerar um diff grande e sem relação funcional.

### Adoção incremental

`no-unused-vars`, `no-explicit-any` e `prefer-const` começam como avisos. Isso
permite ligar o gate de CI agora e corrigir o legado por domínio antes de elevar
regras específicas a erro.

A primeira execução reportou 506 problemas. Desses, 495 eram falsos positivos
de variáveis do `<script setup>` usadas no template Vue. A regra de variáveis
não usadas foi desativada apenas para arquivos `.vue`; o preset essencial do
Vue e as demais regras continuam ativos.

Depois do ajuste e da limpeza segura, o inventário final ficou em:

- 0 erros;
- 22 avisos;
- 9 ocorrências de `prefer-const`;
- 13 variáveis/imports não usados em arquivos TypeScript ou scripts Node.

Os avisos restantes exigem julgamento por arquivo e não bloqueiam o CI nesta
primeira versão.

## Escopo verificado

```text
apps/**/*.{ts,vue}
packages/**/*.ts
scripts/**/*.mjs
eslint.config.js
```

Diretórios gerados, cobertura, dependências e runtime do Playwright permanecem
ignorados.

## Arquivos principais

- `eslint.config.js`;
- `package.json`;
- `package-lock.json`;
- `.github/workflows/ci.yml`;
- `docs/PENDENCIAS.md`;
- `docs/tasks/README.md`;
- `docs/tasks/NEXT.md`.

## Validação executada

- `npm install` com atualização do lockfile;
- `npm run lint` — 0 erros e 22 avisos catalogados;
- execução de `npm run lint:fix` durante o inventário inicial;
- remoção revisada das sete diretivas obsoletas encontradas pelo autofix;
- CI final do PR como validação de `typecheck`, lint, build, documentação da API,
  testes e smoke E2E.

## Limitações e próximos passos

- Prettier não foi introduzido;
- avisos legados não foram convertidos em erro;
- o CLI Bash continua fora do ESLint e exigiria uma frente própria com
  ShellCheck;
- a próxima elevação de severidade deve ocorrer por categoria, somente depois
  de zerar o inventário correspondente.
