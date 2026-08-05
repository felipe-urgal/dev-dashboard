# Task 099 — Project Doctor somente leitura

## Status

Em revisão na branch `agent/project-doctor-readonly`.

Branch rebaseado sobre a `main` após a incorporação do PR #189, com os pontos
compartilhados reconciliados e a numeração atualizada para Task 099.

## Contexto

Esta entrega promove a OPP-01 de
`docs/product/feature-opportunities-2026-08.md`. Depois da atualização da
`main`, a Task 096 passou a registrar a política unificada de risco e histórico
Git, a Task 097 passou a registrar Variáveis de ambiente por projeto e a Task
098 ficou reservada em `NEXT.md` para a continuação da migração das mutações
Git. Por isso o Doctor foi renumerado para 099, sem disputar a mesma área de
código nem a numeração das entregas já incorporadas.

O Dev Dashboard já detecta capacidades, dependências, testes, banco e
processos, mas ainda não reúne os principais sinais de preparação do projeto
num relatório único. O desenvolvedor precisa descobrir manualmente por que um
projeto não inicia, não instala dependências ou está com configuração local
incompleta.

## Objetivo

Adicionar um diagnóstico por projeto que seja útil no início do trabalho e
seguro para executar repetidamente. A primeira fatia é estritamente somente
leitura: informa o estado, explica a evidência e aponta para áreas já
existentes do dashboard, sem corrigir arquivos, instalar ferramentas ou
iniciar processos automaticamente.

## Escopo entregue

### Contrato compartilhado

Novo contrato `ProjectDiagnosticReport` em `packages/contracts`, com:

- estado geral `healthy`, `attention` ou `blocked`;
- resumo de checks prontos, com atenção, bloqueados e não verificados;
- checks categorizados em projeto, runtime, dependências e configuração;
- recomendação opcional;
- ação opcional restrita a destinos conhecidos do dashboard.

### Serviço da API

Novo `ProjectDoctorService`, separado dos serviços Git e injetável diretamente
no `buildApp`, para reduzir acoplamento e permitir testes determinísticos.

Checks da primeira fatia:

- diretório existente e legível;
- manifesto esperado para o tipo detectado (`package.json` ou `Gemfile`);
- disponibilidade do Node usado pela API e declarações em `.node-version`,
  `.nvmrc` e `engines.node`;
- lockfiles Node, ambiguidade de gerenciador e disponibilidade do executável;
- presença de `node_modules`;
- disponibilidade do Ruby e declaração em `.ruby-version`;
- presença de `Gemfile.lock` e resultado de `bundle check` no diretório do
  projeto;
- comparação somente dos nomes presentes em `.env.example` e `.env`.

O relatório possui cache local de 15 segundos e pode ser atualizado
explicitamente por `?refresh=true`. Cada check é isolado: uma falha inesperada
vira um aviso controlado e não impede os demais resultados.

### API HTTP

Nova rota autenticada:

```text
GET /api/projects/:projectId/doctor
GET /api/projects/:projectId/doctor?refresh=true
```

A resposta contém apenas o contrato estruturado. Projeto inexistente retorna
`PROJECT_NOT_FOUND`; parâmetros fora do schema são recusados pelo Fastify.

### Interface

Nova aba **Diagnóstico** no detalhe do projeto, com:

- estado geral em destaque;
- contadores por situação;
- checks agrupados por categoria;
- recomendação direta e deep link para Dependências, Servidor, Banco de dados
  ou Configurações quando aplicável;
- atualização manual;
- estados de carregamento e erro;
- layout responsivo.

## Decisões de segurança

1. **Somente leitura.** Não há rota de correção, instalação, start, stop ou
   alteração de arquivos.
2. **Sem shell.** As poucas consultas a executáveis usam `execFile` com
   comando conhecido, argumentos explícitos, timeout de 2,5 segundos e buffer
   limitado.
3. **Diretório derivado do projeto.** O navegador envia somente `projectId`; a
   API resolve o caminho pelo `ProjectStore`.
4. **Arquivos conhecidos e limitados.** Apenas manifests e arquivos de versão
   reconhecidos são lidos, com teto de 256 KiB.
5. **Segredos não atravessam a API.** O check de ambiente extrai somente nomes
   de variáveis. Valores de `.env` não entram no contrato, nos resumos ou nos
   testes.
6. **Falhas isoladas.** Erro de permissão, timeout ou executável ausente não
   derruba o relatório inteiro.
7. **Nenhuma afirmação de compatibilidade sem prova.** Nesta primeira versão,
   declarações de versão são exibidas e divergências entre os próprios
   arquivos são sinalizadas; o Doctor não tenta implementar um resolvedor
   completo de ranges semver/Ruby.

## Testes automatizados

### API

`apps/api/test/project-doctor-routes.test.ts` cobre:

- relatório de projeto Node;
- detecção de lockfile e gerenciador;
- aviso de nome ausente no `.env`;
- garantia de que um valor secreto presente no fixture não aparece na
  resposta;
- cache e atualização explícita;
- projeto inexistente;
- autenticação obrigatória.

### Frontend

`apps/web/test/project-doctor-panel.test.ts` cobre:

- resumo e checks agrupados;
- recomendação com deep link;
- atualização manual;
- troca de projeto sem reaproveitar relatório obsoleto;
- ausência de conteúdo sensível no HTML.

## Critérios de aceite

- [x] existe um relatório estruturado por projeto;
- [x] a primeira fatia não altera o projeto nem instala dependências;
- [x] cada check pode falhar isoladamente;
- [x] valores de ambiente não são devolvidos;
- [x] comandos reconhecidos usam execução sem shell e com timeout;
- [x] a UI diferencia pronto, atenção, bloqueado e não verificado;
- [x] recomendações apontam para áreas existentes;
- [x] há atualização explícita e cache curto;
- [x] API e componente possuem testes dedicados;
- [ ] typecheck, build, documentação gerada, testes e smoke E2E aprovados no
  CI do PR após o rebase.

## Fora do escopo

- botão “corrigir tudo”;
- instalação automática de runtimes ou pacotes;
- encerramento de processos ou liberação de portas;
- teste de conectividade com serviços externos;
- execução completa de suíte, build ou migrations;
- persistência histórica dos diagnósticos;
- selo de preflight para push/PR;
- comparação completa de ranges de versão.

## Evolução planejada

O relatório cria uma base reutilizável para:

1. Inspetor seguro de portas;
2. navegador estruturado de falhas de teste;
3. preflight local antes de push/PR;
4. caixa de manutenção acionável;
5. sessões de desenvolvimento.

Essas evoluções devem continuar em PRs próprios e reutilizar o contrato de
checks em vez de ampliar esta primeira entrega com mutações.
