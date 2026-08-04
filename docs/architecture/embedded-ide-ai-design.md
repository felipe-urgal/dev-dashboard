# IDE embutida com Monaco, LSP e IA local

## Status

Implementada nas tasks 076–082: fundação Monaco somente leitura (076),
escrita segura com preview/rollback (077), LSP JavaScript/TypeScript (078),
LSP Ruby/Rails (079), assistente de IA local via Ollama com catálogo fechado
de quatro ferramentas somente leitura (080), compleção inline/ghost text
(081) e smoke E2E do assistente com um double do Ollama em CI (082). As
decisões abaixo continuam sendo a referência de arquitetura para essa área;
onde o texto e o código divergirem, o código e os documentos de task
numerados (`docs/tasks/076-*.md` a `082-*.md`) prevalecem.

Uma quinta ferramenta do assistente, `propose_workspace_edit` (aplicação de
edições propostas pela IA através do mesmo preview/confirmação da task 077),
está planejada e ainda não implementada — ver
`docs/tasks/083-ai-proposed-edits-plan.md`.

## Objetivo

Transformar a opção atual de abrir um editor local em uma experiência de IDE
completa dentro do Dev Dashboard, mantendo o botão de editor externo como
alternativa.

A IDE deve oferecer:

- Monaco Editor como superfície principal de edição;
- explorador de arquivos, abas, busca, outline e painel de problemas;
- IntelliSense, diagnósticos, definições, referências, rename, símbolos,
  formatação e code actions por Language Server Protocol (LSP);
- suporte prioritário a JavaScript/TypeScript e Ruby/Rails;
- assistência de IA gratuita por padrão, executada localmente;
- revisão explícita em diff antes de aplicar alterações sugeridas pela IA;
- nenhum terminal livre e nenhuma execução arbitrária de comandos.

## Decisão de produto

A IDE é uma experiência desktop. O Monaco é o editor que alimenta o VS Code e
não oferece suporte oficial a navegadores móveis. Em telas pequenas, o dashboard
pode manter leitura simplificada e a ação **Abrir no editor local**, sem prometer
paridade funcional com desktop.

O editor local e a IDE embutida são complementares:

- **Abrir editor local:** delega o projeto a VS Code, Cursor, VSCodium, Sublime
  ou Zed, conforme a task 064;
- **Editor:** trabalha dentro do dashboard com Monaco, arquivos, LSP e IA;
- **Abrir localmente:** continua disponível no cabeçalho da IDE para fluxos que
  dependam de extensões ou ferramentas externas.

## Princípios

1. **Local por padrão.** Arquivos, servidores de linguagem e IA ficam no
   computador do usuário.
2. **Sem custo obrigatório de API.** A experiência padrão usa um modelo local;
   nenhum provedor pago é necessário.
3. **API como fronteira.** O navegador nunca acessa diretamente o filesystem,
   o processo LSP ou o runtime de IA.
4. **Projeto como limite.** Toda leitura, escrita, busca, URI e alteração deve
   permanecer dentro da raiz canônica do projeto detectado.
5. **Mudança revisável.** Alterações de IA, rename e code actions que afetem
   arquivos passam por preview de diff antes da aplicação.
6. **Capacidades explícitas.** LSP e modelos de IA anunciam o que suportam; a UI
   não presume chat, fill-in-the-middle, tools ou embeddings.
7. **Degradação segura.** Sem LSP ou IA, o Monaco continua funcional para edição
   básica; sem permissão de escrita, permanece somente leitura.

## Arquitetura de alto nível

```text
┌────────────────────── Dev Dashboard Web ──────────────────────┐
│ Explorer │ Monaco │ Outline │ Problems │ AI Assistant │ Diff  │
│                                                                │
│ Monaco models por URI       Monaco Language Client             │
└───────────────┬──────────────────────┬─────────────────────────┘
                │ HTTP/SSE             │ WebSocket JSON-RPC
                ▼                      ▼
┌──────────────────────── Dev Dashboard API ─────────────────────┐
│ ProjectFileService        LanguageServerManager                 │
│ ProjectSearchService      LanguageServerGateway                 │
│ WorkspaceEditService      AiAssistantService                    │
│ ContextBuilder            Diff/preview e auditoria              │
└───────────────┬──────────────────────┬─────────────────────────┘
                │ filesystem           │ processos locais
                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Projeto local │ TypeScript LS │ Ruby LSP │ Ollama local         │
└─────────────────────────────────────────────────────────────────┘
```

## Monaco Editor

O Monaco será usado desde a primeira fatia da IDE; não haverá um editor
intermediário descartável.

Responsabilidades no frontend:

- manter um `ITextModel` por arquivo aberto, identificado por URI estável;
- preservar abas, seleção, scroll, undo/redo e dirty state;
- configurar workers do Monaco com Vite;
- aplicar tema e densidade do dashboard;
- expor keybindings conhecidos (`Ctrl+P`, `Ctrl+S`, `F12`, `Shift+F12`);
- integrar completion, hover, diagnostics, symbols e workspace edits vindos do
  LSP;
- mostrar diff do Monaco para conflitos externos e alterações propostas;
- descartar modelos e conexões ao trocar de projeto.

URI lógica proposta:

```text
file:///dev-dashboard/projects/<projectId>/app/models/user.rb
```

O caminho absoluto real nunca precisa ser enviado ao navegador.

Referência oficial:

- <https://microsoft.github.io/monaco-editor/>

## Acesso a arquivos

### Contratos iniciais

```http
GET  /api/projects/:projectId/files?path=<relativePath>
GET  /api/projects/:projectId/files/content?path=<relativePath>
GET  /api/projects/:projectId/files/search?query=<term>
PUT  /api/projects/:projectId/files/content
POST /api/projects/:projectId/files
POST /api/projects/:projectId/directories
POST /api/projects/:projectId/files/rename
POST /api/projects/:projectId/files/delete-confirmations
DELETE /api/projects/:projectId/files
```

A primeira entrega implementa somente listagem, leitura e busca limitada. Escrita
e operações estruturais entram depois do modelo de ameaça e dos testes de
confinamento.

### Versão e concorrência

A leitura devolve uma versão derivada do conteúdo e dos metadados relevantes:

```ts
interface ProjectFileContent {
  path: string;
  content: string;
  language: string;
  size: number;
  modifiedAt: string;
  version: string;
  writable: boolean;
}
```

O salvamento exige `expectedVersion`. Se o arquivo mudou desde a leitura, a API
responde `409 FILE_CHANGED_EXTERNALLY` e a interface abre um diff entre:

- versão aberta no Monaco;
- conteúdo atual no disco;
- conteúdo editado pelo usuário.

A gravação é atômica: arquivo temporário no mesmo diretório, `fsync` quando
aplicável, preservação de modo permitido e `rename` final.

### Confinamento

Cada operação deve:

1. recuperar a raiz canônica pelo `ProjectStore`;
2. aceitar somente caminho relativo normalizado;
3. resolver o destino e seu ancestral existente mais próximo com `realpath`;
4. recusar `..`, caminho absoluto, NUL e segmentos vazios ambíguos;
5. recusar symlink que saia da raiz;
6. aplicar limite de profundidade, quantidade e tamanho;
7. ignorar binários e diretórios pesados reconhecidos;
8. nunca aceitar um caminho de workspace ou raiz vindo do navegador.

Exclusões padrão da árvore e da busca:

```text
.git
node_modules
vendor/bundle
coverage
dist
build
tmp/log
```

Arquivos sensíveis não aparecem automaticamente:

```text
.env*
*.pem
*.key
config/master.key
id_rsa
id_ed25519
```

Uma política futura pode permitir abertura explícita de certos arquivos
sensíveis, mas não deve colocá-los em contexto de IA automaticamente.

## Language Server Protocol

O frontend usa `monaco-languageclient`. A API inicia servidores externos e faz
a ponte por WebSocket autenticado/JSON-RPC.

Referência:

- <https://github.com/TypeFox/monaco-languageclient>

### Servidores prioritários

#### JavaScript e TypeScript

- servidor: `typescript-language-server --stdio`;
- `cwd`: raiz canônica do projeto;
- TypeScript resolvido preferencialmente pelo projeto;
- recursos: completion, diagnostics, definition, references, rename, symbols,
  code actions, inlay hints e organização de imports.

#### Ruby e Rails

- servidor: Ruby LSP, preferencialmente no contexto Bundler reconhecido;
- `cwd`: raiz canônica do projeto;
- detectar versão Ruby e ambiente do projeto antes de iniciar;
- reconhecer o add-on Rails quando estiver instalado;
- recursos: completion, diagnostics, definition, references, rename, symbols,
  semantic highlighting, formatting e code actions.

### Gerenciamento de processo

O `LanguageServerManager` mantém no máximo uma instância por projeto e tipo:

```ts
type LanguageServerStatus =
  | 'starting'
  | 'indexing'
  | 'ready'
  | 'failed'
  | 'stopped';
```

Política inicial:

- inicialização sob demanda quando um arquivo compatível é aberto;
- catálogo fechado de executáveis e argumentos;
- `shell: false`;
- limite global de servidores concorrentes;
- timeout de inicialização;
- encerramento após período ocioso;
- stop gradual e verificação de identidade do processo;
- logs limitados e mascarados;
- ação explícita para reiniciar;
- nenhuma instalação automática de gem ou pacote.

### Gateway LSP

O gateway não encaminha cegamente toda solicitação do servidor.

Operações como `workspace/applyEdit`, criação, rename, exclusão e comandos devem
ser autorizadas individualmente. Toda URI é convertida para um caminho relativo
e validada pelo mesmo serviço de arquivos.

Regras:

- bloquear `workspace/executeCommand` por padrão;
- manter allowlist por servidor para comandos realmente necessários;
- exigir preview para `WorkspaceEdit` em múltiplos arquivos;
- limitar quantidade de arquivos e bytes por alteração;
- recusar URI fora do projeto ou esquema desconhecido;
- não abrir links externos automaticamente;
- cancelar requests ao fechar o projeto ou trocar de rota.

## IA gratuita e local

### Provedor padrão

A v1 usa **Ollama local** como provedor padrão. Isso significa:

- nenhuma chave de API obrigatória;
- nenhuma cobrança por token pelo dashboard;
- prompts e respostas processados na máquina do usuário;
- custo computacional, memória e energia assumidos localmente;
- licença e condições de cada modelo continuam sendo responsabilidade do modelo
  escolhido.

A API local padrão do Ollama fica em:

```text
http://127.0.0.1:11434/api
```

O dashboard nunca pressupõe um modelo específico. Ele consulta modelos já
instalados com `GET /api/tags` e detalhes/capacidades com `POST /api/show`.
Nenhum download é iniciado sem ação explícita fora da v1.

Referências oficiais:

- <https://docs.ollama.com/api/introduction>
- <https://docs.ollama.com/api/chat>
- <https://docs.ollama.com/api/generate>
- <https://docs.ollama.com/api/tags>
- <https://docs.ollama.com/api/show>

### Por que a API intermedeia

Mesmo que a API local do Ollama não exija autenticação por padrão, o navegador
não deve chamá-la diretamente. O `AiAssistantService`:

- fixa o destino em loopback e impede SSRF;
- normaliza timeout, cancelamento e streaming;
- controla quais arquivos entram no contexto;
- aplica limites de bytes, arquivos e mensagens;
- evita que conteúdo sensível seja incluído automaticamente;
- não expõe detalhes internos do runtime ao frontend;
- mantém o mesmo modelo de autenticação e origem do dashboard.

Configuração inicial:

```text
DEV_DASHBOARD_OLLAMA_URL=http://127.0.0.1:11434
```

O valor deve aceitar somente HTTP em endereço de loopback. URLs remotas e
provedores cloud ficam fora da v1.

### Capacidades da IA

```ts
type AiCapability =
  | 'chat'
  | 'edit'
  | 'inline-completion'
  | 'fill-in-the-middle'
  | 'embeddings'
  | 'tools';
```

A interface habilita ações somente quando o adaptador e o modelo anunciarem a
capacidade necessária.

### Experiência inicial

Painel lateral **IA**:

- conversar sobre o arquivo atual ou seleção;
- explicar código e diagnóstico;
- sugerir correção;
- gerar testes para o arquivo/símbolo atual;
- propor documentação;
- criar um plano de alteração em múltiplos arquivos;
- aplicar somente após abrir e aprovar o diff.

Ações no editor:

- **Explicar seleção**;
- **Corrigir problema**;
- **Gerar testes**;
- **Refatorar**;
- **Perguntar sobre este símbolo**;
- **Completar linha/bloco**, quando o modelo suportar completion/FIM.

### Contexto

O contexto padrão é pequeno e explícito:

1. instrução do usuário;
2. seleção atual ou trecho próximo ao cursor;
3. linguagem e caminho relativo;
4. diagnósticos LSP associados;
5. assinatura/símbolos relevantes;
6. diff Git do arquivo quando útil.

Arquivos adicionais são encontrados por ferramentas fechadas controladas pelo
backend, por exemplo:

```ts
type AiTool =
  | 'read_project_file'
  | 'search_project_text'
  | 'list_project_files'
  | 'get_symbol_definition'
  | 'get_symbol_references'
  | 'get_git_diff';
```

O modelo nunca escolhe um caminho absoluto ou executa shell. Cada chamada é
validada, limitada e vinculada ao projeto atual.

### Busca semântica

Embeddings não fazem parte da primeira versão da IA. A prioridade é contexto
obtido por seleção, busca textual e símbolos do LSP, que são mais previsíveis e
não exigem índice persistente.

Uma fase posterior pode usar `/api/embed` para RAG local, desde que:

- seja opt-in;
- use modelo de embedding separado e selecionado pelo usuário;
- armazene índice somente no diretório privado de estado;
- registre digest do arquivo e modelo usado;
- remova entradas ao excluir projeto ou trocar modelo;
- nunca indexe arquivos sensíveis ou ignorados;
- limite tamanho total e permita limpeza manual.

### Streaming e cancelamento

O Ollama transmite NDJSON por padrão. A API converte esse stream em contrato
próprio, autenticado e cancelável. Para chat e edições longas, a interface exibe
texto progressivamente. Ao trocar de projeto, fechar o painel ou iniciar outra
solicitação incompatível, o request anterior é abortado.

O conteúdo interno de raciocínio de modelos que o forneçam não é armazenado nem
exibido como requisito do produto. O dashboard usa somente resposta final,
chamadas de ferramentas validadas e métricas operacionais seguras.

### Aplicação de mudanças

A IA nunca grava um arquivo diretamente.

Fluxo obrigatório:

```text
Usuário pede alteração
        ↓
IA retorna proposta estruturada
        ↓
API valida paths, versões e limites
        ↓
Monaco Diff mostra cada arquivo
        ↓
Usuário aceita ou rejeita por arquivo
        ↓
API reaplica validação e expectedVersion
        ↓
Gravação atômica
```

A proposta deve ser representada como alterações estruturadas, não como comando
shell. Para múltiplos arquivos, a v1 pode usar conteúdo completo por arquivo sob
limite fechado; patches/hunks entram somente após parser e testes robustos.

## Privacidade e persistência

Padrão inicial:

- conversas não são persistidas pela API;
- reload ou fechamento da aba encerra a sessão da conversa;
- prompts e respostas não entram em logs de aplicação;
- somente métricas não sensíveis podem ser registradas: duração, modelo,
  resultado, cancelamento e contagem aproximada de contexto;
- histórico de chat, quando implementado, será opt-in, privado (`0600`),
  limitado e removível;
- nenhuma telemetria externa será adicionada.

## Limites iniciais propostos

Os valores finais serão definidos com testes, mas a implementação deve nascer
com limites explícitos:

- arquivo editável: até 512 KiB;
- arquivo somente leitura: até 1 MiB;
- árvore: até 5.000 entradas por resposta paginada;
- busca: até 200 resultados e timeout curto;
- contexto de IA: até 20 arquivos e teto agregado em bytes/tokens;
- workspace edit: até 50 arquivos e tamanho agregado fechado;
- uma geração ativa por projeto;
- quantidade global limitada de LSPs e gerações simultâneas.

## Estados e falhas

A UI diferencia:

- Monaco carregando;
- arquivo indisponível ou grande demais;
- arquivo modificado externamente;
- LSP ausente, iniciando, indexando, pronto ou falho;
- Ollama ausente;
- nenhum modelo local instalado;
- modelo sem capacidade necessária;
- geração aguardando, transmitindo, cancelada ou falha;
- proposta inválida ou conflito antes da gravação.

A ausência de IA ou LSP nunca deve bloquear leitura e edição básica autorizada.

## Sequência de implementação

### Task 076 — Fundação da IDE e leitura segura

- Monaco, workers e nova aba Editor;
- explorer, abas, modelos e busca limitada;
- endpoints somente leitura;
- URI lógica por projeto;
- testes de traversal, symlink, binário, tamanho e troca de projeto;
- botão para abrir no editor local preservado.

### Task 077 — Escrita, conflitos e operações de arquivo

- dirty state e `Ctrl+S`;
- `expectedVersion` e diff de conflito;
- escrita atômica;
- criar, renomear e excluir com política proporcional;
- preview para mudanças em múltiplos arquivos.

### Task 078 — LSP JavaScript/TypeScript

- `LanguageServerManager` e gateway WebSocket;
- TypeScript Language Server;
- diagnostics, completion, definition, references, rename e code actions;
- painel de problemas e outline.

### Task 079 — Ruby/Rails LSP

- resolução segura do runtime Ruby/Bundler;
- Ruby LSP e suporte Rails detectado;
- símbolos, diagnósticos, referências, rename, formatação e actions;
- estado de indexação e reinício explícito.

### Task 080 — IA local com Ollama

- detecção do Ollama e listagem de modelos instalados;
- painel de chat contextual e streaming cancelável;
- explicar, corrigir, refatorar e gerar testes;
- ferramentas fechadas de leitura, busca, LSP e Git;
- diff obrigatório antes de aplicar alterações;
- nenhuma persistência de conversa por padrão.

### Task 081 — Compleção inline e contexto ampliado

- ghost text no Monaco para modelos compatíveis;
- FIM quando anunciado pelo modelo;
- debounce, cancelamento e cache curto;
- contexto semântico opt-in com embeddings locais;
- restauração opcional de abas e histórico privado opt-in.

## Critérios de aceite da arquitetura

Antes de iniciar a task 076:

- modelo de ameaça revisado;
- limites iniciais definidos em contratos e schemas;
- política de symlinks decidida e testável;
- estratégia de workers do Monaco validada com Vite;
- compatibilidade de versões entre Monaco e `monaco-languageclient` fixada;
- comandos permitidos por LSP documentados;
- UX de preview de alterações aprovada;
- Ollama tratado como dependência opcional detectada, nunca instalada
  automaticamente.

## Fora do escopo inicial

- terminal embutido ou shell livre;
- execução de comandos sugeridos pelo modelo;
- extensões arbitrárias do VS Code;
- marketplace de plugins;
- acesso remoto ao dashboard;
- provedores cloud e chaves de API;
- agentes autônomos que alteram o projeto sem revisão;
- colaboração em tempo real;
- paridade mobile com a IDE desktop;
- indexação automática de todo arquivo do projeto.
