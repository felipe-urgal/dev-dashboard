# Arquitetura da informaÃ§Ã£o

## Objetivo

A interface deve permitir que o usuÃ¡rio entenda rapidamente:

- quais workspaces existem;
- quais projetos estÃ£o disponÃ­veis;
- quais serviÃ§os estÃ£o ativos;
- quais aÃ§Ãµes podem ser executadas;
- quais operaÃ§Ãµes falharam;
- onde encontrar logs e detalhes.

A organizaÃ§Ã£o deve priorizar descoberta, estado e aÃ§Ã£o.

## NavegaÃ§Ã£o principal

A navegaÃ§Ã£o planejada possui quatro Ã¡reas:

```text
VisÃ£o geral
RepositÃ³rios
Processos
Jobs e logs
```

> Status atualizado: **RepositÃ³rios**, detalhe do projeto e **Processos**
> (`/processes`) estÃ£o implementados. **VisÃ£o geral** existe como landing,
> mas sem os widgets consolidados descritos abaixo. **command palette** jÃ¡
> estÃ¡ implementado. As pÃ¡ginas globais **Atividade** (`/activity`) e
> **ConfiguraÃ§Ãµes** (`/settings`) chegaram a ser implementadas e foram
> removidas (task 236) por nÃ£o justificarem uma Ã¡rea prÃ³pria na navegaÃ§Ã£o
> principal â a retenÃ§Ã£o de logs/histÃ³rico continua configurÃ¡vel por
> variÃ¡vel de ambiente (ver `docs/architecture/security.md`), e perfis de
> ambiente seguem editÃ¡veis por projeto. **Jobs e logs** segue aspiracional
> â nÃ£o existe uma pÃ¡gina dedicada, mapeado em
> [`../../tasks/PENDENCIAS.md`](../../tasks/PENDENCIAS.md).
>
> A reforma do vocabulÃ¡rio visual (cores, tipografia, densidade,
> componentes de card/badge/formulÃ¡rio) foi concluÃ­da: os tokens vivem em
> `apps/web/src/styles/tokens.css` e os componentes compartilhados
> (`<Card>`, `<StatusBadge>`) substituÃ­ram as superfÃ­cies ad hoc anteriores.
> Este documento descreve **a estrutura da informaÃ§Ã£o e navegaÃ§Ã£o**, nÃ£o a
> camada visual.

### VisÃ£o geral

Resumo operacional do ambiente.

No estado atual, a landing prioriza uma leitura direta dos projetos detectados:

- quantidade de projetos;
- lista ordenada por prioridade, com tipo, estado, branch e recÃªncia;
- aÃ§Ãµes globais de iniciar e parar servidores junto do tÃ­tulo e da contagem de
  projetos;
- aÃ§Ãµes de escanear novamente e remover workspace separadas no cabeÃ§alho.

A VisÃ£o geral nÃ£o expÃµe busca textual nem filtro por tipo. Esses controles
pertencem Ã  Ã¡rea de **RepositÃ³rios** quando houver necessidade de exploraÃ§Ã£o da
lista completa, evitando duplicar navegaÃ§Ã£o e filtros na landing.

Widgets operacionais consolidados â servidores ativos, processos com falha,
alteraÃ§Ãµes Git e jobs em execuÃ§Ã£o â continuam como evoluÃ§Ã£o possÃ­vel da VisÃ£o
geral sem alterar esse princÃ­pio de manter a entrada enxuta.

### RepositÃ³rios

Lista completa dos projetos detectados.

Filtros planejados:

- workspace;
- tipo;
- capacidade;
- estado do servidor;
- favorito;
- busca textual.

Modos de visualizaÃ§Ã£o:

- cards;
- tabela compacta.

### Processos

VisÃ£o consolidada de todos os processos gerenciados.

InformaÃ§Ãµes:

- projeto;
- tipo do processo;
- estado;
- PID;
- porta;
- duraÃ§Ã£o;
- comando;
- aÃ§Ãµes disponÃ­veis.

### Jobs e logs

HistÃ³rico de operaÃ§Ãµes iniciadas pelo dashboard.

Exemplos:

- iniciar servidor;
- executar testes;
- rodar migration;
- instalar dependÃªncias;
- realizar pull;
- criar commit.

Cada job deve possuir:

- identificador;
- projeto;
- aÃ§Ã£o;
- estado;
- inÃ­cio;
- fim;
- exit code;
- saÃ­da;
- erro.

### ConfiguraÃ§Ãµes

Removida (task 236) â chegou a existir como pÃ¡gina dedicada (`/settings`)
reunindo retenÃ§Ã£o de logs/histÃ³rico e perfis de ambiente, mas foi retirada da
navegaÃ§Ã£o principal por nÃ£o justificar uma Ã¡rea prÃ³pria. Perfis de ambiente
continuam editÃ¡veis por projeto (`ProjectEnvironmentPanel`); retenÃ§Ã£o de
logs/histÃ³rico segue configurÃ¡vel apenas por variÃ¡vel de ambiente. Gerenciamento
de workspaces, portas e diagnÃ³sticos do ambiente vivem em **RepositÃ³rios** e no
Project Doctor, nÃ£o numa Ã¡rea de configuraÃ§Ãµes dedicada.

## Estrutura do app shell

```text
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â Topbar                                                       â
â Workspace ativo | busca | command palette | estado da API   â
âââââââââââââââââ¬ââââââââââââââââââââââââââââââ¬âââââââââââââââââ¤
â Sidebar       â ConteÃºdo principal          â Atividade      â
â               â                             â opcional       â
â VisÃ£o geral   â                             â                â
â RepositÃ³rios  â                             â                â
â Processos     â                             â                â
â Jobs e logs   â                             â                â
âââââââââââââââââ´ââââââââââââââââââââââââââââââ´âââââââââââââââââ
```

O painel de atividade deve ser recolhÃ­vel e, em telas menores, virar um drawer.

## Hierarquia de entidades

```text
Workspace
âââ Project
    âââ Capabilities
    âââ Managed Processes
    âââ Jobs
    âââ Logs
    âââ Git
    âââ Tests
    âââ Scripts
    âââ Environment
```

## Workspace

Um workspace representa uma pasta raiz contendo projetos.

InformaÃ§Ãµes exibidas:

- nome;
- caminho;
- estado;
- quantidade de projetos;
- Ãºltimo scan;
- warnings;
- aÃ§Ãµes.

AÃ§Ãµes:

- selecionar;
- escanear;
- editar;
- desabilitar;
- remover do dashboard.

Remover um workspace nunca deve apagar arquivos locais.

## Projeto

O projeto Ã© a principal unidade operacional da interface.

InformaÃ§Ãµes resumidas:

- nome;
- tipo;
- caminho;
- workspace;
- capacidades;
- estado do servidor;
- porta;
- PID;
- branch;
- alteraÃ§Ãµes Git;
- Ãºltima atividade.

AÃ§Ãµes rÃ¡pidas:

- iniciar;
- parar;
- reiniciar;
- abrir aplicaÃ§Ã£o;
- visualizar logs;
- favoritar;
- abrir detalhes.

## PÃ¡gina de detalhes do projeto

Estrutura atual (`apps/web/src/router/index.ts`):

```text
README
DiagnÃ³stico
Servidor
Logs
Git
Testes
Banco de dados
DependÃªncias
Scripts
Terminal
Console
Sidekiq/webpack
VariÃ¡veis de ambiente
```

As abas disponÃ­veis dependem das capacidades detectadas: **Banco de dados** sÃ³ quando o projeto
tem suporte a banco detectado; **DependÃªncias** (task 072, reÃºne Bundler/lockfile Node e build),
**Console** e **Sidekiq/webpack** sÃ³ para projetos Rails/Node conforme o tipo. Uma IDE embutida com
Monaco e LSP existiu como aba prÃ³pria **Editor** (task 076 em diante) e foi removida no PR #262. A
aba prÃ³pria **Assistente IA** (chat/implementaÃ§Ã£o via IA local) existiu depois disso como painel
independente de editor/LSP e foi removida na task 238; a Ãºnica capacidade de IA que resta no
produto Ã© a Code review dentro da aba **Git**, fixa no Ollama local.

### VisÃ£o geral

- identidade do projeto;
- caminho;
- tipo;
- branch;
- capacidades;
- processos;
- aÃ§Ãµes rÃ¡pidas;
- atividade recente.

### Servidor

- estado;
- porta;
- PID;
- tempo ativo;
- comando;
- health check;
- start;
- stop;
- restart;
- logs.

### Git

- branch atual;
- arquivos alterados;
- commits recentes;
- pull;
- push;
- commit;
- troca de branch.

### Testes

- suÃ­te completa;
- arquivo especÃ­fico;
- cobertura;
- duraÃ§Ã£o;
- Ãºltimos resultados;
- falhas.

### Banco

Exibida principalmente para Rails.

- status de migrations;
- migrate;
- rollback;
- seed;
- prepare;
- tarefas futuras com confirmaÃ§Ã£o.

### Scripts

Exibida para projetos Node ou projetos com `package.json`.

- lista de scripts;
- descriÃ§Ã£o do comando;
- execuÃ§Ã£o;
- logs;
- histÃ³rico.

### Logs

- seleÃ§Ã£o de processo;
- atualizaÃ§Ã£o;
- follow;
- pausa de rolagem;
- filtro;
- copiar;
- limpar visualmente;
- exportaÃ§Ã£o futura.

## Estados visuais

Todo estado deve combinar texto, Ã­cone e cor.

```text
Verde    executando ou saudÃ¡vel
Amarelo  iniciando, encerrando ou atenÃ§Ã£o
Vermelho falha
Azul     aÃ§Ã£o em andamento
Cinza    parado, inativo ou desconhecido
```

A cor nunca deve ser o Ãºnico indicador.

## Estados vazios

Estados vazios devem orientar a prÃ³xima aÃ§Ã£o.

Exemplos:

### Sem workspace

```text
Nenhum workspace cadastrado.
Adicione uma pasta local para encontrar projetos.
```

### Sem projetos

```text
Nenhum projeto Rails ou Node foi encontrado.
Verifique o caminho ou execute um novo scan.
```

### Sem processos

```text
Nenhum servidor estÃ¡ em execuÃ§Ã£o.
Inicie um projeto pela lista de repositÃ³rios.
```

### Sem logs

```text
Nenhuma saÃ­da foi registrada para este processo.
```

## Tratamento de erros

Erros devem informar:

- o que nÃ£o foi concluÃ­do;
- qual entidade foi afetada;
- uma mensagem compreensÃ­vel;
- uma aÃ§Ã£o possÃ­vel.

NÃ£o devem exibir stack trace no frontend.

Exemplo:

```text
NÃ£o foi possÃ­vel iniciar fi-editor-api.
O comando bin/rails nÃ£o foi encontrado.
```

## ConfirmaÃ§Ãµes

AÃ§Ãµes nÃ£o destrutivas devem ser rÃ¡pidas e diretas.

ConfirmaÃ§Ã£o explÃ­cita serÃ¡ obrigatÃ³ria para:

- remover workspace;
- excluir branch;
- resetar alteraÃ§Ãµes;
- limpar arquivos;
- resetar banco;
- apagar logs persistidos;
- interromper processo nÃ£o identificado;
- aÃ§Ãµes futuras classificadas como destrutivas.

## Command palette

Atalho planejado:

```text
Ctrl+K
Cmd+K
```

A command palette deve permitir:

- buscar projeto;
- trocar workspace;
- iniciar servidor;
- parar servidor;
- abrir aplicaÃ§Ã£o;
- executar testes;
- navegar para uma Ã¡rea.

Os resultados devem respeitar contexto e capacidades.

## Responsividade

### Desktop

- sidebar fixa;
- conteÃºdo amplo;
- painel de atividade opcional;
- cards ou tabela.

### Tablet

- sidebar reduzida;
- painel de atividade em drawer;
- mÃ©tricas em duas colunas.

### Mobile

O uso mobile nÃ£o Ã© prioritÃ¡rio, mas a interface deve continuar navegÃ¡vel.

- navegaÃ§Ã£o recolhida;
- cards em uma coluna;
- aÃ§Ãµes agrupadas;
- logs com altura limitada.

## Acessibilidade

Requisitos:

- navegaÃ§Ã£o por teclado;
- foco visÃ­vel;
- labels em formulÃ¡rios;
- mensagens com `role`;
- contraste adequado;
- aÃ§Ãµes com nomes acessÃ­veis;
- estados nÃ£o dependentes somente de cor;
- suporte a reduÃ§Ã£o de movimento;
- semÃ¢ntica HTML correta.

## Densidade da interface

O produto Ã© uma ferramenta profissional de uso frequente.

A interface deve ser compacta, mas nÃ£o apertada.

Diretrizes:

- grid de 4 e 8 pixels;
- controles entre 32 e 40 pixels;
- tipografia tÃ©cnica em dados;
- agrupamento claro de aÃ§Ãµes;
- detalhes progressivos;
- evitar grandes Ã¡reas decorativas apÃ³s a fase inicial.

## EvoluÃ§Ã£o

A estrutura atual Ã© uma visÃ£o geral com cards de projeto.

A evoluÃ§Ã£o prevista Ã©:

1. consolidar o app shell;
2. adicionar roteamento;
3. separar pÃ¡ginas;
4. criar detalhe do projeto;
5. adicionar processos globais;
6. adicionar jobs;
7. implementar command palette;
8. acrescentar configuraÃ§Ãµes;
9. otimizar densidade e atalhos.
