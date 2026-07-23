# Visão geral da arquitetura

## Contexto

O Dev Dashboard começou como um conjunto modular de scripts Bash carregados diretamente no shell.

Essa implementação continua útil por oferecer acesso rápido a projetos locais, operações Git, servidores Rails e Node, banco de dados, testes e outras ferramentas de desenvolvimento.

A evolução web não substitui imediatamente o CLI. Ela adiciona uma segunda interface e cria uma arquitetura compartilhada que permitirá reduzir gradualmente o acoplamento entre regras de negócio e menus interativos.

## Objetivos arquiteturais

A arquitetura deve:

- preservar o funcionamento do CLI existente;
- permitir uma interface profissional no navegador;
- reutilizar regras entre CLI, API e frontend;
- impedir execução arbitrária de comandos;
- manter todos os serviços limitados ao computador local;
- operar com múltiplos workspaces;
- suportar projetos Rails e Node;
- acompanhar processos persistentes;
- oferecer logs e estados estruturados;
- permitir testes automatizados das regras centrais.

## Visão de alto nível

```text
┌──────────────────────────────────────────────────────┐
│ Interfaces                                           │
├──────────────────────────┬───────────────────────────┤
│ CLI Bash                 │ Dashboard Vue             │
│ dev-tools                │ http://127.0.0.1:5173     │
└─────────────┬────────────┴──────────────┬────────────┘
              │                           │ HTTP
              │                           ▼
              │              ┌─────────────────────────┐
              │              │ API Fastify             │
              │              │ http://127.0.0.1:4343   │
              │              └────────────┬────────────┘
              │                           │
              ▼                           ▼
┌──────────────────────────────────────────────────────┐
│ Núcleo da aplicação                                  │
├──────────────────────────────────────────────────────┤
│ Contracts                                            │
│ Core                                                 │
│ Project Discovery                                    │
│ Process Manager                                      │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│ Sistema operacional e ferramentas locais             │
├──────────────────────────────────────────────────────┤
│ Filesystem │ Git │ Rails │ Ruby │ Node │ npm │ MySQL │
└──────────────────────────────────────────────────────┘
```

## Monorepo

O projeto utiliza npm workspaces.

```text
apps/
├── api/
└── web/

packages/
├── contracts/
├── core/
├── process-manager/
└── project-discovery/
```

Essa organização permite que aplicações e bibliotecas sejam versionadas juntas, mas mantenham responsabilidades separadas.

## Aplicação web

Localização:

```text
apps/web
```

Tecnologias:

- Vue 3;
- TypeScript;
- Vite;
- componentes Vue SFC;
- Fetch API.

Responsabilidades:

- apresentar workspaces;
- apresentar projetos detectados;
- exibir estados;
- solicitar ações à API;
- mostrar erros de forma compreensível;
- acompanhar processos;
- exibir logs.

O frontend não deve executar comandos locais nem acessar diretamente o filesystem.

## API local

Localização:

```text
apps/api
```

Tecnologias:

- Node.js;
- TypeScript;
- Fastify;
- JSON Schema.

Responsabilidades:

- validar requisições;
- gerenciar workspaces;
- solicitar scans;
- disponibilizar projetos;
- iniciar e parar processos;
- fornecer logs;
- traduzir erros internos em respostas HTTP;
- manter a API limitada a `127.0.0.1`.

A API atua como fronteira de segurança entre o navegador e o sistema operacional.

## Contratos compartilhados

Localização:

```text
packages/contracts
```

Contém tipos compartilhados como:

- `Workspace`;
- `Project`;
- `ManagedProcess`;
- `ProcessLogSnapshot`;
- `Job`.

Os contratos não devem conter lógica de infraestrutura ou depender de aplicações específicas.

## Core

Localização:

```text
packages/core
```

Responsabilidades atuais:

- persistir workspaces;
- validar caminhos cadastrados;
- gerar identificadores;
- evitar duplicidade;
- remover configurações;
- abstrair o caminho do arquivo de configuração.

O `core` não depende de Fastify ou Vue.

## Project Discovery

Localização:

```text
packages/project-discovery
```

Responsabilidades:

- receber um workspace;
- listar candidatos;
- identificar Rails;
- identificar Node;
- detectar capacidades;
- gerar identificadores estáveis;
- retornar warnings por diretório;
- ignorar diretórios internos e dependências.

A descoberta não deve exibir prompts ou depender de interfaces interativas.

## Process Manager

Localização:

```text
packages/process-manager
```

Responsabilidades:

- selecionar comandos conhecidos;
- iniciar servidores;
- definir o diretório de execução;
- escolher portas;
- persistir estado;
- validar processos existentes;
- encerrar grupos de processos;
- armazenar logs;
- fornecer trechos limitados de logs.

O gerenciador não aceita strings de shell arbitrárias.

## Persistência

### Configuração

Caminho padrão:

```text
~/.config/dev-dashboard/config.json
```

Alternativas:

```text
DEV_DASHBOARD_CONFIG_DIR
XDG_CONFIG_HOME
```

Conteúdo atual:

```json
{
        "version": 1,
        "workspaces": []
}
```

### Estado

Caminho padrão:

```text
~/.local/state/dev-dashboard
```

Alternativas:

```text
DEV_DASHBOARD_STATE_DIR
XDG_STATE_HOME
```

Subdiretórios:

```text
processes/
logs/
```

Arquivos de configuração e estado são criados com permissões restritas ao usuário sempre que possível.

## Fluxo de workspace

```text
Usuário cadastra uma pasta
        ↓
API valida a requisição
        ↓
Core resolve o caminho real
        ↓
Workspace é persistido
        ↓
Usuário solicita scan
        ↓
Project Discovery analisa os diretórios
        ↓
Projetos estruturados são armazenados pela API
        ↓
Frontend renderiza os projetos
```

## Fluxo de processo

```text
Usuário clica em Iniciar
        ↓
Frontend envia projectId
        ↓
API procura o projeto detectado
        ↓
Process Manager escolhe um comando permitido
        ↓
Processo é iniciado sem shell
        ↓
PID, porta, comando e log são persistidos
        ↓
Frontend consulta o estado
```

## Fluxo de encerramento

```text
Usuário clica em Parar
        ↓
API procura o processo persistido
        ↓
Process Manager verifica se o PID existe
        ↓
No Linux, compara /proc/<pid>/cwd com o projeto
        ↓
Envia SIGTERM ao grupo
        ↓
Aguarda encerramento
        ↓
Usa SIGKILL somente quando necessário
        ↓
Persiste o estado stopped
```

## Processo de desenvolvimento

O comando:

```bash
npm run dev
```

inicia API e frontend.

Comandos de validação:

```bash
npm run typecheck
npm run build
npm test
```

## Estratégia de migração do Bash

A migração deve ser incremental.

1. Manter funções Bash atuais funcionando.
2. Identificar comportamentos reutilizáveis.
3. Criar operações não interativas.
4. Implementar essas regras em pacotes testáveis.
5. Fazer o CLI e a API consumirem o mesmo núcleo.
6. Remover duplicações somente depois de validar paridade.

Não devemos reescrever todo o CLI antes que a nova arquitetura comprove seu valor.

## Próximos componentes

A arquitetura deverá incorporar:

- repositório de projetos persistentes;
- status Git;
- executor de operações Git;
- jobs;
- eventos Server-Sent Events;
- execução de testes;
- scripts Node;
- operações Rails;
- adaptador para abrir editor e navegador;
- autenticação local;
- command palette;
- histórico de ações.

## Critérios para novos módulos

Um módulo novo deve:

- ter responsabilidade clara;
- não depender da interface;
- aceitar dados estruturados;
- retornar dados estruturados;
- validar entradas;
- ser testável isoladamente;
- não executar shell arbitrário;
- não acessar caminhos fora do escopo autorizado;
- expor erros identificáveis.
