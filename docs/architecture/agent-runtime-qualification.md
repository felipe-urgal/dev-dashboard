# Agent Runtime — qualificação e paridade

Issue de origem: #777.

Este documento separa **provas automatizadas do control plane** de **qualificação real com providers externos**. CI verde não é suficiente para declarar paridade.

## Gates

| Gate | Tipo | Estado atual | Evidência |
| --- | --- | --- | --- |
| Criar task pela aba Agente | automatizado | coberto | `project-agent-qualification.spec.ts` |
| Autorização explícita | automatizado | coberto | UI concede somente capability solicitada |
| Checkpoint humano | automatizado | coberto | execução abre checkpoint e exige decisão explícita |
| Continuação após checkpoint | automatizado | coberto | instrução de continuação é enviada na resolução |
| Evidence após conclusão | automatizado | coberto | UI recebe evidence de teste após segunda execução |
| Persistência/restart do task store | automatizado | coberto | testes do `GitAgentTaskStore` |
| Runtime interrompido/recovery | automatizado | coberto | `packages/agent-runtime/test/recovery.test.ts` |
| Conversa multi-turn sem replay após reabrir stores | automatizado | coberto | `packages/agent-runtime/test/conversation-recovery.test.ts` |
| Exclusão por task/owner | automatizado | coberto | lock manager e ownership tests |
| Browser bridge/tool safety | automatizado | coberto | testes de browser provider/bridge/tool policy |
| Activity/Jobs sem prompt/output bruto | automatizado | coberto | testes de Activity da #776 |
| Provider indisponível | automatizado | coberto | UI mantém estado explícito e execução bloqueada |
| Retry após falha | automatizado | coberto | E2E devolve task `failed` para `queued` somente por ação explícita |
| Recover após interrupção | automatizado | coberto | E2E exige ação `Recover` e reconstrói estado `queued` |
| E2E real Codex | provider real | concluído | execução real em 2026-09-24; evidência consolidada na #777 |
| E2E real Claude Code | provider real | bloqueado externo | CLI presente, mas autenticação/entitlement indisponível; evidência na #777 |
| E2E real ChatGPT Browser | provider real | concluído | execução real em 2026-09-24 e hardening do #925; evidência na #777 |
| Automatic com providers reais | provider real | próximo gate | confirmar seleção determinística entre os providers locais reais por preflight e execução |
| Multi-turn real Codex | provider real | gate executável | `agent:qualification:multiturn`; exige recuperação de marcador entre execuções reais |
| Multi-turn real Claude Code | provider real | bloqueado externo | mesmo gate, mas preflight continua bloqueado por autenticação/entitlement local |
| Multi-turn real ChatGPT Browser | provider real | gate executável | mesmo gate contra Browser Bridge/extensão reais |
| Multi-turn real Automatic | provider real | gate executável | registra provider concreto por turno; opção de troca Codex↔Claude quando ambos estiverem disponíveis |
| Restart físico do processo Agent com provider controlado | sistema real parcial | gate automatizado | `Agent Physical Process Restart`: dois processos Node, Git/conversation/audit/runtime stores reais e `SIGKILL` |
| Restart do Dashboard durante execução real | sistema real | pendente | matar/reiniciar processo e registrar recovery |
| Duas tasks em repositórios diferentes | sistema real | pendente | duas execuções reais simultâneas |
| Lock físico entre processos em targets independentes | sistema real parcial | gate automatizado | `Agent Physical Lock Qualification`: 2 repositórios Git e processos Node, sem providers |
| Mesmo target com exclusão | sistema real | pendente | comprovar lock/serialização no target real |
| PR/readiness real | integração externa | pendente | criar PR real e registrar readiness |
| GitHub remoto indisponível | integração externa | pendente | degradar vínculo remoto sem derrubar runtime |

## Estado do tracker

### Recovery da conversa multi-turn (#895)

`conversation-recovery.test.ts` integra o runtime com os stores reais de task
Git, conversa, auditoria e estado operacional em diretórios temporários. Cada
reabertura cria novas instâncias sobre os mesmos arquivos. O provider e a
detecção de processo encerrado são simulados; não é um teste de interrupção de
um provider real.

O teste cobre:

- execução concluída: histórico e vínculo execution/provider sobrevivem à
  reabertura; reenviar o mesmo `turnId`, inclusive com outro conteúdo, não executa
  o provider nem altera a conversa;
- falha depois de persistir a mensagem do usuário e antes de salvar `running`:
  a mensagem permanece única e seu ID não pode ser reenviado;
- falha depois de persistir a resposta e antes de salvar `review`: recovery
  preserva as duas mensagens e o estado canônico, sem replay da execução.

`Recover` restaura somente o bookkeeping operacional de `interrupted` para
`idle`. Não transforma uma task canônica ainda `running` em `queued` ou `review`.
Essa execução ambígua continua impedida de executar; retomar trabalho exige
reconciliação canônica explícita, não reenvio automático. Da mesma forma, um
turno persistido antes de uma falha de início não ganha retry implícito.

A cobertura comprova ausência de duplicação nesses pontos de falha, não
recuperação automática de qualquer execução interrompida. Qualificação
multi-turn com providers reais e interrupção real do processo continuam como gates separados da #895/#777. A observabilidade da redução bounded do contexto é persistida como evidence quando turnos são omitidos; isso registra contagens/limites, não o conteúdo da conversa.

Em 2026-09-23, a epic #768 e o roadmap #596 foram sincronizados com o estado real: #773–#776 estão concluídas e #777 permanece aberta para os gates reais de paridade. As issues #599/#600 foram reconciliadas como concluídas e #589 continua parcial apenas na convergência da execução mutável.

## Evidência real consolidada — 2026-09-24

- **Codex**: E2E real concluído com provider concreto `codex`, capability `workspace:write` e execução chegando a `review`. O diff ficou restrito ao arquivo esperado e a validação direcionada passou. Nenhum commit, push ou PR foi autorizado ao provider.
- **Claude Code**: preflight real encontrou CLI compatível, mas `claude auth status` permaneceu sem autenticação. A tentativa interativa confirmou dependência externa de plano elegível ou chave de API. O gate continua pendente sem ser tratado como falha do runtime.
- **ChatGPT Browser**: E2E real concluído com provider concreto `chatgpt-browser`, capability `workspace:write`, diff restrito ao teste esperado e validação direcionada verde. A qualificação revelou gaps reais de envelope renderizado, classificação de `apply_patch` e persistência do token do Browser Bridge, corrigidos no #925.
- **Automatic**: é o próximo gate real executável. O contrato de #771 seleciona deterministicamente apenas os providers locais Codex/Claude Code; ChatGPT Browser ficou explicitamente fora do escopo dessa seleção. No ambiente qualificado atual, Codex está disponível e Claude permanece bloqueado externamente, então a execução real deve comprovar a escolha concreta de Codex sem fallback silencioso depois do início.

A reinicialização do Browser Bridge com token persistido já foi comprovada, mas isso **não** substitui o gate separado de restart/recovery durante uma execução real.

## E2E automatizado do control plane

Rodar:

```bash
npm run build
npm run test:e2e --workspace=@dev-dashboard/web -- project-agent-qualification.spec.ts
```

Esse teste usa providers simulados de forma deliberada. Ele prova o fluxo da UI/API client e as transições esperadas, mas **não** prova disponibilidade/autenticação/comportamento real de Codex, Claude ou ChatGPT Browser.

## Gate físico de ownership (sem provider externo) — #1073

O CI executa o job `Agent Physical Lock Qualification` com Node e Git reais,
em diretórios descartáveis e sem credenciais de providers/GitHub:

```bash
npm run build:packages
AGENT_LOCK_QUALIFY=1 node scripts/qualify-agent-lock-ownership.mjs
```

O gate exige opt-in explícito e **não aceita caminhos/targets arbitrários**
na linha de comando. Cria dois repositórios Git temporários, inicia processos
independentes do SO usando `AgentTaskLockManager` compilado do runtime e
comprova: (1) um concorrente no mesmo target recebe `AGENT_TASK_LOCKED`;
(2) targets separados mantêm locks ao mesmo tempo; (3) a espera pelo mesmo
target não avança antes da liberação; (4) após encerrar um owner com
`SIGKILL`, outra instância reconhece o PID morto e recupera o lock.
Os recursos são apagados no `finally`, e a evidência é somente JSON
sanitizado de categorias e resultados, sem tokens, prompts ou saídas de providers.

**Limite da evidência:** isso qualifica a implementação do lock físico
**entre processos** e o isolamento de diretórios Git, não o orquestrador
com dois providers reais, a escolha de target por Task Context, uma execução
em andamento durante restart do Dashboard, a idempotência do turno, ou PR/
readiness remoto. Os gates de `Duas tasks em repositórios diferentes`,
`Mesmo target com exclusão` ponta a ponta e `Restart durante execução real`
permanecem pendentes até provas com o runtime e os providers apropriados.
CI verde não altera o estado de `blocked external` de Claude.

## Gate físico de interrupção e recovery entre processos — #1073

O job `Agent Physical Process Restart` executa o runtime compilado com
`GitAgentTaskStore`, `AgentRuntimeStateStore`, `AgentConversationStore`,
`AgentAuditStore` e `AgentTaskLockManager` reais em disco. Ele inicia
um processo Node que salva um turno concluído e outro turno em andamento
com um **provider controlado sem conexão externa**, mata o processo
durante a segunda execução com `SIGKILL` e inicia **outro processo**
sobre os mesmos stores.

```bash
npm run build:packages
AGENT_RESTART_QUALIFY=1 node scripts/qualify-agent-process-restart.mjs
```

O gate cria apenas diretórios temporários sob `os.tmpdir()`, exige opt-in,
rejeita caminhos fornecidos pelo operador e apaga os dados em `finally`.
Não reinicia serviços instalados, não consome credenciais externas e
não toca em repositórios/projetos do usuário.

A verificação comprova:

1. execução não concluída detectada como `interrupted` após morte física
   do processo anterior, preservando o `executionId` e o state `running`
   canônico;
2. ausência de execução ativa no runtime novo e ausência de dispatch
   automático do provider ao chamar `recoverInterrupted`;
3. necessidade de recovery explícito, que altera somente bookkeeping para
   `idle` e **não** reabre task canônica ambígua para replay;
4. turno do usuário pendente permanece único, e reexecução é recusada
   mesmo após recovery explícito;
5. turno previamente concluído mantém usuário + resposta no store,
   e enviar o mesmo `turnId` novamente retorna
   `AGENT_WORKFLOW_TURN_ALREADY_SUBMITTED`;
6. quantidade de chamadas ao provider controlado não aumenta ao reiniciar,
   consultar status ou tentar um turno já persistido.

A evidência JSON contém apenas flags, contagens e tipo de fixture;
não imprime conteúdo da conversa, tokens, cookies nem saída de providers.

**Limitação:** esse gate comprova a semântica física de recovery entre
processos usando stores canônicos, mas **não** mata o processo da API
do Dashboard com uma execução de **provider externo real** em andamento.
Por isso, o gate `Restart do Dashboard durante execução real` continua
pendente e só poderá ser fechado com evidência de provider real e da
instalação local. A qualificação multi-turn de providers reais, PR/readiness
remoto e falha de GitHub remoto permanecem separadas.

## Preflight do gate real

Antes de uma execução real, rode o preflight somente contra a API loopback do Dashboard:

```bash
npm run agent:qualification:preflight -- --provider codex
npm run agent:qualification:preflight -- --provider claude-code
npm run agent:qualification:preflight -- --provider chatgpt-browser
npm run agent:qualification:preflight -- --provider automatic
```

Opcionalmente, quando a API usa outra porta local:

```bash
npm run agent:qualification:preflight -- --provider codex --api http://127.0.0.1:4444
```

## Gate real de conversa multi-turn

Depois que o preflight do provider estiver verde, o gate multi-turn pode ser executado contra a mesma API local:

```bash
npm run agent:qualification:multiturn -- --provider codex --project <projectId>
npm run agent:qualification:multiturn -- --provider claude-code --project <projectId>
npm run agent:qualification:multiturn -- --provider chatgpt-browser --project <projectId>
npm run agent:qualification:multiturn -- --provider automatic --project <projectId>
```

O gate cria uma Agent Task **sem capabilities**, portanto Codex/Claude operam em modo read-only e o Browser não recebe ferramentas mutáveis. O fluxo é deliberadamente pequeno:

1. executa a task inicial até `review`;
2. envia um primeiro turno com um marcador aleatório;
3. envia um segundo turno que **não contém o marcador** e exige que o provider o recupere apenas do contexto persistido;
4. valida os dois pares user/agent reconstruídos por `GET /conversation`;
5. registra somente IDs, provider concreto por execução, quantidade de turnos e o booleano `markerRecovered`; resposta textual bruta não entra no relatório.

Para provar mudança de provider concreto no modo Automatic quando Codex e Claude estiverem ambos disponíveis:

```bash
npm run agent:qualification:multiturn -- --provider automatic --project <projectId> --automatic-switch-to claude-code
```

Nesse modo o gate lê a preferência atual do projeto, executa o primeiro turno, altera temporariamente a preferência para o provider alvo, exige que o segundo turno rode nesse provider e recupere o marcador, e restaura a preferência anterior **antes** de declarar sucesso. Se o provider alvo não estiver realmente disponível ou a restauração falhar, o gate falha fechado. A seleção Automatic continua limitada a Codex/Claude pelo contrato atual; ChatGPT Browser é qualificado diretamente.

O comando não transforma teste simulado em evidência real. Um resultado só conta como gate de provider real quando executado contra a instalação local, com preflight real verde e os IDs de execução registrados. No ambiente já documentado da #777, Claude continua bloqueado externamente; portanto esse gate pode ser implementado e testado no CI, mas a evidência real de Claude só existe depois que a autenticação/entitlement estiver disponível.

O comando registra somente:

- commit e indicador de working tree suja, sem listar paths;
- provider alvo;
- versão local do CLI quando aplicável;
- status sanitizado retornado por `/api/agent/providers`;
- `ready: true|false`.

Ele rejeita API não-loopback, lê o token local já gerenciado pelo Dashboard apenas para autenticar a chamada loopback e nunca o imprime. Também não imprime `reason` bruto do provider nem transporta cookies, stdout/stderr do provider ou configuração MCP. Para `automatic`, quando o runtime comprova uma escolha saudável no status, o preflight preserva apenas `selectedProviderId` como evidência estruturada e não sensível. Falha de autenticação/transporte da API é reportada separadamente de `availability: unavailable` do provider. `ready: true` comprova apenas que o ambiente está pronto para começar o gate; **não** conta como E2E real nem como paridade.

## Protocolo de qualificação real por provider

Para cada provider (`codex`, `claude-code`, `chatgpt-browser` e depois `automatic`):

1. Registrar o commit exato do Dev Dashboard.
2. Registrar projeto, branch, Task Context, Environment Instance e worktree usados.
3. Rodar o provider doctor/preflight e registrar somente status/versão, nunca tokens.
4. Criar uma Agent Task pela UI com uma alteração pequena e verificável.
5. Conceder somente as capabilities necessárias.
6. Executar e registrar:
   - provider solicitado;
   - provider concreto;
   - execution id;
   - attempts;
   - checkpoints;
   - evidence produzida;
   - resultado final.
7. Validar diff/testes/readiness no domínio original.
8. Repetir com checkpoint humano.
9. Repetir com cancelamento.
10. Repetir uma execução interrompendo/reiniciando o Dashboard.
11. Registrar qualquer desvio sem reinterpretar falha ambígua como sucesso.

## Registro mínimo por execução

```text
commit:
provider solicitado:
provider concreto:
task id:
project id:
task context id:
environment instance id:
branch/worktree:
preparação:
capabilities concedidas:
checkpoint(s):
resultado:
evidence:
retry/recovery:
falhas/desvios:
observações de timing:
```

Não registrar:

- token;
- cookie;
- prompt bruto se contiver dados sensíveis;
- stdout/stderr bruto desnecessário;
- conteúdo de secrets;
- credenciais de GitHub/ChatGPT/providers.

## Critério para decisão sobre runtimes antigos

Nenhum repositório de origem deve ser arquivado apenas porque os testes automatizados estão verdes.

A decisão sobre `agent-workflow`, `agent-orchestrator` e `agent-workflow-browser` só pode acontecer depois que os gates reais acima tiverem evidência registrada e os gaps restantes estiverem explícitos.
