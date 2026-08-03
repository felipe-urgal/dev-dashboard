# Próxima atividade

A task 078 adicionou o primeiro servidor de linguagem à IDE embutida: gateway
WebSocket autenticado, processo JavaScript/TypeScript sob demanda, isolamento de
URI, providers semânticos no Monaco e revisão obrigatória de `WorkspaceEdit`.

## Task 079 — LSP Ruby/Rails

Estender a infraestrutura semântica para arquivos Ruby e projetos Rails sem
permitir instalação automática, comandos arbitrários ou inicialização silenciosa
da aplicação.

### Objetivo

Oferecer diagnósticos, hover, definição, referências, símbolos e completion
Ruby, adicionando capacidades Rails somente quando as ferramentas já estiverem
disponíveis e o risco de introspecção em tempo de execução estiver explícito.

### Escopo proposto

- generalizar o gateway atual para múltiplos tipos de servidor;
- manter catálogo fechado de executável, argumentos e sinais do projeto;
- reconhecer projetos Rails, `Gemfile`, `.ruby-version` e arquivos `.rb`;
- usar `ruby-lsp` já instalado ou o bundle já resolvido, sem instalar gems;
- recusar qualquer fluxo que exija alteração de `Gemfile.lock` ou bundle
  auxiliar automático;
- compartilhar isolamento de URI, framing, limite de mensagem, idle timeout e
  limite de reinício da task 078;
- registrar providers Monaco para Ruby;
- sincronizar `didOpen`, `didChange`, `didSave` e `didClose`;
- manter busca de símbolos pelo prefixo `@`;
- reutilizar o preview e a confirmação de `WorkspaceEdit` da task 077;
- manter operações estruturais e `workspace/executeCommand` bloqueados;
- distinguir estado do Ruby LSP, add-on Rails e introspecção Rails;
- não iniciar `rails runner` apenas por abrir um arquivo;
- exigir ação explícita antes de qualquer introspecção que inicialize a
  aplicação Rails.

### Segurança

- o navegador continua sem escolher executável, cwd, argumentos ou ambiente;
- nenhuma gem é instalada, atualizada ou adicionada automaticamente;
- respostas fora da raiz autorizada são descartadas;
- falha de Ruby, Bundler ou Ruby LSP degrada para o Monaco local;
- Rails runtime permanece desabilitado por padrão;
- logs internos não expõem credenciais, variáveis ou caminhos absolutos;
- alterações propostas não são gravadas sem revisão explícita.

### Critérios principais

- arquivos Ruby recebem recursos semânticos quando o servidor já está
  disponível;
- servidor ausente produz orientação clara e não altera o ambiente;
- sessões Ruby e JavaScript/TypeScript possuem lifecycle independente;
- localização e edição não escapam da raiz do projeto;
- Rails runtime não inicia sem consentimento específico;
- `WorkspaceEdit` inválido, estrutural ou fora da raiz é recusado;
- typecheck, build, testes de API, testes web e smoke E2E passam.

### Fora do escopo

- instalação automática de Ruby LSP ou do add-on Rails;
- terminal livre, generators, migrations e testes disparados pelo LSP;
- assistência de IA local, planejada para a task 080;
- completion inline/FIM e contexto semântico, planejados para a task 081.

O plano completo está em `docs/tasks/079-ruby-rails-lsp.md`.
