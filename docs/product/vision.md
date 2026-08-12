# VisÃ£o do produto

## Resumo

O Dev Dashboard Ã© uma central local de desenvolvimento para organizar projetos, iniciar serviÃ§os, acompanhar processos e executar tarefas recorrentes sem depender de mÃºltiplos terminais e comandos memorizados.

O produto combina a velocidade do CLI existente com uma interface web profissional, preservando o controle local e a seguranÃ§a do ambiente do desenvolvedor.

## Problema

Desenvolvedores que trabalham com mÃºltiplos projetos Rails e Node geralmente precisam:

- localizar repositÃ³rios em diferentes pastas;
- lembrar comandos especÃ­ficos de cada projeto;
- iniciar vÃ¡rios processos;
- acompanhar portas e PIDs;
- consultar logs;
- alternar entre terminal, navegador e editor;
- repetir operaÃ§Ãµes Git, testes e banco;
- manter contexto sobre quais serviÃ§os estÃ£o ativos.

Essas tarefas sÃ£o simples isoladamente, mas geram fricÃ§Ã£o quando se repetem durante todo o dia.

## Proposta de valor

O Dev Dashboard oferece uma Ãºnica interface para:

- encontrar projetos locais;
- entender as capacidades de cada projeto;
- iniciar e parar servidores;
- visualizar estados e logs;
- abrir aplicaÃ§Ãµes no navegador;
- alternar entre workspaces;
- executar aÃ§Ãµes de desenvolvimento conhecidas;
- preservar a opÃ§Ã£o de uso pelo terminal.

## PÃºblico inicial

O pÃºblico inicial Ã© composto por desenvolvedores que:

- utilizam Linux;
- trabalham com Rails, Node ou ambos;
- mantÃªm vÃ¡rios repositÃ³rios locais;
- preferem ferramentas locais;
- usam terminal diariamente;
- precisam reduzir tarefas repetitivas;
- valorizam transparÃªncia sobre comandos e processos.

## PrincÃ­pios do produto

### Local primeiro

O produto deve funcionar integralmente no computador do usuÃ¡rio.

A API deve permanecer restrita ao ambiente local e nÃ£o depender de um serviÃ§o externo para executar operaÃ§Ãµes bÃ¡sicas.

### CLI e Web complementares

A interface web nÃ£o substitui o terminal.

O CLI continua sendo a opÃ§Ã£o mais rÃ¡pida para usuÃ¡rios que preferem teclado e comandos. O navegador oferece contexto visual, descoberta, monitoramento e aÃ§Ãµes organizadas.

### TransparÃªncia

Antes de executar uma aÃ§Ã£o relevante, o usuÃ¡rio deve conseguir entender:

- qual projeto serÃ¡ afetado;
- qual aÃ§Ã£o serÃ¡ executada;
- qual comando estÃ¡ associado;
- qual processo foi criado;
- qual porta estÃ¡ sendo utilizada;
- onde os logs estÃ£o armazenados.

### SeguranÃ§a por padrÃ£o

A aplicaÃ§Ã£o nÃ£o deve aceitar comandos livres enviados pelo navegador.

AÃ§Ãµes devem vir de um catÃ¡logo fechado, com validaÃ§Ã£o de parÃ¢metros, caminhos e permissÃµes.

### EvoluÃ§Ã£o incremental

A migraÃ§Ã£o do cÃ³digo Bash para pacotes TypeScript deve acontecer somente quando trouxer benefÃ­cio mensurÃ¡vel.

O funcionamento existente nÃ£o deve ser quebrado apenas para perseguir uma arquitetura ideal.

### Feedback imediato

Toda aÃ§Ã£o deve comunicar seu estado:

```text
aguardando
executando
concluÃ­da
falhou
cancelada
```

OperaÃ§Ãµes longas devem exibir logs e progresso.

## Objetivos da primeira versÃ£o

A primeira versÃ£o web deve permitir:

1. cadastrar workspaces;
2. detectar projetos Rails e Node;
3. visualizar as capacidades dos projetos;
4. iniciar e parar servidores;
5. consultar PID, porta e estado;
6. abrir aplicaÃ§Ãµes no navegador;
7. acompanhar logs;
8. manter o CLI existente funcional;
9. executar toda a soluÃ§Ã£o com um Ãºnico comando;
10. possuir testes e documentaÃ§Ã£o bÃ¡sicos.

## Fora do escopo inicial

NÃ£o fazem parte da primeira versÃ£o:

- acesso remoto;
- mÃºltiplos usuÃ¡rios;
- hospedagem em nuvem;
- terminal arbitrÃ¡rio no navegador;
- ediÃ§Ã£o de cÃ³digo;
- substituiÃ§Ã£o de IDE;
- suporte oficial completo a Windows e macOS;
- Docker ou Kubernetes como requisitos;
- sincronizaÃ§Ã£o de configuraÃ§Ãµes entre computadores;
- automaÃ§Ãµes destrutivas sem confirmaÃ§Ã£o.

## DireÃ§Ã£o de longo prazo

JÃ¡ entregue no dashboard web (ver [`../../tasks/PENDENCIAS.md`](../../tasks/PENDENCIAS.md) para o
detalhamento por task): status e operaÃ§Ãµes Git (leitura e mutaÃ§Ãµes com
confirmaÃ§Ã£o), execuÃ§Ã£o de testes, scripts Node, banco e tarefas Rails de
baixo risco, processos auxiliares (start/stop/logs/limpeza), command palette,
notificaÃ§Ãµes locais, serviÃ§os Docker Compose (start/stop/logs/build) e Code
review de Pull Request com IA local via Ollama, dentro da aba **Git** (ver
[`../architecture/ai-multi-provider.md`](../architecture/ai-multi-provider.md)).
Uma IDE embutida com Monaco e LSP chegou a ser construÃ­da (tasks 076â083) e
foi depois removida (PR #262); um assistente de IA local em painel prÃ³prio
(chat, catÃ¡logo de ferramentas somente leitura e aplicaÃ§Ã£o de ediÃ§Ãµes
propostas via preview/confirmaÃ§Ã£o) tambÃ©m chegou a existir e foi removido na
task 236 â "ediÃ§Ã£o de cÃ³digo" e "substituiÃ§Ã£o de IDE" seguem fora do escopo,
como jÃ¡ listado abaixo.

O Dev Dashboard poderÃ¡ evoluir ainda mais para uma plataforma local
extensÃ­vel com:

- histÃ³rico de jobs unificado (Git, Rails e processos numa Ãºnica linha do
  tempo);
- GitHub CLI (`git-pr` e alÃ©m);
- plugins;
- perfis de workspace;
- automaÃ§Ãµes configurÃ¡veis;
- mÃ©tricas locais de desenvolvimento.

## MÃ©tricas de sucesso

### AdoÃ§Ã£o

- quantidade de workspaces cadastrados;
- quantidade de projetos detectados;
- frequÃªncia de abertura do dashboard;
- projetos acessados por sessÃ£o.

### Utilidade

- servidores iniciados pelo dashboard;
- logs consultados;
- aÃ§Ãµes executadas por projeto;
- tempo entre abrir o dashboard e iniciar um projeto;
- reduÃ§Ã£o do uso de comandos repetitivos.

### Confiabilidade

- taxa de sucesso ao iniciar processos;
- taxa de encerramento correto;
- scans sem warnings;
- erros por aÃ§Ã£o;
- processos Ã³rfÃ£os;
- falhas de identificaÃ§Ã£o de PID.

### Qualidade

- typecheck sem erros;
- build reproduzÃ­vel;
- suÃ­te de testes aprovada;
- endpoints com validaÃ§Ã£o;
- documentaÃ§Ã£o atualizada;
- regressÃµes no CLI.

## CritÃ©rio para novas funcionalidades

Uma nova funcionalidade deve responder positivamente a pelo menos uma destas perguntas:

- reduz uma tarefa repetitiva?
- melhora visibilidade do ambiente?
- reduz risco operacional?
- elimina a necessidade de lembrar um comando?
- aproxima o CLI e o navegador de um nÃºcleo comum?
- melhora a confiabilidade ou testabilidade?

Caso contrÃ¡rio, deve permanecer fora do escopo imediato.
