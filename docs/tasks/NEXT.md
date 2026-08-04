# Próxima atividade

A task 080 adicionou o assistente de IA local com Ollama ao editor embutido:
painel de chat, ações rápidas, detecção de modelos instalados e um catálogo
fechado de quatro ferramentas somente leitura (`read_project_file`,
`search_project_text`, `list_project_files`, `get_git_diff`), tudo
intermediado pela API — o navegador nunca fala com o Ollama diretamente.
Duas coisas do plano original ficaram para depois: ferramentas de símbolo
via LSP (exigem uma sessão LSP sem navegador, ainda não projetada) e
aplicação de edições propostas pela IA (exige um formato de tool-calling
estruturado e validado, tratado como um incremento à parte, não a task 081).

## Task 081 — Compleção inline e contexto semântico ampliado

Adicionar sugestões de código "ghost text" no editor usando o mesmo Ollama
local, com debounce, cancelamento agressivo e um cache curto.

### Objetivo

Compleção inline (e FIM quando o modelo suportar) sem enviar o projeto
inteiro a cada tecla digitada, mais um contexto semântico opt-in via
embeddings locais.

### Escopo proposto

- endpoint dedicado de completion (`POST /api/projects/:projectId/ai/complete`),
  sem tool-calling, com prefixo/sufixo limitados em bytes;
- detecção de suporte a FIM pelas capacidades já reportadas por
  `/api/show` (task 080);
- `registerInlineCompletionsProvider` no Monaco com debounce e
  `AbortController` cancelando a requisição anterior a cada tecla;
- cache curto em memória por `(caminho, prefixo, sufixo)`;
- embeddings locais opt-in para contexto adicional, desligados por padrão,
  com controle e limpeza na tela de Configurações;
- restauração opcional de abas/estado do editor entre sessões, também
  opt-in.

### Segurança

- API continua intermediando toda chamada ao Ollama;
- nenhuma ferramenta é chamada durante a compleção inline (chamada direta,
  sem tools, para manter latência previsível);
- embeddings ficam no diretório privado de estado, nunca no navegador, e são
  removidos ao excluir o projeto ou trocar de modelo de embedding;
- nenhum arquivo sensível ou ignorado entra no índice.

### Critérios principais

- ghost text não interfere na digitação normal nem no undo/redo do Monaco;
- nenhuma requisição de completion sobrevive a uma tecla digitada depois
  dela;
- ausência de suporte a completion/FIM desativa o recurso com estado claro;
- typecheck, build, testes de API, testes web e smoke E2E passam.

### Fora do escopo

- aplicação automática de sugestão sem a tecla de aceite padrão do Monaco;
- geração de commits, PRs ou textos fora do editor;
- embeddings multi-projeto ou compartilhados entre usuários;
- provedores de IA além do Ollama local.

O plano completo está em `docs/tasks/081-inline-completion.md`, com a
arquitetura de referência em `docs/architecture/embedded-ide-ai-design.md`.
