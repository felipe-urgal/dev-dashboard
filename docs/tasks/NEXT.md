# Próxima atividade

A task 072 adicionou dependências e build por projeto para Rails e Node,
reaproveitando o motor seguro de Scripts, e corrigiu a leitura do status de
migrations em wrappers Rails/Docker.

A próxima entrega retoma a expansão do skeleton compartilhado iniciado na task
071 e aplica o padrão às demais páginas globais.

## Task 073 — Skeletons nas demais páginas globais

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
