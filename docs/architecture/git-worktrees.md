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

A remoção exige um `GitWorktreeRemovalResourceGuard`. Sem guard configurado, o fluxo falha fechado e nem emite confirmação.

O guard recebe exclusivamente a `environmentInstanceId` derivada de `projectId + worktreeId` e precisa:

1. provar que não existem recursos ativos que impeçam a remoção;
2. após o Git confirmar que a origem desapareceu, limpar somente recursos cuja ownership pertença exatamente à mesma Environment Instance.

O lifecycle nunca recebe um owner arbitrário do browser e não ganha autoridade para limpar recursos de outra instância.

A mutação usa apenas:

```text
git worktree remove -- <path-observado>
```

Não existe `--force`. Depois do comando, o observer precisa confirmar que o mesmo `worktreeId` desapareceu. Se a remoção Git for confirmada mas o cleanup posterior falhar, o resultado é `cleanup-required`: o sistema não inventa rollback do diretório nem declara cleanup concluído.

## API HTTP

A primeira superfície HTTP expõe somente inspeção e criação:

```text
GET  /api/projects/:projectId/worktrees
POST /api/projects/:projectId/worktrees
```

O `GET` executa o observer e devolve o snapshot normalizado. Somente quando o estado é `ready` o backend reconcilia o snapshot completo com `DevelopmentEnvironmentInstance`; `unavailable` e `invalid-output` continuam explícitos e não criam estado operacional saudável.

Cada worktree conhecido recebe `environmentInstanceId` derivada pelo backend quando a relação é comprovável:

- `main` aponta para a `primary` do projeto;
- `linked` aponta para `environment:worktree:<projectId>:<worktreeId>`;
- `unknown` não recebe identidade operacional inventada.

O `POST` aceita um body fechado com apenas:

- `branch`;
- `directoryName`;
- `createBranch` opcional.

Campos extras como `path`, `cwd`, programa ou argv não participam da mutação. O lifecycle continua responsável por derivar o target e construir o comando Git. Depois de `created` ou `already-present`, a rota reinspeciona a lista completa e somente então reconcilia a Environment Instance e devolve sua identidade.

A remoção **não** é exposta por HTTP neste recorte. O domínio já possui confirmação/dirty guard, mas a composição ainda precisa fornecer um `GitWorktreeRemovalResourceGuard` concreto que prove ownership dos recursos ativos antes de abrir essa mutação ao browser.

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
- `move`, `prune`, `unlock` e remoção forçada continuam fora do lifecycle.

## Próximos recortes

A próxima etapa é criar a UI de worktrees sobre os contratos HTTP existentes e, separadamente, conectar um `GitWorktreeRemovalResourceGuard` concreto aos domínios que já possuem ownership da mesma `DevelopmentEnvironmentInstance` antes de expor remoção pela API.

O Port Registry existente continua sendo a autoridade para portas por ambiente. A superfície web deve consumir os domínios normalizados em vez de parsear Git diretamente.
