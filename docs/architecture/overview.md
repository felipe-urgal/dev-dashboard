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
- exibir logs;
- descartar respostas assíncronas obsoletas ao trocar de projeto;
- impedir sobreposição das consultas periódicas de processo e logs.

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

Cada instância criada por `buildApp()` recebe um contexto próprio com repositório de
workspaces, store de projetos, gerenciador de processos e configurações de servidor.
As rotas recebem essas dependências explicitamente, o que evita estado global entre
instâncias e permite substituí-las por implementações isoladas nos testes.

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
- mascarar credenciais conhecidas antes de devolver logs às interfaces.

O gerenciador não aceita strings de shell arbitrárias.

## Execução do catálogo

O catálogo de scripts é redetectado no momento da execução. O identificador recebido pela API precisa corresponder a um script `package.json`, tarefa Rails ou executável `bin/` da allowlist atual; comando e argumentos nunca vêm do navegador. A execução possui estado e log limitados, pode ser cancelada e impede duas ações simultâneas no mesmo projeto. O frontend acompanha estado e logs por polling e invalida esse acompanhamento ao trocar de projeto.

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
Estado starting, PID, porta, comando e log são persistidos
        ↓
Process Manager confirma que a porta está aceitando conexões
        ↓
Estado passa para running
        ↓
Saída inesperada é persistida como failed com exitCode
        ↓
Frontend consulta o estado sem reutilizar PID ou URLs obsoletos
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

Para uso local sem Vite, `npm run dev-web` executa diagnóstico e build, valida `apps/web/dist` e inicia somente a API compilada em `http://127.0.0.1:4343`. O comando gera e imprime uma URL com capacidade efêmera no fragmento para autenticar o bootstrap da sessão; origem HTTP isoladamente não concede acesso. A API serve assets versionados com cache imutável, HTML sem cache prolongado e fallback Vue somente fora de `/api`. Porta e diretório podem ser definidos por `DEV_DASHBOARD_API_PORT` e `DEV_DASHBOARD_WEB_DIST`; o modo exige `DEV_DASHBOARD_LOCAL_DISTRIBUTION=1`. O bind permanece fixo no loopback.

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
