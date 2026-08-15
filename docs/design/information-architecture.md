# Arquitetura da informação

## Objetivo

A interface deve permitir que o usuário entenda rapidamente:

- quais workspaces existem;
- quais projetos estão disponíveis;
- quais serviços estão ativos;
- quais ações podem ser executadas;
- quais operações falharam;
- onde encontrar logs e detalhes.

A organização deve priorizar descoberta, estado e ação.

## Navegação principal

A navegação planejada possui quatro áreas:

```text
Visão geral
Repositórios
Processos
Jobs e logs
```

> Status atualizado: **Repositórios**, detalhe do projeto e **Processos**
> (`/processes`) estão implementados. **Visão geral** existe como landing,
> mas sem os widgets consolidados descritos abaixo. **command palette** já
> está implementado. As páginas globais **Atividade** (`/activity`) e
> **Configurações** (`/settings`) chegaram a ser implementadas e foram
> removidas (task 237) por não justificarem uma área própria na navegação
> principal — a retenção de logs/histórico continua configurável por
> variável de ambiente (ver `docs/architecture/security.md`), e perfis de
> ambiente seguem editáveis por projeto. **Jobs e logs** segue aspiracional
> — não existe uma página dedicada, mapeado em
> [`../../tasks/PENDENCIAS.md`](../../tasks/PENDENCIAS.md).
>
> A reforma do vocabulário visual (cores, tipografia, densidade,
> componentes de card/badge/formulário) foi concluída: os tokens vivem em
> `apps/web/src/styles/tokens.css` e os componentes compartilhados
> (`<Card>`, `<StatusBadge>`) substituíram as superfícies ad hoc anteriores.
> Este documento descreve **a estrutura da informação e navegação**, não a
> camada visual.

### Visão geral

Resumo operacional do ambiente.

No estado atual, a landing prioriza uma leitura direta dos projetos detectados:

- quantidade de projetos;
- lista ordenada por prioridade, com tipo, estado, branch e recência;
- ações globais de iniciar e parar servidores junto do título e da contagem de
  projetos;
- ações de escanear novamente e remover workspace separadas no cabeçalho.

A Visão geral não expõe busca textual nem filtro por tipo. Esses controles
pertencem à área de **Repositórios** quando houver necessidade de exploração da
lista completa, evitando duplicar navegação e filtros na landing.

Widgets operacionais consolidados — servidores ativos, processos com falha,
alterações Git e jobs em execução — continuam como evolução possível da Visão
geral sem alterar esse princípio de manter a entrada enxuta.

### Repositórios

Lista completa dos projetos detectados, em grade de cards (`ProjectCard.vue`)
— substituiu a listagem em linhas de tabela. Cada card mostra tipo (avatar
colorido por stack), nome, caminho, branch atual, porta (quando há processo
gerenciado ativo), status do servidor (`<StatusBadge>`) e uma ação de
ativar/desativar discreta (ícone, não um botão vermelho de largura total).
Projetos desativados sempre ordenam para o final da lista
(`sortProjectsByPriority`), depois disso mantendo recência e ordem alfabética
dentro de cada grupo.

Não há busca textual nem filtro por tipo/capacidade/favorito nesta área —
decisão deliberada para manter a listagem enxuta; reavaliar apenas se o
volume de projetos por workspace justificar.

### Processos

Visão consolidada de todos os processos gerenciados.

Informações:

- projeto;
- tipo do processo;
- estado;
- PID;
- porta;
- duração;
- comando;
- ações disponíveis.

### Jobs e logs

Histórico de operações iniciadas pelo dashboard.

Exemplos:

- iniciar servidor;
- executar testes;
- rodar migration;
- instalar dependências;
- realizar pull;
- criar commit.

Cada job deve possuir:

- identificador;
- projeto;
- ação;
- estado;
- início;
- fim;
- exit code;
- saída;
- erro.

### Configurações

Removida (task 237) — chegou a existir como página dedicada (`/settings`)
reunindo retenção de logs/histórico e perfis de ambiente, mas foi retirada da
navegação principal por não justificar uma área própria. Perfis de ambiente
continuam editáveis por projeto (`ProjectEnvironmentPanel`); retenção de
logs/histórico segue configurável apenas por variável de ambiente. Gerenciamento
de workspaces, portas e diagnósticos do ambiente vivem em **Repositórios** e no
Project Doctor, não numa área de configurações dedicada.

## Estrutura do app shell

```text
┌──────────────────────────────────────────────────────────────┐
│ Topbar                                                       │
│ Workspace ativo | busca | command palette | estado da API   │
├───────────────┬─────────────────────────────┬────────────────┤
│ Sidebar       │ Conteúdo principal          │ Atividade      │
│               │                             │ opcional       │
│ Visão geral   │                             │                │
│ Repositórios  │                             │                │
│ Processos     │                             │                │
│ Jobs e logs   │                             │                │
└───────────────┴─────────────────────────────┴────────────────┘
```

O painel de atividade deve ser recolhível e, em telas menores, virar um drawer.

## Hierarquia de entidades

```text
Workspace
└── Project
    ├── Capabilities
    ├── Managed Processes
    ├── Jobs
    ├── Logs
    ├── Git
    ├── Tests
    ├── Scripts
    └── Environment
```

## Workspace

Um workspace representa uma pasta raiz contendo projetos.

Informações exibidas:

- nome;
- caminho;
- estado;
- quantidade de projetos;
- último scan;
- warnings;
- ações.

Ações:

- selecionar;
- escanear;
- editar;
- desabilitar;
- remover do dashboard.

Remover um workspace nunca deve apagar arquivos locais.

## Projeto

O projeto é a principal unidade operacional da interface.

Informações resumidas:

- nome;
- tipo;
- caminho;
- workspace;
- capacidades;
- estado do servidor;
- porta;
- PID;
- branch;
- alterações Git;
- última atividade.

Ações rápidas:

- iniciar;
- parar;
- reiniciar;
- abrir aplicação;
- visualizar logs;
- favoritar;
- abrir detalhes.

## Página de detalhes do projeto

Estrutura atual (`apps/web/src/router/index.ts`):

```text
README
Diagnóstico
Servidor
Logs
Git
Testes
Banco de dados
Dependências
Terminal
Console
Sidekiq/webpack
Variáveis de ambiente
```

As abas disponíveis dependem das capacidades detectadas: **Banco de dados** só quando o projeto
tem suporte a banco detectado; **Dependências** (task 072, reúne Bundler/lockfile Node e build),
**Console** e **Sidekiq/webpack** só para projetos Rails/Node conforme o tipo. Uma IDE embutida com
Monaco e LSP existiu como aba própria **Editor** (task 076 em diante) e foi removida no PR #262. A
aba própria **Assistente IA** (chat/implementação via IA local) existiu depois disso como painel
independente de editor/LSP e foi removida na task 238, que manteve uma Code review simplificada
(Ollama fixo) na aba **Git**; essa Code review foi removida também, num commit posterior sem task
numerada — o produto não tem hoje nenhuma capacidade de IA (ver
[`../architecture/ai-multi-provider.md`](../architecture/ai-multi-provider.md)).

### Visão geral

- identidade do projeto;
- caminho;
- tipo;
- branch;
- capacidades;
- processos;
- ações rápidas;
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

- suíte completa;
- arquivo específico;
- cobertura;
- duração;
- últimos resultados;
- falhas.

### Banco

Exibida principalmente para Rails.

- status de migrations;
- migrate;
- rollback;
- seed;
- prepare;
- tarefas futuras com confirmação.

### Logs

- seleção de processo;
- atualização;
- follow;
- pausa de rolagem;
- filtro;
- copiar;
- limpar visualmente;
- exportação futura.

## Estados visuais

Todo estado deve combinar texto, ícone e cor.

```text
Verde    executando ou saudável
Amarelo  iniciando, encerrando ou atenção
Vermelho falha
Azul     ação em andamento
Cinza    parado, inativo ou desconhecido
```

A cor nunca deve ser o único indicador.

## Estados vazios

Estados vazios devem orientar a próxima ação.

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
Nenhum servidor está em execução.
Inicie um projeto pela lista de repositórios.
```

### Sem logs

```text
Nenhuma saída foi registrada para este processo.
```

## Tratamento de erros

Erros devem informar:

- o que não foi concluído;
- qual entidade foi afetada;
- uma mensagem compreensível;
- uma ação possível.

Não devem exibir stack trace no frontend.

Exemplo:

```text
Não foi possível iniciar fi-editor-api.
O comando bin/rails não foi encontrado.
```

## Confirmações

Ações não destrutivas devem ser rápidas e diretas.

Confirmação explícita será obrigatória para:

- remover workspace;
- excluir branch;
- resetar alterações;
- limpar arquivos;
- resetar banco;
- apagar logs persistidos;
- interromper processo não identificado;
- ações futuras classificadas como destrutivas.

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
- abrir aplicação;
- executar testes;
- navegar para uma área.

Os resultados devem respeitar contexto e capacidades.

## Responsividade

### Desktop

- sidebar fixa;
- conteúdo amplo;
- painel de atividade opcional;
- cards ou tabela.

### Tablet

- sidebar reduzida;
- painel de atividade em drawer;
- métricas em duas colunas.

### Mobile

O uso mobile não é prioritário, mas a interface deve continuar navegável.

- navegação recolhida;
- cards em uma coluna;
- ações agrupadas;
- logs com altura limitada.

## Acessibilidade

Requisitos:

- navegação por teclado;
- foco visível;
- labels em formulários;
- mensagens com `role`;
- contraste adequado;
- ações com nomes acessíveis;
- estados não dependentes somente de cor;
- suporte a redução de movimento;
- semântica HTML correta.

## Densidade da interface

O produto é uma ferramenta profissional de uso frequente.

A interface deve ser compacta, mas não apertada.

Diretrizes:

- grid de 4 e 8 pixels;
- controles entre 32 e 40 pixels;
- tipografia técnica em dados;
- agrupamento claro de ações;
- detalhes progressivos;
- evitar grandes áreas decorativas após a fase inicial.

## Evolução

A estrutura atual é uma visão geral com cards de projeto.

A evolução prevista é:

1. consolidar o app shell;
2. adicionar roteamento;
3. separar páginas;
4. criar detalhe do projeto;
5. adicionar processos globais;
6. adicionar jobs;
7. implementar command palette;
8. acrescentar configurações;
9. otimizar densidade e atalhos.
