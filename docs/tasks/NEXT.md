# Próxima atividade — 012: Painel de atividade unificado

## Objetivo

Criar uma visão global, somente leitura, das atividades reconhecidas pelo
dashboard, agregando referências aos estados já pertencentes a execuções do
catálogo, testes e servidores sem copiar logs, comandos, PIDs ou caminhos para
um novo armazenamento.

## Premissas confirmadas pela auditoria

- o catálogo possui histórico persistente e paginado;
- testes e servidores possuem estado gerenciado próprio, mas não histórico
  equivalente ao catálogo;
- os três domínios têm ciclos de vida diferentes e não devem fingir a mesma
  durabilidade;
- a primeira versão deve informar a origem e a disponibilidade real do detalhe,
  em vez de preencher dados inexistentes;
- a visão é uma projeção. A fonte de verdade continua em cada domínio.

## Plano detalhado

1. Definir em `packages/contracts` uma união discriminada e fechada para
   atividade de `script`, `test` e `server`, com ID opaco, projeto, workspace,
   origem, estado normalizado, instante e referência interna tipada.
2. Documentar a correspondência entre estados dos três domínios, incluindo
   estados sem instante terminal e itens que deixam de existir após limpeza.
3. Implementar um serviço agregador sem persistência própria. Ele consultará
   somente stores e serviços já autorizados e descartará projetos que não
   pertençam aos workspaces atuais.
4. Expor `GET /api/activities` com schemas explícitos e filtros fechados por
   `workspaceId`, `projectId`, `origin`, `status`, `page` e `pageSize`.
5. Aplicar limites de página, ordenação determinística e cursor/critério de
   desempate documentado. Não aceitar caminho, comando, texto livre ou ID de
   log.
6. Criar página global `/activity` com filtros, paginação, estado vazio, erro,
   carregamento e aviso de que a retenção varia por origem.
7. Direcionar cada item para a sub-rota segura do projeto. Quando o detalhe já
   tiver expirado, manter metadados mínimos e apresentar indisponibilidade sem
   tentar recuperar arquivo diretamente.
8. Aplicar cancelamento por `AbortController` e geração de requisição ao trocar
   filtros ou navegar, evitando sobreposição e respostas obsoletas.
9. Cobrir contrato, serialização, isolamento entre workspaces, filtros,
   paginação, ordenação, referências expiradas e utilitários do frontend.
10. Adicionar pelo menos um teste de componente montado para estados vazio,
    carregando, erro e sucesso, inaugurando a camada de testes de UI priorizada
    na auditoria.
11. Atualizar README, arquitetura, segurança, roadmap e registro da task com o
    comportamento efetivamente entregue.

## Fora do escopo

- persistência ou retenção nova para testes e servidores;
- cópia ou busca global no conteúdo de logs;
- SSE global, WebSocket ou fila de eventos;
- reexecução, cancelamento ou qualquer ação mutável pelo painel;
- auditoria multiusuário;
- filtros de texto livre;
- comandos e caminhos fornecidos pelo navegador.

## Critérios de aceite

- atividades disponíveis aparecem em uma única visão e identificam sua origem;
- a UI não promete histórico que o domínio de origem não persiste;
- agregação não amplia acesso a projeto, processo ou log;
- filtros e paginação possuem limites e schemas explícitos;
- ordenação é estável e respostas obsoletas não alteram a tela;
- cada link preserva o contexto e usa apenas rotas autorizadas existentes;
- há cobertura de API, domínio e ao menos um componente Vue;
- `npm run typecheck`, `npm run build` e `npm test` passam.

## Riscos a validar antes da implementação

- custo de listar históricos de vários projetos sem leitura ilimitada do disco;
- semântica de data para processos restaurados ou ainda ativos;
- paginação correta ao combinar fontes com retenções distintas;
- dependência de uma biblioteca de montagem Vue sem ampliar desnecessariamente
  as dependências de teste;
- comportamento quando um workspace é removido durante a consulta.

## Sequência posterior esperada

Após esta entrega: testes de componentes e smoke E2E adicionais, página global
de processos e, só então, diff Git somente leitura.
