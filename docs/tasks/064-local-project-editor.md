# Task 064 — Abrir o projeto no editor local

## Status

Concluída.

## Objetivo

Levar ao dashboard web a próxima capacidade seletiva de paridade com o CLI:
abrir o projeto atual em um editor gráfico conhecido, sem aceitar comandos ou
caminhos livres do navegador.

## Escopo entregue

- catálogo fechado de Visual Studio Code, Cursor, VSCodium, Sublime Text e
  Zed;
- detecção dos executáveis disponíveis no `PATH` da API;
- preferência opcional via `DEV_EDITOR`, restrita ao catálogo;
- rota autenticada de consulta dos editores disponíveis;
- rota autenticada para abrir o editor usando o caminho canônico do
  `ProjectStore`;
- processo destacado, sem shell e sem captura de saída;
- ação compacta no cabeçalho do projeto, com seletor apenas quando necessário;
- estados de carregamento, indisponibilidade, sucesso e erro na interface;
- desenho de segurança em `docs/architecture/local-editor-design.md`.

## Critérios de aceite

- o navegador envia somente `projectId` e `editorId`;
- IDs fora do catálogo são recusados pelo schema;
- projetos ausentes retornam `PROJECT_NOT_FOUND`;
- editor ausente retorna `EDITOR_NOT_AVAILABLE` sem tentar executar processo;
- a execução usa `shell: false`, `cwd` canônico e um único argumento de
  caminho definido pela API;
- com um editor disponível, a ação exige um único clique;
- com vários, o usuário consegue escolher antes de abrir.

## Validação

- testes unitários do serviço de editor;
- testes das rotas e dos schemas de entrada/saída;
- testes montados do componente Vue;
- `npm run typecheck`;
- `npm run build`;
- `npm test`: API aprovada com 327 testes e frontend aprovado com 252 testes.

A suíte global chega ao `process-manager`, onde mantém 12 falhas preexistentes
do ambiente isolado: `os.networkInterfaces()` é bloqueado e alguns processos
destacados não preservam a semântica esperada. Nenhuma falha envolve os arquivos
ou contratos desta task.

## Limitações

- aliases e funções de shell não são detectados;
- a disponibilidade depende do `PATH` herdado pela API;
- editor embutido no navegador continua adiado para o Horizonte 4.

## PR

[#145](https://github.com/felipe-urgal/dev-dashboard/pull/145)
