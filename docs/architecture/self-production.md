# Self-production do Dev Dashboard

O Dev Dashboard opera produção de outros projetos, mas o próprio repositório permanece com self-production **fail-closed** enquanto a cadeia completa de handoff, update, restart, readiness, prova da revision e recovery não estiver comprovada end-to-end.

O contrato continua deliberadamente:

```text
production.enabled=false
strategy=disabled
provider=none
```

Esse estado é uma decisão de segurança. A existência de tooling de self-update não habilita o planner nem cria um `prod:deploy` alternativo.

## Por que a API não pode ser a única coordenadora

Um deployment normal é coordenado pela API local. No self-update, a API que coordena a operação também precisa parar para que a nova revision assuma a porta e o runtime.

Se o Fastify fosse o único dono da execução, desapareceriam junto com ele:

- ownership do trabalho;
- timeline/resultado terminal;
- readiness pós-restart;
- decisão entre falha simples e `recovery_required`;
- prova de qual revision realmente voltou.

Por isso o fluxo usa handoff persistente + agent/worker externo.

## Contrato atual

`.dev-dashboard/production.json` declara o gate de self-production e seus blockers.

```bash
npm run prod:status
npm run prod:check
```

`prod:check` falha de propósito enquanto o contrato estiver desabilitado. O domínio não deve contornar `strategy=disabled`.

A frente é rastreada por #487, dentro da iniciativa #482.

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

O diretório usa `0700` e os arquivos JSON `0600`, com escrita atômica por temporário + `rename`. Shape, tamanho, tipo de arquivo, symlink, permissões e vínculo entre ID solicitado e ID persistido são validados de forma fail-closed.

Cada handoff registra somente metadados estruturados:

- `version=1`;
- `id` gerado pelo helper;
- `action=self-update` fixa;
- `projectId`;
- `targetRevision`;
- `planHash`;
- estado e timestamps;
- resultado terminal sanitizado quando existir.

O arquivo persistido não concede autorização por si só.

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

Falhas podem terminar em `failed` ou `recovery_required` conforme a etapa. Transições fora do grafo fechado são recusadas.

## PR B — agent instalado, lifecycle e canal local

`scripts/self-update-agent.mjs` adiciona uma cópia instalada fora da checkout, processo próprio e canal local autenticado.

Fluxo operacional base:

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

Cada release é identificada por SHA-256 dos arquivos conhecidos. `current.json` registra os hashes esperados; manifesto, diretórios e arquivos são revalidados antes do start.

O modo interno `serve` só executa o entrypoint da release instalada apontada pelo manifesto. Assim, o processo de longa duração não roda diretamente o arquivo mutável da checkout.

O agent é iniciado com `shell: false`, processo destacado e lifecycle independente do Fastify.

### Canal Unix autenticado

O agent não abre TCP. O socket padrão fica em:

```text
$XDG_RUNTIME_DIR/dev-dashboard/self-update-agent/agent.sock
```

Quando `XDG_RUNTIME_DIR` não existe, é usado um diretório privado sob o estado local. Diretório e socket usam permissões restritas (`0700`/`0600`).

Existe um token próprio do agent em:

```text
${DEV_DASHBOARD_CONFIG_DIR:-~/.config/dev-dashboard}/self-update-agent-token
```

Esse token é separado do token HTTP, não entra no handoff, não retorna em resposta e é comparado em tempo constante.

O catálogo remoto do socket continua fechado em:

```text
ping
inspect
claim
recover
```

Não existe ação remota genérica `execute`, shell, programa, args, path ou unit. `claim` e `recover` são serializados.

## PR C — integração API → agent e worker operacional

O PR #523 adiciona a camada operacional sem habilitar o Production Contract.

### Integração no backend

`SelfUpdateHandoffService` é registrado no `AppContext` e executa uma sequência fixa:

```text
validar projectId/revision/planHash
        ↓
ping no agent autenticado
        ↓
helper prepare
        ↓
agent claim do mesmo handoff
        ↓
comando local execute do mesmo ID
```

Os caminhos dos scripts e os argumentos possíveis são resolvidos pelo backend. O browser não escolhe shell, programa, checkout, unit ou comando.

A API também revalida que o handoff retornado por helper/agent pertence ao mesmo `projectId`, `targetRevision`, `planHash`, ID e timestamp de criação.

Esta integração ainda não é uma rota pública de self-production nem um bypass do planner. `strategy=disabled` continua sendo a fonte de verdade do produto.

### Execução local fechada

O comando local:

```text
self-update-agent execute <handoff-id>
```

aceita apenas um ID de handoff já assumido. Ele não recebe revision, path, comando ou unit em argv.

Antes de iniciar o worker, a execução valida novamente a checkout e a revision alvo.

O worker externo roda a partir da release instalada/verificada do agent, não diretamente da checkout, e recebe internamente somente o caminho de checkout que foi validado pela própria cópia confiável do tooling.

### Preflight Git

A checkout precisa:

1. ser diretório absoluto real, não symlink;
2. pertencer ao usuário atual;
3. possuir `package.json` com `name=dev-dashboard`;
4. ter working tree completamente limpa, incluindo untracked;
5. estar na branch `main`;
6. conseguir executar `git fetch --no-tags origin main`;
7. resolver `origin/main` exatamente para `targetRevision`;
8. provar que a revision alvo é fast-forward do `HEAD` atual.

Nenhum reset forçado ou checkout destrutivo é usado.

### Exclusividade

Antes da execução existe um lock privado em `self-update/execution.lock`.

O lock contém apenas PID + handoff ID, usa `0600` e é validado contra tipo, symlink, owner, tamanho e PID vivo. Um segundo worker ativo é recusado.

Lock stale só é removido depois de confirmar que o PID registrado não está vivo.

### Parada, aplicação e restart

Depois do handoff aceito, o worker instalado pode sobreviver ao Fastify antigo.

O desenho implementado no #523 é:

```text
worker instalado assume execução
        ↓
aguarda API antiga sair da porta
        ↓
applying
        ↓
repete preflight Git
        ↓
git merge --ff-only <targetRevision>
        ↓
confirma HEAD == targetRevision
        ↓
reinstala release do agent a partir da nova revision
        ↓
restarting
        ↓
inicia scripts/dev-web.mjs em processo destacado
        ↓
verifying
        ↓
readiness + prova de revision
```

O restart atual é **user-space**. Não há `sudo`, `systemctl` ou unit configurável pelo cliente.

### Resultado e recovery

Se a operação falhar ainda em `accepted`, antes da mutação operacional, o handoff pode terminar em `failed`.

Depois que a execução entra em `applying`, uma falha passa a ser tratada conservadoramente como `recovery_required`, porque a checkout/runtime já podem ter sido alterados.

O sucesso terminal só é aceitável quando a revision aplicada e a revision comprovada pela nova API coincidirem.

O agent continua executando recovery conservador no startup para handoffs anteriormente assumidos e sem resultado terminal. Não existe rollback automático cego.

## Readiness e prova de revision ainda pendentes no #523

O worker já possui timeout bounded e exige conceitualmente:

```text
GET /api/health
status=ok
service=dev-dashboard-api
revision=<targetRevision>
```

Entretanto, no estado atual da branch, `/api/health` ainda retorna apenas `status`, `service` e `timestamp`.

Isso significa que a cadeia **ainda não consegue comprovar a revision end-to-end** e não deve marcar self-update como pronto apenas porque o processo voltou à porta.

Essa divergência precisa ser fechada no PR #523 junto com o teste real de interrupção/restart/readiness. Até lá, readiness e prova de revision permanecem blockers formais.

`DEV_DASHBOARD_RUNTIME_REVISION` é tratado como detalhe interno do restart e não deve ser uma configuração manual de `.env.local`.

## Modelo de privilégio

O PR C não introduz privilégio root.

A aplicação atual de Git e o restart de `dev-web` são user-space. Fastify não recebe sudo amplo e a senha do modal de deployment não é reutilizada.

Se o desenho final do PR D exigir integração privilegiada, ela precisará ser uma nova fronteira de segurança, com ação mínima instalada fora da checkout e sem aceitar unit/path/comando livre.

## Recovery após crash

No startup, o agent marca de forma conservadora handoffs assumidos e sem resultado terminal como `recovery_required`.

Um handoff apenas `prepared` não é considerado interrompido porque ownership ainda não foi transferido.

A regra é preservar diagnóstico, não tentar “consertar” automaticamente uma checkout/runtime cujo estado real não foi provado.

## Configuração local

Variáveis comuns para desenvolvimento estão documentadas em `.env.example` e `docs/operations-and-troubleshooting.md`.

Overrides do agent, como:

```text
DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR
DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR
```

são opções operacionais avançadas. `npm run self-update:agent` não carrega `.env.local` automaticamente; quando necessários, esses overrides devem ser exportados conscientemente no shell.

Variáveis internas como `DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT` e `DEV_DASHBOARD_RUNTIME_REVISION` não pertencem ao contrato público nem ao `.env.example` como configuração editável.

## Condições para habilitar

`production.enabled=true` só pode ser considerado quando houver, no mínimo:

1. helper/agent externo separado da API;
2. agent instalado fora de caminho editável pelo repositório;
3. catálogo fechado de ações/paths;
4. canal local autenticado/restrito;
5. handoff persistido antes de parar a API;
6. ownership operacional comprovado antes da API antiga encerrar;
7. aplicação/restart que não dependam da API antiga continuar viva;
8. readiness pós-restart bounded;
9. comprovação da revision realmente aplicada;
10. resultado final persistido/recuperável;
11. modelo de privilégio mínimo auditável;
12. teste real de interrupção/restart/recovery;
13. documentação de instalação, logs e troubleshooting;
14. revisão de segurança específica.

Os itens 1–4 estão entregues em `main` pelos PRs #520/#521. O PR #523 implementa a base dos itens 5–10, mas a prova end-to-end ainda não está concluída.

## Relação com as issues/PRs

- #482 — frente ampla de produção;
- #487 — self-production/self-update;
- #505 — contrato fail-closed;
- #520 — handoff/helper;
- #521 — instalação/lifecycle/canal local;
- #523 — integração API→agent + worker de update/restart/readiness.

O PR D só deve considerar habilitação depois que #523 fechar os blockers restantes e a revisão de segurança confirmar o modelo final.