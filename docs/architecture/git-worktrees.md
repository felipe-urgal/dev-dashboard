# Git Worktrees

Git worktrees são a base de ambientes locais paralelos do Dashboard. O domínio evolui em slices pequenos: observação read-only, criação estruturada e remoção segura. A identidade operacional de execução pertence a `DevelopmentEnvironmentInstance`.

## Observer read-only

`GitWorktreeObserver` usa exclusivamente comandos Git estruturados, delegando a execução ao runner canônico do backend:

```text
git rev-parse --path-format=absolute --git-common-dir
git worktree list --porcelain -z
```

Os dois comandos usam `cwd=Project.path`, sem shell, prompt interativo ou texto de comando vindo do browser. O runner padrão aplica timeout de 5 segundos e limite de 1 MiB.

`--porcelain -z` é usado porque oferece formato estável e separadores NUL, evitando parsing de saída humana dependente de locale/espaçamento.

## Modelo normalizado

Para cada worktree, o observer preserva somente:

- identidade estável;
- path normalizado;
- HEAD;
- branch local quando existe;
- detached;
- bare;
- classificação `main`, `linked` ou `unknown`;
- `locked` e motivo resumido quando informado pelo Git;
- `prunable` e motivo resumido quando informado pelo Git.

Campos futuros do formato porcelain são ignorados, mas campos essenciais (`worktree` e `HEAD`) continuam obrigatórios. Saída sem estrutura suficiente vira `invalid-output`; não é convertida em lista vazia saudável.

## Identidade Git

A identidade do worktree não usa branch nem HEAD. Ela é derivada por hash de:

```text
<git-common-dir> + NUL + <worktree-path-normalizado>
```

Isso mantém o mesmo `worktree.id` quando o usuário troca/renomeia branch ou produz novos commits dentro do mesmo worktree. A ordem retornada pelo Git também não altera a identidade; a coleção normalizada é ordenada por path apenas para determinismo de consumo/teste.

Para repositórios Git tradicionais, o worktree principal é identificado a partir do parent de `<repo>/.git`. Se o `git-common-dir` não permitir provar essa relação (por exemplo, layouts incomuns/bare), o observer usa `kind=unknown` em vez de inventar `main`.

## Relação com Development Environment Instance

`worktree.id` continua sendo a identidade Git da origem. Processos, terminais, portas e runtimes usam `DevelopmentEnvironmentInstance` como identidade operacional.

A reconciliação segue estas regras:

- o checkout principal continua sendo `environment:primary:<projectId>` e não ganha uma segunda instance;
- linked worktrees usam `environment:worktree:<projectId>:<worktreeId>`;
- branch/HEAD mudarem não trocam a Environment Instance;
- worktree ausente não apaga a instance: ela fica `degraded`;
- o mesmo linked worktree host reaparecendo restaura a mesma identidade;
- observar a origem Git não é suficiente para considerar um runtime `devcontainer` saudável.

O observer não persiste lifecycle nem cria/remove recursos. Ele apenas produz a evidência read-only que a Environment Instance pode reconciliar.

Veja [Development Environment Instances](development-environment-instances.md).

## Estados da inspeção

- `ready`: common dir e lista porcelain foram normalizados com sucesso;
- `unavailable`: Git não pôde ser consultado;
- `invalid-output`: Git respondeu, mas sem estrutura confiável.

Erros brutos, stderr e paths presentes na mensagem de erro não são transportados ao snapshot.

## Lifecycle de criação

`GitWorktreeLifecycleService` cria linked worktrees para uma branch existente ou cria branch + worktree no mesmo fluxo.

A ação recebe somente:

- branch;
- nome simples do diretório irmão ao checkout principal;
- flag explícita para criar a branch.

O caller não fornece shell, argv livre nem path absoluto. O path final é derivado pelo backend como irmão de `Project.path`; nomes absolutos, traversal, separadores e caracteres de controle são rejeitados antes de qualquer comando Git.

Antes da mutação, o serviço exige um snapshot `ready`, bloqueia diretório já ocupado por outro worktree e bloqueia branch já vinculada a outra worktree. O nome da branch passa por `git check-ref-format --branch` e a criação usa somente argv fechado:

```text
git worktree add -- <target> <branch>
git worktree add -b <new-branch> -- <target>
```

`--force` não faz parte do fluxo. Depois do comando, o serviço observa novamente o repositório e só retorna `created` quando path e branch aparecem no snapshot confirmado. Reexecução do mesmo target/branch retorna `already-present`; falha de confirmação vira `unverified` em vez de inventar sucesso. Erros brutos do Git não atravessam o contrato.

## Lifecycle de remoção

A remoção é deliberadamente mais restritiva que a criação.

O caller informa somente o `worktreeId` produzido pelo observer. O serviço resolve o path no backend e só aceita um worktree que continue sendo:

- `kind=linked`;
- não bare;
- irmão direto do checkout principal;
- não `locked`;
- não `prunable`.

O checkout principal, worktrees `unknown` e origens observadas fora da área gerenciada não podem ser removidos por esse lifecycle.

### Dirty guard

Antes de emitir confirmação e novamente imediatamente antes da mutação, o serviço executa no próprio worktree observado:

```text
git status --porcelain=v1 -z --untracked-files=all
```

Qualquer saída significa dirty state e bloqueia a remoção. Falha ao consultar o status também bloqueia; ausência de evidência nunca é tratada como `clean`.

### Confirmação e TOCTOU

`prepareRemoval` emite uma confirmação curta, com TTL de 60 segundos, vinculada a:

- projeto;
- `worktreeId`;
- `environmentInstanceId` derivada;
- path observado;
- HEAD;
- branch quando existe.

`remove` consome a confirmação uma única vez e reinspeciona tudo. Mudança de HEAD, branch ou path desde a confirmação exige nova preparação. Isso impede que uma confirmação antiga autorize remoção sobre um estado diferente. Confirmação expirada ou inválida nunca executa a mutação.

### Ownership e cleanup

A composição normal da API fornece `GitWorktreeRemovalResourceGuardService` ao lifecycle. O guard recebe exclusivamente a `environmentInstanceId` derivada de `projectId + worktreeId`; path, porta e PID não são usados como heurística de ownership.

A prova atual verifica os domínios que já carregam Environment Instance de forma explícita:

- Process Manager: processo `starting`, `running` ou `stopping` da mesma instance bloqueia;
- Process Manager legado: processo ativo do mesmo projeto sem `environmentInstanceId` também bloqueia, porque a ownership não pode ser provada;
- Terminal: qualquer sessão ativa da mesma Environment Instance bloqueia;
- runtime diferente de `host` bloqueia enquanto não existir cleanup específico suportado.

Processos ativos de outra Environment Instance do mesmo projeto não bloqueiam a remoção. O guard nunca tenta adivinhar pertencimento por cwd, porta ou PID.

Depois que o Git confirma a remoção, o guard revalida a mesma prova. Quando não existem recursos ativos com ownership da instance, não há processo ou terminal para matar durante cleanup; a reconciliação preserva a Environment Instance como `degraded`, mantendo diagnóstico e restauração determinística se a mesma origem reaparecer.

A mutação usa apenas:

```text
git worktree remove -- <path-observado>
```

Não existe `--force`. Depois do comando, o observer precisa confirmar que o mesmo `worktreeId` desapareceu. Se a remoção Git for confirmada mas o cleanup posterior falhar, o resultado é `cleanup-required`: o sistema não inventa rollback do diretório nem declara cleanup concluído.

## API HTTP

A superfície HTTP expõe inspeção, criação e o fluxo em duas etapas de remoção:

```text
GET  /api/projects/:projectId/worktrees
POST /api/projects/:projectId/worktrees
POST /api/projects/:projectId/worktrees/:worktreeId/removal/confirmations
POST /api/projects/:projectId/worktrees/:worktreeId/removal
```

O `GET` executa o observer e devolve o snapshot normalizado. Somente quando o estado é `ready` o backend reconcilia o snapshot completo com `DevelopmentEnvironmentInstance`; `unavailable` e `invalid-output` continuam explícitos e não criam estado operacional saudável.

Cada worktree conhecido recebe `environmentInstanceId` derivada pelo backend quando a relação é comprovável:

- `main` aponta para a `primary` do projeto;
- `linked` aponta para `environment:worktree:<projectId>:<worktreeId>`;
- `unknown` não recebe identidade operacional inventada.

O `POST /worktrees` aceita um body fechado com apenas:

- `branch`;
- `directoryName`;
- `createBranch` opcional.

Campos extras como `path`, `cwd`, programa ou argv não participam da mutação. O lifecycle continua responsável por derivar o target e construir o comando Git. Depois de `created` ou `already-present`, a rota reinspeciona a lista completa e somente então reconcilia a Environment Instance e devolve sua identidade.

Antes de preparar uma remoção, a rota também reinspeciona/reconcilia um snapshot `ready`. Isso garante que o guard concreto encontre a mesma Environment Instance derivada do worktree mesmo quando a chamada de remoção é a primeira operação após iniciar a API.

A confirmação recebe apenas `projectId + worktreeId` pela rota e devolve o token curto do lifecycle quando todos os guards passam. A execução usa somente `confirmationToken` como autoridade no body; campos extras como `path`, `cwd`, comando ou argv não chegam ao lifecycle nem influenciam a mutação. Após `removed`, `already-absent` ou `cleanup-required`, a rota observa novamente os worktrees e reconcilia o estado operacional.

## UI básica

A ferramenta **Worktrees** usa somente os contratos HTTP acima e mantém o lifecycle separado do CRUD de Branches.

A UI permite:

- listar o snapshot atual de worktrees do projeto;
- criar linked worktree para branch existente ou criar branch + worktree no mesmo fluxo;
- omitir o diretório na experiência, derivando no cliente um nome simples e seguro a partir da branch antes de chamar o contrato atual;
- remover somente linked worktrees elegíveis usando o fluxo `prepare -> confirmationToken -> remove`;
- manter o checkout principal sem ação de remoção.

A UI não recebe autoridade adicional sobre paths e não transforma remoção de worktree em remoção de branch. Cleanup avançado e remoção explícita da branch associada continuam recortes separados.

## Segurança e limites

- nenhum shell livre;
- argv fixo no domínio;
- `cwd` de criação sempre parte do projeto conhecido;
- remoção resolve target pelo snapshot do Git, nunca por path vindo do caller;
- limite de 256 worktrees por snapshot;
- limite por campo e no output total;
- HEAD precisa ter formato hexadecimal plausível;
- campos desconhecidos não promovem estado saudável;
- criação não aceita path arbitrário nem `--force`;
- remoção exige clean state, confirmação curta, revalidação e ownership fail-closed;
- processo legado ativo sem ownership explícita bloqueia em vez de ser inferido;
- runtime sem cleanup específico bloqueia em vez de ser removido parcialmente;
- `move`, `prune`, `unlock` e remoção forçada continuam fora do lifecycle.

## Próximos recortes

Com observer, lifecycle, ownership guard, API e UI básica estabelecidos, os próximos recortes são de integração por `DevelopmentEnvironmentInstance` e validação da experiência completa:

- propagar a identidade correta aos processos, PTYs, testes e logs restantes quando aplicável;
- preservar ownership/cleanup quando branch ou worktree desaparecer externamente;
- cobrir criação, uso e remoção end-to-end sem afetar outra Environment Instance;
- tratar eventual remoção da branch associada como ação separada e explícita.

O Port Registry existente continua sendo a autoridade para portas por ambiente. Se leases duráveis passarem a existir no lifecycle real da API, o guard de remoção deverá compor esse ownership explicitamente antes de liberá-los; não deve inferir leases por porta observada.
