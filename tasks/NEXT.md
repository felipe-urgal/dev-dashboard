# Próxima atividade

Após o merge do PR **#288 — `AiProvider` + `OllamaProvider`**, iniciar o **PR 4 — modos de execução `fast` / `complete`** do plano em [`AI-MULTI-PROVIDER.md`](AI-MULTI-PROVIDER.md).

O objetivo é **tirar budgets de execução de constantes espalhadas e transformá-los em uma policy explícita, determinística e testável**, sem adicionar provider cloud nem alterar a UI.

## Escopo obrigatório

1. Criar `AiExecutionMode = 'fast' | 'complete'`.
2. Criar uma única `AiExecutionPolicy` para concentrar budgets.
3. Manter `fast` como default compatível com o comportamento atual.
4. Manter no `fast` o limite atual de 4 rodadas e 4.000 caracteres de diff por arquivo.
5. Dar ao `complete` budget maior de rodadas, resultados de ferramentas e diff.
6. Contabilizar o tamanho acumulado de resultados de ferramentas, não apenas o número de rounds.
7. Bloquear tool calls idênticas repetidas sem progresso antes de formar loop.
8. Fazer o `GitAiCodeReviewService` usar `maxDiffChars` da mesma policy.
9. Registrar `maxContextFiles` e `runGlobalSynthesis` na policy para as fases seguintes, sem antecipar `ContextBuilder` ou síntese global neste PR.
10. Cobrir `fast`, `complete`, loop guard e limite de diff com testes.

## Policy inicial para validação

| Campo | `fast` | `complete` |
|---|---:|---:|
| `maxToolRounds` | 4 | 10 |
| `maxToolResultChars` | 8.000 | 12.000 |
| `maxAccumulatedToolResultChars` | 32.000 | 96.000 |
| `maxIdenticalToolCalls` | 2 | 2 |
| `maxDiffChars` | 4.000 | 12.000 |
| `maxContextFiles` | 4 | 12 |
| `runGlobalSynthesis` | `false` | `true` |

Esses valores são a primeira calibração e podem ser ajustados depois de validação com projetos reais. O importante neste PR é tornar a policy centralizada e testável.

## Fora do escopo

Não fazer nesse PR:

- provider cloud;
- seleção de provider na UI;
- síntese global da Code review;
- fallback;
- `ProviderRegistry` dinâmico;
- `ContextBuilder` ou `ToolExecutor` como serviços independentes;
- cache de contexto/símbolos;
- mudança visual.

## Critério de conclusão

O PR termina quando:

- `fast` preserva o comportamento atual nos fluxos existentes;
- `complete` possui budget maior, mas continua limitado;
- a repetição de tool call idêntica é interrompida com erro explicativo;
- o crescimento acumulado dos resultados de ferramentas possui teto explícito;
- a Code review deixa de depender de limite de diff hardcoded fora da policy;
- nenhum detalhe específico de provider entra na policy comum;
- a suíte obrigatória do projeto está verde;
- `tasks/AI-MULTI-PROVIDER.md` e este `NEXT.md` avançam para o **PR 5 — síntese global da Code review**.

## Validação manual ainda pendente

Após o CI, validar com Ollama real:

- uma implementação curta no modo `fast`;
- uma implementação multi-arquivo no modo `complete` via chamada programática enquanto a UI ainda não expõe o seletor;
- comportamento quando o modelo repete a mesma ferramenta;
- resposta ao atingir budget de contexto;
- Code review com diff entre 4k e 12k para comparar o contexto enviado.
