# Task 023 — Consolidação do CSS legado

## Status

Concluída.

## Objetivo

Concluir o passo 7 da reforma visual de 2026, reduzindo o ponto de entrada
legado, tornando a ordem da cascata explícita e fazendo as áreas ativas
responderem aos tokens de tema.

## Escopo entregue

- `styles.css` foi reduzido a um ponto de entrada compatível de duas linhas.
- A cascata passou a importar, nesta ordem, tokens, base, layout, componentes e
  utilitários.
- Regras ativas foram distribuídas entre `base.css`, `layout.css`,
  `components.css` e `utilities.css` sem alterar a ordem relativa da folha
  original.
- As cores literais remanescentes foram substituídas pelos tokens semânticos
  existentes; valores hexadecimais ficaram restritos à definição dos temas em
  `tokens.css`.
- Seletores comprovadamente sem referência foram removidos. Famílias montadas
  dinamicamente a partir de conjuntos fechados, como tipos de projeto e estados
  de processo, foram preservadas.
- Um teste de arquitetura verifica o limite do ponto de entrada, a ordem das
  camadas, seletores estruturais críticos, famílias legadas e cores literais.

## Decisões e limitações

A separação preserva a cascata existente: reset e elementos globais ficam na
base, o shell e a navegação em layout, e regras de telas e responsividade em
componentes. `utilities.css` nasce deliberadamente pequeno e não deve virar um
depósito de exceções.

A consolidação não altera templates nem fluxos de produto. A validação visual
automatizada permanece limitada pela ausência de navegador instalado no
ambiente; a próxima task cria uma base E2E reproduzível para cobrir essa lacuna.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

O teste específico de arquitetura CSS também integra `npm test` do workspace
web. A inspeção estática cobre todas as rotas por meio de seus seletores
estruturais; tema, densidade e larguras responsivas continuam definidos pelas
mesmas media queries e atributos do shell.

## Fora do escopo

- Alteração da arquitetura de navegação ou novos componentes.
- Drawer móvel.
- Adoção de biblioteca externa de estilos.
- Suíte E2E com capturas de tela.
