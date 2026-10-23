# Agent Runtime — qualificação e paridade

Issue de origem: #777.

Este documento separa **provas automatizadas do control plane** de **qualificação real com providers externos**. CI verde não é suficiente para declarar paridade.

## Política operacional de histórico — #1073

O histórico canônico de Agent Tasks não tem TTL nem exclusão automática. A
retenção é **indefinida até uma política de descarte separada, explícita e
autorizada**, ainda inexistente. A UI carrega inicialmente uma página limitada,
prioriza tasks não terminais (incluindo `review`, `blocked`, `checkpoint` e
`failed`) e solicita páginas adicionais somente por ação do usuário. A
indexação por revisão Git é auxiliar e não substitui a task canônica.

Tasks `completed` ou `cancelled` sem execução ativa podem ser arquivadas
explicitamente. Archive grava `archivedAt` no registro canônico por CAS e apenas
retira a task da listagem operacional `order=priority` por padrão. A task e sua
conversa, auditoria, attachments e evidence **não são apagadas**. Uma task
arquivada pode ser consultada por ID ou exibida com
`includeArchived=true` para auditoria; archive não reexecuta um provider
nem concede permissão para execução. Archive de task em execução falha fechado.

A paginação priorizada retorna um lote limitado e cursor versionado; `Ver
mais` expande apenas os registros já carregados e `Carregar mais` solicita
a página seguinte. `Atualizar histórico` reinicia a consulta quando necessário;
uma falha ao obter a página seguinte preserva itens e cursor já disponíveis para
retry. Não há compactação automática, deleção silenciosa nem mudança nos stores
de conversation/audit/attachments por causa da política visual.

O card `ProjectAgentTaskHistoryCard` é somente apresentação. A identidade,
a seleção, a geração de requests, o histórico incremental e o realtime
permanecem nos owners do cockpit e seus composables; o card apenas emite
intenções de navegação e carregamento.

## Gates

| Gate                                               | Tipo                    | Estado atual          | Evidência                                                                                                     |
| -------------------------------------------------- | ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Criar task pela aba Agente                         | automatizado            | coberto               | `project-agent-qualification.spec.ts`                                                                         |
| Autorização explícita                              | automatizado            | coberto               | UI concede somente capability solicitada                                                                      |
| Checkpoint humano                                  | automatizado            | coberto               | execução abre checkpoint e exige decisão explícita                                                            |
| Continuação após checkpoint                        | automatizado            | coberto               | instrução de continuação é enviada na resolução                                                               |
| Evidence após conclusão                            | automatizado            | coberto               | UI recebe evidence de teste após segunda execução                                                             |
| Persistência/restart do task store                 | automatizado            | coberto               | testes do `GitAgentTaskStore`                                                                                 |
| Runtime interrompido/recovery                      | automatizado            | coberto               | `packages/agent-runtime/test/recovery.test.ts`                                                                |
| Conversa multi-turn sem replay após reabrir stores | automatizado            | coberto               | `packages/agent-runtime/test/conversation-recovery.test.ts`                                                   |
| Exclusão por task/owner                            | automatizado            | coberto               | lock manager e ownership tests                                                                                |
| Browser bridge/tool safety                         | automatizado            | coberto               | testes de browser provider/bridge/tool policy                                                                 |
| Activity/Jobs sem prompt/output bruto              | automatizado            | coberto               | testes de Activity da #776                                                                                    |
| Provider indisponível                              | automatizado            | coberto               | UI mantém estado explícito e execução bloqueada                                                               |
| Retry após falha                                   | automatizado            | coberto               | E2E devolve task `failed` para `queued` somente por ação explícita                                            |
| Recover após interrupção                           | automatizado            | coberto               | E2E exige ação `Recover` e reconstrói estado `queued`                                                         |
| E2E real Codex                                     | provider real           | concluído             | execução real em 2026-09-24; evidência consolidada na #777                                                    |
| E2E real Claude Code                               | provider real           | bloqueado externo     | CLI presente, mas autenticação/entitlement indisponível; evidência na #777                                    |
| E2E real ChatGPT Browser                           | provider real           | concluído             | execução real em 2026-09-24 e hardening do #925; evidência na #777                                            |
| Automatic com providers reais                      | provider real           | próximo gate          | confirmar seleção determinística entre os providers locais reais por preflight e execução                     |
| Multi-turn real Codex                              | provider real           | gate executável       | `agent:qualification:multiturn`; exige recuperação de marcador entre execuções reais                          |
| Multi-turn real Claude Code                        | provider real           | bloqueado externo     | mesmo gate, mas preflight continua bloqueado por autenticação/entitlement local                               |
| Multi-turn real ChatGPT Browser                    | provider real           | gate executável       | mesmo gate contra Browser Bridge/extensão reais                                                               |
| Multi-turn real Automatic                          | provider real           | gate executável       | registra provider concreto por turno; opção de troca Codex↔Claude quando ambos estiverem disponíveis          |
| Restart real, evidência antes/depois               | provider real assistido | protocolo opt-in      | `agent:qualification:restart-observe`; exige execução no host + intervenção do operador, sem prova real ainda |
| Restart do Dashboard durante execução real         | sistema real            | pendente              | matar/reiniciar processo e registrar recovery                                                                 |
| Duas tasks em repositórios diferentes              | sistema real            | pendente              | duas execuções reais simultâneas                                                                              |
| Mesmo target com exclusão                          | sistema real            | pendente              | comprovar lock/serialização no target real                                                                    |
| PR feedback com CI/review incompleto               | automatizado parcial    | regressão fail-closed | `AgentRuntimeApiService`: remote explícito, CI success, review approved e 0 conversas pendentes para `ready`  |
| GitHub remoto offline, execução local preservada   | automatizado parcial    | fault injection       | snapshot remoto indisponível, feedback `unavailable` e execução local ainda permitida                         |
| PR/readiness real                                  | integração externa      | pendente              | criar PR real e registrar readiness                                                                           |
| GitHub remoto indisponível                         | integração externa      | pendente              | degradar vínculo remoto sem derrubar runtime                                                                  |

## Regra fail-closed para PR/readiness — #1073

A classificação `ready` de feedback de PR exige evidência **positiva**
e coerente de GitHub: `remoteStatus=available`, `ciStatus=success`,
`reviewState=approved` e zero conversas de revisão não resolvidas.
Observação remota ausente/offline/autenticação inválida/rate limit é
`unavailable`; CI `pending`/`unknown` ou review
`review-required`/`unknown` fica em `attention`.
Nenhuma dessas condições concede capability, cria merge ou dispara
continuação automática do Agent.

Os testes com snapshot reader injetado e falhando confirmam também que
esse vínculo remoto é **observacional**: a task local pode continuar com
autorização normal, a evidence registra a indisponibilidade de forma
sanitizada e estados/capabilities não são alterados. A simulação de
falha **não é** evidência de uma interrupção real do GitHub no host.
Os gates `PR/readiness real` e `GitHub remoto indisponível` seguem
pendentes para qualificação externa.

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

## Protocolo opt-in de restart com provider real — #1073

O protocolo `agent:qualification:restart-observe` **não inicia providers,
não cria tasks, não mata processos e não modifica o estado do Agent**. Ele
consulta somente `GET /status`, `GET /conversation` e o preflight
existente da API local. É uma ferramenta para reunir evidência da
instalação real, não uma prova automática que possa rodar no CI.

**Preparação pelo operador:** selecione um projeto de qualificação isolado
e uma task de teste com capabilities vazias. No Dev Dashboard local, inicie
uma execução com um provider externo disponível e um turno de usuário.
O provider precisa ainda estar executando quando a captura ocorrer.

```bash
export AGENT_REAL_RESTART_QUALIFY=1
npm run agent:qualification:restart-observe -- \
  --phase capture --provider codex --project PROJECT_ID --task TASK_ID \
  --snapshot /tmp/agent-restart-observation.json
```

A captura falha se o provider doctor/preflight não estiver disponível,
se a task não estiver canonicamente `running`, se o estado do runtime
não tiver um `activeExecution` correspondente ou se o último turno
do usuário já tiver resposta. O arquivo de evidência é **criado apenas
se não existir**, com permissão 0600. Guarda somente hashes de
identificadores/turnos, versão canônica, provider, API loopback e horário.
Não guarda tokens, prompts ou respostas brutas.

**Ação explícita do operador:** interrompa/reinicie o serviço Dev Dashboard
pelo mecanismo de gerenciamento local já autorizado. Não encerre o
provider externo de forma que sua execução continue consumindo recursos
sem controle. Registre separadamente a forma de restart, o resultado do
provider real e a nova identidade do processo. O comando não automatiza
nenhuma dessas ações.

```bash
npm run agent:qualification:restart-observe -- \
  --phase verify --provider codex --project PROJECT_ID --task TASK_ID \
  --snapshot /tmp/agent-restart-observation.json
```

A verificação exige, em **duas leituras separadas por três segundos**:

- task canônica ainda `running` na mesma versão;
- runtime `interrupted` e `lastReason=process-interrupted`;
- mesmo `executionId` anterior, sem `processId` vivo e sem
  `activeExecution` no novo runtime;
- mesmos IDs/roles de turnos, sem nova resposta nem replay observável.

Não é chamado `POST /recover`, `POST /turns` nem `POST /executions`.
O snapshot expira após duas horas e não pode ser sobrescrito. Falha do
preflight, status inconsistente, API não-loopback, token inválido ou novos
turnos fazem o gate falhar **sem relançar o provider**.

**Limitações:** a ferramenta observa o status e o histórico do
Dashboard, mas não inspeciona diretamente processos de CLI nem a
contabilidade de chamadas no serviço do provider. O campo
`providerReplayDirectlyObserved: false` significa ausência dessa
observabilidade direta, e **não** certifica ausência absoluta de chamadas
externas. A captura de `activeExecution` e preflight verde, isoladamente,
não provam qual provider concreto está executando aquela task.
O gate da issue só será marcado como concluído após evidência manual
de identidade do provider, encerramento/restart do processo real e
verificação da instalação. Claude segue `blocked external` enquanto
autenticação/entitlement não estiver disponível.

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
