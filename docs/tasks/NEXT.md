# Próxima atividade

A task 079 generalizou o gateway LSP para múltiplas linguagens e adicionou
Ruby/Rails: sessões independentes por `(projeto, kind)`, catálogo fechado de
detecção do `ruby-lsp` sem instalação automática, e a capacidade Rails runtime
com opt-in explícito confirmado — o `bundle exec` que carregaria o add-on
`ruby-lsp-rails` só é liberado depois da confirmação; sem ela, o serviço cai
para um `ruby-lsp` global (fora do bundle do projeto), que nunca inicializa a
aplicação Rails.

## Task 080 — IA local com Ollama

Adicionar assistência de IA ao editor embutido usando Ollama local como
provedor padrão, sem chave de API, sem cobrança por token e sem enviar código
para um serviço remoto.

### Objetivo

Painel de IA no editor com chat contextual, ações rápidas (explicar, corrigir,
gerar testes, refatorar) e streaming cancelável, com a API intermediando toda
chamada ao Ollama local.

### Escopo proposto

- `AiAssistantService` na API, destino fixo em loopback
  (`DEV_DASHBOARD_OLLAMA_URL`), sem aceitar URL remota;
- detecção de modelos instalados via `GET /api/tags` / `POST /api/show`, sem
  baixar nada automaticamente;
- catálogo fechado de ferramentas (`AiTool`) que o modelo pode invocar:
  leitura de arquivo, busca textual, listagem de arquivos, definição/referências
  de símbolo (via LSP das tasks 078/079) e diff Git — tudo limitado ao projeto
  atual, nunca caminho absoluto ou shell;
- conversão do streaming NDJSON do Ollama para um contrato próprio,
  autenticado e cancelável;
- painel lateral **IA** no `ProjectEmbeddedEditor.vue` com ações rápidas por
  seleção/símbolo;
- qualquer edição proposta pela IA reaproveita o preview/confirmação de
  `WorkspaceEdit` já existente (tasks 077–079) — nunca aplicação direta;
- nenhuma persistência de conversa por padrão.

### Segurança

- o navegador nunca chama o Ollama diretamente;
- limites de bytes, arquivos e mensagens por requisição;
- resposta de raciocínio interno do modelo (quando exposta) não é armazenada
  nem exibida;
- cancelamento ao trocar de projeto, fechar o painel ou iniciar outra
  solicitação incompatível;
- nenhum modelo é baixado ou instalado pelo dashboard.

### Critérios principais

- painel de IA funciona apenas com Ollama local detectado; ausência produz
  orientação clara sem instalar nada;
- ferramentas do modelo restritas ao catálogo fechado e à raiz do projeto;
- streaming cancelável sem requisições penduradas;
- qualquer edição proposta exige preview e confirmação explícita;
- typecheck, build, testes de API, testes web e smoke E2E passam.

### Fora do escopo

- download ou gerenciamento de modelos Ollama pelo dashboard;
- provedores de IA remotos/pagos;
- busca semântica com embeddings, avaliada só como fase posterior opt-in;
- completion inline/FIM, planejada para a task 081;
- persistência de histórico de conversa.

O plano completo está em `docs/tasks/080-ollama-local-ai.md`, com a
arquitetura de referência em `docs/architecture/embedded-ide-ai-design.md`.
