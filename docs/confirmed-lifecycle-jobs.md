# Jobs persistentes para lifecycle confirmado — etapa interna

A issue [#1116](https://github.com/felipe-urgal/dev-dashboard/issues/1116) acrescenta um journal persistente de execuções confirmadas, **sem criar um novo executor público**. O `ConfirmedServiceLifecycleCoordinator` permanece interno: o `buildApp` não instancia esse coordenador com um runner real nem registra rota POST de Start/Stop.

## Como funciona

`ConfirmedLifecycleJobJournal` usa o diretório de estado do Process Manager, em `confirmed-lifecycle-jobs-v1/`, com um arquivo JSON por UUID de execução. O journal armazena **metadados delimitados**, não stdout/stderr, tokens de confirmação, comandos ou logs completos.

1. Após aprovação e revalidação do plano **dentro dos locks**, o coordenador registra um job `running/prepared` antes de qualquer comando.
2. **Antes** da invocação do provider, marca `stage=invoking` e `inFlightRef`. Se não conseguir persistir, a mutação não é iniciada.
3. Após a resposta e verificação observada, acrescenta um step `completed|failed|unverified`, sem o texto bruto do erro do provider.
4. Ao concluir, grava `completed|failed|partial`, horário e estado de recuperação. Não há rollback automático.

Um arquivo tem limite de 64 KiB, um job tem até 200 steps e o diretório até 1.000 jobs. Atualizações usam escrita temporária com rename; novos IDs usam criação exclusiva. Um arquivo corrompido, de versão desconhecida ou excessivo bloqueia novas gravações (**fail-closed**) e é preservado para diagnóstico.

## Reinício e recuperação

Ao reiniciar a API, registros `running` sem ownership em memória passam a ser apresentados como **`reconciliationRequired`**, preservando `inFlightRef` e os passos comprovados. Essa indicação **não prova** que o processo anterior morreu: pode ainda existir outra instância. A interface deve mostrar estado incerto; nunca reiniciar comandos com base apenas no estado do journal.

Enquanto existir job `running` para o mesmo projeto e ambiente, o journal recusa iniciar outro nesse alvo. O lock de recursos físicos continua sendo exigido: o journal por si só **não** fornece exclusão transacional entre processos. Nenhuma limpeza/retentativa automática de jobs ativos, arquivos de estado ou leases é autorizada.

A reconciliação posterior deve verificar processo owner, Compose runtime, dependencies, estado final dos serviços e locks antes de autorizar nova execução. Um job `partial` concluído mantém `reconciliationRequired=true` para auditoria, mas não é retomado automaticamente.

## Activity e Jobs

O mesmo `ActivitySnapshotService` existente recebe um `activityJobReader` baseado no journal. Jobs não terminados são exibidos com ID reanexável `compose-confirmed:<uuid>`, `resourceRef`, projeto e ambiente, ação e estágio; `reconciliation-required` destaca que a execução não pode ser considerada concluída. `cancelSupported=false` até existir mecanismo real de cancelamento seguro.

**Não há rota adicional de execução, endpoint de replay nem reparação automática.** O leitor de Activity é apenas observacional. O `ConfirmedServiceLifecycleCoordinator` interno entrega o UUID durável ao `ConfirmedServiceLifecycleActivityWriter` para **cada step** Compose. O writer só correlaciona o último step persistido de um Job ativo, no escopo de projeto/ambiente/revisão/hash correspondentes; impede forjar o ID do Job ou reaproveitar step anterior após outra mutação. A Activity mantém o `resourceRef` exato do node e `jobId=compose-confirmed:<uuid>`, sem guardar erros brutos ou repetir a mutação.

Jobs Compose `partial/failed` com `reconciliationRequired` continuam visíveis no leitor Activity/Jobs, assim como os systemd. O link do Job Compose abre seu owner; o systemd abre o Diagnóstico read-only. `cancelSupported=false` e nenhum link concede recuperação ou ação de host. `blocked`/`retained` de uma **prévia** não geram histórico: não houve execução, portanto nenhum resultado de Job pode ser afirmado.

## Limites para uma futura interface mutável

- O journal é por job e não substitui um serviço completo de Jobs com scheduler, timeouts/cancelamento/reattach real.
- Falta integrar o coordinator interno ao fluxo público de confirmação/autorização, fazer compatibilização entre processos, lidar com quedas após a operação e antes do commit e criar recuperação explícita e auditável.
- Fluxos de Compose já oferecidos pelo Dashboard têm lifecycle próprio e não foram migrados automaticamente para este journal.

## Testes

- Persistência e reabertura de jobs e steps após o reinício.
- Crash lógico depois de `beforeStep` e antes de registrar o resultado, com marcação `reconciliationRequired` e sem replay.
- Falha de persistência **antes** da mutação abortando o runner.
- Falha de persistência **depois** da mutação preservando incerteza e evitando segunda invocação.
- Isolamento por projeto, UUID bounded, arquivo inválido/versão futura e ausência de diagnósticos sensíveis.

Referências: #1113, #1116, #1126–#1130.

## Durable systemd user recovery fence (#1117)

When an internal Job includes systemd units, `begin()` accepts **only**
canonical `systemd:user:<unit>.service` refs. Mixed-provider and system-scope
jobs remain unsupported. Before writing an intent, the journal checks **all
projects and environments** for a prior Job involving the same physical unit.
A Job still `running` (including one from a crashed process) or terminal with
`reconciliationRequired=true` blocks the new Job. A completed and verified
Job does not. Rebinding a unit to another project cannot bypass this check.

An operator must reconcile ambiguous systemd jobs outside this endpoint; a
terminal partial result is not automatically upgraded to verified merely
because the unit now appears active or stopped.

This is a conservative **recovery fence**, not a transactional lease: concurrent
processes can race between journal reads. A future executable owner still
requires the shared physical lease protocol and pre-dispatch revalidation.
There is deliberately **no automatic reset** of interrupted/partial records
and no API to approve retry. A human reconciliation workflow is still needed.

Activity's existing Job reader uses `security` and
`systemd-user-confirmed:<uuid>` for these records, including terminal
partial/failed Jobs requiring reconciliation. Compose Jobs keep their
existing identity and behavior. The recovery evidence inspector also checks
the **same canonical systemd:user physical lease key** held by the user-unit
adapter, not only the coordinator's `resource:` prefixed key.

All integration tests use local temporary journal files and fake lease/catalog
readers; no host systemd units are operated. This does not enable Start/Stop.

## Systemd pre-dispatch journal proof (#1117)

Future systemd --user owner authorization requires an exclusive,
fresh `invoking` Job referencing the unit, exact project/environment,
action, revision and `planHash`. `begin` on its own is never authority.
A reopened process that finds an orphaned `running` Job reports
`reconciliationRequired` and refuses to dispatch, even when policy
and observations appear unchanged. An alternate project with an
unreconciled job for the same physical unit also blocks execution.

No API dispatch path exists yet; the new requirement is enforced solely
inside the internal future authorizer.
