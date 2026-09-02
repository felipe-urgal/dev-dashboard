# Self-production do Dev Dashboard

O Dev Dashboard opera produção de outros projetos e agora possui uma cadeia operacional de self-update capaz de transferir ownership para um worker externo, parar a API antiga, aplicar `origin/main`, reiniciar o runtime e comprovar a revision que voltou.

Mesmo assim, o contrato do próprio repositório permanece deliberadamente **fail-closed**:

```text
production.enabled=false
strategy=disabled
provider=none
```

A implementação do mecanismo não habilita o planner automaticamente. A habilitação fica para o PR D, depois da revisão final de segurança e do modelo de privilégio.

## Por que a API não pode ser a única coordenadora

No self-update, a API que inicia a operação também precisa parar. Se o Fastify fosse o único dono da execução, desapareceriam junto com ele ownership, resultado terminal, readiness pós-restart e a prova de qual revision realmente voltou.

Por isso o fluxo usa três camadas:

```text
API atual
   ↓
handoff persistente + agent local autenticado
   ↓
worker instalado fora da checkout
```

O worker continua executando quando a API antiga encerra.

## Contrato atual

`.dev-dashboard/production.json` continua sendo a fonte do gate:

```bash
npm run prod:status
npm run prod:check
```

`prod:check` falha de propósito enquanto `strategy=disabled`.

Depois do PR C, os blockers operacionais de integração/update/health deixam de ser descritos como não implementados. Permanecem:

```text
privilege-model-not-validated
self-update-security-review-not-completed
```

A frente é rastreada pela #487, dentro da #482.

## PR A — handoff persistente

`scripts/self-update-helper.mjs` + `scripts/self-update-handoff.mjs` implementam o protocolo persistente v1.

O helper possui catálogo fechado:

```text
prepare
claim
inspect
recover
```

Ele não recebe shell, programa, argumentos, checkout, unit systemd ou credencial.

Os handoffs ficam sob:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/self-update/
```

Diretório e arquivos usam permissões privadas (`0700`/`0600`), escrita atômica e validação fail-closed de shape, tamanho, symlink, owner e ID.

Cada handoff contém somente:

- `version=1`;
- ID gerado localmente;
- `action=self-update` fixa;
- `projectId`;
- `targetRevision`;
- `planHash`;
- estado/timestamps;
- resultado terminal sanitizado.

### Estados

```text
prepared
  ↓
accepted
  ↓
applying
  ↓
restarting
  ↓
verifying
  ↓
succeeded
```

Falhas podem terminar em `failed` ou `recovery_required` conforme a etapa.

## PR B — agent instalado, lifecycle e canal local

`scripts/self-update-agent.mjs` pode ser instalado fora da checkout:

```bash
npm run self-update:agent -- install
npm run self-update:agent -- start
npm run self-update:agent -- status
npm run self-update:agent -- ping
npm run self-update:agent -- stop
```

A instalação padrão fica em:

```text
~/.local/lib/dev-dashboard/self-update-agent/
```

Releases são identificadas por SHA-256. Manifesto, diretórios, arquivos, permissões e hashes são revalidados antes do start. O modo `serve` só executa o entrypoint da release instalada.

O agent é um processo user-space separado do Fastify e usa Unix socket local privado + token próprio. O catálogo remoto continua fechado em:

```text
ping
inspect
claim
recover
```

Não existe `execute` remoto genérico no socket.

## PR C — API → agent → worker → restart → readiness

O PR #523 fecha a cadeia operacional mantendo o Production Contract desabilitado.

### 1. Handoff e ownership antes da parada

`SelfUpdateHandoffService` executa somente uma sequência fixa:

```text
validar projectId + targetRevision + planHash
        ↓
ping autenticado no agent
        ↓
helper prepare
        ↓
agent claim do mesmo handoff
        ↓
execute <handoff-id>
        ↓
provar execution.lock do PID/handoff esperado
        ↓
solicitar SIGTERM controlado da API
```

O `execute` local faz o preflight antes de iniciar o worker externo. Depois do spawn, a API não considera “worker iniciado” suficiente: ela aguarda um lock privado com o mesmo PID e handoff ID e confirma que o processo continua vivo.

Só depois dessa prova o `AppContext` agenda `SIGTERM` para a própria API. Em execução normal, o handler já existente do servidor fecha Fastify e seus recursos de forma controlada.

O browser não escolhe shell, programa, revision, checkout, path, unit ou comando. O único argumento variável do `execute` é o ID do handoff previamente criado e validado.

### 2. Preflight Git

A checkout precisa:

1. ser diretório absoluto real, não symlink;
2. pertencer ao usuário atual;
3. possuir `package.json` com `name=dev-dashboard`;
4. ter working tree completamente limpa, incluindo untracked;
5. estar em `main`;
6. conseguir `git fetch --no-tags origin main`;
7. resolver `origin/main` exatamente para `targetRevision`;
8. provar fast-forward entre `HEAD` e a revision alvo.

Não existe `reset --hard` ou checkout forçado para apagar estado local.

### 3. Aplicação e restart

O worker instalado aguarda a API antiga deixar a porta. Depois:

```text
applying
   ↓
preflight Git novamente
   ↓
git merge --ff-only <targetRevision>
   ↓
HEAD == targetRevision
   ↓
reinstala release do agent a partir da nova revision
   ↓
restarting
   ↓
inicia scripts/dev-web.mjs destacado
   ↓
verifying
```

O restart é user-space, sem `sudo`, `systemctl` ou unit configurável pelo cliente.

### 4. Readiness com prova de revision

A nova API continua respondendo o JSON público tradicional de `/api/health`:

```json
{
  "status": "ok",
  "service": "dev-dashboard-api",
  "timestamp": "..."
}
```

Quando o runtime foi iniciado pelo worker, `DEV_DASHBOARD_RUNTIME_REVISION` é validada como SHA hexadecimal e publicada somente no header:

```text
x-dev-dashboard-revision: <targetRevision>
```

Esse detalhe preserva o contrato JSON público e permite que o worker prove a revision sem aceitar um valor arbitrário do navegador.

O worker só termina em `succeeded` quando:

- health retorna HTTP utilizável;
- `status=ok`;
- `service=dev-dashboard-api`;
- o header contém exatamente a `targetRevision`;
- a revision comprovada coincide com a revision que foi aplicada na checkout.

Health sem header, header inválido ou revision diferente continua sendo “não pronto” até o timeout bounded e termina conservadoramente.

`DEV_DASHBOARD_RUNTIME_REVISION` é variável interna do restart e não deve ser configurada manualmente em `.env.local`.

### 5. Resultado e recovery

Falha antes da mutação operacional pode terminar em `failed`.

Depois que a execução entra em `applying`, uma falha vira `recovery_required`, porque checkout/runtime já podem ter sido alterados. Isso inclui nova API que volta com revision errada ou não comprova readiness dentro do limite.

O agent também mantém recovery conservador no startup para handoffs anteriormente assumidos sem resultado terminal. Não há rollback automático cego.

## Teste real de restart/recovery

`scripts/self-update-restart.integration.test.mjs` exercita a cadeia com processos e Git reais, sem alterar a checkout do CI:

1. cria repositório temporário `dev-dashboard` + bare remote `origin`;
2. mantém a checkout local numa revision anterior e `origin/main` numa revision alvo;
3. sobe uma API antiga real em processo Node separado;
4. cria handoff aceito e inicia o worker;
5. espera o lock de ownership;
6. encerra a API antiga;
7. executa fetch + fast-forward reais;
8. inicia um novo runtime HTTP real;
9. valida health + `x-dev-dashboard-revision`;
10. confirma `succeeded` + `HEAD` alvo.

O segundo cenário inicia deliberadamente o novo runtime com outra revision. O health responde, mas a prova de revision falha; o handoff termina em `recovery_required` com `SELF_UPDATE_READINESS_TIMEOUT`.

Assim o teste diferencia “porta voltou” de “revision correta voltou”.

## Modelo de privilégio

O mecanismo do PR C não usa privilégio root. Git, instalação user-space do agent e `dev-web` rodam com o mesmo usuário do Dev Dashboard.

Fastify não recebe sudo amplo e a senha do modal de deployment não é reutilizada.

O PR D ainda precisa revisar formalmente se esse modelo user-space é suficiente para o modo final de operação. Se surgir necessidade de root/systemd, isso será uma nova fronteira de segurança e não poderá aceitar unit/path/comando livre.

## Configuração local

Variáveis comuns estão em `.env.example` e `docs/operations-and-troubleshooting.md`.

Overrides avançados do agent:

```text
DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR
DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR
```

não são carregados automaticamente por `npm run self-update:agent`; devem ser exportados conscientemente quando necessários.

Variáveis internas:

```text
DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT
DEV_DASHBOARD_RUNTIME_REVISION
```

não pertencem ao contrato público nem são configuração editável do `.env.local`.

## Condições para habilitar

A cadeia operacional agora cobre:

- [x] helper/agent externo separado da API;
- [x] instalação fora da checkout;
- [x] catálogo fechado e canal autenticado;
- [x] handoff persistido antes da parada;
- [x] ownership do worker comprovado antes do shutdown;
- [x] aplicação/restart independente da API antiga;
- [x] readiness bounded;
- [x] comprovação da revision aplicada;
- [x] resultado terminal persistido/recuperável;
- [x] teste real de restart e recovery por revision divergente;
- [x] documentação operacional do fluxo.

Antes de `production.enabled=true`, ainda faltam:

- [ ] revisão formal do modelo de privilégio;
- [ ] revisão de segurança específica do PR C/fluxo final;
- [ ] PR D habilitando conscientemente o contrato e integrando-o ao planner/UI sem bypass.

## Relação com issues/PRs

- #482 — frente ampla de produção;
- #487 — self-production/self-update;
- #505 — contrato fail-closed;
- #520 — handoff/helper;
- #521 — instalação/lifecycle/canal local;
- #523 — integração API→agent, shutdown, update/restart/readiness e testes reais;
- PR D — habilitação, somente após revisão final.
