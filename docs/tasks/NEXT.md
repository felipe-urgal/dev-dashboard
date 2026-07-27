# Próxima atividade — 035: Configurações seguras de retenção

## Contexto

A paleta encerrou o item de produtividade por teclado do Horizonte 2. O próximo
item do roadmap reúne configurações e notificações. A primeira fatia deve
começar pela preferência operacional de maior impacto já prevista pelo produto:
retenção de logs e históricos dentro de limites seguros, sem permitir caminhos
ou valores arbitrários.

## Objetivo

Permitir consultar e ajustar, em uma tela de configurações, a retenção local de
logs e históricos usando limites fechados e persistência segura, mantendo os
valores efetivos visíveis e auditáveis.

## Plano detalhado

1. Inventariar as variáveis e padrões atuais de retenção dos gerenciadores de
   processo, catálogo e testes, eliminando divergências antes de expor a UI.
2. Definir contrato explícito com valores efetivos, mínimos, máximos e padrões;
   preferir presets fechados quando reduzirem risco e complexidade.
3. Persistir a configuração no diretório privado do dashboard com escrita
   atômica, permissões `0700`/`0600` e validação também na leitura.
4. Adicionar rotas autenticadas de leitura e atualização com schemas completos,
   sem aceitar caminhos e sem disparar limpeza destrutiva implicitamente.
5. Criar a tela de configurações e ligá-la à navegação principal e à paleta,
   deixando claro quando uma mudança passa a valer.
6. Cobrir defaults, limites, arquivo inválido, persistência, autenticação,
   serialização e estados montados da UI; acrescentar smoke E2E somente se a
   fixture puder isolar integralmente a configuração.

## Segurança

- Ler `docs/architecture/security.md` antes de criar as rotas.
- Aceitar somente números/presets limitados; nunca caminho, glob ou comando.
- Derivar todos os arquivos do diretório de estado interno.
- Não apagar logs como efeito colateral de salvar preferências.
- Não enfraquecer os limites máximos de leitura ou a política de mascaramento.

## Fora do escopo

- Notificações do sistema operacional.
- Limpeza manual em massa.
- Escolha de diretório de logs/estado.
- Configurações remotas ou multiusuário.

## Critérios de aceite

- valores efetivos e limites aparecem de forma compreensível;
- valores inválidos são recusados na API e na UI;
- persistência é atômica e privada;
- nenhuma entrada controla caminhos ou comandos;
- `npm run typecheck`, `npm run build` e `npm test` passam.
