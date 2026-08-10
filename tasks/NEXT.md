# Próxima atividade

Após o merge do **PR #290 — primeiro provider cloud (OpenAI)**, executar o **PR 7 — seleção de provider + consentimento por projeto** do plano em [`AI-MULTI-PROVIDER.md`](AI-MULTI-PROVIDER.md).

O objetivo é permitir escolher **Local/OpenAI** e **Rápido/Completo** sem transformar o Assistente IA em um painel técnico e sem permitir qualquer envio cloud sem autorização explícita do projeto.

## Escopo obrigatório

1. Criar um resolver central de providers no backend.
2. Manter `Ollama + fast` como seleção padrão compatível.
3. Persistir provider e modo por projeto em configuração local `0600`.
4. Persistir consentimento OpenAI separadamente por projeto.
5. Revalidar consentimento e disponibilidade no momento de cada nova execução.
6. Bloquear OpenAI quando não houver consentimento, mesmo que ela esteja selecionada.
7. Expor status de Local/OpenAI, modelos, disponibilidade e consentimento para a UI.
8. Adicionar seletor simples `Executar com` mostrando claramente `Local` vs `Cloud`.
9. Adicionar seleção independente `Rápido` / `Completo`.
10. Mover seleção de modelo para `Opções avançadas`.
11. Permitir conceder e revogar consentimento cloud pelo projeto.
12. Cobrir default local, provider indisponível, consentimento ausente, persistência e revogação com testes.

## Decisões

- a seleção é persistida por projeto; a execução não confia somente no estado da UI;
- o provider continua sem conhecer `Project`, filesystem, Git, LSP ou workspace edit;
- a OpenAI só recebe conteúdo depois do resolver validar consentimento;
- revogar consentimento impede novas execuções cloud;
- o provider OpenAI pode consultar seu próprio status/modelos sem enviar conteúdo do projeto;
- o Code review continua usando o fluxo atual neste PR; a seleção visual entra primeiro no Assistente IA para manter o PR pequeno e verificável.

## Fora do escopo

Não fazer neste PR:

- fallback Local → Cloud;
- troca automática de provider;
- provider adicional;
- `ProviderRegistry` dinâmico;
- parâmetros específicos de fornecedor na tela principal;
- reescrever o fluxo de Code review.

## Critério de conclusão

O PR termina quando:

- `Local + Rápido` continua funcionando como default;
- OpenAI indisponível aparece claramente como indisponível;
- OpenAI disponível exige consentimento antes de executar;
- provider e modo sobrevivem à reabertura da tela/reinício da API;
- revogação bloqueia a próxima execução cloud;
- a suíte obrigatória do projeto está verde;
- o próximo item passa a ser o **PR 8 — fallback `offer`**.
