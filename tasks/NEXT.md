# Próxima atividade

Após o merge do **PR #289 — modos de execução `fast` / `complete`**, considerar o **PR 5 — síntese global da Code review** absorvido pelo mesmo PR: o `complete` já executa síntese global, o `fast` preserva a agregação local, há deduplicação, validação estruturada, falha explícita, cancelamento e testes multi-arquivo.

A atividade atual é o **PR 6 — primeiro provider cloud**, usando **OpenAI API** como primeira validação externa do contrato `AiProvider`.

## Decisão técnica

- usar autenticação por API key (`DEV_DASHBOARD_OPENAI_API_KEY`, com fallback para `OPENAI_API_KEY`);
- usar somente endpoint oficial da OpenAI;
- manter `store: false` nas requests de inferência;
- manter IDs nativos de function/tool calling encapsulados dentro do adapter;
- reutilizar `createAiOutboundProtectionFetch` como última barreira de masking;
- não permitir que o provider conheça `Project`, filesystem, Git, LSP ou workspace edit;
- não ligar o provider cloud ao fluxo de produção neste PR: sem seletor/resolver e sem caminho que envie código à cloud;
- mover a persistência/validação de **consentimento por projeto** para o PR seguinte, junto do resolver/seleção, antes de existir qualquer caminho ativo de envio externo.

## Escopo obrigatório

1. Criar `OpenAiProvider` implementando o contrato `AiProvider` existente.
2. Expor status e modelos compatíveis quando houver API key válida.
3. Traduzir o catálogo interno para function tools sem expor detalhes nativos ao domínio.
4. Preservar continuidade de tool calls entre rodadas dentro do próprio adapter.
5. Implementar completion sem acesso direto a filesystem/Git.
6. Estender a barreira de masking para requests do provider cloud.
7. Garantir que requests de inferência usem `store: false`.
8. Não registrar API key, prompts, diffs ou resultados sensíveis.
9. Cobrir autenticação, status, masking, tool calling, argumentos inválidos e completion com testes.
10. Manter Ollama como provider ativo e comportamento padrão do produto.

## Fora do escopo

Não fazer neste PR:

- seleção de provider na UI;
- ativar OpenAI no `AppContext`;
- consentimento visual;
- fallback Local → Cloud;
- `ProviderRegistry` dinâmico;
- mudanças visuais;
- provider Gemini/Anthropic adicional.

## Critério de conclusão

O PR termina quando:

- `OpenAiProvider` passa nos testes sem chamada real à internet;
- masking é aplicado antes do `fetch` cloud;
- function calls mantêm o `call id` nativo sem alterar o contrato compartilhado;
- `store: false` é enviado nas requests;
- Ollama continua sendo o único provider usado pelo `AppContext`;
- a suíte obrigatória do projeto está verde;
- o próximo item passa a ser o **PR 7 — resolver/seleção de provider + consentimento por projeto**.
