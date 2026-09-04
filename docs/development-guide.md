# Guia de engenharia para desenvolvimento

A receita operacional de setup, execução local e gate antes do PR está em [`DEVELOPMENT.md`](DEVELOPMENT.md). Este documento complementa esse fluxo com decisões por camada, segurança, testes e regras do domínio de Produção.

## Interface canônica

Para uma mudança normal:

```bash
npm run dev
npm run check
```

`npm run check` executa `lint -> test -> build:apps` e é o mesmo gate usado pelo CI depois da preparação nativa.

Checks direcionados continuam disponíveis:

```bash
npm run typecheck
npm run format:check
npm run test:cli
npm run test:e2e
npm run test:coverage
npm run docs:api:check
```

Use-os quando o risco/escopo justificar. Coverage é diagnóstico, não threshold.

## Antes de implementar

Defina:

- problema e comportamento esperado;
- estado público e fonte de verdade;
- entradas aceitas e erros estáveis;
- leitura ou mutação;
- risco destrutivo/irreversível;
- persistência necessária;
- dependência local/provider externo;
- impacto em CLI, API, frontend, contratos e documentação.

Tipos compartilhados por web/API pertencem a `packages/contracts`.

## Escolha da camada

- regra genérica: package compartilhado;
- caso de uso/integração: serviço da API;
- transporte: rota Fastify;
- provider externo: adapter explícito;
- apresentação: Vue;
- tooling do repo: `scripts/`;
- comportamento implementado do produto: `docs/`;
- planejamento futuro/multi-PR: issue GitHub.

Não coloque comportamento específico de um repositório alvo dentro do Dev Dashboard.

## Fronteira de segurança

Para operações locais:

- IDs conhecidos em vez de paths livres;
- canonicalização/revalidação;
- programa/args definidos no backend;
- `shell: false` quando aplicável;
- timeout e limites;
- masking;
- confirmação para mutações sensíveis.

Para providers externos:

- credencial só no processo local;
- browser não fornece token nem autoridade derivável pelo backend;
- request/response com timeout, tamanho e shape bounded;
- mensagens externas sanitizadas;
- estado parcial/indisponível representado honestamente;
- mutação dentro do mesmo domínio de confirmação/recovery.

## Rotas e schemas

Toda rota deve possuir params/query/body/responses explícitos e `additionalProperties: false` quando apropriado. Traduza erros internos para códigos públicos estáveis e cubra auth/origem nos testes relevantes.

Quando rotas/schemas mudarem:

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada e não deve ser editada manualmente.

## Frontend

A interface precisa tratar:

- loading real;
- vazio/erro/sucesso;
- ação em andamento e clique duplicado;
- confirmação;
- resposta stale;
- teclado/foco;
- responsividade;
- reduced motion.

Não use texto localizado da API como identificador de lógica.

### Política HTTP

`requestJson()` diferencia leituras idempotentes de mutações:

- `GET` usa timeout interno, retry bounded para falhas transitórias e deduplicação quando não há `AbortSignal` próprio;
- `POST`, `PUT`, `PATCH` e `DELETE` não recebem timeout/retry implícitos;
- mutações podem receber `AbortSignal` somente quando suportam cancelamento ponta a ponta;
- abortar o `fetch` não prova cancelamento de efeito remoto já iniciado;
- operações longas preferem lifecycle observável (PTY/SSE/deployment) em vez de fingir request curto;
- quando uma operação não é cancelável, descarte resposta obsoleta por `generation/latest-wins`.

## Testes

| Camada | Teste esperado |
| --- | --- |
| package | unidade sobre regra relevante |
| serviço API | unidade/integração com fixtures |
| adapter externo | transporte simulado, limites e erros |
| rota | Fastify inject + schemas/auth |
| web | Vitest + Vue Test Utils |
| fluxo crítico | Playwright quando necessário |
| script raiz | `node:test` |

A suíte não deve crescer por inércia. Antes de adicionar teste, identifique a regressão importante que ele protege.

Priorize:

- regras de negócio;
- segurança/autorização;
- mutações/recovery;
- concorrência/cleanup;
- regressões observadas;
- estados relevantes de UI.

Evite testes que apenas congelem CSS/markup/detalhes incidentais ou existam para elevar coverage.

Testes que iniciam processos/repositórios temporários precisam de cleanup garantido.

## Domínio de Produção

Antes de alterar Production Contract, planner, adapters ou UI, leia:

- [`architecture/production-contract.md`](architecture/production-contract.md);
- [`architecture/deployment-domain.md`](architecture/deployment-domain.md);
- [`architecture/security.md`](architecture/security.md);
- [`deployment-operations.md`](deployment-operations.md);
- [`production-ui.md`](production-ui.md).

Invariantes:

1. manifesto/browser não enviam shell arbitrário;
2. plano usa branch/revision real e working tree limpa;
3. confirmação é vinculada ao `planHash`;
4. `strategy=command` executa somente aliases `prod:*` canônicos;
5. `strategy=git-managed` não inventa `prod:deploy` local;
6. Vercel recebe projeto/origem/revision derivados pelo backend;
7. antes da promoção Vercel, `origin/<branch>` real prova o SHA confirmado;
8. provider READY é separado de `prod:verify`;
9. etapas irreversíveis usam recovery conservador;
10. retry de verify nunca repete mutação anterior;
11. credenciais externas não entram em contratos/responses/persistência;
12. self-production usa `strategy=self-update` no mesmo planner/confirmação/revalidação, sem rota paralela;
13. sucesso de self-update exige readiness + prova da revision.

### Self-production

A produção do próprio Dashboard está em [`PRODUCTION.md`](PRODUCTION.md) e [`architecture/self-production.md`](architecture/self-production.md).

Não transforme `self-update:*` em bypass. O handoff precisa existir antes de ownership externo; checkout/revision são revalidados; o worker aplica somente fast-forward; sucesso exige a revision esperada depois do restart.

## Persistência

Arquivos privados usam permissões restritas quando aplicável, formatos são validados e escrita deve ser atômica quando relevante.

Não persista token de confirmação, senha, `VERCEL_TOKEN`, resposta bruta de provider ou conteúdo de projeto quando metadado/ID basta.

Estado persistido de self-update não é autoridade executável: não deve carregar shell, unit, path ou credencial que transforme adulteração em execução arbitrária.

## UI

O produto prioriza experiência simples, ágil e funcional:

- ação no contexto onde é usada;
- sem títulos/resumos redundantes;
- estado real em vez de animação artificial;
- loading só durante trabalho;
- linguagem direta em português;
- risco/irreversibilidade explícitos;
- labels/controles/corpo respeitam tokens tipográficos do design system;
- diálogos possuem semântica/foco/trap/Escape/retorno de foco apropriados;
- feedback assíncrono usa live regions conforme severidade;
- animações respeitam `prefers-reduced-motion`;
- componentes-base só surgem quando há repetição real de estrutura/semântica.

## Documentação

Uma mudança está incompleta quando o comportamento mudou e os documentos correspondentes não.

Entradas canônicas:

- [`DEVELOPMENT.md`](DEVELOPMENT.md) para operação de desenvolvimento;
- [`PRODUCTION.md`](PRODUCTION.md) para self-production.

Atualize também arquitetura, operações, UI, `.env.example` ou guia de usuário quando esses contratos forem afetados.

Não recrie `tasks/`, `NEXT.md` ou roadmaps versionados.

## Checklist final

- responsabilidade na camada correta;
- entradas/paths/provider data validados;
- nenhum shell arbitrário;
- mutação com preview/confirmação/revalidação adequados;
- logs/respostas bounded e masked;
- credenciais não vazam;
- shutdown/cancelamento fecham recursos;
- recovery representa efeitos parciais honestamente;
- testes cobrem sucesso/falhas relevantes;
- documentação está coerente;
- `npm run check` verde no head final;
- checks direcionados aplicáveis verdes;
- auto-review executado depois do último commit.
