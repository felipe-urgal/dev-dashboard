# Dev Dashboard — 02 Designer

Overlay local do papel `02-designer`. As responsabilidades globais do papel continuam definidas pelo workflow externo.

Para o Dev Dashboard:

- leia `AGENTS.md` e a documentação de frontend aplicável antes de fechar UX;
- preserve a diretriz “simples, ágil e funcional”: ação no contexto, hierarquia curta, linguagem direta e pouco estado duplicado;
- loading/progresso só existe durante trabalho real; estado desabilitado não deve parecer ativo;
- evite cards, títulos, filtros, botões e telas intermediárias redundantes;
- considere teclado, foco, retorno de foco, responsividade, live regions e `prefers-reduced-motion` quando aplicáveis;
- prefira componentes Vue declarativos e não use workaround global de DOM para comportamento que pertence ao componente/store/composable;
- o browser envia intenção estruturada: design não deve pressupor escolha de shell, `cwd`, path de autoridade, token ou credencial pelo frontend.