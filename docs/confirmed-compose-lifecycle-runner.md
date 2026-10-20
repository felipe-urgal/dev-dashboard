# Integração interna do lifecycle confirmado com Docker Compose

Esta etapa da [#1116](https://github.com/felipe-urgal/dev-dashboard/issues/1116) liga o boundary `ConfirmedLifecycleRunner` do PR #1127 ao **dono atual** das operações de Docker Compose (`DockerComposeLifecycleService`). O adapter é interno e **não é criado pelo app**, não registra rotas HTTP, nem inicia/paralisa serviços do host por padrão.

## Contratos e restrições

- O `ConfirmedServiceLifecycleCoordinator` transmite ao runner a intenção **e** a identidade confirmada de Project/Environment Instance; `node.name` nunca funciona como autoridade para selecionar Compose.
- Apenas `compose:<projectId>:<serviceName>` com nome de serviço validado, `owned`, consumidor exclusivo, ação coerente e ambiente **primary/host** são elegíveis. Worktrees/Dev Containers permanecem bloqueados nesta fatia.
- O runner reconsulta Project, Environment Instance, `DockerComposeOwnershipStore.get` e `DockerComposeProvider.inspect`; configuração e runtime devem corresponder ao nome Compose registrado. Não assume ownership por PID, porta ou nome de container.
- O início delega a `DockerComposeLifecycleService.start(project, {}, service)` para reutilizar a validação e reservas de porta do owner. **Restrição conservadora:** enquanto esse serviço usar `docker compose up SERVICE` (sem `--no-deps` controlado), o runner rejeita start de serviço com qualquer `dependsOn`; evita subir/recriar dependências não explicitamente autorizadas.
- A parada delega a `DockerComposeLifecycleService.stop(project, service)` somente se nenhum outro serviço declarado depender do alvo estando ativo **ou** sem estado comprovadamente inativo; não interrompe bancos usados por aplicações dependentes.
- O coordinator continua obrigado a revalidar o plano antes de cada mutação, aplicar locks process-local e verificar `running + readiness` no start ou `stopped` no stop. O retorno do comando isoladamente **não** prova sucesso.
- `ConfirmedServiceLifecycleActivityWriter` aproveita o `ActivityEventRepository` atual, com domain `compose`, ação e resourceRef. Não registra diagnósticos crus com possíveis segredos e não cria um novo armazenamento.
- Para `serviceRef` maior que o limite de ID aceito pelo Activity, o writer usa um hash SHA-256 estável em vez de truncar silenciosamente a identidade do recurso.

## Limites para disponibilização futura

- **Nenhuma chamada é conectada ao `buildApp`** nem existe rota de execução; testes de adapter usam os owners simulados.
- Locks do #1127 são locais ao processo e não cobrem outras instâncias da API, automações ou chamadas diretas ao Compose: é necessário lease interoperável antes de tornar isso público.
- Ainda faltam proteção end-to-end de produção, limites/timeout, Activity **Jobs** persistente com reattach/cancelamento, testes E2E Linux com fixtures, integração Stack e interface.
- O hook de Activity grava eventos de step, **não** implementa Jobs duráveis nem recuperação automática.
- Não habilitar start/stop através do Dashboard antes de concluir esses itens e a confirmação explícita do usuário.

## Testes

`confirmed-compose-lifecycle-runner.test.ts`: contexto primary/host, serviceRef/backend owner, configuração/runtime, impedimento de `dependsOn` implícito, proteção de dependentes na parada, shared/unowned, cross-project e falha de evidência.

`confirmed-service-lifecycle-activity-writer.test.ts`: mapeamento de resultados para Activity, redaction, status de erro do repositório.

Referências: #1113, #1116, #1126, #1127.

## Revisão e validação do rollout

Antes de expor uma ação mutável, exigir uma nova verificação de plano/ownership imediatamente antes do comando e confirmar que o mesmo recurso não está em uso por outra execução, inclusive fora do processo atual. Na ausência de evidência suficiente, devolver um diagnóstico sem chamar o owner de Compose. A integração deste PR é deliberadamente apenas um adapter interno testado com doubles.
