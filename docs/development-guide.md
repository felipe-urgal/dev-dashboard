# Guia de engenharia para desenvolvimento

A receita operacional de setup, execução local e gate antes do PR está em [`DEVELOPMENT.md`](DEVELOPMENT.md). Este documento complementa esse fluxo com decisões por camada, segurança, testes e Produção.

## Interface canônica

Para uma mudança normal:

```bash
npm run dev
npm run check
```

O gate atual é:

```text
format:check
-> lint
-> test
-> build:apps
```

O workflow `CI` usa essa mesma interface depois de `npm ci --ignore-scripts` e da preparação explícita de `esbuild`/`node-pty`.

Checks adicionais continuam disponíveis quando o risco justificar:

```bash
npm run typecheck
npm run test:cli
npm run test:e2e
npm run test:coverage
npm run docs:api:check
```

`format:check` também pode ser executado isoladamente para diagnóstico, mas já faz parte de `npm run check`. Coverage é diagnóstico, não threshold de aprovação.

## Antes de implementar

Defina o problema, comportamento esperado, fonte de verdade, entradas/erros, se a operação é leitura ou mutação, risco destrutivo, persistência, dependências externas e impacto em CLI/API/web/contratos/docs.

Tipos compartilhados por web/API pertencem a `packages/contracts`.

## Escolha da camada

- regra realmente compartilhável: package apropriado;
- caso de uso/integração: serviço da API;
- transporte: rota Fastify;
- provider externo: adapter explícito;
- apresentação/estado visual: Vue;
- tooling do próprio repo: `scripts/`;
- comportamento implementado: `docs/`;
- trabalho futuro ou multi-PR: issue GitHub.

Não coloque comportamento específico de um repositório alvo dentro do Dev Dashboard e não crie abstrações apenas para uma possibilidade futura.

## Fronteira de segurança

Para operações locais:

- IDs conhecidos em vez de paths livres;
- canonicalização e revalidação;
- programa/args definidos no backend;
- `shell: false` quando aplicável;
- timeout/limites/masking;
- confirmação proporcional ao risco.

Para providers externos:

- credencial permanece no processo local;
- browser não fornece token nem autoridade que o backend possa derivar;
- request/response possuem timeout, tamanho e shape limitados;
- mensagens externas são sanitizadas;
- indisponibilidade parcial é representada sem falso estado saudável;
- mutações continuam dentro do domínio de confirmação/recovery correspondente.

Leia [`architecture/security.md`](architecture/security.md) antes de alterar autenticação, origem, filesystem, processos, providers, banco ou Produção.

## Rotas e schemas

Toda rota deve declarar params/query/body/responses quando aplicável e usar contratos fechados onde necessário. Erros internos são traduzidos para códigos públicos estáveis.

Quando rotas/schemas mudarem:

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada e não deve ser editada manualmente.

## Frontend

A interface deve representar loading real, vazio/erro/sucesso, concorrência, confirmação, respostas stale, teclado/foco, responsividade e `prefers-reduced-motion`.

Para estado assíncrono/realtime, reutilize a política descrita em [`architecture/frontend-live-state.md`](architecture/frontend-live-state.md): snapshot quando basta; SSE/WS quando já existe fonte adequada; polling somente como fallback com lifecycle explícito. Não replique timers por view.

Abortar um `fetch` não prova que uma mutação já aceita pelo backend foi cancelada. Quando a operação não é cancelável, descarte respostas antigas por geração/latest-wins.

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

Priorize regras de negócio, segurança, mutações/recovery, concorrência/cleanup, regressões observadas e estados relevantes de UI. Evite testes que apenas congelem markup/CSS incidental ou existam para elevar coverage.

Testes que iniciam processos, repositórios ou recursos temporários precisam de cleanup garantido.

## Domínio de Produção

Antes de alterar Produção, leia:

- [`architecture/production-contract.md`](architecture/production-contract.md);
- [`architecture/deployment-domain.md`](architecture/deployment-domain.md);
- [`architecture/security.md`](architecture/security.md);
- [`deployment-operations.md`](deployment-operations.md);
- [`production-ui.md`](production-ui.md).

Invariantes principais:

1. manifesto/browser não enviam shell arbitrário;
2. branch/revision/plano são resolvidos e revalidados pelo backend;
3. confirmação é vinculada ao `planHash`;
4. `strategy=command` usa somente aliases `prod:*` canônicos;
5. `strategy=git-managed` usa `provider-deploy`, sem `prod:deploy` artificial;
6. Vercel recebe a revision exata comprovada em `origin/<branch>`;
7. provider `READY` é separado de `prod:verify`;
8. irreversibilidade gera recovery conservador;
9. retry de verify não repete mutação anterior;
10. credenciais ficam fora de contratos/responses/persistência;
11. self-production usa `strategy=self-update` no mesmo planner/confirmação/revalidação;
12. sucesso de self-update exige readiness e prova da revision.

Para o próprio Dashboard, use [`PRODUCTION.md`](PRODUCTION.md) e [`architecture/self-production.md`](architecture/self-production.md). `self-update:*` é tooling de engenharia, não bypass do Production Contract.

## Persistência e lifecycle

Arquivos privados usam permissões restritas, formatos validados e escrita atômica quando relevante. Não persista token de confirmação, senha, `VERCEL_TOKEN`, resposta bruta de provider ou conteúdo do projeto quando metadado/ID basta.

Processos, PTYs, streams, timers, subscriptions, locks e outros recursos duradouros precisam de owner, encerramento e cleanup idempotente explícitos.

## UI

O produto prioriza experiência simples, ágil e funcional:

- ação no contexto onde é usada;
- sem títulos/resumos redundantes;
- estado real em vez de animação artificial;
- linguagem direta em português;
- risco/irreversibilidade explícitos;
- componentes compartilhados apenas quando há repetição real;
- acessibilidade e reduced motion preservados.

## Documentação

Uma mudança está incompleta quando comportamento e documentação divergem. `docs/` descreve o estado implementado; backlog, débitos e planos multi-PR vivem em issues. Não recrie `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap versionado equivalente.

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
