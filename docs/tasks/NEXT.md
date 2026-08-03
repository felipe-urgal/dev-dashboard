# Próxima atividade

A task 069 concluiu os favoritos persistentes por projeto. A próxima frente
candidata é aproveitar os eventos e avisos locais já existentes para oferecer
notificações nativas opt-in ao término de execuções longas.

## Notificações nativas opt-in

Avisar fora da aba quando testes, scripts ou builds demorados terminarem, sem
enviar dados a serviços externos e sem pedir permissão antes de uma ação
explícita do usuário.

### Escopo proposto

- adicionar uma preferência local, desativada por padrão, em Configurações;
- solicitar permissão da Notification API somente após clique explícito;
- notificar conclusões de testes, scripts e builds quando a aba estiver oculta;
- reutilizar a deduplicação da central de avisos para não emitir alertas em
  duplicidade;
- limitar título e corpo a metadados seguros já exibidos no dashboard;
- manter fallback integral para a central de avisos quando a API não existir ou
  a permissão for negada.

### Decisões antes da implementação

- definir se a preferência deve ser global ou separada por tipo de execução;
- definir um limiar de duração para evitar notificações de tarefas rápidas;
- decidir se clicar na notificação abre diretamente o projeto e a execução.

Nenhum código desta frente foi escrito ainda.
