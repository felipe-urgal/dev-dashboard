# Git Worktrees

Git worktrees serão a base de ambientes locais paralelos do Dashboard. O domínio começa por **observação confiável e read-only**; criação e remoção evoluem em slices separados para manter guardrails explícitos. A identidade operacional de execução já pertence a `DevelopmentEnvironmentInstance`.

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

`GitWorktreeLifecycleService` introduz o primeiro slice mutável do domínio: criação estruturada de linked worktrees para uma branch existente ou criação de branch + worktree no mesmo fluxo.

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

Remoção continua fora deste slice porque precisa de guard específico para dirty state, confirmation e ownership de recursos da `DevelopmentEnvironmentInstance`.

## Segurança e limites

- nenhum shell livre;
- argv fixo no domínio;
- `cwd` sempre é o path do projeto já conhecido pelo backend;
- limite de 256 worktrees por snapshot;
- limite por campo e no output total;
- HEAD precisa ter formato hexadecimal plausível;
- campos desconhecidos não promovem estado saudável;
- criação não aceita path arbitrário nem `--force`;
- remoção/move/prune/unlock ainda não são expostos pelo lifecycle.

## Próximos recortes

A criação precisa ser conectada à superfície HTTP/UI e reconciliar a mesma `DevelopmentEnvironmentInstance`. A remoção deve ser adicionada somente com preflight/confirmation apropriados, bloqueio de dirty state e cleanup verificável por ownership. O Port Registry existente continua sendo a autoridade para portas por ambiente.

A superfície HTTP/UI deve consumir os domínios normalizados em vez de parsear Git diretamente.
