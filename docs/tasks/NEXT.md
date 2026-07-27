# Próxima atividade — 024: Smoke E2E visual e responsivo

## Contexto

A reforma visual foi concluída em sete entregas incrementais e a task 023
consolidou a cascata em camadas. A validação atual cobre componentes montados e
contratos estáticos de CSS, mas ainda não abre o produto em um navegador real.
O backlog de qualidade também mantém Playwright/smoke E2E como pendência.

## Objetivo

Criar uma base pequena e reproduzível de smoke E2E para verificar que as rotas
principais renderizam e que tema, densidade e breakpoints continuam operáveis
em navegador real.

## Plano detalhado

1. Definir a menor configuração de Playwright compatível com o monorepo e com
   a origem única usada na distribuição local.
2. Criar fixtures determinísticas para evitar dependência de projetos reais,
   processos locais ou estado pessoal do desenvolvedor.
3. Cobrir dashboard, detalhes de projeto, processos e atividade com ao menos um
   smoke de navegação e renderização por rota.
4. Exercitar as combinações claro/escuro e cômoda/compacta, validando os
   atributos no elemento raiz e sua persistência após recarga.
5. Executar um cenário desktop e um estreito, verificando ausência de overflow
   horizontal e acesso aos controles globais.
6. Adicionar capturas estáveis somente para superfícies determinísticas, com
   política documentada para atualização dos baselines.
7. Integrar o smoke aos scripts e à CI sem duplicar os testes unitários do web.

## Fora do escopo

- Cobertura E2E exaustiva de mutações ou processos do sistema operacional.
- Testes contra projetos reais do diretório pessoal.
- Redesign adicional ou drawer móvel completo.
- Suporte simultâneo a todos os motores de navegador na primeira entrega.

## Critérios de aceite

- smoke executável localmente por um comando documentado;
- fixtures não acessam estado ou segredos pessoais;
- rotas principais abrem sem erro em desktop e largura estreita;
- preferências visuais persistem em navegador real;
- ao menos um baseline visual determinístico protege a cascata consolidada;
- `npm run typecheck`, `npm run build`, `npm test` e o novo smoke passam.
