# Próxima atividade

A task 087 completa o fluxo de diagnóstico local: servidor, testes e scripts
podem exportar exatamente o snapshot já limitado e mascarado pela API, sem rota
para o arquivo bruto. A task 088, executada em paralelo, adicionou a primeira
suíte automatizada para helpers não interativos do CLI Bash. A auditoria da
task 086 classificou projetos recentes por workspace como a próxima melhoria
operacional de maior valor diário.

## Task 089 — Projetos recentes por workspace

### Objetivo

Destacar, em cada workspace, os projetos acessados mais recentemente para
reduzir o tempo de retomada, complementando os favoritos persistentes sem
substituir a descoberta ou alterar os repositórios locais.

### Decisão principal

Um projeto conta como acessado quando o usuário entra em qualquer rota de
detalhe desse projeto no navegador. A interface envia apenas o identificador do
projeto conhecido; a API deriva o workspace e persiste o horário de acesso em
um arquivo privado.

A visita à visão geral, scans automáticos, polling, command palette e consultas
de processos não devem alterar a ordem de recentes. O evento representa uma
navegação deliberada para o projeto, não atividade técnica em segundo plano.

### Escopo

- criar um repositório privado de projetos recentes, seguindo o padrão de
  favoritos:
  - arquivo versionado no diretório de configuração;
  - escrita atômica, diretório `0700` e arquivo `0600`;
  - limite fechado por workspace e limite global;
  - entradas compostas somente por identificador de projeto, workspace e
    horário ISO;
- adicionar rota autenticada para registrar acesso por `projectId`, sem aceitar
  caminho ou horário do navegador;
- validar que o projeto existe no `ProjectStore` e possui workspace conhecido;
- manter referências de projetos temporariamente ausentes sem expô-las na UI,
  removendo apenas por limite/idade definida;
- registrar a visita ao entrar ou trocar para uma rota de detalhe de projeto,
  com deduplicação client-side para não repetir a mesma gravação em mudanças de
  aba internas;
- devolver os metadados de recente junto da projeção de projetos ou em uma
  resposta fechada equivalente, sem criar uma segunda fonte de descoberta;
- ordenar a visão geral por:
  1. favoritos;
  2. recentes do workspace ativo;
  3. demais projetos em ordem alfabética;
- manter a estrela de favorito como prioridade explícita: um favorito não perde
  posição por ser antigo;
- exibir no máximo cinco recentes por workspace, com indicação discreta de
  acesso relativo ou absoluto acessível;
- adicionar testes do repositório, rota, integração com navegação, ordenação,
  limites e rollback/falha;
- atualizar segurança, roadmap, pendências e documentação da task.

### Política inicial

- reter no máximo 20 identificadores por workspace e 500 no total;
- exibir somente os cinco mais recentes presentes no scan atual;
- atualizar `lastAccessedAt` no servidor com o relógio da API;
- não sincronizar entre computadores;
- não gravar dados no repositório do projeto;
- não registrar acesso em `localStorage` como fonte de verdade.

### Critérios de aceite

- abrir um projeto o move para a seção/ordem de recentes do workspace correto;
- navegar entre abas do mesmo projeto não gera múltiplas gravações
  desnecessárias;
- favoritos permanecem acima dos recentes;
- projetos de outro workspace não afetam a ordenação do workspace ativo;
- uma referência ausente não quebra scans nem listagens e volta a valer quando
  o projeto reaparece;
- reiniciar a API preserva os recentes;
- o navegador envia somente `projectId`;
- arquivo e diretório usam permissões privadas e escrita atômica;
- limites impedem crescimento indefinido;
- typecheck, build, testes e smoke E2E continuam aprovados.

### Testes esperados

- repositório:
  - gravação e restauração;
  - atualização move o projeto para o topo sem duplicar;
  - separação por workspace;
  - limites por workspace e global;
  - arquivo inválido degrada de forma segura;
- API:
  - projeto conhecido registra acesso;
  - projeto inexistente é recusado;
  - corpo adicional e caminhos são rejeitados;
  - horário vem do servidor;
- frontend:
  - entrada em detalhe registra uma vez;
  - troca de aba interna não repete a chamada;
  - troca de projeto registra o novo identificador;
  - favoritos, recentes e demais mantêm a ordem definida;
  - falha ao registrar não bloqueia a navegação.

### Fora do escopo

- histórico completo de navegação;
- métricas de uso ou telemetria;
- sincronização remota;
- recentes globais misturando workspaces;
- remoção manual individual na primeira versão;
- ranking por frequência;
- registrar ações em background como acesso;
- alterar os identificadores estáveis de projeto;
- substituir favoritos por recentes.
