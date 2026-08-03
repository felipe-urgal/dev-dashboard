# Próxima atividade

A task 071 validou o componente compartilhado de skeleton na Visão geral. A
próxima entrega aplica o mesmo padrão às outras páginas globais e fecha a
matriz de estados diretamente afetada.

## Task 072 — Skeletons nas demais páginas globais

Aplicar carregamentos acessíveis e visualmente estáveis a Atividade, Processos
e Configurações, reutilizando o padrão já aprovado sem esconder dados válidos
durante atualizações em segundo plano.

### Escopo proposto

- mapear o carregamento inicial real de cada página e não criar estados
  artificiais;
- reutilizar `LoadingSkeleton` e compor apenas as variantes necessárias para
  listas ou painéis com forma materialmente diferente;
- manter mensagens com `role="status"`, `aria-busy` no contêiner correto e o
  atraso visual de 150 ms;
- preservar conteúdo já carregado durante refresh silencioso sempre que isso
  representar corretamente o estado;
- manter erros acionáveis e estados vazios reais depois da carga;
- adicionar testes montados para carregamento, sucesso, erro, desmontagem do
  timer e ausência de flash;
- validar `prefers-reduced-motion` e os tamanhos responsivos sem depender da
  animação para comunicar estado.

### Fora desta fatia

- auditoria abrangente de teclado, foco e contraste das páginas globais;
- validação E2E específica para tablet;
- mudanças nos contratos ou endpoints da API.
