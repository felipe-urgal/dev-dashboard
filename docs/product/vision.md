# Visão do produto

## Resumo

O Dev Dashboard é uma central local de desenvolvimento para organizar projetos, iniciar serviços, acompanhar processos e executar tarefas recorrentes sem depender de múltiplos terminais e comandos memorizados.

O produto combina a velocidade do CLI existente com uma interface web profissional, preservando o controle local e a segurança do ambiente do desenvolvedor.

## Problema

Desenvolvedores que trabalham com múltiplos projetos Rails e Node geralmente precisam:

- localizar repositórios em diferentes pastas;
- lembrar comandos específicos de cada projeto;
- iniciar vários processos;
- acompanhar portas e PIDs;
- consultar logs;
- alternar entre terminal, navegador e editor;
- repetir operações Git, testes e banco;
- manter contexto sobre quais serviços estão ativos.

Essas tarefas são simples isoladamente, mas geram fricção quando se repetem durante todo o dia.

## Proposta de valor

O Dev Dashboard oferece uma única interface para:

- encontrar projetos locais;
- entender as capacidades de cada projeto;
- iniciar e parar servidores;
- visualizar estados e logs;
- abrir aplicações no navegador;
- alternar entre workspaces;
- executar ações de desenvolvimento conhecidas;
- preservar a opção de uso pelo terminal.

## Público inicial

O público inicial é composto por desenvolvedores que:

- utilizam Linux;
- trabalham com Rails, Node ou ambos;
- mantêm vários repositórios locais;
- preferem ferramentas locais;
- usam terminal diariamente;
- precisam reduzir tarefas repetitivas;
- valorizam transparência sobre comandos e processos.

## Princípios do produto

### Local primeiro

O produto deve funcionar integralmente no computador do usuário.

A API deve permanecer restrita ao ambiente local e não depender de um serviço externo para executar operações básicas.

### CLI e Web complementares

A interface web não substitui o terminal.

O CLI continua sendo a opção mais rápida para usuários que preferem teclado e comandos. O navegador oferece contexto visual, descoberta, monitoramento e ações organizadas.

### Transparência

Antes de executar uma ação relevante, o usuário deve conseguir entender:

- qual projeto será afetado;
- qual ação será executada;
- qual comando está associado;
- qual processo foi criado;
- qual porta está sendo utilizada;
- onde os logs estão armazenados.

### Segurança por padrão

A aplicação não deve aceitar comandos livres enviados pelo navegador.

Ações devem vir de um catálogo fechado, com validação de parâmetros, caminhos e permissões.

### Evolução incremental

A migração do código Bash para pacotes TypeScript deve acontecer somente quando trouxer benefício mensurável.

O funcionamento existente não deve ser quebrado apenas para perseguir uma arquitetura ideal.

### Feedback imediato

Toda ação deve comunicar seu estado:

```text
aguardando
executando
concluída
falhou
cancelada
```

Operações longas devem exibir logs e progresso.

## Objetivos da primeira versão

A primeira versão web deve permitir:

1. cadastrar workspaces;
2. detectar projetos Rails e Node;
3. visualizar as capacidades dos projetos;
4. iniciar e parar servidores;
5. consultar PID, porta e estado;
6. abrir aplicações no navegador;
7. acompanhar logs;
8. manter o CLI existente funcional;
9. executar toda a solução com um único comando;
10. possuir testes e documentação básicos.

## Fora do escopo inicial

Não fazem parte da primeira versão:

- acesso remoto;
- múltiplos usuários;
- hospedagem em nuvem;
- terminal arbitrário no navegador;
- edição de código;
- substituição de IDE;
- suporte oficial completo a Windows e macOS;
- Docker ou Kubernetes como requisitos;
- sincronização de configurações entre computadores;
- automações destrutivas sem confirmação.

## Direção de longo prazo

O Dev Dashboard poderá evoluir para uma plataforma local extensível com:

- status e operações Git;
- execução de testes;
- scripts Node;
- banco e tarefas Rails;
- processos auxiliares;
- histórico de jobs;
- command palette;
- notificações;
- GitHub CLI;
- Docker Compose;
- plugins;
- perfis de workspace;
- automações configuráveis;
- métricas locais de desenvolvimento.

## Métricas de sucesso

### Adoção

- quantidade de workspaces cadastrados;
- quantidade de projetos detectados;
- frequência de abertura do dashboard;
- projetos acessados por sessão.

### Utilidade

- servidores iniciados pelo dashboard;
- logs consultados;
- ações executadas por projeto;
- tempo entre abrir o dashboard e iniciar um projeto;
- redução do uso de comandos repetitivos.

### Confiabilidade

- taxa de sucesso ao iniciar processos;
- taxa de encerramento correto;
- scans sem warnings;
- erros por ação;
- processos órfãos;
- falhas de identificação de PID.

### Qualidade

- typecheck sem erros;
- build reproduzível;
- suíte de testes aprovada;
- endpoints com validação;
- documentação atualizada;
- regressões no CLI.

## Critério para novas funcionalidades

Uma nova funcionalidade deve responder positivamente a pelo menos uma destas perguntas:

- reduz uma tarefa repetitiva?
- melhora visibilidade do ambiente?
- reduz risco operacional?
- elimina a necessidade de lembrar um comando?
- aproxima o CLI e o navegador de um núcleo comum?
- melhora a confiabilidade ou testabilidade?

Caso contrário, deve permanecer fora do escopo imediato.
