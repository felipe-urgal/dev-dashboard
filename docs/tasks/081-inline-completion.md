# Task 081 — Compleção inline e contexto semântico ampliado

## Status

Planejada. Começa após a revisão e o merge da task 080.

## Objetivo

Adicionar sugestões de código "ghost text" (compleção inline) ao editor
embutido usando o mesmo Ollama local já integrado na task 080, com
debounce, cancelamento e um cache curto — sem enviar o projeto inteiro a
cada tecla digitada.

## Resultado esperado

- sugestão inline (ghost text) enquanto o usuário digita, para modelos que
  anunciem suporte a completion/FIM;
- uso de *fill-in-the-middle* (prefixo + sufixo do cursor) quando o modelo
  suportar, em vez de só completar a partir do prefixo;
- debounce e cancelamento agressivos: nenhuma requisição sobrevive a uma
  tecla digitada depois da última;
- cache curto (mesmo prefixo/sufixo/arquivo) para evitar chamadas repetidas
  em edições que vão e voltam;
- contexto semântico **opt-in** via embeddings locais, desligado por padrão;
- restauração opcional de abas/estado do editor entre sessões, também
  opt-in.

## Decisão de segurança principal

Compleção inline dispara uma requisição por pausa de digitação — o volume é
maior que o chat da task 080. As mesmas garantias continuam obrigatórias:

- API continua intermediando toda chamada ao Ollama (nenhum fetch direto do
  navegador);
- o texto enviado é só prefixo/sufixo próximos ao cursor, limitado em bytes
  — nunca o arquivo inteiro nem o projeto;
- nenhuma ferramenta (`AiTool`) é chamada durante a compleção inline: é uma
  chamada direta a `/api/generate` (ou `/api/chat` sem tools), sem
  tool-calling, para manter a latência previsível;
- embeddings, se habilitados, indexam só o que o usuário autorizar
  explicitamente, ficam no diretório privado de estado
  (`~/.config/dev-dashboard` / `DEV_DASHBOARD_STATE_DIR`), nunca em
  `localStorage` do navegador, e são removidos ao excluir o projeto ou
  trocar de modelo de embedding.

## Arquitetura proposta

### API

- endpoint dedicado, ex. `POST /api/projects/:projectId/ai/complete`, corpo
  `{ model, prefix, suffix, language }`, resposta única (não streaming,
  já que ghost text é uma sugestão curta) ou streaming curto se o modelo
  demorar;
- detecta suporte a FIM pelas capacidades já reportadas por `/api/show`
  (task 080); sem suporte, cai para completion simples a partir do prefixo
  ou fica indisponível;
- limite de tamanho de prefixo/sufixo bem menor que o das mensagens de chat.

### Cliente Monaco

- `registerInlineCompletionsProvider` no cliente já existente
  (`project-language-server-client.ts` ou um novo módulo irmão);
- debounce (algo como 300–500ms de pausa) e `AbortController` cancelando a
  requisição anterior a cada nova tecla;
- cache em memória por `(caminho, prefixo, sufixo)` com TTL curto, limpo ao
  trocar de arquivo/projeto.

### Contexto semântico opt-in

- fora do caminho crítico de latência da compleção: um índice de embeddings
  local, construído sob consentimento explícito, usado para *rerank* de
  contexto adicional (não para a chamada de completion em si);
- controle de habilitar/desabilitar e limpar o índice na tela de
  Configurações existente.

## Critérios de aceite

- ghost text aparece e desaparece corretamente sem interferir na digitação
  normal nem no undo/redo do Monaco;
- nenhuma requisição de completion sobrevive a uma tecla digitada depois
  dela (cancelamento efetivo, verificável em teste);
- ausência de suporte a completion/FIM no modelo selecionado desativa o
  recurso com um estado claro, sem erro ruidoso a cada tecla;
- embeddings permanecem desligados até ativação explícita e nunca indexam
  arquivos sensíveis/ignorados;
- typecheck, build, testes automatizados e smoke E2E passam.

## Fora do escopo

- qualquer aplicação automática de sugestão sem a tecla de aceite padrão do
  Monaco;
- geração de commits, PRs ou textos fora do editor;
- embeddings multi-projeto ou compartilhados entre usuários;
- provedores de IA além do Ollama local.
