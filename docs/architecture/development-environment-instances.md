# Development Environment Instances

`Project` e `DevelopmentEnvironmentInstance` representam coisas diferentes.

- `Project` é a unidade estática descoberta pelo workspace: identidade, path principal, tipo e capabilities.
- `DevelopmentEnvironmentInstance` é a identidade operacional de uma execução concreta desse projeto: origem (`primary` ou worktree), runtime, lifecycle e recursos associados.

Essa separação permite que o mesmo projeto tenha mais de um ambiente local sem duplicar `Project` e sem fazer processos, terminais ou portas inventarem identidades próprias.

## Identidade

Todo `Project` atual possui uma Environment Instance `primary` determinística:

```text
environment:primary:<projectId>
```

Linked worktrees usam a identidade Git estável produzida pelo `GitWorktreeObserver` como origem da Environment Instance:

```text
environment:worktree:<projectId>:<worktreeId>
```

O checkout principal nunca recebe uma segunda identidade de worktree: ele continua sendo a `primary`.

Branch e HEAD não fazem parte da identidade. Alterar branch ou produzir commits dentro do mesmo worktree não cria outro ambiente.

## Execution Context é autoridade do backend

O browser pode referenciar `environmentInstanceId`, mas não escolhe `cwd`, path ou runtime.

O backend resolve um `ExecutionContext` contendo:

- `projectId`;
- `environmentInstanceId`;
- `cwd` conhecido pela origem persistida/reconciliada;
- runtime conhecido pela instance.

Sem `environmentInstanceId` explícito, as superfícies migradas incrementalmente continuam resolvendo a `primary` do projeto. Uma instance de outro projeto, desconhecida ou `degraded` não produz contexto executável.

## Runtime

Runtime pertence à mesma Environment Instance:

- `host`: execução local no host;
- `devcontainer`: execução futura via adapter, identificada por `runtimeId` quando conhecido.

Dev Container não cria uma segunda identidade operacional. Após restart, uma instance `devcontainer` persistida permanece `degraded` até que um adapter consiga provar novamente o runtime; observar apenas a origem Git não é prova suficiente de que o container existe.

## Persistência e reconciliação

O store persiste as Environment Instances sob a raiz de estado da aplicação, fora da árvore mutável dos projetos:

```text
~/.local/state/dev-dashboard/development-environment-instances.json
```

A gravação usa arquivo temporário + rename e permissões privadas. O arquivo é versionado e entradas inválidas são ignoradas fail-closed.

No restart:

1. identidades/runtime conhecidos são recarregados como `degraded`;
2. projetos atuais reconciliam a `primary` pelo `ProjectStore`;
3. snapshots de linked worktrees reconciliam pelo mesmo `worktree.id` estável;
4. origem ausente permanece `degraded` em vez de ser apagada silenciosamente;
5. quando uma origem host reaparece, a mesma identidade volta a `ready`.

Isso evita trocar identidade por ausência temporária de workspace/worktree e impede usar um path persistido como autoridade antes de reconciliação.

## Ownership de recursos

Process Manager, Terminal e Port Registry associam recursos duradouros à `environmentInstanceId` quando essa informação já está disponível.

O Port Registry mantém responsabilidades separadas:

- declarações estáticas de porta continuam pertencendo ao `Project` + `role`;
- leases/alocação operacional podem pertencer à Environment Instance;
- observações de processos gerenciados propagam a mesma `environmentInstanceId`;
- cleanup de lease por ambiente usa `releaseOwned`, que só libera quando o owner confere.

Compatibilidade com estados legados sem `environmentInstanceId` permanece durante a migração incremental.

## Cleanup

Persistir uma identidade não autoriza remover recurso automaticamente.

Uma origem desaparecer faz a instance ficar `degraded`; isso não implica matar processo, remover worktree, liberar porta ou destruir runtime. Cleanup só pode ocorrer quando o domínio dono do recurso consegue provar ownership pela mesma Environment Instance e aplicar seu lifecycle apropriado.

O `GitWorktreeObserver` continua read-only. O lifecycle mutável de Worktrees (#570) é um recorte posterior e deve reutilizar esta entidade em vez de criar outro lifecycle paralelo.
