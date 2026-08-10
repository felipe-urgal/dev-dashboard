# Próxima atividade

Após o merge do **PR #291 — seleção de provider + consentimento por projeto**, executar o **PR 8 — fallback `offer`** do plano em [`AI-MULTI-PROVIDER.md`](AI-MULTI-PROVIDER.md).

O objetivo é recuperar indisponibilidade de provider sem transformar Local → Cloud em troca automática ou silenciosa.

## Escopo obrigatório

1. Implementar policies `off` e `offer`.
2. Manter `offer` como comportamento inicial do Assistente IA.
3. Considerar elegível somente execução que falhou enquanto o provider selecionado está indisponível no status atual.
4. Não oferecer troca para erro de ferramenta/modelo quando o provider continua disponível.
5. Exibir claramente qual provider falhou e qual alternativa está disponível.
6. Permitir recusar a oferta sem alterar provider, modo ou consentimento.
7. Ao aceitar a oferta, restaurar somente o pedido original e selecionar explicitamente o provider alternativo.
8. Não reaproveitar histórico, tool results, diffs ou eventos da execução que falhou.
9. Para Local → Cloud, continuar exigindo consentimento explícito do projeto antes de uma nova execução.
10. Não iniciar a execução alternativa automaticamente: depois da troca/consentimento, o usuário ainda confirma em `Iniciar`.
11. Cobrir `off`, `offer`, provider ainda disponível, alternativa indisponível, aceite e recusa com testes.
12. Manter a suíte obrigatória do projeto verde.

## Decisões

- fallback é uma oferta de UX nesta fase; não existe roteamento automático no backend;
- a classificação inicial é conservadora e baseada em indisponibilidade observável do provider;
- aceitar a oferta usa o fluxo normal de seleção já persistido por projeto;
- consentimento cloud continua sendo validado pelo fluxo existente antes da execução;
- a continuação segura reaproveita apenas o `prompt` original;
- `automatic` permanece fora do escopo.

## Fora do escopo

Não fazer neste PR:

- fallback automático;
- retry transparente;
- transportar histórico/tool results entre providers;
- adicionar novo provider;
- `ProviderRegistry` dinâmico;
- migrar Code review para seleção multi-provider.

## Critério de conclusão

O PR termina quando:

- `offer` aparece somente para falha elegível;
- `off` encerra sem oferta;
- o usuário pode recusar sem efeito colateral;
- o usuário pode selecionar explicitamente o provider alternativo;
- Local → Cloud continua bloqueado sem consentimento;
- somente o pedido original é preparado para a nova execução;
- a suíte obrigatória do projeto está verde.
