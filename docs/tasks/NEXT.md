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
- otimização e validação E2E específica para tablet;
- implementação da IDE embutida.

## Sequência aprovada depois da task 075

A IDE dentro do dashboard foi aprovada como uma série incremental. O desenho
completo está em
[`docs/architecture/embedded-ide-ai-design.md`](../architecture/embedded-ide-ai-design.md).

- **Task 076:** Monaco, explorer, abas e leitura segura de arquivos;
- **Task 077:** escrita atômica, conflitos e operações de arquivo;
- **Task 078:** LSP JavaScript/TypeScript;
- **Task 079:** Ruby/Rails LSP;
- **Task 080:** assistência de IA gratuita e local com Ollama;
- **Task 081:** completion inline, fill-in-the-middle e contexto semântico
  opt-in.

A task 076 está detalhada em
[`076-embedded-ide-foundation-plan.md`](./076-embedded-ide-foundation-plan.md).
A sequência não autoriza terminal livre, extensões arbitrárias, provedores
cloud ou alterações autônomas sem revisão em diff.
