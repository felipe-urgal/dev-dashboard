# Task 074 — Runtime do banco e layout de Dependências

## Status

Implementação concluída. Typecheck e testes diretamente afetados foram
aprovados.

## Objetivo

Eliminar a ambiguidade entre bancos locais e serviços Docker que publicam a
mesma porta, além de tornar o painel de Dependências mais compacto, estável e
legível em diferentes larguras.

## Escopo entregue

- Runtime de cada ambiente classificado como local, Docker, parado ou
  desconhecido, sem confundir conectividade TCP com origem do processo.
- Serviços Compose correspondentes identificados por driver e porta publicada.
- Iniciar ou reiniciar pela aba Banco encerra primeiro o container
  correspondente e assume o serviço systemd local.
- Parar pela aba Banco encerra tanto o Compose correspondente quanto o serviço
  systemd local.
- Runtime e nomes dos serviços Docker visíveis nos detalhes do ambiente.
- Ações da UI adaptadas ao estado: iniciar local, migrar de Docker para local,
  reiniciar local ou parar todos os runtimes compatíveis.
- Painel de Dependências com grupos e ações mais compactos, cabeçalho de
  execução em grid, log com altura controlada e breakpoints para desktop,
  tablet e celular.
- `aria-busy` no painel e nome acessível no inspetor de execução.

## Decisões

- A correspondência Docker usa somente metadados detectados do Compose e a
  porta publicada; nenhum nome de serviço livre é aceito do navegador.
- A aba Banco representa o runtime local. A aba Docker continua sendo o lugar
  para iniciar serviços Compose intencionalmente.
- A ação coordenada de parada usa o catálogo interno já detectado e não encerra
  processos arbitrários que apenas ocupem a porta.
- O estado `local` significa que a porta está acessível e nenhum Compose
  compatível foi identificado; `unknown` permanece para hosts remotos ou sem
  dados suficientes.

## Arquivos principais

- `packages/contracts/src/database.ts`
- `apps/api/src/services/database-detection-service.ts`
- `apps/api/src/services/docker-compose-service.ts`
- `apps/api/src/http/response-schemas/rails.ts`
- `apps/web/src/components/ProjectDatabasePanel.vue`
- `apps/web/src/components/ProjectDatabasePanel.template.html`
- `apps/web/src/components/ProjectDependenciesPanel.vue`
- `apps/web/src/components/ProjectDependenciesPanel.css`
- `apps/api/test/database-detection-service.test.ts`
- `apps/api/test/docker-compose-service.test.ts`
- `apps/web/test/project-database-panel.test.ts`
- `apps/web/test/project-dependencies-panel.test.ts`

## Testes e verificação

- 27 testes direcionados de API aprovados.
- 12 testes direcionados de componentes web aprovados.
- `npm run typecheck` e `npm run build` aprovados em todos os workspaces.
- `apps/api`: 362 testes aprovados.
- `apps/web`: 283 testes aprovados em 65 arquivos.
- `packages/core`: 11 testes aprovados.
- `packages/project-discovery`: 1 teste aprovado.
- `scripts`: 6 testes aprovados.
- `packages/process-manager`: 38 testes aprovados e 13 falhas já conhecidas do
  ambiente isolado, relacionadas a `uv_interface_addresses`, processos
  destacados e temporização de locks; nenhuma área desse pacote foi alterada.

## Limitações

- Serviços Compose sem porta publicada conhecida não podem ser associados com
  segurança a um ambiente local.
- Um container que continue ativo quando o Docker CLI/daemon estiver
  indisponível não pode ser encerrado automaticamente; a tentativa local
  retornará o erro seguro do serviço se a porta continuar ocupada.
- A auditoria transversal de acessibilidade permanece para a task 075.
