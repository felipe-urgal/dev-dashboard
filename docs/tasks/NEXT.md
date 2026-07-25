# Próxima atividade — 004: Scripts e tarefas do projeto

## Objetivo

Criar a aba `/projects/:projectId/scripts` para reunir scripts Node e tarefas
Rails reconhecidas em um catálogo seguro, antes de permitir sua execução.

## Plano detalhado

1. Criar contratos para script, origem, classificação de risco e catálogo.
2. Detectar scripts do `package.json`, tarefas públicas de `bin/rails -T` e
   executáveis conhecidos em `bin/`, sem aceitar comandos enviados pelo browser.
3. Separar inicialmente ações somente leitura das mutáveis e manter as
   destrutivas desabilitadas.
4. Expor `GET /api/projects/:projectId/scripts` com paginação, schemas completos
   e projeto resolvido exclusivamente pelo `ProjectStore`.
5. Criar a aba web com busca, filtros por origem e risco, descrição do comando e
   estado vazio.
6. Invalidar estado assíncrono ao alternar projetos e adicionar testes de
   detecção, paginação e ausência de comandos arbitrários.

## Fora do escopo inicial

- execução de scripts e tarefas;
- argumentos personalizados;
- tarefas destrutivas de banco ou filesystem;
- terminal interativo;
- gerenciamento de bancos por Docker ou Docker Compose, reservado para o
  roadmap futuro.

## Critérios de aceite

- catálogo reproduzível e ordenado;
- nenhum conteúdo do projeto é executado durante a detecção Node;
- schemas descartam detalhes internos de resolução;
- UI responsiva com estados de carregamento, erro e vazio;
- `npm run typecheck`, `npm run build` e `npm test` passam.
