# Próxima atividade — 032: Diagnóstico Bundler (somente leitura)

## Contexto

Com a task 031, a frente "Rails de baixo risco" cobre detecção de banco,
inicialização de serviço local, status de migrations, rotas e operações
mutáveis de banco com confirmação. O roadmap ainda lista, na mesma frente,
"diagnóstico Bundler" como pendente (`docs/roadmap.md`, seção "Banco e
ferramentas Rails"). Hoje não há nenhuma visão sobre o estado das gems de um
projeto Rails/Ruby — se o `Gemfile.lock` está desatualizado, se há gems
desatualizadas ou se `bundle check` aponta problema de instalação.

## Objetivo

Mostrar, no detalhe de um projeto Rails (ou qualquer projeto com Gemfile),
um diagnóstico somente leitura do Bundler: se o bundle está instalado e
consistente (`bundle check`) e quais gems estão desatualizadas
(`bundle outdated`), sem instalar, atualizar ou modificar nada.

## Plano detalhado

1. Detectar projetos com `Gemfile` (não restrito a `type: 'rails'`, já que
   Bundler também é usado por gems/bibliotecas Ruby puras) e resolver o
   comando (`bundle`, sempre disponível via Gemfile — não há variante
   bin/binstub aqui como em `bin/rails`).
2. Rodar `bundle check` (saída curta: instalado e satisfeito, ou lista de
   dependências faltando) e `bundle outdated` (lista de gems com versão
   atual/mais nova) como leitura pontual, reaproveitando o padrão de
   `RailsInspectionService` (execução via `execFile`, sem processo
   gerenciado, timeout curto). Ambos os comandos podem demorar em projetos
   grandes (`bundle outdated` resolve a árvore de dependências) — considerar
   um timeout mais generoso que o das outras leituras desta service (ex.
   30-45s) e comunicar claramente na UI quando expira.
3. Parsear a saída de `bundle outdated` (formato texto padrão: uma linha por
   gem desatualizada, com nome, versão instalada, versão mais nova e,
   opcionalmente, se é uma major/minor/patch) para uma estrutura tipada.
   Avaliar se existe uma flag de saída mais estruturada (`--parseable` ou
   similar) antes de escrever um parser de texto livre novo.
4. Expor rota privada somente leitura (ex.
   `GET /api/projects/:projectId/bundler`), reaproveitando o padrão de
   projeto-não-suportado já usado em testes/banco/migrations.
5. Adicionar um painel (ou seção dentro de um painel existente, a decidir
   olhando para onde faz mais sentido na navegação atual — banco, scripts,
   ou uma aba nova) mostrando o resultado de `bundle check` e a lista de
   gems desatualizadas, com busca simples se a lista for grande.
6. Testes de serviço (parsing de `bundle outdated` com gems desatualizadas e
   com nenhuma pendência, projeto sem Gemfile, timeout/falha do comando
   degradando graciosamente), teste de rota, e ao menos um teste montado do
   painel.

## Fora do escopo

- `bundle update`, `bundle install` ou qualquer mutação de dependências.
- Sidekiq, Webpack ou generators (itens separados na mesma linha do
  roadmap, cada um merece sua própria investigação de escopo).
- Auditoria de segurança de dependências (`bundle audit` ou equivalente) —
  pode ser uma entrega futura relacionada, mas não faz parte desta.
- Diagnóstico de gems por múltiplos Gemfiles/gemsets no mesmo projeto.

## Critérios de aceite

- o detalhe de um projeto com Gemfile mostra o resultado de `bundle check`
  e a lista de gems desatualizadas, sem executar nenhuma mutação;
- projetos sem Gemfile continuam funcionando sem erro, apenas sem a seção;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
