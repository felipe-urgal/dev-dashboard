# Guia de desenvolvimento

Este guia define o fluxo recomendado para alterar o Dev Dashboard com segurança, consistência e documentação suficiente.

## Preparação

```bash
npm install
npm run doctor
npm run dev
```

Abra:

```text
Dashboard:  http://127.0.0.1:5173
API health: http://127.0.0.1:4343/api/health
```

`npm run dev` carrega `.env.local` quando existir. Quando precisar customizar o ambiente ou configurar integração externa, comece pelo template versionado:

```bash
cp .env.example .env.local
```

Credenciais locais, como `VERCEL_TOKEN`, ficam somente em `.env.local`/ambiente do processo e nunca no repositório. Variáveis internas/efêmeras do runtime e do self-update não devem ser transformadas em configuração manual só porque existem em `process.env`; veja `docs/operations-and-troubleshooting.md`.

## Scripts principais

| Script | Uso |
| --- | --- |
| `npm run dev` | API + web com watch |
| `npm run dev:api` | somente API |
| `npm run dev:web` | somente Vite |
| `npm run dev-web` | distribuição local compilada |
| `npm run doctor` | diagnóstico local |
| `npm run docs:api` | regenera referência HTTP |
| `npm run docs:api:check` | verifica referência gerada |
| `npm run prod:status` | mostra o gate/estado do contrato do próprio Dashboard |
| `npm run prod:check` | valida o gate de self-production |
| `npm run self-update:helper -- ...` | tooling de engenharia do handoff persistente |
| `npm run self-update:agent -- ...` | tooling de instalação/lifecycle/inspeção do agent |
| `npm run typecheck` | valida tipos |
| `npm run lint` | ESLint |
| `npm run format:check` | verifica Prettier |
| `npm run build` | compila packages/apps |
| `npm test` | testes dos workspaces |
| `npm run test:cli` | suíte Bash |
| `npm run test:e2e` | smoke E2E da web |

Enquanto o próprio contrato permanecer `strategy=disabled`, os scripts `self-update:*` são tooling de engenharia e não um bypass suportado para produção.

## Como adicionar ou alterar uma funcionalidade

### 1. Defina o contrato

Responda:

- qual problema é resolvido;
- qual estado é público;
- que entradas são aceitas;
- quais erros possuem código estável;
- leitura ou mutação;
- risco destrutivo/irreversível;
- persistência necessária;
- dependência local ou provider externo.

Tipos compartilhados por web/API pertencem a `packages/contracts`.

### 2. Escolha a camada correta

- regra genérica: package compartilhado;
- caso de uso/integração: serviço da API;
- transporte: rota Fastify;
- provider externo: adapter explícito;
- apresentação: Vue;
- tooling do repo: `scripts/`;
- estado permanente do produto: `docs/`;
- planejamento futuro/multi-PR: issue GitHub.

Não coloque comportamento específico de um repositório alvo no Dev Dashboard.

### 3. Defina a fronteira de segurança

Para operações locais:

- IDs conhecidos em vez de paths livres;
- canonicalização e revalidação;
- programa/args no backend;
- `shell: false` quando aplicável;
- timeout e limites;
- masking;
- confirmação para mutações sensíveis.

Para providers externos:

- credencial só no processo local;
- browser não fornece token nem parâmetros de autoridade que possam ser derivados pelo backend;
- request/response externos com timeout/tamanho/shape bounded;
- mensagens externas sanitizadas;
- estado parcial/indisponível representado honestamente;
- mutação externa dentro do mesmo domínio de confirmação/recovery quando aplicável.

Para self-update:

- não transforme o agent em executor remoto genérico;
- handoff precisa existir antes de ownership externo;
- checkout/revision são revalidadas antes da mutação;
- worker que precisa sobreviver ao Fastify deve executar de uma cópia instalada/verificada, não da checkout mutável;
- retorno da porta não basta: readiness precisa provar a revision aplicada;
- falha após início de mutação deve preservar estado/recovery em vez de inventar rollback seguro;
- `strategy=disabled` continua valendo até a cadeia inteira ser comprovada e explicitamente habilitada.

### 4. Rotas e schemas

Toda rota deve possuir params/query/body/responses explícitos e `additionalProperties: false` quando apropriado. Traduza erros internos para códigos estáveis e cubra auth/origem nos testes relevantes.

Depois de alterar rotas:

```bash
npm run docs:api
npm run docs:api:check
```

A referência gerada não é editada manualmente.

### 5. Web

A interface precisa tratar loading real, vazio, erro, sucesso, ação em andamento, clique duplicado, confirmação, resposta stale, teclado/foco, responsividade e reduced motion.

Não use texto localizado da API como identificador de lógica.

### 6. Testes

| Camada | Teste esperado |
| --- | --- |
| package | unidade |
| serviço API | unidade/integração com fixtures |
| adapter externo | transporte simulado, limites, erros e estados |
| rota | Fastify inject + schemas/auth |
| web | Vitest + Vue Test Utils |
| fluxo crítico | Playwright E2E |
| script raiz | `node:test` |

Testes que iniciam processo/repositório temporário devem ter cleanup garantido.

Fluxos de self-update precisam cobrir não só helpers isolados, mas também ownership externo, concorrência, interrupção da API, restart, readiness/revision e recovery quando a entrega declarar essas capacidades.

## Mudanças no domínio de Produção

Antes de alterar Production Contract, planner, adapters ou UI, leia:

- [production-contract.md](architecture/production-contract.md)
- [deployment-domain.md](architecture/deployment-domain.md)
- [security.md](architecture/security.md)
- [self-production.md](architecture/self-production.md) quando tocar o próprio Dashboard
- [deployment-operations.md](deployment-operations.md)
- [production-ui.md](production-ui.md)

Invariantes que não devem ser quebrados:

1. manifesto/browser não enviam linha de shell arbitrária;
2. plano usa branch/revision real e working tree limpa;
3. confirmação é vinculada ao `planHash`;
4. `strategy=command` executa somente aliases `prod:*` canônicos;
5. `strategy=git-managed` não inventa `prod:deploy` local;
6. Vercel recebe projeto/origem/revision derivados pelo backend;
7. antes da promoção Vercel, `origin/<branch>` real precisa provar o SHA confirmado;
8. provider READY é separado de `prod:verify`;
9. etapas irreversíveis usam recovery conservador;
10. retry de verify nunca repete mutação anterior;
11. credenciais Vercel não entram em contratos, responses ou persistência;
12. self-production não pode ignorar `strategy=disabled` por existir tooling interno;
13. sucesso de self-update exige readiness e prova da revision, não apenas processo/porta disponível.

### Testes mínimos para Vercel

Cubra quando relevante:

- token ausente;
- auth/escopo recusado;
- projeto não encontrado;
- quota/transport indisponível;
- resposta inválida/acima do limite;
- criação com branch + SHA exato;
- revision remota divergente/indisponível;
- polling BUILDING → READY;
- ERROR/CANCELED;
- cancelamento best-effort;
- falha de verify depois de promoção sem repetir provider-deploy.

## Persistência

Arquivos privados usam `0700`/`0600` quando aplicável, formatos são validados na leitura e escrita deve ser atômica quando relevante.

Não persista token de confirmação, senha, `VERCEL_TOKEN`, response bruta de provider ou conteúdo de projeto quando metadado/ID basta.

Estado persistido de self-update não é autoridade executável: ele pode vincular ID/projeto/revision/`planHash`/estado/resultado, mas não deve carregar shell, unit, path ou credencial que transforme adulteração de arquivo em execução arbitrária.

## UI

O produto prioriza experiência simples, ágil e funcional:

- ação no contexto onde é usada;
- sem títulos/resumos redundantes;
- estado real em vez de animação artificial;
- loading só durante trabalho;
- linguagem direta em português;
- risco/irreversibilidade explícitos sem dramatização;
- use `--font-label` (11px) para labels e metadados compactos, `--font-control` (12px) para texto de controles e `--font-body` (13px) para corpo padrão;
- 8–9px não são tamanho padrão de UI; 10px fica restrito a metadado técnico não interativo quando a densidade realmente justificar;
- diálogos customizados precisam de `role="dialog"`/`aria-modal`, foco inicial previsível, trap de `Tab`, fechamento por `Escape` quando permitido e retorno de foco ao elemento que abriu o diálogo;
- feedback assíncrono deve usar `role="status"`/`aria-live="polite"` quando informativo e `role="alert"` quando exigir anúncio imediato; animações e transições devem respeitar o fallback global de `prefers-reduced-motion`;
- reutilize `EmptyState` para estados de página que compartilham a estrutura visual de ícone, título, descrição e ação opcional;
- extraia novos componentes-base somente quando houver repetição real de estrutura e semântica; controles específicos da feature permanecem locais até essa repetição existir.

## Documentação

Uma mudança está incompleta quando o comportamento mudou e os documentos correspondentes não.

Atualize:

- `README.md`/`getting-started.md` para primeiro uso;
- `architecture/*` para contratos/fluxos/segurança;
- `operations-and-troubleshooting.md` para variáveis/arquivos/diagnóstico;
- `.env.example` quando configuração local versionável mudar;
- `deployment-operations.md` e `production-ui.md` para produção;
- `guia/*` para a experiência do usuário;
- issues para backlog/roadmap que atravessa PRs.

Não recrie `tasks/`, `NEXT.md` ou roadmaps versionados.

## Validação final

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:cli
```

Rode também:

```bash
npm run test:e2e
```

quando o fluxo web alterado justificar.

## Checklist de revisão

- [ ] responsabilidade na camada correta;
- [ ] entradas, paths e provider data validados;
- [ ] nenhum shell arbitrário;
- [ ] mutação possui preview/confirmação/revalidação apropriados;
- [ ] logs/respostas possuem limites e masking;
- [ ] credenciais não vazam;
- [ ] shutdown/cancelamento fecham recursos;
- [ ] recovery representa efeitos parciais honestamente;
- [ ] testes cobrem sucesso e falhas relevantes;
- [ ] documentação, `.env.example` e issues estão coerentes;
- [ ] gates completos passaram no head final;
- [ ] auto-review foi executado depois do último commit.
