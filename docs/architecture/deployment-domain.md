# Domínio de deployment

O Dev Dashboard possui um domínio de deployment separado do `process-manager`. Ele transforma um `Production Contract v1` válido em uma operação estruturada, auditável e fail-closed sem ensinar o dashboard sobre detalhes internos de systemd, Docker Compose ou da aplicação hospedada na Vercel.

Existem duas estratégias mutáveis suportadas:

- `strategy=command`: executa scripts `prod:*` canônicos do projeto;
- `strategy=git-managed` + `provider=vercel`: executa operações locais do contrato e uma etapa externa `provider-deploy` pela API da Vercel.

Produção `disabled` continua bloqueada por contrato.

## Fronteira arquitetural

O mesmo planner, confirmação, store, timeline e serviço coordenam as duas estratégias. O que muda é o adapter responsável pela etapa.

```text
ProjectStore
    │
    ▼
ProductionContractV1
    │
    ▼
GitDeploymentRevisionResolver
    │
    ▼
DeploymentPlanner
    │
    ├── DeploymentPlan + planHash
    ▼
DeploymentConfirmationService
    │
    ├── token de uso único
    ▼
DeploymentService
    ├── ProductionCommandAdapter    # check/backup/migrate/deploy/verify locais
    ├── VercelDeploymentAdapter     # provider-deploy git-managed
    ├── OriginRevisionResolver      # prova remota antes da promoção
    └── DeploymentStore
```

A leitura de status externo usa `ProductionDeploymentStatusService` + `VercelDeploymentAdapter` e não inicia mutação.

O `process-manager` continua responsável por servidor, worker e outros processos de desenvolvimento. Deployment possui semântica própria: revision, plano, confirmação, irreversibilidade, histórico e recovery.

## Planejamento

Gerar um plano não executa produção. O backend:

1. resolve o projeto pelo `ProjectStore`;
2. exige `production.enabled=true` e capability `production`;
3. resolve branch e SHA Git atuais;
4. exige working tree limpa, inclusive arquivos não rastreados;
5. exige branch atual igual a `production.branch`;
6. valida requisitos específicos da estratégia;
7. converte comandos/políticas em etapas tipadas;
8. calcula `planHash` determinístico sobre projeto, provider, branch, revision e etapas.

O resultado contém `projectId`, provider, branch, revision, `planHash` e timeline planejada.

`start()` recalcula o plano antes de consumir a confirmação. Se checkout, revision, working tree, contrato ou etapas mudarem, o plano anterior fica stale e a mutação não começa.

## `strategy=command`

O planner exige `check`, `deploy` e `verify`. Etapas adicionais são inseridas pelas políticas.

Exemplos:

```text
check → backup → deploy → verify
```

quando migration acontece no startup, ou:

```text
check → backup → migrate → deploy → verify
```

quando migration é separada.

`ProductionCommandAdapter` resolve o package manager no backend e executa:

```text
<package-manager> run <script-prod-canônico>
```

com `cwd=Project.path`, `shell: false`, stdin fechado e stdout/stderr mascarados antes da persistência. O dashboard não precisa saber se `prod:deploy` usa systemd, Docker Compose ou outro mecanismo interno reconhecido pelo projeto.

### Diagnóstico conhecido do `prod:check`

O adapter mantém uma classificação fechada para o código estável `P1001` do Prisma quando ele aparece no stderr de `prod:check`. Nesse caso, a execução falha com `DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE`, a etapa `check` permanece `failed` e o domínio persiste uma orientação produzida localmente para verificar a disponibilidade da dependência do ambiente de check.

A classificação não copia host, porta, URL, nome do banco ou credenciais do stderr para `errorMessage` nem para a linha adicional gerada pelo Dev Dashboard. O stdout/stderr original continua seguindo o pipeline normal de masking e limite de log.

Esse diagnóstico não altera ownership de infraestrutura: o Dashboard não inicia PostgreSQL, Docker, Compose ou outro serviço do projeto. Readiness, retries e lifecycle da dependência continuam pertencendo ao `prod:check`/projeto alvo. `P1001` fora de `prod:check` e outros textos de conexão permanecem no tratamento genérico, evitando inferência aberta de infraestrutura.

## Ambiente local de produção por projeto

Para scripts locais que realmente consultam ou alteram o ambiente de produção, o `ProductionCommandAdapter` procura opcionalmente:

```text
<Project.path>/.dev-dashboard/.env.production.local
```

O arquivo não faz parte do `Production Contract` e não é enviado pelo browser. Quando existe, ele é lido e interpretado no backend, limitado a 64 KiB e aceito somente como arquivo regular. Seus valores são mesclados sobre o ambiente herdado pelo processo filho, portanto uma variável definida pelo projeto prevalece sobre uma variável homônima do processo do Dev Dashboard apenas naquela execução.

`prod:check` é uma exceção deliberada: ele **não recebe** `.env.production.local`. A etapa de check deve validar código, build e testes sem ganhar credenciais de produção por consequência do deployment. Isso impede que uma suíte de testes que usa `DATABASE_URL`, por exemplo, passe a escrever no banco de produção apenas porque o deployment foi iniciado.

Ausência do arquivo mantém o comportamento anterior nas etapas que o consomem. Arquivo inválido, ilegível, não regular ou acima do limite bloqueia essas etapas antes de iniciar o processo, sem incluir conteúdo do arquivo na mensagem de erro. Como `prod:check` não lê esse arquivo, uma configuração de produção inválida também não impede a validação local; ela falha quando a primeira etapa que realmente precisa do ambiente de produção for iniciada.

O arquivo deve permanecer fora do Git. Ele é destinado a credenciais específicas do projeto, por exemplo `DATABASE_URL` usada por `prod:migrate`. Credenciais do provider, como `VERCEL_TOKEN`, continuam pertencendo ao ambiente do próprio Dev Dashboard e não ao manifesto.

A etapa externa `provider-deploy` também não carrega esse arquivo; ela continua usando exclusivamente o adapter/provider correspondente.

## `strategy=git-managed` + Vercel

O planner exige:

- `provider=vercel`;
- `external.project`;
- `prod:check`;
- `prod:verify`;
- ausência de `prod:deploy` local;
- `prod:migrate` quando `policies.migrations=before-deploy`.

A etapa de promoção é representada explicitamente como:

```text
provider-deploy
```

Ela é mutável e tratada como irreversível, porque a criação/promoção externa pode produzir efeito mesmo se o processo local cair logo depois.

Um plano típico é:

```text
check → migrate → provider-deploy → verify
```

ou, quando não há migration separada:

```text
check → provider-deploy → verify
```

Não existe `prod:deploy` artificial.

## Prova da revision remota

A revision local confirmada no plano não basta para autorizar uma promoção git-managed. Imediatamente antes de `provider-deploy`, o backend consulta a branch diretamente no `origin` com Git sem shell.

A regra é:

```text
revision confirmada == revision atual de origin/<production.branch>
```

Se o remote não puder ser consultado, a branch não existir ou o SHA diferir, o deployment falha fechado antes da promoção. Uma ref local de tracking não é aceita como prova quando a mutação externa depende do estado real do remote.

Isso reduz dois riscos:

- promover um commit local que nunca foi publicado em `origin`;
- promover outra revision porque a branch avançou depois da confirmação.

## Origem Git e criação na Vercel

Para deploy mutável, o backend resolve a origem GitHub do projeto a partir do remote Git reconhecido. O browser não informa `owner`, `repo`, branch ou SHA de promoção.

A criação do deployment Vercel recebe:

- projeto Vercel resolvido por `external.project`;
- target `production`;
- repositório GitHub resolvido pelo backend;
- `ref=production.branch`;
- `sha=revision` confirmada.

Enviar o SHA exato é obrigatório; a branch sozinha é móvel e não preserva a confirmação.

Depois da criação, o adapter faz polling bounded do deployment específico até estado terminal. `BUILDING` permanece em execução; `READY` conclui a etapa; `ERROR`/`CANCELED` viram falha/cancelamento de provider conforme o domínio.

## Status Vercel e drift

`GET /api/projects/:projectId/deployments/status` permanece uma leitura separada. O snapshot inclui, quando disponíveis:

- projeto Vercel resolvido;
- deployment atual com `target=production`;
- URL e estado;
- branch/revision do provider;
- revision conhecida em `origin/<production.branch>`;
- drift;
- timeline normalizada;
- operações locais declaradas.

A leitura de status não faz `git fetch`. Ausência da ref local resulta em `drift=unknown`.

Estados de drift:

- `in-sync`: SHAs conhecidos e iguais;
- `drift`: SHAs conhecidos e diferentes;
- `unknown`: evidência insuficiente.

Drift não é automaticamente classificado como ahead/behind.

## Timeline do provider

A etapa lógica `provider-deploy` normaliza estados Vercel:

| Vercel | Etapa |
| --- | --- |
| `QUEUED`, `INITIALIZING` | `pending` |
| `BUILDING` | `running` |
| `READY` | `succeeded` |
| `ERROR` | `failed` |
| `CANCELED` | `cancelled` |
| desconhecido | tratamento conservador / resposta inválida conforme o endpoint |

`READY` prova conclusão do provider, não health funcional da aplicação. `prod:verify` continua uma etapa posterior e independente.

## Confirmação

Toda execução mutável parte de um preview e confirmação. O token:

- é aleatório;
- possui TTL curto;
- é de uso único;
- fica vinculado a `projectId + revision + planHash`;
- não é persistido.

A confirmação não é uma autorização genérica para “fazer deploy”. Qualquer mudança relevante exige novo plano.

## Retry seguro de verify

Se todas as etapas anteriores concluíram e somente o `verify` final falhou/cancelou, o domínio pode repetir **somente `prod:verify`** na mesma execução.

O retry é fail-closed. Ele exige que:

- a timeline persistida prove que a promoção anterior terminou;
- `verify` seja a etapa final e somente leitura;
- branch/revision continuem válidas;
- o contrato atual continue compatível;
- a execução ainda seja a mais recente aplicável ao projeto.

No retry não há nova migration, backup, `deploy` nem `provider-deploy`. Se a promoção Vercel já foi concluída, ela não é criada de novo apenas porque o primeiro readiness check da aplicação falhou.

Detalhes adicionais: [deployment-verify-retry.md](deployment-verify-retry.md).

## Concorrência

Existe no máximo **um deployment mutável ativo globalmente** nesta versão. A regra vale para `command` e `git-managed` porque ambos podem executar migration, alterar infraestrutura ou depender de recursos locais compartilhados.

Leituras de status Vercel não ocupam o slot.

## Cancelamento

### Etapas locais

O adapter de comando usa `SIGTERM` e escala para `SIGKILL` somente após a janela de encerramento.

### Vercel

Durante `provider-deploy`, cancelar interrompe o polling local e o adapter tenta cancelar o deployment Vercel em andamento quando o provider ainda permite isso. A tentativa remota é best-effort; o estado final precisa ser observado e persistido conservadoramente.

Se uma etapa irreversível já iniciou, cancelamento/falha pode terminar em `recovery_required`.

## Falhas e irreversibilidade

O domínio diferencia:

- falha antes de qualquer etapa irreversível → `failed`;
- cancelamento antes de etapa irreversível → `cancelled`;
- falha/cancelamento durante ou depois de etapa irreversível → `recovery_required`.

`recovery_required` não executa rollback automático. Schema, dados ou provider podem já ter mudado.

Se a API reiniciar no meio de um deployment, o store recupera o registro de forma conservadora. Uma etapa irreversível `running` já conta como iniciada.

## Credenciais Vercel

O adapter lê apenas configuração local do processo:

```text
VERCEL_TOKEN
VERCEL_TEAM_ID   # opcional
```

`npm run dev` carrega `.env.local` quando presente. O token:

- não pertence ao manifesto;
- não é persistido no store;
- não é devolvido ao browser;
- não entra em mensagens sanitizadas;
- não pode ser enviado pelo request de deployment.

## Falhas externas seguras

Falhas esperadas são traduzidas para códigos estáveis, incluindo:

- `DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE`;
- `DEPLOYMENT_PROVIDER_AUTH_FAILED`;
- `DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED`;
- `DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND`;
- `DEPLOYMENT_PROVIDER_UNAVAILABLE`;
- `DEPLOYMENT_PROVIDER_RESPONSE_INVALID`.

Respostas externas têm tamanho limitado e shape validado. Corpos brutos do provider não são repassados ao navegador.

## Persistência e logs

O estado fica em:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

O store mantém registros e logs em diretório privado, com histórico e tamanho limitados. Todo stdout/stderr local passa por `maskSensitiveLogContent` antes da persistência. Mensagens da Vercel são geradas localmente a partir de estados normalizados; o corpo externo não vira log bruto.

Tokens de confirmação e `VERCEL_TOKEN` nunca são persistidos.

## Autorização temporária de sudo

O fluxo de sudo existe somente para etapas locais que realmente precisam de privilégio. A senha é usada exclusivamente para validar o ticket local e nunca é encaminhada a `prod:*` ou ao provider.

A validação também testa reutilização do ticket a partir de outro processo pai para evitar falso positivo com `timestamp_type=ppid`. Se não for delegável, o dashboard falha fechado e orienta uma regra `NOPASSWD` limitada ao helper necessário; não edita sudoers nem repassa senha ao projeto.

## API

Rotas privadas principais:

```text
POST /api/projects/:projectId/deployments/plan
POST /api/projects/:projectId/deployments/confirmations
POST /api/projects/:projectId/deployments
GET  /api/projects/:projectId/deployments
GET  /api/projects/:projectId/deployments/status
GET  /api/projects/:projectId/deployments/:deploymentId
GET  /api/projects/:projectId/deployments/:deploymentId/log
POST /api/projects/:projectId/deployments/:deploymentId/cancel
POST /api/projects/:projectId/deployments/:deploymentId/verify
GET  /api/projects/:projectId/deployments/sudo
POST /api/projects/:projectId/deployments/sudo
```

Schemas são fechados. O browser envia IDs, `planHash` e token de confirmação; não envia linha de comando, path do projeto, credencial Vercel ou parâmetros livres de promoção.

A referência exata é gerada em [api-reference.md](api-reference.md).

## Invariantes

Mudanças neste domínio precisam preservar:

1. nenhum shell arbitrário vindo do browser ou manifesto;
2. working tree limpa para o código confirmado;
3. branch e revision revalidadas no start;
4. `git-managed` prova `origin/<branch>` antes da promoção;
5. Vercel recebe o SHA exato confirmado;
6. confirmação vinculada ao plano;
7. mutation externa/local registrada na mesma timeline;
8. logs/erros sanitizados;
9. `READY` do provider separado de `prod:verify`;
10. nenhuma repetição de etapa mutável no retry de verify;
11. nenhuma recuperação destrutiva automática após mudança irreversível.
