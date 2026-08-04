# Task 081 — Compleção inline e contexto semântico ampliado

## Status

Implementada e aguardando revisão.

## Objetivo

Adicionar sugestões de código "ghost text" (compleção inline) ao editor
embutido usando o mesmo Ollama local já integrado na task 080, com
debounce, cancelamento e um cache curto — sem enviar o projeto inteiro a
cada tecla digitada.

## Resultado entregue

- sugestão inline (ghost text) via `registerInlineCompletionsProvider`,
  registrada globalmente (`'*'`) e usando um modelo próprio: o primeiro com
  capacidade `fill-in-the-middle`, com fallback para o primeiro modelo
  disponível — independente do modelo escolhido no painel de chat (task 080);
- *fill-in-the-middle* real: prefixo (até 4.000 caracteres antes do cursor) e
  sufixo (até 1.000 caracteres depois) enviados como `prompt`/`suffix` para
  `POST /api/generate` do Ollama, com `stream: false` (resposta única, como
  planejado);
- debounce de 400ms usando o próprio `CancellationToken` que o Monaco já
  cancela a cada tecla — se o token cancelar durante a espera, nenhuma
  requisição é disparada; o `AbortController` da chamada HTTP também está
  ligado ao mesmo token, então uma tecla nova aborta a requisição em voo;
- cache em memória por `(uri do modelo, prefixo, sufixo)` com TTL de 15s e
  limite de 50 entradas;
- nenhuma ferramenta (`AiTool`) é chamada durante a compleção — chamada
  direta a `/api/generate`, sem tool-calling, latência previsível.

Também entregue nesta rodada, a partir de feedback direto sobre a
legibilidade do editor:

- **realce de sintaxe para Haml** (`apps/web/src/monaco-languages.ts`):
  Monaco não distribui uma gramática Haml, então arquivos `.haml` caíam em
  `plaintext` (nenhuma cor). Um tokenizer Monarch compacto foi registrado
  (tags `%div`, atalhos `.classe`/`#id`, linhas `-`/`=` de Ruby,
  comentários `-#`/`/`, interpolação `#{}`, strings, símbolos, palavras-chave)
  e `apps/api/src/services/project-file-service.ts` passou a reconhecer a
  extensão `.haml` (inclusive `.html.haml`, via `path.posix.extname`);
- **cobertura Monokai para tokens Ruby que faltavam**
  (`constructor.identifier` para classes/constantes, `namespace.*.identifier`
  para `@ivar`/`@@cvar`, `global.constant` para `$global`,
  `constant.other.symbol` para `:symbol`) — esses tokens existiam na
  gramática Ruby do Monaco mas não tinham cor definida no tema, então caíam
  no branco padrão em vez de seguir a paleta Monokai.

## Decisões que divergiram do plano original

- **`language` fora do corpo de `/ai/complete`.** O plano original listava
  `{ model, prefix, suffix, language }`, mas nada no serviço interpreta o
  campo `language` (o Ollama não precisa dele para completar texto puro);
  incluir um campo que nada usa violaria a diretriz do projeto de não expor
  superfície sem necessidade real. O contrato ficou com
  `{ model, prefix, suffix? }`.
- **Contexto semântico via embeddings e restauração de abas ficam fora
  desta entrega.** São recursos substanciais e independentes da compleção
  inline em si (um índice persistente, uma tela de configurações nova, uma
  política de exclusão) — nenhum critério de aceite desta task depende
  deles, e agrupá-los aqui só ampliaria o raio de mudança sem necessidade.
  Ficam como candidatos a uma task futura, não bloqueiam a compleção inline.
- **Realce de sintaxe (Haml + tokens Ruby) não estava no plano original**,
  mas foi resolvido nesta entrega porque apareceu como feedback direto de
  uso real do editor e é do mesmo domínio (qualidade visual do Monaco). Não
  tentei replicar anotações de CodeLens de rota ("Jump to view") nem blame
  de Git por linha vistos no VS Code de referência — essas vêm de extensões
  específicas do VS Code (Rails routes, GitLens) com acesso a informação que
  o Monaco standalone não expõe por padrão; ficam fora do escopo deste
  projeto por ora.

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

## Arquitetura entregue

### API

- `AiAssistantService.complete(model, prefix, suffix, signal)`
  (`apps/api/src/services/ai-assistant-service.ts`): valida modelo e limites,
  chama `POST /api/generate` sem tool-calling, trunca a resposta em 2.000
  caracteres;
- `POST /api/projects/:projectId/ai/complete`
  (`apps/api/src/routes/ai-assistant.ts`): schema fecha `prefix`/`suffix` nos
  mesmos limites do serviço; se o cliente cancelar (conexão fechada), a rota
  não tenta serializar resposta para uma conexão morta (`reply.hijack()`);
  erros de validação viram 400 (`AI_ASSISTANT_INVALID_REQUEST`), falhas do
  Ollama viram 502 (`AI_ASSISTANT_FAILED`).

### Cliente Monaco

- `AiInlineCompletionProvider`
  (`apps/web/src/language-server/ai-inline-completion.ts`), instanciado por
  projeto em `ProjectEmbeddedEditor.vue` no mesmo ciclo de vida dos clients
  LSP (criado ao carregar o Monaco/trocar de projeto, descartado ao trocar
  de projeto/desmontar);
- prefixo e sufixo lidos via `model.getValueInRange` a partir da posição do
  cursor, cortados nos limites acima antes de sair do navegador.

## Critérios de aceite

- ghost text aparece e desaparece corretamente sem interferir na digitação
  normal nem no undo/redo do Monaco — **atendido**, via
  `registerInlineCompletionsProvider` padrão do Monaco;
- nenhuma requisição de completion sobrevive a uma tecla digitada depois
  dela — **atendido e testado** (`token.onCancellationRequested` aborta o
  fetch em andamento; teste cobre cancelamento durante o debounce);
- ausência de suporte a completion/FIM no modelo selecionado desativa o
  recurso com um estado claro — o provider cai para o primeiro modelo
  disponível mesmo sem `fill-in-the-middle` (completion simples a partir do
  prefixo, sem sufixo relevante) em vez de desabilitar por completo; só fica
  totalmente inativo quando não há Ollama ou nenhum modelo instalado;
- embeddings permanecem desligados — **não aplicável nesta entrega** (fora
  do escopo, ver decisões acima);
- typecheck, build e testes automatizados passam — **atendido**; smoke E2E
  não foi executado neste ambiente (mesma limitação da task 080: sem Ollama
  instalado para exercitar o caminho ponta a ponta).

## Testes automatizados

- `apps/api/test/ai-assistant-service.test.ts`: capacidade
  `fill-in-the-middle` reportada a partir de `insert` do Ollama, `complete()`
  não chama a API com prefixo/sufixo vazios, recusa modelo vazio e contexto
  acima do limite, envia `suffix` só quando presente, propaga falha do
  Ollama como erro claro;
- `apps/api/test/ai-assistant-routes.test.ts`: `POST /ai/complete` feliz,
  corpo inválido rejeitado pelo schema, projeto inexistente;
- `apps/api/test/project-file-service.test.ts`: `.haml` reconhecido como
  linguagem `haml`;
- `apps/web/test/ai-inline-completion.test.ts`: provider não registra sem
  Ollama disponível, prefere modelo com `fill-in-the-middle`, não chama a
  API quando o token cancela durante o debounce, reaproveita o cache;
- `apps/web/test/monaco-languages.test.ts`: registro idempotente do
  tokenizer Haml.

## Fora do escopo

- qualquer aplicação automática de sugestão sem a tecla de aceite padrão do
  Monaco;
- geração de commits, PRs ou textos fora do editor;
- embeddings multi-projeto ou compartilhados entre usuários, restauração de
  abas/estado entre sessões — adiados (ver decisões acima);
- provedores de IA além do Ollama local;
- anotações de CodeLens (rotas Rails, "Jump to view") e blame de Git por
  linha — recursos de extensões do VS Code, não do Monaco standalone.
