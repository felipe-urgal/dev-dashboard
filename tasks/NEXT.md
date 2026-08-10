# Próxima atividade

Após o merge do PR de **Caracterização e segurança**, iniciar o **PR 3 — `AiProvider` + `OllamaProvider`** do plano em [`AI-MULTI-PROVIDER.md`](AI-MULTI-PROVIDER.md).

O objetivo é **separar detalhes do Ollama do fluxo de negócio sem mudar a UI nem o comportamento observável do Assistente IA e da Code review IA**.

## Escopo obrigatório

1. Criar o contrato mínimo `AiProvider`.
2. Criar `OllamaProvider`.
3. Mover chamadas HTTP, status/modelos e payloads específicos do Ollama para o provider.
4. Mover a compatibilidade de tool call textual para o `OllamaProvider`.
5. Preservar a barreira de masking introduzida no PR anterior.
6. Transformar o loop interativo atual em um `AiOrchestrator` mínimo.
7. Manter o catálogo de ferramentas, Git, LSP, workspace edit e aprovação fora do provider.
8. Manter `GitAiCodeReviewService` separado do `AiOrchestrator`, consumindo apenas a abstração necessária de inferência.
9. Fazer todos os testes de caracterização e segurança continuarem passando sem alterar expectativas.

## Fora do escopo

Não fazer nesse PR:

- provider cloud;
- `ProviderRegistry` dinâmico;
- seleção de provider na UI;
- modos `fast` / `complete`;
- síntese global da Code review;
- fallback;
- `ContextBuilder` ou `ToolExecutor` como serviços independentes;
- cache de contexto/símbolos;
- mudanças visuais.

## Critério de conclusão

O PR termina quando:

- nenhum HTTP específico do Ollama permanece no orquestrador;
- o `OllamaProvider` não conhece filesystem, Git, LSP ou workspace edit;
- o `AiOrchestrator` não conhece payloads nativos do Ollama;
- masking, cancelamento, limite de rounds e compatibilidade de tool calling continuam protegidos pelos testes do PR anterior;
- o comportamento atual permanece equivalente;
- a suíte obrigatória do projeto está verde;
- `tasks/AI-MULTI-PROVIDER.md` e este `NEXT.md` avançam para o PR de modos de execução.

## Validação manual ainda pendente

A validação com Ollama real continua importante para calibrar as próximas fases:

- implementação pequena em múltiplos arquivos;
- preview, expiração de token e revalidação antes de aplicar;
- respostas lentas e cancelamento;
- Code review com múltiplos arquivos e troca de sub-aba;
- comportamento de modelos diferentes com tool calling.

A calibração dos budgets de `fast`/`complete` continua reservada ao PR 4.
