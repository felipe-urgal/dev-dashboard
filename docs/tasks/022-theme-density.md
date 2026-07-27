# Task 022 — Tema e densidade na navegação global

## Status

Concluída.

## Objetivo

Transformar tema e densidade em preferências persistentes, aplicadas ao elemento `<html>`, e migrar a sidebar para o vocabulário visual compartilhado sem alterar sua arquitetura de navegação.

## Escopo entregue

- Módulo tipado de preferências com conjuntos fechados para tema (`dark|light`) e densidade (`comfortable|compact`), defaults seguros e tolerância a indisponibilidade ou conteúdo inválido do `localStorage`.
- Aplicação das preferências no bootstrap e também a cada mudança, sempre por `data-theme` e `data-density` no elemento raiz.
- Dois controles segmentados na sidebar, com rótulos em português, botões nativos operáveis por teclado, foco visível e seleção exposta por `aria-pressed` além da cor.
- Migração das superfícies, contornos, cores, tipografia, raios, sombras e espaçamentos da sidebar para tokens existentes.
- Densidade compacta limitada ao shell: reduz espaçamento da marca, navegação, workspace e controles sem comprimir o conteúdo das views.
- Testes unitários para normalização e aplicação e teste montado para interação e restauração após uma nova montagem.

## Decisões e limitações

O tema escuro e a densidade cômoda permanecem defaults para preservar o comportamento atual. Falhas de acesso ao armazenamento não impedem o uso: a escolha continua aplicada na sessão. Em largura estreita, a navegação mantém o comportamento responsivo já existente e os controles permanecem disponíveis no cabeçalho empilhado; um drawer móvel continua fora do escopo.

O tema claro evidencia que áreas ainda mantidas no CSS legado possuem cores escuras próprias. A sidebar e os componentes já migrados respondem aos tokens; a remoção dessas regras remanescentes é o próximo passo explícito do roteiro.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

Foram adicionados três casos automatizados para as preferências visuais. As quatro combinações de tema e densidade são representadas pelos atributos fechados cobertos pela suíte. Não foi possível gerar captura automatizada porque o ambiente não disponibiliza Chromium, Chrome, Playwright ou Puppeteer; a estrutura responsiva e os estados selecionados foram validados pela suíte montada e pelo build do frontend.

## Fora do escopo

- Drawer móvel completo ou mudança da arquitetura de informação.
- Sincronização das preferências pela API.
- Remoção integral das regras legadas das views e topbar.
