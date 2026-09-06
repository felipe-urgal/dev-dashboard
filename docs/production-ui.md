# Interface de Produção

A superfície **Produção** concentra o estado e a operação de projetos com `capability=production` válida. Existe uma visão global do workspace e uma superfície detalhada por projeto; ambas usam o mesmo domínio de deployment.

As estratégias suportadas no produto são:

- `strategy=command`;
- `strategy=git-managed` com provider explícito, como Vercel;
- `strategy=self-update` fechado para o próprio Dev Dashboard.

## Visão global do workspace

A navegação principal possui a rota `/production`. Ela lê o workspace ativo por:

```text
GET /api/workspaces/:workspaceId/production/overview
```

O overview apresenta projeto, provider, branch, revisions conhecidas, evidência de verify e estado agregado.

Abrir/atualizar essa tela é somente leitura: não faz `git fetch`, não inicia deployment e não executa correção automática. Falha isolada de um projeto vira estado desconhecido naquele item sem derrubar o overview inteiro.

### Health

`Verify passou`/`Verify falhou` é evidência histórica vinculada à revision/contrato compatíveis. Não representa monitoramento contínuo.

`READY` de provider externo também não substitui health funcional.

### Atualizar pendentes

**Atualizar pendentes** usa o mesmo planner/confirmation/deployment service das telas individuais. Não existe um segundo motor de deployment no frontend.

O fluxo é:

```text
gerar todos os planos elegíveis
        ↓
mostrar preview do lote
        ↓
confirmar explicitamente
        ↓
confirmar/iniciar um projeto por vez
        ↓
aguardar estado terminal
        ↓
continuar ou parar na primeira falha
```

A confirmação é criada just-in-time para cada projeto. Se revision/branch/plano ficarem stale enquanto aguardam, o backend falha fechado.

Estratégias que exigem fluxo dedicado ou não são elegíveis ao lote não devem ser tratadas como deployment comum. Em particular, `self-update` do próprio Dashboard permanece uma operação dedicada do projeto, não um `provider-deploy` em massa.

## Quando a aba do projeto aparece

A aba aparece quando o discovery reconhece um `Production Contract v1` válido.

- manifesto ausente/inválido: nenhuma capability falsa é criada;
- `strategy=disabled`: a superfície pode explicar o bloqueio, mas não oferece mutação;
- `strategy=command`: oferece planejamento/execução dos scripts canônicos;
- `strategy=git-managed` + Vercel: oferece planejamento/execução com etapa externa `provider-deploy`;
- `strategy=self-update`: usa painel próprio com `check → self-update` e handoff para agent externo.

A rota acessada diretamente continua fail-closed quando o projeto não possui contrato válido.

## Sinais exibidos

A tela separa sinais que não são equivalentes:

- **revision local**: SHA do checkout usado para planejar;
- **origin/<branch>**: revision remota conhecida/consultada conforme o fluxo;
- **produção**: revision informada pelo provider ou última promoção comprovada;
- **provider**: disponibilidade/estado da infraestrutura externa;
- **drift**: comparação de SHA quando há evidência suficiente;
- **health/verify**: verificação funcional declarada pelo projeto;
- **self-update agent**: disponibilidade do agente externo quando a estratégia é `self-update`.

## Fluxo comum de planejamento e confirmação

As estratégias operacionais usam preview e confirmação forte:

```text
Preparar deployment
        ↓
DeploymentPlan
        ↓
revisar projeto + provider + branch + revision + etapas
        ↓
Confirmar e iniciar deployment
        ↓
confirmationToken vinculado ao planHash
        ↓
execução
        ↓
timeline + log
```

**Preparar deployment** não executa mutação. Mudança de branch, working tree, revision ou plano entre preview e start é recusada.

## `strategy=command`

A timeline pode conter:

```text
check → backup → migrate → deploy → verify
```

conforme as políticas do projeto.

A UI não conhece comandos internos de systemd/Docker Compose do projeto alvo; ela mostra somente as etapas do contrato e os resultados normalizados.

Quando `origin/<branch>` e a revision da última promoção local são conhecidas e divergem, o banner principal mostra produção desatualizada mesmo que um deployment histórico anterior tenha terminado com sucesso.

### Banco de check indisponível

Quando o backend classifica `P1001` do Prisma em `prod:check` como `DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE`, o banner usa a mensagem sanitizada do domínio. A UI não tenta iniciar banco/Docker automaticamente.

## `strategy=git-managed` + Vercel

A timeline usa:

```text
check → migrate? → provider-deploy → verify
```

Não existe `prod:deploy` artificial.

Antes de criar o deployment remoto, o backend revalida diretamente `origin/<production.branch>`, resolve a origem GitHub/projeto Vercel no backend e envia branch/SHA exatos confirmados.

Estados externos como queued/building/ready são apresentados pela timeline normalizada. `READY` encerra a etapa do provider, não substitui `prod:verify`.

### Configuração ausente

Sem `VERCEL_TOKEN`, a tela mostra provider não configurado. O segredo é configurado localmente no processo do Dev Dashboard (`.env.local`/ambiente) e nunca é pedido ou exibido pelo frontend.

## `strategy=self-update`

O próprio Dev Dashboard usa:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

A UI mostra somente:

```text
check → self-update
```

O target vem de `origin/main`, o plano usa confirmação normal vinculada ao `planHash` e a etapa `self-update` transfere ownership para o agent externo.

### Durante o handoff

A sequência de alto nível é:

```text
confirmar
  ↓
agent claim + worker comprovado
  ↓
API antiga recebe SIGTERM
  ↓
fast-forward da revision
  ↓
restart do runtime
  ↓
health + revision
  ↓
reconciliação do deployment
```

Depois que o ownership foi entregue ao worker, a API antiga não oferece um cancelamento simples. Durante o restart, a UI deve tratar indisponibilidade temporária da API como reconexão e retomar polling/reconciliação quando ela voltar.

### Runtime local gerenciado

Quando o Dev Dashboard foi instalado por `npm run local:install`, o handoff propagado ao novo runtime inclui revision alvo e raiz canônica da checkout já validada. O restart só pode ser delegado para:

```text
systemctl --user restart dev-dashboard.service
```

quando a raiz real coincide com a instalação registrada e a unit fixa possui o marcador de ownership do instalador. Esse comando não vem da UI.

A UI pode perder temporariamente a conexão durante o restart; isso é esperado. O deployment só termina em sucesso depois que o backend reconciliado comprova `/api/health` e `x-dev-dashboard-revision` iguais ao alvo.

Se o runtime não voltar, a superfície deve tratar o caso como falha/recovery e não sugerir que um restart manual isolado prova sucesso do handoff.

## Acompanhamento e concorrência

Enquanto existe deployment ativo, a tela acompanha detalhe/log e para polling somente em estado terminal:

- `succeeded`;
- `failed`;
- `cancelled`;
- `recovery_required`.

O viewer de log remove ANSI antes de renderizar, acompanha automaticamente o final e pausa auto-follow quando a pessoa sobe para ler conteúdo anterior.

O domínio mantém exclusividade para mutações incompatíveis; loading/atividade só aparecem quando há trabalho real.

## Cancelamento

O cancelamento depende da etapa:

- processo local controlado: TERM/KILL conforme lifecycle;
- provider Vercel: interrompe polling e tenta cancelamento remoto best-effort;
- self-update depois do handoff: não oferece cancelamento simples pela API antiga.

Depois de etapa irreversível, cancelamento/falha pode resultar em `recovery_required`.

## Retry de verify

Quando a promoção concluiu e somente `verify` falhou, a UI pode mostrar **Verificar novamente**.

Esse botão executa somente `prod:verify`. Não repete migration/deploy/provider-deploy. Se revision/contrato ficaram stale, o retry é recusado e um novo plano é exigido.

## `recovery_required`

A tela não apresenta rollback automático como solução genérica. Ela orienta revisar:

- etapa irreversível;
- timeline/log;
- estado real do provider/aplicação;
- schema/backup;
- revision aplicada;
- handoff do self-update quando aplicável;
- política de rollback do projeto.

## Troca de projeto/workspace

Requests canceláveis usam `AbortController` e geração/latest-wins. Respostas tardias do contexto anterior são descartadas e não podem sobrescrever a tela atual.

## Acessibilidade e responsividade

- preview recebe foco quando criado;
- botões preservam teclado e `disabled`;
- erros usam semântica de alerta;
- loading usa semântica de status;
- layout colapsa em telas estreitas;
- spinners respeitam `prefers-reduced-motion`.

## Testes

A cobertura da superfície deve proteger:

- fail-closed de contratos;
- preview/confirmação;
- descarte de respostas stale;
- Vercel/provider-deploy;
- timeline/log;
- retry de verify;
- overview/lote sequencial;
- self-update/reconciliação;
- regressões de handoff gerenciado, incluindo a raiz canônica exigida para delegação ao systemd.

Guia de uso: [guia/producao.md](guia/producao.md). Operação detalhada: [deployment-operations.md](deployment-operations.md). Self-production: [architecture/self-production.md](architecture/self-production.md).
