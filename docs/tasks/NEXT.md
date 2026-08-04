# Próxima atividade

A task 085 fecha a lacuna responsiva registrada no app shell: tablets em modo
retrato passam a usar o drawer, e o smoke Playwright cobre desktop, tablet e
tela estreita. O arco de IDE/IA (tasks 076–084) também está concluído. Antes de
abrir outro ciclo grande, a próxima atividade deve comparar as pendências do
produto com evidência do código e dos fluxos atuais.

## Task 086 — Auditoria de prioridades pós-IDE

### Objetivo

Revisar o produto, a documentação ativa e a cobertura automatizada para escolher
uma única próxima frente de implementação, evitando continuar no arco de IA por
inércia ou selecionar uma pendência apenas porque já aparece no roadmap.

### Escopo

- revisar `docs/PENDENCIAS.md`, `docs/roadmap.md`, `docs/product/vision.md` e os
  documentos ativos em `docs/architecture/`;
- conferir no código e nos testes o estado real das principais candidatas:
  - confirmação por risco e histórico de mutações Git;
  - execução de caso/`describe` específico e cobertura de testes;
  - exportação segura de logs;
  - projetos recentes por workspace;
  - monorepos e scan recursivo opt-in;
  - contexto semântico local e restauração de estado da IDE;
  - qualidade de engenharia (lint/formatação, cobertura, documentação da API,
    revisão dirigida de dependências);
- eliminar itens duplicados, já entregues ou deliberadamente fora de escopo;
- classificar as candidatas pelos critérios do roadmap: segurança,
  confiabilidade, valor diário, cobertura de risco, redução de trabalho
  repetitivo, consistência, acessibilidade e extensibilidade;
- registrar no documento da task 086 uma lista curta e ordenada, com evidência,
  dependências, risco e tamanho aproximado;
- escolher uma única próxima entrega e substituir este `NEXT.md` por um plano
  executável, com critérios de aceite e fora de escopo claros.

### Restrições

- atividade documental e de inspeção: não implementar a candidata escolhida na
  mesma branch;
- não reabrir o E2E de ghost text sem estratégia diferente da descartada na
  task 082;
- não introduzir shell livre, plugins remotos ou exposição da API na rede;
- não assumir que embeddings são automaticamente a prioridade por serem a maior
  pendência restante da IDE.

### Critérios de aceite

- cada candidata final possui evidência concreta no código, documentação ou
  fluxo atual;
- a priorização explica por que a primeira opção supera as demais;
- roadmap, pendências, índice de tasks e arquitetura ficam reconciliados;
- a próxima task possui escopo pequeno, revisável e verificável;
- nenhuma mudança funcional é misturada à auditoria.
