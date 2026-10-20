# Leases de recursos de lifecycle — proteção entre processos

A issue [#1116](https://github.com/felipe-urgal/dev-dashboard/issues/1116) introduz `ServiceResourceOperationLock` com opção `stateDirectory` para compartilhar bloqueios entre processos da API no **mesmo filesystem local**. A implementação é um mecanismo de segurança, não um novo executor.

## Interface

`new ServiceResourceOperationLock({ stateDirectory: processManager.stateDirectory })`

`await lock.withResources(resourceKeys, async () => { /* operação backend autenticada */ })`

O construtor sem opções continua operando apenas **em memória**, como antes. Quando `stateDirectory` é fornecido, cada recurso usa um nome de diretório `SHA-256(resourceKey)` abaixo de `service-resource-leases-v1` no diretório de estado do processo.

Os recursos são ordenados antes da aquisição e duplicatas são descartadas. Cada `mkdir` exclusivo é atômico em filesystems locais suportados. Uma colisão retorna **409 CONFLICT** e libera todos os recursos obtidos na tentativa, antes de chamar o callback. O código não aguarda um lock nem executa uma operação com apenas parte dos recursos reservada.

## Identidade e diagnóstico

Dentro de cada diretório adquirido, o arquivo `owner.json` contém a versão do protocolo, o identificador do recurso, um token aleatório exclusivo da aquisição, o PID local e o horário da aquisição. As permissões solicitadas são `0700` nos diretórios e `0600` nos arquivos. As mensagens HTTP de erro não expõem caminhos de estado ou metadados.

O `finally` remove somente arquivos de ownership cujo token ainda corresponde à operação, liberando os diretórios em ordem inversa. Nenhuma rotina apaga diretórios desconhecidos à força.

## Recuperação após queda

**Um processo que morre pode deixar leases persistentes. Isso é intencional e seguro.** Não há reaproveitamento por tempo, PID ou remoção de diretórios considerados antigos. Antes de remover manualmente um lease órfão, o operador deve confirmar que nenhuma instância da API ou outro executor ainda está fazendo mutações e reconciliar o estado do Docker Compose/Process Manager e de seus consumidores.

Nunca automatizar `rm -rf` nos locks como rotina de inicialização do Dashboard. Se um lease permanecer após falha, a próxima operação fica bloqueada até uma recuperação explícita.

## Limites antes da ativação de Start/Stop

- Os leases funcionam apenas entre **chamadores cooperantes** com a mesma raiz de estado e o mesmo protocolo; `docker compose` usado pelo terminal, ferramentas externas, outra raiz de estado e mutações do Process Manager não ficam automaticamente bloqueados.
- O owner `DockerComposeLifecycleService` é agora o ponto de aquisição de `compose-project:<projectId>` no app. Os caminhos de Compose e os nós Compose dos Stacks passam por essa mesma instância de owner; Start, Stop e Restart adquirem a lease antes de preflight/comando. O coordenador confirmado mantém apenas locks `resource:<serviceRef>` + Environment Instance, para evitar aquisição aninhada da mesma chave. A cooperação cobre esses fluxos Compose, não ferramentas externas nem processos do Process Manager.
- Não são locks distribuídos em múltiplas máquinas/NFS, nem um sistema de renovação ou fencing token. Nenhuma mutação deve ser exposta publicamente até haver proteção para todos os fluxos correspondentes.
- Persistência de Job, reattach, timeouts/cancelamento e reconciliação de alterações parciais continuam pendentes na #1116.

## Testes

`service-resource-operation-lock.test.ts` exercita exclusão entre instâncias com o mesmo diretório, independência entre projetos, rollback de aquisições parciais, liberação no erro, leases órfãos não reivindicáveis e falha segura com diretório de estado inválido.

## Identidade do processo no Linux (continuação da #1116)

Novos leases passam a gravar, além de `pid`, o campo `processIdentity`: `bootId` (`/proc/sys/kernel/random/boot_id`) e `startTicks` (campo 22 de `/proc/<pid>/stat`). A combinação reduz o risco de confundir o mesmo número de PID com outro processo criado depois de um reinício ou de reutilização do PID. Não exige privilégios elevados nem envia sinais que terminem processos.

A inspeção devolve `processIdentity: verified-same|different|unverifiable`: compara o marcador com a leitura atual **somente quando o PID está presente**. Leases legados, sem `processIdentity`, continuam compatíveis e recebem evidência `unverifiable`; o sistema jamais remove, renova ou rouba esses locks automaticamente. Quando `/proc` não está disponível, a leitura é inconclusiva, sem fallback para acreditar apenas no PID.

**Isso ainda não constitui fencing ou prova de quiescência.** Mesmo `different` não exclui outro executor, worker ou máquina; mesmo `verified-same` não comprova se o processo está alterando o Compose. Nenhum resultado habilita `retry`, `cancel`, limpeza de lease ou finalização de Job. Essas etapas exigem um protocolo explícito e interoperável de controle do executor.
