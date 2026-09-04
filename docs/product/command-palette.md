# Command Palette global

A Command Palette é uma camada global de navegação rápida do Dev Dashboard. O primeiro MVP é deliberadamente pequeno: ele encontra destinos e troca de contexto, mas não executa comandos nem mutações.

## Atalho

Use `Ctrl+K` no Linux/Windows ou `Cmd+K` no macOS em qualquer rota principal.

O mesmo atalho fecha a palette quando ela já está aberta. `Esc` também fecha e devolve o foco ao elemento que estava ativo antes da abertura.

## O que pode aparecer

O catálogo inclui:

- páginas globais, como Visão geral, Processos, Produção e Banco de dados;
- workspaces conhecidos;
- projetos conhecidos pelo frontend;
- ferramentas de projeto que apenas navegam para uma superfície existente.

As ferramentas são filtradas pelo estado real do projeto. Capacidades como Servidor, Git, Testes e Produção só entram no catálogo quando a capability correspondente existe e o projeto está habilitado.

Dependências aparece somente para projetos Rails ou Node. Variáveis de ambiente, Diagnóstico e README são destinos de leitura/configuração já existentes e não executam um processo apenas por serem abertos.

## Busca

A busca é fuzzy e também considera nome, ID, caminho e aliases do projeto. Consultas com mais de um termo usam combinação por tokens: cada termo precisa corresponder a algum token real do destino. Assim, `financeiro git` encontra a ferramenta Git do projeto financeiro sem aceitar resultados apenas porque as letras aparecem espalhadas pelo texto de busca.

Prefixos opcionais:

- `/` limita a busca a páginas e ferramentas navegáveis;
- `@` limita a busca a projetos e workspaces.

Itens usados recentemente aparecem primeiro quando a busca está vazia.

## Limite de segurança do MVP

A palette não é um shell e não é um executor de ações.

Neste primeiro corte:

- não existe entrada de comando arbitrário;
- não há start/stop de servidor;
- não há execução de testes ou scripts;
- não há mutações Git;
- Terminal e Console não entram no catálogo, porque navegar para essas rotas hoje inicia uma sessão interativa automaticamente;
- workers que possam iniciar runtime também ficam fora do catálogo.

Qualquer evolução para ações estruturadas deve ser tratada como uma nova fronteira: contrato fechado, autorização explícita quando necessária, confirmação proporcional ao risco e testes próprios. Ela não deve ser adicionada implicitamente ao catálogo de navegação.

## Arquitetura

`apps/web/src/command-palette-navigation.ts` contém o catálogo e o filtro de navegação sem montar Vue. Essa separação permite testar capabilities, rotas e busca como dados puros.

`CommandPalette.vue` fica responsável apenas pela interação: abrir/fechar, foco, teclado, recentes, troca de workspace e `router.push`.

O componente é montado uma única vez em `App.vue`, portanto o atalho permanece disponível durante a navegação entre as rotas principais.
