# Task 079 — LSP Ruby/Rails

## Status

Implementada e aguardando revisão.

## Objetivo

Estender a infraestrutura semântica do editor para arquivos Ruby e projetos
Rails, reaproveitando o gateway, o lifecycle de processos, o isolamento de URI
e o fluxo seguro de `WorkspaceEdit` já entregues para JavaScript/TypeScript.

## Resultado entregue

- diagnósticos, hover, definição, referências, completion e símbolos Ruby nos
  arquivos abertos, reaproveitando o mesmo cliente Monaco genérico por `kind`;
- busca de símbolos com prefixo `@` combinando as sessões JavaScript/TypeScript
  e Ruby simultaneamente;
- detecção estática de projetos Ruby/Rails (`project.type === 'rails'`,
  `Gemfile`, `.ruby-version`), sem depender de arquivos `.rb` já abertos;
- catálogo fechado de resolução do `ruby-lsp`, sem `bundle install` nem
  qualquer execução do Bundler — apenas leitura de texto de `Gemfile.lock`;
- capacidade Rails runtime separada, com opt-in explícito por confirmação de
  uso único (mesmo padrão de `confirmationToken` já usado em Git/Rails/Scripts);
- gateway generalizado por `(projectId, kind)`, permitindo sessões
  JavaScript/TypeScript e Ruby simultâneas e independentes no mesmo projeto;
- `ProjectLanguageServerStatus.rails` informa `addonAvailable` e `runtimeState`
  (`unavailable` | `disabled` | `enabled`) separadamente do estado da sessão
  Ruby estática.

## Decisões que divergiram do plano original

- em vez de expor três estados de `kind` (`ruby`, `rails-static`,
  `rails-runtime`), o contrato manteve um único `kind: 'ruby'` e acrescentou um
  objeto `rails` opcional ao `ProjectLanguageServerStatus` — mais simples de
  consumir no cliente e suficiente para diferenciar as duas capacidades;
- o gate do Rails runtime não tenta controlar o protocolo interno do add-on
  `ruby-lsp-rails` (que carrega automaticamente quando presente no bundle).
  Em vez disso, o próprio **caminho de execução** é condicionado: com o add-on
  resolvido no `Gemfile.lock` e a introspecção **desabilitada**, o serviço
  recusa `bundle exec ruby-lsp --stdio` (o único caminho que carregaria o
  add-on, pois ele vive dentro do bundle do projeto) e cai para um `ruby-lsp`
  global do `PATH` quando disponível — que nunca herda o bundle do projeto e
  portanto nunca inicializa a aplicação Rails. Só com a introspecção
  **habilitada** o `bundle exec` é liberado. Esse é o mecanismo real de
  bloqueio, documentado em
  `findRubyLanguageServer` (`apps/api/src/services/project-language-server-service.ts`).

## Decisão de segurança principal

Ruby LSP e os recursos Rails possuem riscos diferentes dos recursos
JavaScript/TypeScript. O servidor base depende do ambiente Ruby/Bundler e o
add-on Rails pode iniciar um processo `rails runner` para obter informações em
tempo de execução.

Por isso, a implementação deve separar duas capacidades:

1. **Ruby estático** — pode iniciar sob demanda quando um executável já instalado
   e reconhecido estiver disponível;
2. **Rails runtime** — permanece desabilitado por padrão e só pode ser ativado
   após uma ação explícita que descreva que a aplicação será inicializada e pode
   acessar banco, cache e configuração local.

A ausência de uma forma comprovadamente não interativa e sem instalação deve
resultar em capacidade indisponível, nunca em `bundle install`, atualização de
gems ou download automático.

## Arquitetura proposta

### Generalização do gateway

- extrair a sessão JavaScript/TypeScript para uma abstração de servidor por
  linguagem;
- manter catálogo fechado por `kind`, executável, argumentos e sinais do
  projeto;
- preservar uma conexão ativa por projeto e linguagem;
- manter framing, limite de 1 MiB, timeout ocioso e limite de reinício;
- reutilizar a tradução de URI e o filtro de localizações externas;
- manter `workspace/executeCommand` bloqueado por padrão.

### Detecção Ruby

Sinais reconhecidos inicialmente:

- projeto do tipo Rails;
- `Gemfile`;
- `.ruby-version`;
- arquivos `.rb` abertos.

O catálogo deve avaliar, sem executar instalação:

- executável `ruby-lsp` já disponível no ambiente autorizado;
- `bundle exec ruby-lsp --stdio` somente quando a gem já estiver resolvida e
  disponível no bundle, sem alterar `Gemfile.lock` ou criar um bundle auxiliar;
- versão e caminho do Ruby selecionados pelo ambiente da própria API, sem
  permitir comando enviado pelo navegador.

### Cliente Monaco

- ampliar o cliente atual para registrar providers também para `ruby`;
- compartilhar transporte e roteamento JSON-RPC por sessão;
- manter diagnósticos por modelo aberto e resumo acessível;
- preservar busca de símbolos pelo prefixo `@`;
- mapear somente respostas suportadas pelo Monaco;
- ignorar comandos, ações automáticas e edições adicionais não revisadas.

### Rails

- detectar a presença do add-on sem instalá-lo;
- informar separadamente os estados `ruby`, `rails-static` e `rails-runtime`;
- não iniciar `rails runner` na abertura simples de um arquivo;
- exigir opt-in específico antes de permitir introspecção em tempo de execução;
- encerrar o processo Rails junto com a sessão LSP;
- manter logs internos limitados e sem expor credenciais, variáveis ou caminhos
  absolutos.

### WorkspaceEdit

- reutilizar integralmente o preview da task 077;
- aceitar apenas alterações textuais em arquivos existentes nesta primeira
  versão;
- rejeitar criação, renomeação, exclusão e comandos;
- exigir arquivo aberto limpo ou leitura atual de versão;
- nunca aplicar automaticamente organização de imports, autocorreção ou
  refatoração.

## Critérios de aceite

- abrir um arquivo Ruby inicia somente a capacidade estática disponível;
- servidor ausente não dispara instalação ou atualização;
- falha do Ruby/Bundler não impede leitura e escrita no Monaco;
- diagnósticos, hover, definição, referências, símbolos e completion funcionam
  dentro da raiz permitida;
- resultados externos são descartados;
- fechar a última conexão encerra o processo após o timeout;
- Rails runtime não inicia sem ação explícita;
- qualquer alteração proposta passa pelo preview e confirmação existentes;
- typecheck, build, testes automatizados e smoke E2E passam.

## Testes previstos

- seleção fechada de executável Ruby e Bundler;
- recusa de instalação, prompt e atualização automática;
- lifecycle independente das sessões JS/TS e Ruby;
- tradução de URI para arquivos `.rb`;
- sincronização dos documentos Ruby;
- providers e diagnósticos no Monaco;
- status separado de Ruby e Rails;
- Rails runtime bloqueado por padrão;
- encerramento do subprocesso Rails quando autorizado;
- `WorkspaceEdit` textual revisável e operações estruturais recusadas;
- degradação com Ruby, Bundler, gem ou add-on ausente.

## Fora do escopo

- instalação automática de `ruby-lsp` ou `ruby-lsp-rails`;
- terminal livre;
- execução automática de testes, generators, migrations ou formatters;
- code actions ou comandos sem confirmação;
- assistência de IA local, planejada para a task 080;
- completion inline/FIM e contexto semântico, planejados para a task 081.

## Arquivos alterados

- `packages/contracts/src/language-server.ts` — `ProjectLanguageServerKind`
  ganha `'ruby'`, novo `ProjectRailsLanguageServerStatus` e
  `ProjectRailsRuntimeConfirmation`;
- `apps/api/src/services/project-language-server-service.ts` — sessões
  chaveadas por `(projectId, kind)`, catálogo `findCommand` por linguagem,
  `findRubyLanguageServer`, `gemfileLockHasGem`, confirmação e gate do Rails
  runtime;
- `apps/api/src/routes/project-language-server.ts` — rotas com segmento
  `:kind`, `POST .../ruby/rails-runtime/confirmations` e
  `POST .../ruby/rails-runtime`;
- `apps/api/src/http/api-error.ts` — novos códigos
  `LANGUAGE_SERVER_CONFIRMATION_INVALID` e `LANGUAGE_SERVER_FAILED`;
- `apps/web/src/api/language-server.ts` — funções recebem `kind` e novas
  chamadas de confirmação/opt-in do Rails runtime;
- `apps/web/src/language-server/project-language-server-client.ts` —
  `SUPPORTED_LANGUAGES` fixo virou `languages` por instância, `kind` explícito,
  `initializationOptions` específico do `typescript-language-server` só é
  enviado para esse `kind`, correção do `languageId` de `.tsx`/`.jsx`
  (`typescriptreact`/`javascriptreact`) para preservar JSX e `paths` do
  `tsconfig.json` no tsserver;
- `apps/web/src/components/ProjectEmbeddedEditor.vue` — duas sessões de
  cliente (JS/TS e Ruby) simultâneas, badge de status por `kind`, controle de
  opt-in do Rails runtime, indicador de arquivo alterado no explorer, abas de
  preview (clique único) e fixação (duplo clique), seletor de tema do editor
  (padrão/Monokai);
- `apps/web/src/monaco-themes.ts` — novo, define o tema Monokai;
- testes: `apps/api/test/project-language-server-service.test.ts`,
  `apps/api/test/project-language-server-routes.test.ts` (novo),
  `apps/web/test/project-language-server-client.test.ts`,
  `apps/web/test/project-embedded-editor.test.ts`.

## Testes automatizados

- catálogo fechado de detecção Ruby, incluindo leitura de `Gemfile.lock` sem
  invocar `bundle`;
- recusa de `bundle exec` com add-on Rails presente sem opt-in, com fallback
  para `ruby-lsp` global;
- lifecycle independente das sessões JavaScript/TypeScript e Ruby no mesmo
  projeto (matar uma sessão não afeta a outra);
- opt-in do Rails runtime exige `confirmationToken` válido e de uso único;
  desabilitar não exige token;
- rotas HTTP: status por `kind`, `kind` inválido rejeitado pelo schema, 404
  para projeto inexistente, 401 sem token, fluxo completo de confirmação e
  habilitação/desabilitação do Rails runtime;
- cliente Monaco: sessão `ruby` não envia `initializationOptions` específico
  de TypeScript e registra `kind` correto no status;
- componente: clique único abre em aba de preview substituindo a anterior;
  duplo clique fixa a aba.

## Limitações conhecidas

- o gate do Rails runtime é best-effort sobre o caminho de execução (bundle
  exec vs. `ruby-lsp` global); não há como o dashboard inspecionar ou
  interromper introspecção específica dentro do próprio add-on
  `ruby-lsp-rails` depois que o processo está rodando com o bundle liberado;
- `ruby-lsp` global (fora do bundle do projeto) não tem acesso às gems do
  projeto, então diagnósticos podem ser menos precisos até o Rails runtime ser
  habilitado;
- como no JS/TS, existe apenas uma conexão de navegador ativa por
  `(projeto, kind)`;
- rename, code actions, formatação e semantic tokens continuam fora do
  escopo.

## Próxima atividade

Task 080 — IA local com Ollama, conforme
`docs/architecture/embedded-ide-ai-design.md` e `docs/tasks/080-ollama-local-ai.md`.
