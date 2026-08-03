# Próxima atividade

A task 070 concluiu as notificações nativas opt-in. A próxima frente candidata
é substituir os carregamentos textuais das páginas globais por skeletons
acessíveis e reduzir mudanças bruscas de layout durante a carga inicial.

## Loading skeletons acessíveis

Aplicar um padrão compartilhado e discreto de carregamento à Visão geral,
Atividade, Processos e Configurações, preservando a leitura por tecnologias
assistivas e sem simular conteúdo inexistente.

### Escopo proposto

- criar um componente compartilhado de skeleton baseado nos tokens visuais;
- manter mensagens reais com `role="status"` disponíveis para leitores de tela;
- respeitar `prefers-reduced-motion` e desativar a animação nesse modo;
- reservar o espaço aproximado do conteúdo para reduzir layout shift;
- cobrir listas, métricas e painéis sem reproduzir dados sensíveis ou valores
  falsos;
- adicionar testes montados para carregamento, sucesso, erro e movimento
  reduzido nas páginas migradas.

### Decisões antes da implementação

- definir se a primeira fatia cobre as quatro páginas globais ou começa apenas
  pela Visão geral;
- escolher entre um skeleton genérico configurável e pequenas variantes por
  composição;
- definir um atraso mínimo de exibição para evitar flashes em respostas muito
  rápidas.

Nenhum código desta frente foi escrito ainda.
