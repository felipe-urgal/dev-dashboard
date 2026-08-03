# Atividades pendentes

Inventário consolidado do que ainda falta implementar no Dev Dashboard em
03/08/2026. Este documento elimina duplicações entre o roadmap, a visão de
arquitetura e os planos de task; itens concluídos continuam registrados em
`docs/tasks/`.

## Próximas entregas

- [ ] Aplicar o skeleton compartilhado às páginas Atividade, Processos e
  Configurações, cobrindo carregamento inicial, erro e movimento reduzido.
- [ ] Fazer a auditoria inicial de acessibilidade das páginas globais, com
  teclado, foco, nomes acessíveis, contraste e anúncios de estado.
- [ ] Validar e otimizar a navegação em tablet com E2E responsivo.

## Produto e fluxos operacionais

- [ ] Unificar a política de confirmação por risco e o histórico das mutações
  Git.
- [ ] Criar uma projeção global de atividade que reúna catálogo, testes,
  servidores, Git, Rails e processos sem duplicar suas fontes de verdade nem
  esconder diferenças de retenção.
- [ ] Executar caso ou `describe` de teste específico e persistir relatórios de
  cobertura.
- [ ] Adicionar operações reconhecidas para Sidekiq, Webpack e credenciais
  Rails, mantendo catálogo fechado e mascaramento de segredos.
- [ ] Implementar um adaptador seguro para abrir destinos no navegador local.
- [ ] Adicionar projetos recentes por workspace, complementando os favoritos
  já entregues.
- [ ] Adicionar perfis de ambiente reutilizáveis sem armazenar segredos no
  frontend.
- [ ] Exportar logs com o mesmo mascaramento e os mesmos limites aplicados na
  tela.
- [ ] Avaliar GitHub CLI somente depois de definir seu modelo de autorização.

## Descoberta e projetos complexos

- [ ] Detectar monorepos e oferecer scans recursivos opt-in com limites de
  profundidade, quantidade, timeout e diretórios ignorados.
- [ ] Definir e implementar uma política explícita para symlinks.

## CLI Bash

- [ ] Criar cache da detecção inicial para workspaces grandes.
- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.
- [ ] Criar uma suíte própria para helpers não interativos, incluindo smoke de
  `git-*` e `_dev_*` puros.

## Qualidade e manutenção

- [ ] Expandir o Playwright para os fluxos privilegiados e para a matriz de
  vazio, carregamento, erro, sucesso e troca de projeto.
- [ ] Padronizar lint e formatação com ESLint e Prettier entre `apps/` e
  `packages/`.
- [ ] Medir cobertura e definir metas por camada.
- [ ] Gerar ou verificar a documentação da API a partir dos JSON Schemas e das
  rotas Fastify registradas.
- [ ] Fazer uma revisão dirigida do `npm audit`, inventariando dependências
  transitivas e upgrades seguros sem `npm audit fix --force`.
- [ ] Fazer a segunda etapa de refatoração de
  `git-service.ts` e `script-execution-service.ts`, que ainda ultrapassam 400
  linhas, sem mudar a API pública.

## Distribuição, governança e compatibilidade

- [ ] Automatizar changelog, release e tags de versão.
- [ ] Definir e adicionar a licença do projeto.
- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Publicar a matriz de suporte de sistemas operacionais e runtimes.
- [ ] Validar e implementar compatibilidade com macOS.
- [ ] Definir uma estratégia específica para Windows, considerando diferenças
  de processos, sinais e filesystem.

## Extensibilidade futura

- [ ] Definir um manifesto declarativo de extensões e capacidades.
- [ ] Criar adaptadores versionados e revisados.
- [ ] Permitir temas e painéis adicionais sem execução remota.
- [ ] Projetar o editor de código embutido no navegador com modelo de ameaça
  próprio, allowlist de caminhos, limite de tamanho e decisão explícita entre
  leitura e escrita.

## Avaliado e adiado

- `dev-kill-port`: não deve ser portado enquanto não houver validação segura da
  identidade do processo dono da porta; o comando atual pode encerrar um PID
  alheio ao dashboard.

## Fora do escopo atual

- shell livre, plugins remotos arbitrários e exposição da API na rede;
- integrações de IA como dependência do fluxo principal.

## Como manter este inventário

Ao concluir uma atividade, remova-a daqui, registre o resultado no documento da
task e reconcilie `docs/roadmap.md` e `docs/tasks/NEXT.md`. Ideias novas só
entram nesta lista quando representarem trabalho de produto, engenharia ou
governança ainda necessário; limitações deliberadas permanecem em “Fora do
escopo atual”.
