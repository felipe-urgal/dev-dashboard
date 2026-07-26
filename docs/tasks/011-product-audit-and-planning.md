# Task 011 — Auditoria integral e planejamento do produto

## Status

Concluída em 26/07/2026.

## Objetivo

Revisar o que existe no CLI, no monorepo web, nos testes e na documentação;
separar entregas reais de intenções antigas; registrar lacunas e organizar uma
sequência futura executável, sem introduzir funcionalidade ou ampliar a
superfície privilegiada da API.

## Método da auditoria

Foram confrontados o histórico Git, manifests, árvore de fontes, contratos,
registro de rotas, navegação Vue, 30 arquivos de teste, tasks 001–010,
arquitetura, segurança, visão do produto, README e roadmap. A validação foi
feita no estado limpo da branch e a documentação foi reconciliada com o código,
não com planos que ainda não foram implementados.

## Inventário confirmado

### CLI Bash

- continua carregado por `init.sh`, independente do web e com fallback sem
  `gum`;
- descobre projetos Rails e Node, gerencia servidores e expõe operações Git,
  Rails, Node, banco, testes, assets, Sidekiq e Webpack;
- não possui suíte própria automatizada e ainda concentra lógica de domínio em
  funções interativas;
- possui uma pendência explícita de desempenho: cache da detecção inicial.

### Fundação web e distribuição

- monorepo npm com contratos, configuração, descoberta e gerenciamento de
  processos em pacotes separados;
- API Fastify local, autenticação por token, origem fechada, schemas de resposta
  e tratamento de erros;
- `npm run dev-web` compila e serve o frontend pela API em origem única, com
  bootstrap efêmero e cookie de sessão restrito;
- diagnóstico, CI, typecheck, build e testes estão configurados;
- não existe `packages/shell-adapter`: a menção era um vestígio documental e foi
  removida.

### Experiência já disponível no navegador

- cadastro, remoção e scan de workspaces, seletor seguro de diretórios e cards
  de projetos;
- detalhe por projeto com servidor, configuração de porta, URLs, logs e limpeza;
- Git somente leitura, testes detectados, banco detectado e catálogo de scripts;
- execução cancelável de testes e itens seguros do catálogo;
- confirmação de risco, histórico persistente e paginado do catálogo;
- logs limitados, retenção e mascaramento central de credenciais;
- acompanhamento SSE das execuções do catálogo, com recuperação HTTP;
- rotas Vue para visão geral, detalhe, Git, testes, banco e scripts.

### Cobertura automatizada

Há cobertura de serviços e rotas da API, segurança e distribuição local,
persistência de configuração, descoberta, Process Manager, proteção/retenção de
logs e utilitários do frontend. Não há testes de componentes Vue montados nem
testes ponta a ponta; portanto, a UI ainda depende de QA manual para os fluxos
integrados.

## Divergências corrigidas

1. A Fase 1 ainda dizia que `dev-web` e o frontend estático estavam pendentes,
   embora a task 006 os tenha concluído.
2. A Fase 5 ainda marcava histórico persistente como pendente, embora a task 009
   o tenha entregue para o catálogo.
3. O README listava apenas as rotas da fundação e descrevia o estado atual como
   se Git, testes, banco, scripts, retenção e SSE não existissem.
4. O roadmap mantinha recomendações de branches anteriores às tasks já
   concluídas e misturava entregas, possibilidades e dívida técnica sem ordem.
5. Os guias de agentes mencionavam um `shell-adapter` que não existe na árvore.

## Lacunas reais

### Produto

- não existe visão global de processos, jobs ou atividade;
- histórico persistente e SSE cobrem o catálogo, mas não servidores e testes;
- Git web não executa mutações e não mostra diff detalhado;
- testes não selecionam arquivo/caso específico nem apresentam cobertura;
- ferramentas Rails do CLI ainda não migraram para o web;
- não existem configurações globais, notificações ou command palette;
- descoberta é apenas um nível abaixo do workspace e não trata bem monorepos.

### Engenharia e operação

- ausência de testes de componentes, E2E, lint e formatação automatizados;
- ausência de release automatizado, changelog e licença;
- suporte oficialmente validado somente em Linux;
- estado local tem formatos versionados pontuais, mas não uma política geral de
  migração e backup;
- documentação da API é manual e pode voltar a divergir do registro real.

### Segurança e limites deliberados

- o modelo é local e mono usuário; acesso remoto permanece proibido;
- não há shell, argumentos ou caminhos arbitrários enviados pelo navegador;
- o arquivo bruto de log pode conter segredos, embora respostas sejam
  mascaradas;
- ações destrutivas, plugins remotos e reexecução automática continuam fora do
  escopo até existir política específica.

## Priorização aprovada

### Agora — coerência operacional

1. Painel de atividade unificado somente leitura.
2. Testes de componentes dos estados críticos e um smoke E2E local.
3. Página global de processos e limpeza segura de estados/logs.

### Depois — valor diário com risco controlado

4. Diff Git somente leitura e, depois, ações mutáveis uma a uma com confirmação
   e histórico.
5. Execução de arquivo de teste e relatório de cobertura por comandos
   reconhecidos.
6. Ferramentas Rails de menor risco: migrations status, routes e Bundler; só
   então migrations mutáveis, seed e rollback.
7. Command palette restrita às ações já autorizadas.

### Futuro — escala e extensibilidade

8. Detecção de monorepos e scan recursivo opt-in com limites.
9. Docker Compose e health checks declarativos.
10. Notificações locais, favoritos, recentes e abertura no editor.
11. Manifesto de extensões declarativas; nunca código remoto arbitrário.
12. Compatibilidade macOS e estratégia explícita para Windows.

## Decisões

- a task seguinte mantém o painel de atividade como primeira prioridade;
- o agregador será uma projeção somente leitura e não duplicará logs, comandos
  ou caminhos;
- histórico de catálogo, estado de testes e processos não serão chamados de
  “unificados” até existir contrato comum e regras claras de retenção;
- qualidade da UI entra na sequência imediata, antes de ampliar muitas ações
  privilegiadas;
- o roadmap passa a usar horizontes e critérios de saída, mantendo as fases
  antigas apenas como mapa de capacidades.

## Arquivos atualizados

- `README.md`;
- `AGENTS.md` e `CLAUDE.md`;
- `docs/roadmap.md`;
- `docs/tasks/README.md`;
- `docs/tasks/NEXT.md`;
- este registro.

## Critérios de aceite

- [x] inventário distingue CLI, web, cobertura e operação;
- [x] entregas 001–010 aparecem como concluídas onde realmente existem;
- [x] lacunas e limites de segurança estão explícitos;
- [x] roadmap possui ordem futura e critérios de saída;
- [x] README descreve capacidades e API atuais;
- [x] próxima task possui escopo detalhado e limitado.

## Limitações

Esta entrega é documental. Ela não valida manualmente cada fluxo em projetos
Rails e Node reais, não mede cobertura de linhas e não transforma ideias futuras
em compromisso de versão. A prioridade deve ser reavaliada após cada entrega.

## PR

Título: `docs: auditar produto e organizar planejamento futuro`

Referência: criada após o commit desta entrega.
