# Próxima atividade

Iniciar o **PR 2 — Caracterização e segurança** do plano de evolução da IA descrito em
[`AI-MULTI-PROVIDER.md`](AI-MULTI-PROVIDER.md).

O objetivo desse PR é **congelar o comportamento observável atual do Ollama com testes e preparar a fronteira de masking para futuros providers externos**, sem adicionar provider novo e sem alterar a interface.

## Escopo obrigatório

### Caracterização do comportamento atual

1. Revisar os testes existentes de `AiAssistantService` e das rotas de IA.
2. Cobrir status/listagem de modelos Ollama.
3. Cobrir chat sem ferramentas.
4. Cobrir chat com tool calling válido.
5. Preservar o caso de tool call vazado como JSON textual.
6. Cobrir o limite atual de rodadas de ferramentas.
7. Cobrir cancelamento/abort.
8. Cobrir `review()` e os fluxos de implementation/preview que dependem do serviço de IA.

### Segurança e masking

1. Mapear todos os pontos que podem enviar conteúdo do projeto ao motor de IA.
2. Confirmar onde `maskSensitiveLogContent` é aplicado hoje.
3. Definir uma fronteira compartilhada de sanitização para futuros providers externos.
4. Garantir que chat, implementation e review possam passar por essa proteção sem caminhos alternativos.
5. Adicionar testes para impedir regressão/vazamento de conteúdo sensível.
6. Confirmar que prompts/diffs sensíveis não ganham persistência em logs.

## Fora do escopo

Não fazer neste PR:

- criar `AiProvider`;
- criar `OllamaProvider`;
- integrar Codex, Gemini, Claude ou outro provider;
- alterar a UI;
- criar seleção de provider;
- implementar `fast` / `complete`;
- implementar síntese global da Code review;
- implementar fallback;
- alterar intencionalmente o comportamento atual do Ollama.

## Critério de conclusão

O PR termina quando:

- o comportamento atual relevante do Ollama está protegido por testes de caracterização;
- a fronteira de masking necessária para uma futura chamada externa está definida e testada;
- não existe mudança visual ou provider novo;
- a suíte obrigatória do projeto está verde;
- `tasks/AI-MULTI-PROVIDER.md` e este `NEXT.md` são atualizados para apontar o PR seguinte.

## Validação manual que continua pendente

A validação em máquina real com Ollama continua necessária e deve ser usada para calibrar os próximos passos:

- pedir uma alteração pequena em mais de um arquivo e verificar preview, expiração do token e revalidação de versão;
- confirmar comportamento com respostas lentas e cancelamento;
- confirmar que reiniciar a API cancela a execução e não persiste prompts;
- na Code review IA, trocar de sub-aba durante a execução e conferir recuperação de progresso, comentários e diff lado a lado.

A calibração de budgets e limites do modo `complete` será feita posteriormente no PR de modos de execução, não neste PR.
