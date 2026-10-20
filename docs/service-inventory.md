# Inventário local de serviços (somente leitura)

O Dev Dashboard apresenta observações de serviços locais sem gerenciar automaticamente recursos externos. O contrato de observação **não é** uma autorização para iniciar, parar, reiniciar ou alterar políticas de boot.

## API

Ambas as rotas usam a autenticação local existente do Dashboard.

- `GET /api/services/inventory`: inventário de unidades `systemd --user` e do sistema, com estado de execução e configuração de boot. Retorna resultados parciais quando o bus de um dos escopos estiver indisponível.
- `GET /api/services/catalog`: catálogo agregado de unidades systemd, containers Docker, serviços Compose com ownership registrado, Managed Processes e evidências de portas do Port Inspector.

Os providers `systemd`, `docker`, `compose`, `managed-process` e `ports` reportam estados de disponibilidade separados. A resposta tem limites de tamanho; `truncated: true` significa que **nem todos** os serviços/portas conhecidos foram incluídos. Não use o catálogo como fonte única para operações administrativas.

### Limites e paginação

- O inventário de systemd tem no máximo 200 entradas por leitura; o catálogo agrega no máximo 250 entradas, até 100 portas, até 12 projetos Compose, até 100 containers Docker e até 250 processos.
- Ambas as rotas aceitam `?offset=0&limit=100` (limit entre 1 e 100). Sem parâmetros, preservam o formato legado (sem `page`) para clientes existentes.
- Com parâmetros, a resposta inclui `page: { offset, limit, hasMore, incomplete }`. `hasMore` representa somente as entradas ainda presentes **na captura limitada atual**; `incomplete=true` indica truncamento anterior e impede assumir que o host foi totalmente enumerado. A página não é um cursor estável: consultas repetidas podem observar estados diferentes.
- A API usa lista de propriedades systemd obtida em lotes de no máximo 40 units, consultas apenas leitura com timeout de CLI e isolamento de erro por escopo. Providers opcionais do catálogo têm deadline de 8 segundos por consulta; falha/timeout não apaga resultados de outros providers.

## Semântica de estados

- `displayName`, `evidence.source` e `evidence.identity` identificam a origem observada; **não** comprovam autorização para mutação. O contrato unificado `ServiceObservation` reporta `capabilities.observe=supported` e `start/stop/restart/boot-policy=unsupported` neste endpoint read-only. Controle explícito, quando existir, possui contrato separado de vínculos e confirmação.
- `enabledAtBoot` é apenas a projeção observada de `UnitFileState` para units systemd (inclusive `static`, `masked`, `transient` e `unknown`); não indica se estão executando. `activeState`/`subState` são observados separadamente de readiness.
- `fragmentKind` indica somente classe genérica de origem da unit; o `FragmentPath` original não é retornado. Templates, instâncias, units transient e generated são classificados sem atribuir gerenciamento. Socket activation não comprova health.
- `state=running` significa que o runtime foi observado ativo; **não** significa que a aplicação está pronta para requisições.
- `readiness=ready` é exposto somente para serviços Compose com health check que retorna `healthy`; os demais ficam `unknown` salvo evidência específica.
- `ownership=confirmed` representa um registro de ownership resolvido nos domínios Compose/Process Manager existentes. Contêineres Docker vistos apenas pelo CLI e unidades systemd são `unmanaged`, mesmo quando seus nomes sugerem vínculo com um projeto.
- Portas de host são evidências auxiliares. Portas abertas, PIDs e nomes de processo, isoladamente, não autorizam associação ou ação administrativa.
- Recursos de user-systemd e system-systemd possuem identidades distintas e não são intercambiáveis. Os dados de Environment Instances são expostos somente quando conhecidos pelo Process Manager.

## Falhas e limitações

- Diagnóstico read-only em Linux, sem alterar serviços reais: `systemctl --user list-units --type=service --all`, `systemctl list-unit-files --type=service`, `docker container ls --all` e `ss -ltnp`. Comandos dependem das permissões disponíveis na sessão da API, especialmente o bus `--user` (que pode não existir em containers).
- O Dashboard não usa `sudo` e não eleva permissões para consultar serviços. DBus/systemd inacessível, Docker ausente ou falta de permissão produzem status `partial`, `unavailable` ou `unsupported`, sem revelar erro bruto de ferramenta.
- A inspeção Compose é restrita a registros de ownership previamente persistidos para projetos conhecidos; projetos sem registro não são adotados.
- Observação Docker usa `docker container ls --all` apenas para listar containers do host. Não executa `docker start`, `docker stop` ou `docker inspect`.
- Serviços de produção e dependências compartilhadas não são gerenciados pelo inventário. Vínculos explícitos, preview e autorização de mutações pertencem às issues #1115, #1116 e #1117.
- O catálogo ainda não substitui os painéis especializados Docker Compose, Process Manager, Stacks ou Port Inspector.

## Validação recomendada

Executar os testes `docker-container-observer.test.ts`, `service-catalog-service.test.ts`, `service-catalog-routes.test.ts` e os testes systemd/port inspector existentes; validar `npm run check` e os E2E do pipeline antes de disponibilizar mudanças.

Referências: epic #1113, inventário #1114, Stacks #1072.
