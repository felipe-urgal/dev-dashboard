# AGENTS.md

Guia canônico para agentes de IA que trabalhem neste repositório.

Use este arquivo para reduzir decisões ambíguas antes de editar código. Quando código e documentação divergirem, confirme o comportamento atual no código/testes e atualize a documentação obsoleta na mesma entrega.

## Integração com `agent-workflow`

Quando a execução vier do repositório externo `felipe-urgal/agent-workflow`:

1. leia `AGENTS-CONTRACT.md` no `agent-workflow`;
2. leia a definição do agent atual;
3. leia a task ativa no caminho canônico registrado pelo workflow;
4. leia este `AGENTS.md` e a documentação local aplicável;
5. revalide estado real de base/branch/head/PR antes de agir.

A divisão de autoridade é intencional:

- regras de plataforma, segurança e permissões continuam absolutas;
- este `AGENTS.md` define invariantes duráveis do Dev Dashboard, arquitetura, segurança, operação e gates locais;
- a task ativa do `agent-workflow` define o escopo e as decisões específicas da entrega e não deve ser redescoberta ou redefinida sem contradição nova ou risco real;
- código, testes e documentação local são evidência técnica do estado atual, mas não substituem silenciosamente uma decisão de produto já aprovada na task.

A task externa é **estado operacional do workflow**, não backlog do Dev Dashboard. Portanto a regra de não recriar `tasks/` neste repositório continua válida; não copie a task para cá.

### Modos de execução e evidência

A execução pode ocorrer em `FULL`, `REMOTE`, `PREPARE` ou `BLOCKED`, conforme `AGENTS-CONTRACT.md`.

- ausência de checkout local, shell ou Git local não encerra automaticamente o trabalho se existir caminho `REMOTE` seguro, suficiente e autorizado;
- `npm run check` local, CI remoto, inspeção de diff e validação manual são evidências diferentes e devem ser registradas como tal;
- nunca declare um gate como executado quando ele não foi realmente rodado ou observado;
- uma etapa do workflow pode terminar com limitações explicitamente registradas, mas **merge readiness** continua exigindo os gates obrigatórios do head final previstos por este projeto.

### Autorizações remotas

No modo `REMOTE`, trate autorizações separadamente:

- `remote_commits` pode autorizar commits por API remota na branch de trabalho;
- `push` autoriza push Git tradicional quando houver checkout/Git local;
- uma autorização não implica automaticamente a outra;
- criar/atualizar PR, merge, deploy, release, exclusões remotas e outras mutações continuam exigindo a autorização correspondente registrada na task ou dada explicitamente pelo usuário.

Quando não houver task ativa no `agent-workflow`, siga o fluxo local normal de issue/branch/PR descrito neste arquivo.

## Antes de editar

1. leia este arquivo;
2. leia [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md);
3. leia [`docs/architecture/overview.md`](docs/architecture/overview.md);
4. leia a documentação do domínio alterado;
5. confirme comportamento atual antes de reutilizar plano/histórico antigo.

Não é necessário ler todos os docs em toda mudança.

## Modelo mental

O projeto possui duas interfaces válidas:

```text
CLI Bash                    Dashboard Vue
lib/ + init.sh                   │
                                 ▼
                           API Fastify local
                                 │
                   packages + domínios da API
```

Produção possui domínio próprio:

```text
Production Contract
  ↓
planner
  ↓
confirmação + revalidação
  ↓
strategy=command | git-managed | self-update
  ↓
timeline / resultado / recovery
```

CLI e web são independentes; não sincronize implementações por reflexo.

## Regras inegociáveis

1. **Português brasileiro** em UI/docs/commits/PRs quando controlados pelo projeto.
2. **Simplicidade primeiro**: KISS/YAGNI; não crie abstração para possibilidade futura.
3. **Docs acompanham comportamento** na mesma entrega.
4. **Backlog não vive no repo**: não recrie `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap versionado. Use issues. Tasks externas do `agent-workflow` são estado operacional e não violam esta regra.
5. **API é fronteira de segurança**: sem shell arbitrário, paths livres ou credenciais vindas do browser.
6. **CLI Bash e web são interfaces independentes**.
7. **CLI interativo mantém `gum` + fallback Bash puro** quando aplicável.
8. **Estado visual é verdadeiro**: loading/progresso apenas durante trabalho real.
9. **Recursos duradouros exigem ownership e cleanup**.
10. **Mutações sensíveis exigem autoridade proporcional ao risco**: preview/confirmação/revalidação/recovery.
11. **Git remoto de escrita exige autorização do usuário**.
12. **Merge exige autorização explícita do usuário**, mesmo com CI verde.

## Camadas

| Área | Responsabilidade | Não deve virar |
| --- | --- | --- |
| `apps/api` | API, casos de uso, segurança, integrações, deployment | regra de UI |
| `apps/web` | apresentação/navegação/estado visual | executor de máquina local |
| `packages/contracts` | tipos/DTOs compartilhados | infraestrutura |
| `packages/core` | configuração/IDs/token local compartilháveis | Vue/Fastify |
| `packages/project-discovery` | discovery/profile/capabilities read-only | lifecycle mutável |
| `packages/process-manager` | processos de desenvolvimento conhecidos | executor universal |
| `lib/` | CLI Bash original | implementação obrigatória da web |
| `scripts/` | tooling do próprio repo | ação livre enviada pelo browser |
| `docs/` | comportamento/arquitetura/guia atual | backlog |

Deployment, Script Execution, Process Manager e Self Update possuem lifecycles distintos. Não junte domínios apenas porque ambos usam `spawn`.

## Backend/API

- Fastify + JSON Schema são a fronteira HTTP.
- Declare params/query/body/responses conforme aplicável.
- Use schemas fechados quando o contrato exigir.
- Erros distinguíveis pelo cliente recebem código público estável.
- `docs/architecture/api-reference.md` é gerada; não edite manualmente.

Quando rota/schema mudar:

```bash
npm run docs:api
npm run docs:api:check
```

### Composição

`app.ts` preserva segurança e registro de rotas. Construção/lifecycle ficam nas camadas de contexto/composição existentes (`app-context*`, `app-composition`) para evitar um composition root monolítico.

Serviço que mantém processos, PTYs, sessions, streams, timers, subscriptions ou locks precisa de fechamento idempotente explícito.

### Segurança

Leia [`docs/architecture/security.md`](docs/architecture/security.md) antes de alterar fronteiras sensíveis.

Preserve:

- loopback por padrão;
- autenticação/origem;
- `GET /api/health` como rota pública prevista;
- IDs/payloads estruturados em vez de shell livre;
- programa/argv/cwd resolvidos pelo backend;
- canonicalização e controle de symlink/path;
- limites de arquivos/logs/respostas;
- masking e ausência de secrets desnecessários;
- providers externos como input não confiável;
- confirmação/revalidação em mutações;
- proteção contra TOCTOU quando o estado puder mudar.

## Frontend

O frontend apresenta estado e envia intenção estruturada. Ele não escolhe comando final, `cwd`, path de autoridade, token de provider ou credencial local.

### Política de UI

O produto prioriza **simples, ágil e funcional**.

Prefira:

- ação no contexto onde é usada;
- hierarquia curta;
- linguagem direta;
- pouco estado duplicado;
- loading real;
- confirmação proporcional ao risco.

Evite:

- títulos/cards/resumos redundantes;
- filtros sem volume que os justifique;
- botões duplicados;
- tela intermediária sem decisão;
- animação artificial;
- abstração visual antes de repetição real.

### Estado assíncrono

Siga [`docs/architecture/frontend-live-state.md`](docs/architecture/frontend-live-state.md):

1. snapshot quando basta;
2. SSE/WS quando já existe fonte adequada;
3. polling somente como fallback explícito com lifecycle.

Abortar `fetch` não prova cancelamento de mutação já aceita. Respostas antigas não podem sobrescrever projeto/workspace/contexto novo.

### Acessibilidade

Considere teclado, foco, retorno de foco em dialogs, semântica, responsividade, live regions quando necessário e `prefers-reduced-motion`.

Prefira Vue declarativo; não use enhancer/`MutationObserver` global para corrigir comportamento que pertence ao componente/store/composable.

## Packages

### `packages/contracts`

Tipos/DTOs puros e serializáveis. Sem Fastify/Vue/processos/filesystem.

### `packages/core`

Configuração/IDs/token local compartilháveis, independente das aplicações.

### `packages/project-discovery`

Discovery Rails/Node/capabilities e providers de profile read-only. Preserve limites, warnings, symlinks e fail-closed.

### `packages/process-manager`

Lifecycle de processos conhecidos de desenvolvimento. Preserve comando reconhecido, `cwd`, `shell:false`, identidade, logs limitados, persistência, TERM→KILL e cleanup.

Deployment e self-update não são kinds do Process Manager.

## Produção

Leia:

- [`docs/PRODUCTION.md`](docs/PRODUCTION.md) para o próprio Dashboard;
- [`docs/architecture/production-contract.md`](docs/architecture/production-contract.md);
- [`docs/architecture/deployment-domain.md`](docs/architecture/deployment-domain.md);
- [`docs/architecture/security.md`](docs/architecture/security.md);
- [`docs/deployment-operations.md`](docs/deployment-operations.md);
- [`docs/production-ui.md`](docs/production-ui.md).

Invariantes:

1. branch/revision/plano revalidados;
2. confirmação vinculada ao `planHash`/alvo;
3. browser não fornece shell/programa/argv/token;
4. provider `READY` não substitui health;
5. irreversibilidade pode exigir `recovery_required`;
6. retry de verify não repete mutação anterior;
7. logs/providers são bounded/sanitizados;
8. credenciais ficam fora de manifesto/responses/persistência.

### `strategy=command`

Somente aliases `prod:*` canônicos reconhecidos.

### `strategy=git-managed`

Não invente `prod:deploy` local. A promoção usa `provider-deploy` e a revision remota precisa provar o SHA confirmado.

### `strategy=self-update`

O próprio Dashboard usa:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

Não existe `npm run prod:deploy`.

`self-update:*` é tooling de engenharia, não bypass. Handoff/agent/worker precisam preservar fast-forward, ownership, readiness e proof-of-revision.

Quando `local:install` está ativo, a integração permanente usa `systemd --user` e unit fixa `dev-dashboard.service`, sem root. A limitação operacional atual de redeploy está rastreada em #659; não contorne removendo provas de ownership.

## CLI Bash

Ao tocar `lib/`/`init.sh`:

- preserve convenções existentes;
- mantenha `gum` + fallback quando a função é interativa;
- não duplique lifecycle sem necessidade;
- rode `npm run test:cli`;
- valide os dois caminhos de UI quando aplicável.

## Gate de qualidade

Para uma mudança normal, o gate local canônico é:

```bash
npm run check
```

Hoje ele executa:

```text
format:check
-> lint
-> test
-> build:apps
```

`npm test` possui `pretest`, que compila packages antes das suítes.

O workflow `CI` usa Node 24 e executa:

```text
npm ci --ignore-scripts
-> npm rebuild esbuild node-pty
-> npm run check
```

Checks direcionados complementam o gate:

| Mudança | Validação adicional |
| --- | --- |
| CLI Bash | `npm run test:cli` |
| rota/schema | `npm run docs:api && npm run docs:api:check` |
| tipos/packages | `npm run typecheck` quando o risco justificar |
| jornada web crítica | `npm run test:e2e` |
| coverage | `npm run test:coverage` sob demanda |
| self-production | `npm run prod:check` quando o agent local estiver disponível |

`format:check` já faz parte de `npm run check`; execute isoladamente apenas para diagnóstico.

Coverage não é gate percentual.

Quando o ambiente não puder executar um gate:

- registre-o como **não executado**, com a limitação concreta;
- procure evidência remota equivalente quando ela existir, sem chamá-la de teste local;
- não transforme ausência de capacidade em aprovação técnica falsa;
- antes de merge, o head final precisa satisfazer os gates obrigatórios e o CI exigido pelo repositório.

## Git e PR

O fluxo de issue/branch/PR continua sendo o fluxo local revisável do Dev Dashboard. Quando houver task ativa no `agent-workflow`, o contrato compartilhado controla handoff, estados terminais, sincronização da task e autorizações; este arquivo não duplica esse protocolo.

Para alterações versionadas:

```text
escopo aprovado
→ branch curta
→ implementação + testes/docs
→ npm run check quando executável localmente
→ checks direcionados
→ PR quando autorizado
→ CI no head final
→ review final
→ correções
→ novo CI/review se o SHA mudar
→ merge somente com autorização explícita
```

Não faça push, commits remotos, abertura/atualização de PR, merge, delete remoto ou operação de produção sem a autorização aplicável ao fluxo atual.

## Documentação

`docs/` descreve o estado implementado. Documentos históricos precisam estar claramente marcados como removidos/históricos.

Backlog/roadmap/débito ficam em issues. Não crie arquivos de tarefas locais. A task operacional externa do `agent-workflow` não deve ser copiada para este repositório.

## Definição de pronto

Para uma **etapa do agent-workflow**, pronto significa que o agent cumpriu seu papel, revisou o estado/diff aplicável, registrou evidências reais, limitações e findings e sincronizou a task para um estado terminal válido.

Para uma mudança estar **pronta para merge** no Dev Dashboard:

- resolve o problema declarado;
- respeita as fronteiras de segurança/lifecycle;
- possui testes proporcionais ao risco;
- atualiza docs/contratos necessários;
- não introduz secrets;
- `npm run check` passou no head final por execução local ou CI equivalente realmente observada conforme o fluxo;
- checks adicionais aplicáveis passaram;
- o diff final foi revisado;
- o CI obrigatório do head final está verde;
- não existem findings bloqueantes conhecidos;
- merge só ocorre após autorização explícita do usuário.
