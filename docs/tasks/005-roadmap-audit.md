# 005 — Auditoria do roadmap e diagnóstico de ambiente

## Status

Implementada e validada por testes automatizados.

## Objetivo

Reconciliar o roadmap original com o estado real do dashboard antes de ampliar a
execução de scripts e fechar uma lacuna objetiva da consolidação da fundação: um
diagnóstico reproduzível do ambiente web.

## Resultado da auditoria

- as fases 2 e 3 já possuem app shell, navegação por URL e detalhe de projeto,
  mas ainda não estão concluídas porque faltam páginas globais, componentes de
  experiência e histórico recente;
- a fase 4 possui a consulta Git somente leitura; todas as mutações permanecem
  deliberadamente pendentes;
- a fase 5 já executa suítes detectadas, cancela processos e acompanha logs, e
  possui um catálogo de scripts ainda sem execução;
- os quatro itens restantes da fase 1 não deveriam continuar escondidos atrás
  de entregas funcionais posteriores. O diagnóstico foi concluído nesta task;
  empacotamento local, `dev-web` e frontend servido pela API formam a próxima
  entrega por serem partes do mesmo fluxo operacional;
- itens antigos do backlog que já estavam entregues (CI, testes do Process
  Manager, rotas Fastify e rotação/retenção de logs) foram marcados como tais.

## Escopo entregue

- comando `npm run doctor`;
- validação da faixa de Node declarada pelo projeto;
- detecção de npm, Git e dependências instaladas;
- inspeção não destrutiva das portas locais da API e do Vite;
- resultado agregado com erro para requisito obrigatório ausente e aviso para
  porta ocupada;
- testes unitários da faixa de versões e da classificação dos resultados;
- roadmap reescrito com status e checklists aderentes ao código existente;
- README atualizado para refletir as funções que já estão disponíveis.

## Decisões

1. Portas ocupadas são avisos, não erros: podem indicar uma instância legítima
   do dashboard já em execução.
2. O diagnóstico não instala, encerra nem altera nada no ambiente.
3. Ruby, Bundler e gerenciadores Node são dependências dos projetos
   cadastrados, não requisitos para iniciar o dashboard; sua avaliação por
   projeto fica para uma tela de diagnósticos futura.
4. A produção local será tratada como uma única entrega. Não será criado um
   `dev-web` que apenas esconda dois servidores de desenvolvimento e perpetue a
   lacuna do build final.

## Critérios de aceite

- [x] o roadmap distingue itens concluídos, parciais e pendentes;
- [x] lacunas de fundação têm prioridade explícita antes da execução de scripts;
- [x] o diagnóstico retorna código diferente de zero quando falta requisito;
- [x] o diagnóstico não modifica o computador;
- [x] a faixa de Node coincide com `package.json`;
- [x] testes automatizados cobrem sucesso, erro e aviso.

## Limitações conhecidas

- o diagnóstico atual é da instalação do dashboard, não de cada projeto;
- as portas são verificadas por tentativa de bind e podem mudar de estado logo
  após a verificação;
- a próxima entrega ainda precisa definir a autenticação segura do frontend
  servido pela própria API, sem embutir o token local no bundle.

## Validação

- `npm run doctor`: aprovado, sem erros ou avisos;
- testes unitários do diagnóstico: 2 aprovados;
- `npm run typecheck`: aprovado;
- `npm run build`: aprovado;
- `npm test`: aprovado após estabilizar a observação do encerramento de processos.

## Ajuste após CI

- a espera pelo evento de saída do filho passou a participar do encerramento
  gerenciado. Isso evita interpretar um processo já encerrado como ativo quando
  o grupo ainda contém uma entrada transitória no sistema operacional;
- o prazo para consumir o evento de saída aumentou de 100 ms para 1 segundo,
  eliminando a corrida em que o estado terminal era persistido antes do
  `exitCode` ficar disponível sob carga na CI.

## QA e code review

- revisão do fluxo confirmou que `SIGTERM` continua sendo enviado ao grupo
  inteiro e que `SIGKILL` só é usado quando o grupo não desaparece no prazo;
- após `SIGKILL`, o evento de saída do filho é aceito como confirmação para não
  depender da remoção imediata de entradas transitórias do grupo pelo sistema
  operacional;
- a suíte do Process Manager passou em três execuções consecutivas, com 32
  testes aprovados em cada rodada;
- a suíte completa passou também com Node.js 24, a mesma versão usada no
  workflow de CI;
- o diagnóstico foi executado com Node.js 24 e manteve os dois testes aprovados;
- não foram encontrados novos problemas bloqueantes ou alterações adicionais
  necessárias no escopo da task.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
