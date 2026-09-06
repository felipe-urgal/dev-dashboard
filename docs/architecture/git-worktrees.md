# Git Worktrees

Git worktrees serão a base de ambientes locais paralelos do Dashboard. O domínio começa por **observação confiável e read-only**; criação, remoção, portas e processos só entram depois que a identidade de cada worktree estiver estável.

## Primeiro recorte: observer read-only

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

## Identidade do ambiente

A identidade não usa branch nem HEAD. Ela é derivada por hash de:

```text
<git-common-dir> + NUL + <worktree-path-normalizado>
```

Isso mantém o mesmo `id` quando o usuário troca/renomeia branch ou produz novos commits dentro do mesmo worktree. A ordem retornada pelo Git também não altera a identidade; a coleção normalizada é ordenada por path apenas para determinismo de consumo/teste.

Para repositórios Git tradicionais, o worktree principal é identificado a partir do parent de `<repo>/.git`. Se o `git-common-dir` não permitir provar essa relação (por exemplo, layouts incomuns/bare), o observer usa `kind=unknown` em vez de inventar `main`.

## Estados da inspeção

- `ready`: common dir e lista porcelain foram normalizados com sucesso;
- `unavailable`: Git não pôde ser consultado;
- `invalid-output`: Git respondeu, mas sem estrutura confiável.

Erros brutos, stderr e paths presentes na mensagem de erro não são transportados ao snapshot.

## Segurança e limites

- nenhum shell livre;
- argv fixo no domínio;
- `cwd` sempre é o path do projeto já conhecido pelo backend;
- limite de 256 worktrees por snapshot;
- limite por campo e no output total;
- HEAD precisa ter formato hexadecimal plausível;
- campos desconhecidos não promovem estado saudável;
- nenhuma mutação (`add`, `remove`, `move`, `prune`, `unlock`) existe neste recorte.

## Próximos recortes

Criação/remoção de worktrees deve ser adicionada somente depois de existir plano/confirmation/guard apropriado. Portas, processos e PTYs precisam ser associados ao `worktree.id` estável e integrados ao Port Registry; não devem criar identidade paralela própria.

A superfície HTTP/UI também deve consumir esse domínio normalizado em vez de parsear Git diretamente.
