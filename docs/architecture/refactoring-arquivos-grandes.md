# Refatoração de arquivos grandes — registro histórico

## Status

**Concluída.** Este documento não representa backlog ativo.

O plano original foi executado em múltiplas fases para reduzir arquivos monolíticos sem alterar comportamento. O detalhamento linha a linha foi removido desta documentação viva porque descrevia inventários e etapas já concluídos que rapidamente ficaram desatualizados.

Trabalho futuro de refatoração deve nascer em issue quando houver problema concreto; não recrie `tasks/`, `NEXT.md` ou um novo roadmap versionado.

## Resultado permanente

As decisões que continuam válidas são:

- separar responsabilidades quando um arquivo concentra domínios independentes;
- preservar fachadas/barrels quando isso evita churn desnecessário de imports;
- manter regras de domínio fora de componentes Vue quando puderem ser testadas isoladamente;
- preferir composables/serviços apenas quando existe responsabilidade/lifecycle real;
- quebrar CSS por responsabilidade sem alterar cascata/ordem incidentalmente;
- manter composition roots legíveis sem esconder dependências em singletons;
- refatorações mecânicas não devem mudar contrato/comportamento junto sem necessidade;
- validar o mesmo gate de qualidade depois da reorganização.

## Principais resultados da execução

O trabalho histórico incluiu, entre outros:

- divisão de rotas/schemas HTTP grandes por domínio;
- divisão da API web por áreas mantendo barrels compatíveis;
- separação de CSS grande por responsabilidade;
- extração de estilos/composables de componentes Vue extensos;
- remoção/fragmentação da antiga camada de enhancers vanilla-DOM;
- divisão do `ProcessManager` em módulos internos por responsabilidade;
- divisão posterior de serviços grandes como Git/Script Execution.

O objetivo não era perseguir um limite rígido de linhas. O critério continua sendo responsabilidade, clareza, testabilidade e lifecycle.

## Política atual

Não abra uma refatoração apenas porque um arquivo ultrapassou um número arbitrário de linhas.

Antes de dividir, confirme pelo menos uma razão concreta:

- responsabilidades independentes;
- fronteira de segurança;
- lifecycle próprio;
- repetição real;
- dificuldade de teste/manutenção causada pelo acoplamento atual.

Se o arquivo é longo porque descreve um único contrato coerente, tamanho isolado não é motivo suficiente.

## Fonte de verdade

O estado atual da arquitetura está em:

- [`overview.md`](overview.md);
- [`repository-structure.md`](repository-structure.md);
- [`runtime-flows.md`](runtime-flows.md);
- [`../development-guide.md`](../development-guide.md).

Histórico específico da execução permanece nos commits/PRs correspondentes.
