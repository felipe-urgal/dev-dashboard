# Task 079 — LSP Ruby/Rails

## Status

Planejada. Começa após a revisão e o merge da task 078.

## Objetivo

Estender a infraestrutura semântica do editor para arquivos Ruby e projetos
Rails, reaproveitando o gateway, o lifecycle de processos, o isolamento de URI
e o fluxo seguro de `WorkspaceEdit` já entregues para JavaScript/TypeScript.

## Resultado esperado

- diagnósticos Ruby nos arquivos abertos;
- hover, definição, referências, completion e símbolos;
- navegação entre classes, módulos e métodos do projeto;
- suporte Rails quando as ferramentas necessárias já estiverem instaladas;
- estado claro quando Ruby LSP, Bundler ou o add-on Rails estiverem ausentes;
- nenhuma instalação, atualização de bundle ou inicialização da aplicação sem
  decisão explícita.

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
