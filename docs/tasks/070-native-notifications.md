# Task 070 — Notificações nativas opt-in

## Status

Implementação concluída. Typecheck, build e todas as suítes diretamente
afetadas foram aprovados.

## Objetivo

Avisar fora da aba quando testes, scripts ou builds demorados terminarem, sem
enviar dados a serviços externos, sem pedir permissão antes de uma ação
explícita e sem substituir a central de avisos do dashboard.

## Escopo entregue

- Preferência global em Configurações, desativada por padrão e persistida
  somente no `localStorage` do navegador.
- Solicitação da permissão da Notification API somente quando o usuário ativa
  explicitamente o controle.
- Notificações para testes, scripts e builds Docker Compose que durem ao menos
  30 segundos e terminem enquanto a aba estiver oculta.
- Clique na notificação foca a janela e navega para a área do projeto que
  originou a execução.
- Builds passam a publicar também na central de avisos, com a mesma regra de
  transição observada usada pelos demais processos.
- Ausência da API, permissão negada, duração curta, aba visível ou falha ao
  criar a notificação preservam integralmente o aviso interno.
- Indisponibilidade ou falha transitória da Notification API suspendem o envio
  sem apagar a preferência; somente a desativação explícita remove a escolha
  salva.

## Decisões

- A preferência é global porque a permissão pertence à origem do navegador e
  separar por tipo aumentaria a configuração sem benefício proporcional.
- O limiar fixo inicial é de 30 segundos; tarefas mais rápidas continuam
  registradas apenas na central de avisos.
- A notificação nativa é disparada somente depois de a central aceitar o
  `dedupeKey`, portanto reconexões e polling não duplicam alertas do sistema.
- Título e corpo usam apenas tipo, desfecho, nome do projeto e rótulo já
  exibidos no dashboard. Logs, comandos brutos, caminhos, portas e segredos não
  são enviados à Notification API.
- Servidores continuam gerando avisos internos, mas notificações nativas ficam
  restritas ao escopo aprovado de testes, scripts e builds.
- Nenhum endpoint ou contrato da API foi adicionado: a preferência e a
  permissão são específicas do navegador.

## Arquivos principais

- `apps/web/src/stores/native-notifications.ts`
- `apps/web/src/stores/notice-center.ts`
- `apps/web/src/views/SettingsView.vue`
- `apps/web/src/components/ProjectDockerPanel.vue`
- `apps/web/src/composables/useProjectTestProcess.ts`
- `apps/web/src/composables/useScriptExecution.ts`
- `apps/web/src/App.vue`

## Testes e verificação

- `npm run typecheck`: aprovado em todos os workspaces.
- `npm run build`: aprovado.
- `apps/web`: 274 testes aprovados em 63 arquivos, incluindo permissão
  explícita, persistência, limiar, visibilidade da aba, clique/navegação,
  deduplicação e conclusão de build.
- `apps/api`: 354 testes aprovados.
- `packages/core`: 11 testes aprovados.
- `packages/project-discovery`: 1 teste aprovado.
- `scripts`: 6 testes aprovados.
- `packages/process-manager`: 37 testes aprovados e 14 falhas já conhecidas do
  ambiente isolado, ligadas a `uv_interface_addresses`, processos destacados e
  temporização de locks; nenhuma área desse pacote foi alterada.

## Limitações

- O navegador em nuvem bloqueou o acesso a `127.0.0.1` com
  `ERR_BLOCKED_BY_CLIENT`; por isso não houve QA visual automatizado da página
  renderizada neste ambiente.
- A Notification API depende do suporte e da política de permissão do
  navegador e do sistema operacional.
- Como os avisos continuam ligados aos painéis que acompanham cada execução,
  a aba específica precisa estar montada para observar a transição terminal,
  conforme a decisão original da task 040.
