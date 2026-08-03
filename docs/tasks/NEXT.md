# Próxima atividade

A task 074 coordenou os runtimes local e Docker do banco e refinou o painel de
Dependências. A próxima entrega faz a primeira auditoria transversal de
acessibilidade sobre os fluxos mais usados.

## Task 075 — Auditoria inicial de acessibilidade

Revisar Visão geral, Atividade, Processos e Configurações com critérios
objetivos de teclado, foco, nomes acessíveis, contraste e comunicação de
estado, corrigindo apenas problemas confirmados.

### Escopo proposto

- percorrer as quatro páginas somente por teclado e registrar ordem de foco,
  foco visível e ausência de armadilhas;
- verificar landmarks, títulos, labels, nomes acessíveis e relações
  `aria-describedby`;
- revisar `role="status"`, `role="alert"` e `aria-busy` para evitar silêncio ou
  anúncios duplicados;
- medir contraste dos tokens usados em texto, bordas, badges e controles;
- adicionar uma verificação automatizada de acessibilidade compatível com a
  suíte montada ou E2E existente;
- corrigir os achados confirmados e documentar os casos que exigirem uma task
  própria.

### Fora desta fatia

- redesenho visual ou mudança de arquitetura da informação;
- certificação formal de conformidade;
- otimização e validação E2E específica para tablet.
