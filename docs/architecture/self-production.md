# Self-production do Dev Dashboard

O Dev Dashboard pode atualizar a própria instalação pela mesma superfície de Production usada pelos demais projetos, mas com uma estratégia própria e fechada: `self-update`.

O contrato atual é habilitado conscientemente:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

Não existe `prod:deploy` local, executor remoto genérico, unit, path executável ou comando escolhido pelo browser. A mutação pertence exclusivamente ao protocolo de handoff + worker documentado aqui.

Quando a instalação local opcional está ativa, o restart pode ser delegado somente à unit fixa `dev-dashboard.service` criada e marcada pelo próprio `local:install`.

## Decisão arquitetural: privilégio user-space

O modelo suportado é user-space.

O self-update precisa somente de:

- leitura/escrita na checkout do próprio usuário;
- `git fetch` e `git merge --ff-only` no repositório;
- estado privado em `~/.local/state/dev-dashboard`;
- configuração/token privado em `~/.config/dev-dashboard`;
- instalação do agent em `~/.local/lib/dev-dashboard/self-update-agent`;
- start/restart do runtime com o mesmo usuário;
- opcionalmente, `systemctl --user restart dev-dashboard.service` quando a instalação local gerenciada estiver comprovada.

O fluxo **não usa `sudo`, unit system-wide nem privilégio root**. A senha e o ticket de sudo usados por deployments locais de outros projetos não são reutilizados.

A integração opcional com systemd permanece no escopo da sessão do usuário. Ela não amplia o catálogo remoto do self-update: o worker não recebe nome de unit, path ou comando do browser. A única unit aceita é a constante `dev-dashboard.service`, com metadados locais válidos e marcador de ownership do instalador.

## Production Contract fechado

`.dev-dashboard/production.json` aceita para esta estratégia somente:

```json
{
  "enabled": true,
  "strategy": "self-update",
  "provider": "none",
  "branch": "main",
  "commands": {
    "status": "prod:status",
    "check": "prod:check"
  },
  "policies": {
    "backup": "not-configured",
    "migrations": "not-configured",
    "rollback": "not-configured"
  }
}
```

O parser rejeita `deploy`, `migrate`, `backup`, `rollback`, `verify` local, provider externo, `blockedBy` residual ou políticas que ampliem a autoridade dessa estratégia.

`npm run prod:check` valida o contrato acima e só passa quando o self-update agent responde `ready` e comprova as capacidades necessárias de ownership/inspeção.

`npm run prod:status` é somente leitura: informa se o contrato está habilitado e se o agent está pronto.

## Planner e confirmação

O planner produz somente:

```text
check
  ↓
self-update
```

A revision do plano é resolvida diretamente de `origin/main`, não do HEAD local. Assim a operação pode atualizar uma checkout local anterior sem permitir que o browser escolha o SHA.

O fluxo usa a confirmação normal do domínio de deployment:

1. resolve `origin/main` no backend;
2. monta plano determinístico;
3. calcula `planHash`;
4. emite confirmação vinculada a `projectId + revision + planHash`;
5. em `start()`, recalcula e revalida o plano;
6. antes de cada etapa, confirma novamente branch local e revision atual de `origin/main`.

Se `origin/main` mudar entre preview, confirmação e execução, o deployment falha como stale e um novo plano precisa ser gerado.

## Handoff determinístico

A etapa `self-update` não passa pelo adapter de comandos. O domínio de deployment cria um handoff com ID determinístico derivado do deployment:

```text
self-update-<deployment UUID>
```

O handoff contém somente:

- `action=self-update` fixa;
- `projectId`;
- `targetRevision`;
- `planHash`;
- estados/timestamps;
- resultado terminal sanitizado.

O store recusa sobrescrever um handoff já existente com o mesmo ID.

## Ownership antes do shutdown

`SelfUpdateHandoffService` executa uma sequência fixa:

```text
validar contexto confirmado
        ↓
ping autenticado no agent
        ↓
helper prepare com handoff ID determinístico
        ↓
agent claim do mesmo handoff
        ↓
execute <handoff-id>
        ↓
provar execution.lock do PID/handoff esperado
        ↓
solicitar SIGTERM controlado da API
```

A API só solicita shutdown depois que o worker externo existe, continua vivo e adquiriu o lock privado correspondente ao mesmo handoff.

A partir desse ponto o cancelamento pela API antiga não é permitido: o ownership já pertence ao worker.

## Preflight Git e aplicação

O worker revalida antes de mutar:

1. checkout absoluta, real e pertencente ao usuário atual;
2. `package.json` com `name=dev-dashboard`;
3. working tree completamente limpa, inclusive untracked;
4. branch local `main`;
5. `git fetch --no-tags origin main`;
6. `origin/main == targetRevision` confirmada;
7. HEAD atual é ancestral da revision alvo.

A aplicação é somente:

```text
git merge --ff-only <targetRevision>
```

Depois o worker exige `HEAD == targetRevision`.

Não existe `reset --hard`, checkout forçado ou descarte automático de mudanças locais.

## Restart e prova de revision

Depois da aplicação o worker:

1. reinstala a release conhecida do self-update agent a partir da nova revision;
2. inicia `scripts/dev-web.mjs` em processo destacado, propagando a revision alvo e a raiz canônica da checkout do handoff;
3. `dev-web.mjs` decide entre runtime direto e handoff para instalação local gerenciada;
4. aguarda `/api/health`;
5. exige `status=ok` e `service=dev-dashboard-api`;
6. exige o header `x-dev-dashboard-revision` exatamente igual à revision alvo.

O processo destacado recebe duas variáveis internas vinculadas ao mesmo handoff validado:

```text
DEV_DASHBOARD_RUNTIME_REVISION=<targetRevision>
DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT=<canonicalRepositoryRoot>
```

A segunda variável não amplia autoridade: `dev-web.mjs` resolve ambos os paths para caminhos reais e só delega ao systemd quando a raiz do handoff é exatamente a checkout local instalada.

### Sem instalação gerenciada

Sem uma instalação local válida para a mesma checkout, `dev-web.mjs` inicia o runtime diretamente como no fluxo anterior.

### Com instalação gerenciada

Quando a mesma checkout possui metadados válidos de `local:install` e a unit contém o marcador de ownership, o handoff deve executar somente:

```text
systemctl --user restart dev-dashboard.service
```

A unit é uma constante interna, não um campo do handoff ou payload do browser.

No modo `--installed`, `dev-web.mjs` deriva a revision atual da checkout e trata os metadados de `local:install` como autoridade para porta e origem. Alterações posteriores em `.env.local` não podem fazer a unit subir em uma origem diferente da registrada pela instalação.

Somente depois de health + revision comprovados o handoff termina em `succeeded`.

Uma porta HTTP que voltou sem a revision correta não é sucesso.

## Contrato do handoff gerenciado

O handoff do worker para `dev-web.mjs` preserva explicitamente a raiz canônica que já foi validada antes da mutação. Isso é necessário porque a revision alvo, isoladamente, não prova que o processo destacado pertence à mesma instalação local gerenciada.

O `dev-web.mjs` só delega o restart quando todas as provas convergem:

```text
revision alvo válida
+ raiz do handoff presente
+ raiz real do processo == raiz real do handoff
+ metadata de local:install para a mesma checkout
+ unit fixa dev-dashboard.service
+ marcador de ownership do instalador
= restart permitido via systemd --user
```

Se qualquer uma dessas provas falhar, a delegação retorna ao comportamento não instalado existente. O worker continua responsável por validar health e revision depois do restart; nenhuma delegação bem-sucedida fabrica `succeeded` sem essa comprovação.

## Reconciliação depois do restart

O `DeploymentStore` continua tratando qualquer execução interrompida de forma conservadora. Ao iniciar novamente, um deployment que estava em `self-update` pode aparecer temporariamente como interrompido.

Quando `get/history` lê esse deployment, o domínio consulta `inspect` usando o handoff determinístico e o mesmo `projectId + revision + planHash`:

- `accepted/applying/restarting/verifying` → volta a `deploying` e continua sendo acompanhado;
- `succeeded` + `appliedRevision == revision confirmada` → deployment `succeeded`;
- `failed` antes da mutação → deployment `failed`;
- `recovery_required` depois da mutação → deployment `recovery_required`;
- resultado `succeeded` com revision divergente → `recovery_required`.

Falha ao consultar o agent nunca cria sucesso por inferência; o estado conservador persistido é mantido.

## UI

Projetos com `strategy=self-update` usam um painel próprio na aba Produção.

A tela:

- mostra a revision alvo de `origin/main`;
- mostra somente `check` e `self-update`;
- usa a confirmação normal do deployment;
- não abre modal de sudo;
- não expõe cancelamento depois do handoff;
- durante o restart, trata a indisponibilidade temporária da API como reconexão e continua polling;
- exibe o resultado reconciliado e o log local do deployment.

## Segurança do canal local

O agent instalado vive fora da checkout e usa Unix socket privado + token próprio. O catálogo remoto permanece fechado:

```text
ping
inspect
claim
recover
```

Não existe ação remota que receba shell, programa, argv, checkout, unit, URL ou credencial.

`execute <handoff-id>` é uma chamada local com um único identificador previamente persistido e validado.

Quando o runtime está instalado com `local:install`, a delegação ao systemd exige simultaneamente:

- metadados locais válidos;
- mesma checkout real do handoff;
- unit exatamente `dev-dashboard.service`;
- arquivo de unit marcado como gerenciado pelo instalador.

Falha em qualquer prova não amplia autoridade.
