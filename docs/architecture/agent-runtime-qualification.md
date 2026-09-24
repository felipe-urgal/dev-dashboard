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
| E2E real Codex | provider real | concluído | execução real em 2026-09-24; evidência consolidada na #777 |
| E2E real Claude Code | provider real | bloqueado externo | CLI presente, mas autenticação/entitlement indisponível; evidência na #777 |
| E2E real ChatGPT Browser | provider real | concluído | execução real em 2026-09-24 e hardening do #925; evidência na #777 |
| Automatic com providers reais | provider real | próximo gate | confirmar seleção determinística entre os providers locais reais por preflight e execução |
| Restart do Dashboard durante execução real | sistema real | pendente | matar/reiniciar processo e registrar recovery |
| Duas tasks em repositórios diferentes | sistema real | pendente | duas execuções reais simultâneas |
| Mesmo target com exclusão | sistema real | pendente | comprovar lock/serialização no target real |
| PR/readiness real | integração externa | pendente | criar PR real e registrar readiness |
| GitHub remoto indisponível | integração externa | pendente | degradar vínculo remoto sem derrubar runtime |

## Estado do tracker

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

O comando registra somente:

- commit e indicador de working tree suja, sem listar paths;
- provider alvo;
- versão local do CLI quando aplicável;
- status sanitizado retornado por `/api/agent/providers`;
- `ready: true|false`.

Ele rejeita API não-loopback, lê o token local já gerenciado pelo Dashboard apenas para autenticar a chamada loopback e nunca o imprime. Também não imprime `reason` bruto do provider nem transporta cookies, stdout/stderr do provider ou configuração MCP. Falha de autenticação/transporte da API é reportada separadamente de `availability: unavailable` do provider. `ready: true` comprova apenas que o ambiente está pronto para começar o gate; **não** conta como E2E real nem como paridade.

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
