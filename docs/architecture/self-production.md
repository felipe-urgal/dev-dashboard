# Self-production do Dev Dashboard

O Dev Dashboard pode atualizar a própria instalação pela mesma superfície de Production usada pelos demais projetos, mas com uma estratégia própria e fechada: `self-update`.

O contrato atual é habilitado conscientemente:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

Não existe `prod:deploy` local, executor remoto genérico, unit, path executável ou comando escolhido pelo browser. A mutação pertence exclusivamente ao protocolo de handoff + worker documentado aqui. Quando a instalação local opcional está ativa, o restart pode ser delegado somente à unit fixa `dev-dashboard.service` criada e marcada pelo próprio `local:install`.

## Decisão arquitetural: privilégio user-space

A revisão final concluiu que o modelo user-space existente é suficiente para a operação suportada. Essa decisão foi habilitada no #527 e faz parte do contrato `self-update` v1.

O self-update precisa somente de:

- leitura/escrita na checkout do próprio usuário;
- `git fetch` e `git merge --ff-only` no repositório;
- estado privado em `~/.local/state/dev-dashboard`;
- configuração/token privado em `~/.config/dev-dashboard`;
- instalação do agent em `~/.local/lib/dev-dashboard/self-update-agent`;
- start do runtime `scripts/dev-web.mjs` com o mesmo usuário;
- opcionalmente, `systemctl --user start dev-dashboard.service` quando a instalação local gerenciada estiver comprovada.

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

`npm run prod:check` não é mais um bloqueio estático. Ele valida o contrato acima e só passa quando o self-update agent responde `ready` e comprova suporte a `claim` + `inspect`.

`npm run prod:status` é somente leitura: informa se o contrato está habilitado e se o agent está pronto.

## Planner e confirmação

O planner produz somente:

```text
check
  ↓
self-update
```

A revision do plano é resolvida diretamente de `origin/main`, não do HEAD local. Assim a operação pode atualizar uma checkout local anterior sem permitir que o browser escolha o SHA.

O fluxo continua usando a confirmação normal do domínio de deployment:

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

Esse vínculo permite que a nova API reconcilie o resultado depois do próprio restart sem adicionar outro identificador controlado pelo browser nem migrar o formato persistido do deployment.

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
2. inicia `scripts/dev-web.mjs` em processo destacado;
3. `dev-web.mjs` verifica se existe uma instalação local gerenciada para a mesma checkout;
4. se existir, delega o start somente para `systemctl --user start dev-dashboard.service`; se não existir, mantém o start direto anterior;
5. aguarda `/api/health`;
6. exige `status=ok` e `service=dev-dashboard-api`;
7. exige o header `x-dev-dashboard-revision` exatamente igual à revision alvo.

No modo instalado, `dev-web.mjs --installed` deriva a revision atual da checkout e trata os metadados de `local:install` como autoridade para porta e origem. Assim alterações posteriores em `.env.local` não fazem a unit subir em uma origem diferente da registrada pela instalação.

Somente então o handoff termina em `succeeded`.

Uma porta HTTP que voltou sem a revision correta não é sucesso.

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

Falha em qualquer uma dessas provas não amplia autoridade; o fluxo volta ao comportamento direto anterior ou falha de forma conservadora.

## Recovery

Falha antes da aplicação pode terminar em `failed`.

Depois que o worker entra em `applying`, qualquer incerteza relevante termina em `recovery_required`, incluindo:

- falha ao aplicar o fast-forward;
- runtime que não volta;
- readiness que expira;
- revision diferente da confirmada;
- execução assumida sem resultado terminal confiável.

Não há rollback automático cego.

## Testes de regressão

A cadeia possui testes para:

- shape fechado do Production Contract;
- gate positivo/negativo do agent;
- handoff ID determinístico e proteção contra sobrescrita;
- planner `check → self-update`;
- target vindo de `origin/main`;
- entrega do handoff sem passar pelo adapter de comandos;
- restart/reconciliação para `succeeded`;
- mapeamento conservador para `recovery_required`;
- executor real com Git, restart, health e prova de revision;
- delegação ao systemd somente para instalação local comprovadamente gerenciada;
- porta/origem instaladas prevalecendo sobre ambiente divergente.

## Relação com issues/PRs

- #482 — frente ampla de produção;
- #487 — self-production/self-update;
- #505 — contrato fail-closed inicial;
- #520 — handoff/helper;
- #521 — instalação/lifecycle/canal local;
- #523 — API → agent → worker → restart/readiness;
- #527 — revisão final de privilégio/segurança, integração ao deployment e habilitação do contrato;
- #646 — instalação local, autostart user-space e URL amigável.
