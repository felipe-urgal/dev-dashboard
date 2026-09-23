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
| Exclusão por task/owner | automatizado | coberto | lock manager e ownership tests |
| Browser bridge/tool safety | automatizado | coberto | testes de browser provider/bridge/tool policy |
| Activity/Jobs sem prompt/output bruto | automatizado | coberto | testes de Activity da #776 |
| Provider indisponível | automatizado | coberto | UI mantém estado explícito e execução bloqueada |
| Retry após falha | automatizado | coberto | E2E devolve task `failed` para `queued` somente por ação explícita |
| Recover após interrupção | automatizado | coberto | E2E exige ação `Recover` e reconstrói estado `queued` |
| E2E real Codex | provider real | pendente | executar protocolo abaixo |
| E2E real Claude Code | provider real | pendente | executar protocolo abaixo |
| E2E real ChatGPT Browser | provider real | pendente | bridge + extensão + sessão ChatGPT |
| Automatic com providers reais | provider real | pendente | confirmar seleção determinística por preflight |
| Restart do Dashboard durante execução real | sistema real | pendente | matar/reiniciar processo e registrar recovery |
| Duas tasks em repositórios diferentes | sistema real | pendente | duas execuções reais simultâneas |
| Mesmo target com exclusão | sistema real | pendente | comprovar lock/serialização no target real |
| PR/readiness real | integração externa | pendente | criar PR real e registrar readiness |
| GitHub remoto indisponível | integração externa | pendente | degradar vínculo remoto sem derrubar runtime |

## E2E automatizado do control plane

Rodar:

```bash
npm run build
npm run test:e2e --workspace=@dev-dashboard/web -- project-agent-qualification.spec.ts
```

Esse teste usa providers simulados de forma deliberada. Ele prova o fluxo da UI/API client e as transições esperadas, mas **não** prova disponibilidade/autenticação/comportamento real de Codex, Claude ou ChatGPT Browser.

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
