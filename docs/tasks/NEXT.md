# Próxima atividade — 027: Testes de arquivo/caso específico

## Contexto

A série "Git em etapas" do Horizonte 2 está concluída (branch na task 016,
pull/push na 025, commit/stash na 026). O roadmap aponta "testes focados"
como a próxima frente: hoje o catálogo de testes
(`packages/contracts/src/test.ts`, `TestDetectionService`) só reconhece
comandos de suíte inteira (`vitest`, `jest`, `rspec`, `rails-test`, etc.);
não há como rodar um arquivo ou caso específico, nem relatório de cobertura,
nem histórico persistente equivalente ao já existente para o catálogo de
scripts (`ScriptExecutionService`, tasks 007-010).

## Objetivo

Permitir executar um arquivo de teste específico (e, quando o runner
suportar de forma simples, um caso/describe nomeado) reconhecido pela
detecção existente, com o mesmo padrão de segurança do catálogo de scripts:
catálogo fechado, sem shell arbitrário, execução cancelável, logs limitados
e mascarados.

## Plano detalhado

1. Estender `ProjectTestCommand`/`TestDetectionService` para expor, quando o
   runner suportar (`vitest`, `jest`, `rspec`, `rails-test`, `minitest`,
   `pytest`), uma forma de compor o comando com um caminho de arquivo
   validado contra o diretório do projeto — reaproveitando a validação de
   path já usada no diff Git (`ensurePathInsideProject`, task 015) como
   referência.
2. Decidir e documentar, por runner, a sintaxe suportada para "arquivo
   específico" e se um nome de caso/describe é aceito nesta etapa ou fica
   para uma entrega seguinte (evitar tentar suportar sintaxe arbitrária de
   todos os runners de uma vez).
3. Reaproveitar o motor de execução já existente para o catálogo de scripts
   (processo sem shell, cancelamento, log limitado e mascarado) em vez de
   duplicar um segundo executor.
4. Expor rota(s) privadas para listar arquivos de teste elegíveis de um
   projeto e para iniciar a execução de um arquivo específico, seguindo o
   catálogo fechado de ações já estabelecido.
5. Adicionar ao painel de testes do detalhe do projeto uma forma de escolher
   um arquivo e disparar sua execução, com log e cancelamento como as demais
   execuções.
6. Cobrir com testes de serviço (composição do comando por runner, rejeição
   de path fora do projeto) e de rota; ao menos um teste montado do painel.

## Fora do escopo

- Relatório de cobertura (fica para uma entrega seguinte desta mesma série).
- Histórico persistente e eventos SSE para execuções de teste (a infra já
  existe para o catálogo de scripts; migrar/generalizar é decisão
  arquitetural própria, não uma extensão implícita desta task).
- Suporte a sintaxe de caso/describe para todos os runners — só os que
  tiverem uma forma simples e seringa de expressar isso na CLI.
- Watch mode ou execução contínua.

## Critérios de aceite

- é possível escolher um arquivo de teste reconhecido e executá-lo
  isoladamente, com cancelamento e log como as demais execuções;
- um caminho fora do projeto ou não reconhecido pela detecção é recusado
  antes de qualquer execução;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
