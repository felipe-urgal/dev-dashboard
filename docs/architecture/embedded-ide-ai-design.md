# IDE embutida com Monaco, LSP e IA local

## Status

> **Removida.** A IDE embutida (Monaco, explorador de arquivos, LSP
> JavaScript/TypeScript e Ruby/Rails, aba **Editor**) foi retirada do
> dashboard no PR #262 ("remove embedded editor"). O cÃ³digo descrito abaixo
> (`ProjectEmbeddedEditor.vue`, `apps/web/src/language-server/`,
> `apps/api/src/routes/project-editor.ts`, a rota `/projects/:projectId/editor`
> e o contrato `packages/contracts/src/editor.ts`) nÃ£o existe mais no
> repositÃ³rio. O assistente de IA local via Ollama descrito aqui (chat,
> compleÃ§Ã£o inline, catÃ¡logo de ferramentas, `propose_workspace_edit`) tambÃ©m
> foi removido â junto com a aba prÃ³pria **Assistente IA** e toda a
> infraestrutura de seleÃ§Ã£o de provider/consentimento cloud â na remoÃ§Ã£o do
> Assistente IA (ver `tasks/238-remover-assistente-ia.md`). A Ãºnica
> capacidade de IA que resta no produto Ã© a Code review dentro da aba **Git**,
> que usa um `AiAssistantService` simplificado, fixo no Ollama local, sem
> seleÃ§Ã£o de provider, sem consentimento cloud e sem o catÃ¡logo de ferramentas
> descrito abaixo (`AiOrchestrator`, tools de leitura/busca/diff/workspace
> edit nÃ£o existem mais). `ProjectWorkspaceEditService` e
> `ProjectLanguageServerService` continuam existindo, mas hoje servem outras
> rotas (`project-workspace-edits.ts`, `project-language-server.ts`), nÃ£o a
> IA. Este documento fica mantido como registro histÃ³rico da decisÃ£o de
> arquitetura; nÃ£o descreve o estado atual do produto.

Implementada nas tasks 076â083: fundaÃ§Ã£o Monaco somente leitura (076),
escrita segura com preview/rollback (077), LSP JavaScript/TypeScript (078),
LSP Ruby/Rails (079), assistente de IA local via Ollama com catÃ¡logo fechado
de quatro ferramentas somente leitura (080), compleÃ§Ã£o inline/ghost text
(081), smoke E2E do assistente com um double do Ollama em CI (082) e uma
quinta ferramenta, `propose_workspace_edit`, aplicando ediÃ§Ãµes propostas
pela IA atravÃ©s do mesmo preview/confirmaÃ§Ã£o/rollback da task 077, sem rota
nova para aplicar (083). As decisÃµes abaixo eram a referÃªncia de arquitetura
para essa Ã¡rea enquanto a IDE embutida existiu; hoje tÃªm valor apenas
histÃ³rico (ver nota acima).

## Objetivo

Transformar a opÃ§Ã£o atual de abrir um editor local em uma experiÃªncia de IDE
completa dentro do Dev Dashboard, mantendo o botÃ£o de editor externo como
alternativa.

A IDE deve oferecer:

- Monaco Editor como superfÃ­cie principal de ediÃ§Ã£o;
- explorador de arquivos, abas, busca, outline e painel de problemas;
- IntelliSense, diagnÃ³sticos, definiÃ§Ãµes, referÃªncias, rename, sÃ­mbolos,
  formataÃ§Ã£o e code actions por Language Server Protocol (LSP);
- suporte prioritÃ¡rio a JavaScript/TypeScript e Ruby/Rails;
- assistÃªncia de IA gratuita por padrÃ£o, executada localmente;
- revisÃ£o explÃ­cita em diff antes de aplicar alteraÃ§Ãµes sugeridas pela IA;
- nenhum terminal livre e nenhuma execuÃ§Ã£o arbitrÃ¡ria de comandos.

## DecisÃ£o de produto

A IDE Ã© uma experiÃªncia desktop. O Monaco Ã© o editor que alimenta o VS Code e
nÃ£o oferece suporte oficial a navegadores mÃ³veis. Em telas pequenas, o dashboard
pode manter leitura simplificada e a aÃ§Ã£o **Abrir no editor local**, sem prometer
paridade funcional com desktop.

O editor local e a IDE embutida sÃ£o complementares:

- **Abrir editor local:** delega o projeto a VS Code, Cursor, VSCodium, Sublime
  ou Zed, conforme a task 064;
- **Editor:** trabalha dentro do dashboard com Monaco, arquivos, LSP e IA;
- **Abrir localmente:** continua disponÃ­vel no cabeÃ§alho da IDE para fluxos que
  dependam de extensÃµes ou ferramentas externas.

## PrincÃ­pios

1. **Local por padrÃ£o.** Arquivos, servidores de linguagem e IA ficam no
   computador do usuÃ¡rio.
2. **Sem custo obrigatÃ³rio de API.** A experiÃªncia padrÃ£o usa um modelo local;
   nenhum provedor pago Ã© necessÃ¡rio.
3. **API como fronteira.** O navegador nunca acessa diretamente o filesystem,
   o processo LSP ou o runtime de IA.
4. **Projeto como limite.** Toda leitura, escrita, busca, URI e alteraÃ§Ã£o deve
   permanecer dentro da raiz canÃ´nica do projeto detectado.
5. **MudanÃ§a revisÃ¡vel.** AlteraÃ§Ãµes de IA, rename e code actions que afetem
   arquivos passam por preview de diff antes da aplicaÃ§Ã£o.
6. **Capacidades explÃ­citas.** LSP e modelos de IA anunciam o que suportam; a UI
   nÃ£o presume chat, fill-in-the-middle, tools ou embeddings.
7. **DegradaÃ§Ã£o segura.** Sem LSP ou IA, o Monaco continua funcional para ediÃ§Ã£o
   bÃ¡sica; sem permissÃ£o de escrita, permanece somente leitura.

## Arquitetura de alto nÃ­vel

```text
âââââââââââââââââââââââ Dev Dashboard Web âââââââââââââââââââââââ
â Explorer â Monaco â Outline â Problems â AI Assistant â Diff  â
â                                                                â
â Monaco models por URI       Monaco Language Client             â
âââââââââââââââââ¬âââââââââââââââââââââââ¬ââââââââââââââââââââââââââ
                â HTTP/SSE             â WebSocket JSON-RPC
                â¼                      â¼
âââââââââââââââââââââââââ Dev Dashboard API ââââââââââââââââââââââ
â ProjectFileService        LanguageServerManager                 â
â ProjectSearchService      LanguageServerGateway                 â
â WorkspaceEditService      AiAssistantService                    â
â ContextBuilder            Diff/preview e auditoria              â
âââââââââââââââââ¬âââââââââââââââââââââââ¬ââââââââââââââââââââââââââ
                â filesystem           â processos locais
                â¼                      â¼
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â Projeto local â TypeScript LS â Ruby LSP â Ollama local         â
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
```

## Monaco Editor

O Monaco serÃ¡ usado desde a primeira fatia da IDE; nÃ£o haverÃ¡ um editor
intermediÃ¡rio descartÃ¡vel.

Responsabilidades no frontend:

- manter um `ITextModel` por arquivo aberto, identificado por URI estÃ¡vel;
- preservar abas, seleÃ§Ã£o, scroll, undo/redo e dirty state;
- configurar workers do Monaco com Vite;
- aplicar tema e densidade do dashboard;
- expor keybindings conhecidos (`Ctrl+P`, `Ctrl+S`, `F12`, `Shift+F12`);
- integrar completion, hover, diagnostics, symbols e workspace edits vindos do
  LSP;
- mostrar diff do Monaco para conflitos externos e alteraÃ§Ãµes propostas;
- descartar modelos e conexÃµes ao trocar de projeto.

URI lÃ³gica proposta:

```text
file:///dev-dashboard/projects/<projectId>/app/models/user.rb
```

O caminho absoluto real nunca precisa ser enviado ao navegador.

ReferÃªncia oficial:

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
e operaÃ§Ãµes estruturais entram depois do modelo de ameaÃ§a e dos testes de
confinamento.

### VersÃ£o e concorrÃªncia

A leitura devolve uma versÃ£o derivada do conteÃºdo e dos metadados relevantes:

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

- versÃ£o aberta no Monaco;
- conteÃºdo atual no disco;
- conteÃºdo editado pelo usuÃ¡rio.

A gravaÃ§Ã£o Ã© atÃ´mica: arquivo temporÃ¡rio no mesmo diretÃ³rio, `fsync` quando
aplicÃ¡vel, preservaÃ§Ã£o de modo permitido e `rename` final.

### Confinamento

Cada operaÃ§Ã£o deve:

1. recuperar a raiz canÃ´nica pelo `ProjectStore`;
2. aceitar somente caminho relativo normalizado;
3. resolver o destino e seu ancestral existente mais prÃ³ximo com `realpath`;
4. recusar `..`, caminho absoluto, NUL e segmentos vazios ambÃ­guos;
5. recusar symlink que saia da raiz;
6. aplicar limite de profundidade, quantidade e tamanho;
7. ignorar binÃ¡rios e diretÃ³rios pesados reconhecidos;
8. nunca aceitar um caminho de workspace ou raiz vindo do navegador.

ExclusÃµes padrÃ£o da Ã¡rvore e da busca:

```text
.git
node_modules
vendor/bundle
coverage
dist
build
tmp/log
```

Arquivos sensÃ­veis nÃ£o aparecem automaticamente:

```text
.env*
*.pem
*.key
config/master.key
id_rsa
id_ed25519
```

Uma polÃ­tica futura pode permitir abertura explÃ­cita de certos arquivos
sensÃ­veis, mas nÃ£o deve colocÃ¡-los em contexto de IA automaticamente.

## Language Server Protocol

O frontend usa `monaco-languageclient`. A API inicia servidores externos e faz
a ponte por WebSocket autenticado/JSON-RPC.

ReferÃªncia:

- <https://github.com/TypeFox/monaco-languageclient>

### Servidores prioritÃ¡rios

#### JavaScript e TypeScript

- servidor: `typescript-language-server --stdio`;
- `cwd`: raiz canÃ´nica do projeto;
- TypeScript resolvido preferencialmente pelo projeto;
- recursos: completion, diagnostics, definition, references, rename, symbols,
  code actions, inlay hints e organizaÃ§Ã£o de imports.

#### Ruby e Rails

- servidor: Ruby LSP, preferencialmente no contexto Bundler reconhecido;
- `cwd`: raiz canÃ´nica do projeto;
- detectar versÃ£o Ruby e ambiente do projeto antes de iniciar;
- reconhecer o add-on Rails quando estiver instalado;
- recursos: completion, diagnostics, definition, references, rename, symbols,
  semantic highlighting, formatting e code actions.

### Gerenciamento de processo

O `LanguageServerManager` mantÃ©m no mÃ¡ximo uma instÃ¢ncia por projeto e tipo:

```ts
type LanguageServerStatus =
  | 'starting'
  | 'indexing'
  | 'ready'
  | 'failed'
  | 'stopped';
```

PolÃ­tica inicial:

- inicializaÃ§Ã£o sob demanda quando um arquivo compatÃ­vel Ã© aberto;
- catÃ¡logo fechado de executÃ¡veis e argumentos;
- `shell: false`;
- limite global de servidores concorrentes;
- timeout de inicializaÃ§Ã£o;
- encerramento apÃ³s perÃ­odo ocioso;
- stop gradual e verificaÃ§Ã£o de identidade do processo;
- logs limitados e mascarados;
- aÃ§Ã£o explÃ­cita para reiniciar;
- nenhuma instalaÃ§Ã£o automÃ¡tica de gem ou pacote.

### Gateway LSP

O gateway nÃ£o encaminha cegamente toda solicitaÃ§Ã£o do servidor.

OperaÃ§Ãµes como `workspace/applyEdit`, criaÃ§Ã£o, rename, exclusÃ£o e comandos devem
ser autorizadas individualmente. Toda URI Ã© convertida para um caminho relativo
e validada pelo mesmo serviÃ§o de arquivos.

Regras:

- bloquear `workspace/executeCommand` por padrÃ£o;
- manter allowlist por servidor para comandos realmente necessÃ¡rios;
- exigir preview para `WorkspaceEdit` em mÃºltiplos arquivos;
- limitar quantidade de arquivos e bytes por alteraÃ§Ã£o;
- recusar URI fora do projeto ou esquema desconhecido;
- nÃ£o abrir links externos automaticamente;
- cancelar requests ao fechar o projeto ou trocar de rota.

## IA gratuita e local

### Provedor padrÃ£o

A v1 usa **Ollama local** como provedor padrÃ£o. Isso significa:

- nenhuma chave de API obrigatÃ³ria;
- nenhuma cobranÃ§a por token pelo dashboard;
- prompts e respostas processados na mÃ¡quina do usuÃ¡rio;
- custo computacional, memÃ³ria e energia assumidos localmente;
- licenÃ§a e condiÃ§Ãµes de cada modelo continuam sendo responsabilidade do modelo
  escolhido.

A API local padrÃ£o do Ollama fica em:

```text
http://127.0.0.1:11434/api
```

O dashboard nunca pressupÃµe um modelo especÃ­fico. Ele consulta modelos jÃ¡
instalados com `GET /api/tags` e detalhes/capacidades com `POST /api/show`.
Nenhum download Ã© iniciado sem aÃ§Ã£o explÃ­cita fora da v1.

ReferÃªncias oficiais:

- <https://docs.ollama.com/api/introduction>
- <https://docs.ollama.com/api/chat>
- <https://docs.ollama.com/api/generate>
- <https://docs.ollama.com/api/tags>
- <https://docs.ollama.com/api/show>

### Por que a API intermedeia

Mesmo que a API local do Ollama nÃ£o exija autenticaÃ§Ã£o por padrÃ£o, o navegador
nÃ£o deve chamÃ¡-la diretamente. O `AiAssistantService`:

- fixa o destino em loopback e impede SSRF;
- normaliza timeout, cancelamento e streaming;
- controla quais arquivos entram no contexto;
- aplica limites de bytes, arquivos e mensagens;
- evita que conteÃºdo sensÃ­vel seja incluÃ­do automaticamente;
- nÃ£o expÃµe detalhes internos do runtime ao frontend;
- mantÃ©m o mesmo modelo de autenticaÃ§Ã£o e origem do dashboard.

ConfiguraÃ§Ã£o inicial:

```text
DEV_DASHBOARD_OLLAMA_URL=http://127.0.0.1:11434
```

O valor deve aceitar somente HTTP em endereÃ§o de loopback. URLs remotas e
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

A interface habilita aÃ§Ãµes somente quando o adaptador e o modelo anunciarem a
capacidade necessÃ¡ria.

### ExperiÃªncia inicial

Painel lateral **IA**:

- conversar sobre o arquivo atual ou seleÃ§Ã£o;
- explicar cÃ³digo e diagnÃ³stico;
- sugerir correÃ§Ã£o;
- gerar testes para o arquivo/sÃ­mbolo atual;
- propor documentaÃ§Ã£o;
- criar um plano de alteraÃ§Ã£o em mÃºltiplos arquivos;
- aplicar somente apÃ³s abrir e aprovar o diff.

AÃ§Ãµes no editor:

- **Explicar seleÃ§Ã£o**;
- **Corrigir problema**;
- **Gerar testes**;
- **Refatorar**;
- **Perguntar sobre este sÃ­mbolo**;
- **Completar linha/bloco**, quando o modelo suportar completion/FIM.

### Contexto

O contexto padrÃ£o Ã© pequeno e explÃ­cito:

1. instruÃ§Ã£o do usuÃ¡rio;
2. seleÃ§Ã£o atual ou trecho prÃ³ximo ao cursor;
3. linguagem e caminho relativo;
4. diagnÃ³sticos LSP associados;
5. assinatura/sÃ­mbolos relevantes;
6. diff Git do arquivo quando Ãºtil.

Arquivos adicionais sÃ£o encontrados por ferramentas fechadas controladas pelo
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

O modelo nunca escolhe um caminho absoluto ou executa shell. Cada chamada Ã©
validada, limitada e vinculada ao projeto atual.

### Busca semÃ¢ntica

Embeddings nÃ£o fazem parte da primeira versÃ£o da IA. A prioridade Ã© contexto
obtido por seleÃ§Ã£o, busca textual e sÃ­mbolos do LSP, que sÃ£o mais previsÃ­veis e
nÃ£o exigem Ã­ndice persistente.

Uma fase posterior pode usar `/api/embed` para RAG local, desde que:

- seja opt-in;
- use modelo de embedding separado e selecionado pelo usuÃ¡rio;
- armazene Ã­ndice somente no diretÃ³rio privado de estado;
- registre digest do arquivo e modelo usado;
- remova entradas ao excluir projeto ou trocar modelo;
- nunca indexe arquivos sensÃ­veis ou ignorados;
- limite tamanho total e permita limpeza manual.

### Streaming e cancelamento

O Ollama transmite NDJSON por padrÃ£o. A API converte esse stream em contrato
prÃ³prio, autenticado e cancelÃ¡vel. Para chat e ediÃ§Ãµes longas, a interface exibe
texto progressivamente. Ao trocar de projeto, fechar o painel ou iniciar outra
solicitaÃ§Ã£o incompatÃ­vel, o request anterior Ã© abortado.

O conteÃºdo interno de raciocÃ­nio de modelos que o forneÃ§am nÃ£o Ã© armazenado nem
exibido como requisito do produto. O dashboard usa somente resposta final,
chamadas de ferramentas validadas e mÃ©tricas operacionais seguras.

### Assistente de implementaÃ§Ã£o em segundo plano

A aba principal **Assistente IA** recebe uma solicitaÃ§Ã£o de implementaÃ§Ã£o e
cria uma execuÃ§Ã£o de propriedade da API. Diferente do chat SSE do editor, essa
execuÃ§Ã£o nÃ£o pertence Ã  conexÃ£o HTTP que a iniciou: trocar de aba, navegar por
outras ferramentas do projeto ou voltar ao painel nÃ£o a cancela. A interface
consulta o snapshot estruturado enquanto o estado for `running` e apresenta um
atalho flutuante para retornar ao trabalho ativo.

O estado Ã© deliberadamente **efÃªmero**: fica somente na memÃ³ria da API e Ã©
cancelado no encerramento dela. NÃ£o hÃ¡ histÃ³rico persistido, telemetria nem
registro do prompt ou da resposta em logs. HÃ¡ uma execuÃ§Ã£o ativa por projeto;
iniciar outra cancela a anterior. O cancelamento manual tambÃ©m continua
disponÃ­vel no painel.

As ferramentas que o modelo pode usar permanecem no catÃ¡logo fechado do
`AiAssistantService`. Mesmo quando ele prepara um `WorkspaceEdit`, a execuÃ§Ã£o
sÃ³ devolve a prÃ©via e o token de confirmaÃ§Ã£o ao usuÃ¡rio autenticado; a escrita
segue sendo uma aÃ§Ã£o separada, explÃ­cita e validada pelas versÃµes atuais dos
arquivos.

### AplicaÃ§Ã£o de mudanÃ§as

A IA nunca grava um arquivo diretamente.

Fluxo obrigatÃ³rio:

```text
UsuÃ¡rio pede alteraÃ§Ã£o
        â
IA retorna proposta estruturada
        â
API valida paths, versÃµes e limites
        â
Monaco Diff mostra cada arquivo
        â
UsuÃ¡rio aceita ou rejeita por arquivo
        â
API reaplica validaÃ§Ã£o e expectedVersion
        â
GravaÃ§Ã£o atÃ´mica
```

A proposta deve ser representada como alteraÃ§Ãµes estruturadas, nÃ£o como comando
shell. Para mÃºltiplos arquivos, a v1 pode usar conteÃºdo completo por arquivo sob
limite fechado; patches/hunks entram somente apÃ³s parser e testes robustos.

## Privacidade e persistÃªncia

PadrÃ£o inicial:

- conversas e execuÃ§Ãµes concluÃ­das nÃ£o sÃ£o persistidas pela API;
- a execuÃ§Ã£o iniciada no Assistente IA continua durante a navegaÃ§Ã£o, mas Ã©
  descartada ao reiniciar a API;
- prompts e respostas nÃ£o entram em logs de aplicaÃ§Ã£o;
- somente mÃ©tricas nÃ£o sensÃ­veis podem ser registradas: duraÃ§Ã£o, modelo,
  resultado, cancelamento e contagem aproximada de contexto;
- histÃ³rico de chat, quando implementado, serÃ¡ opt-in, privado (`0600`),
  limitado e removÃ­vel;
- nenhuma telemetria externa serÃ¡ adicionada.

## Limites iniciais propostos

Os valores finais serÃ£o definidos com testes, mas a implementaÃ§Ã£o deve nascer
com limites explÃ­citos:

- arquivo editÃ¡vel: atÃ© 512 KiB;
- arquivo somente leitura: atÃ© 1 MiB;
- Ã¡rvore: atÃ© 5.000 entradas por resposta paginada;
- busca: atÃ© 200 resultados e timeout curto;
- contexto de IA: atÃ© 20 arquivos e teto agregado em bytes/tokens;
- workspace edit: atÃ© 50 arquivos e tamanho agregado fechado;
- uma geraÃ§Ã£o ativa por projeto;
- quantidade global limitada de LSPs e geraÃ§Ãµes simultÃ¢neas.

## Estados e falhas

A UI diferencia:

- Monaco carregando;
- arquivo indisponÃ­vel ou grande demais;
- arquivo modificado externamente;
- LSP ausente, iniciando, indexando, pronto ou falho;
- Ollama ausente;
- nenhum modelo local instalado;
- modelo sem capacidade necessÃ¡ria;
- geraÃ§Ã£o aguardando, transmitindo, cancelada ou falha;
- proposta invÃ¡lida ou conflito antes da gravaÃ§Ã£o.

A ausÃªncia de IA ou LSP nunca deve bloquear leitura e ediÃ§Ã£o bÃ¡sica autorizada.

## SequÃªncia de implementaÃ§Ã£o

### Task 076 â FundaÃ§Ã£o da IDE e leitura segura

- Monaco, workers e nova aba Editor;
- explorer, abas, modelos e busca limitada;
- endpoints somente leitura;
- URI lÃ³gica por projeto;
- testes de traversal, symlink, binÃ¡rio, tamanho e troca de projeto;
- botÃ£o para abrir no editor local preservado.

### Task 077 â Escrita, conflitos e operaÃ§Ãµes de arquivo

- dirty state e `Ctrl+S`;
- `expectedVersion` e diff de conflito;
- escrita atÃ´mica;
- criar, renomear e excluir com polÃ­tica proporcional;
- preview para mudanÃ§as em mÃºltiplos arquivos.

### Task 078 â LSP JavaScript/TypeScript

- `LanguageServerManager` e gateway WebSocket;
- TypeScript Language Server;
- diagnostics, completion, definition, references, rename e code actions;
- painel de problemas e outline.

### Task 079 â Ruby/Rails LSP

- resoluÃ§Ã£o segura do runtime Ruby/Bundler;
- Ruby LSP e suporte Rails detectado;
- sÃ­mbolos, diagnÃ³sticos, referÃªncias, rename, formataÃ§Ã£o e actions;
- estado de indexaÃ§Ã£o e reinÃ­cio explÃ­cito.

### Task 080 â IA local com Ollama

- detecÃ§Ã£o do Ollama e listagem de modelos instalados;
- painel de chat contextual e streaming cancelÃ¡vel;
- explicar, corrigir, refatorar e gerar testes;
- ferramentas fechadas de leitura, busca, LSP e Git;
- diff obrigatÃ³rio antes de aplicar alteraÃ§Ãµes;
- nenhuma persistÃªncia de conversa por padrÃ£o.

### Task 081 â CompleÃ§Ã£o inline e contexto ampliado

- ghost text no Monaco para modelos compatÃ­veis;
- FIM quando anunciado pelo modelo;
- debounce, cancelamento e cache curto;
- contexto semÃ¢ntico opt-in com embeddings locais;
- restauraÃ§Ã£o opcional de abas e histÃ³rico privado opt-in.

## CritÃ©rios de aceite da arquitetura

Antes de iniciar a task 076:

- modelo de ameaÃ§a revisado;
- limites iniciais definidos em contratos e schemas;
- polÃ­tica de symlinks decidida e testÃ¡vel;
- estratÃ©gia de workers do Monaco validada com Vite;
- compatibilidade de versÃµes entre Monaco e `monaco-languageclient` fixada;
- comandos permitidos por LSP documentados;
- UX de preview de alteraÃ§Ãµes aprovada;
- Ollama tratado como dependÃªncia opcional detectada, nunca instalada
  automaticamente.

## Fora do escopo inicial

- terminal embutido ou shell livre;
- execuÃ§Ã£o de comandos sugeridos pelo modelo;
- extensÃµes arbitrÃ¡rias do VS Code;
- marketplace de plugins;
- acesso remoto ao dashboard;
- provedores cloud e chaves de API;
- agentes autÃ´nomos que alteram o projeto sem revisÃ£o;
- colaboraÃ§Ã£o em tempo real;
- paridade mobile com a IDE desktop;
- indexaÃ§Ã£o automÃ¡tica de todo arquivo do projeto.
