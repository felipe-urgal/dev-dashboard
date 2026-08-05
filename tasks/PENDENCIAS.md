# Atividades pendentes

Inventário consolidado do que ainda falta implementar no Dev Dashboard em
04/08/2026. Este documento elimina duplicações entre o roadmap, a visão de
arquitetura e os planos de task; itens concluídos continuam registrados em
`docs/tasks/`.

## Próximas entregas

- [ ] Fazer a revisão dirigida do `npm audit` conforme
  `docs/tasks/NEXT.md`, separando risco real, dependências de desenvolvimento e
  upgrades compatíveis sem usar `npm audit fix --force`.

## Assistente de IA e IDE embutida — candidatos ainda sem plano detalhado

- [ ] Contexto semântico via embeddings locais e restauração de abas/estado
  entre sessões, adiados da task 081 — exigem desenho próprio de índice,
  política de exclusão e tela de configurações. A task 086 concluiu que são
  duas frentes distintas, grandes e não bloqueantes; devem permanecer atrás de
  melhorias operacionais menores.
- Teste E2E dedicado para compleção inline (ghost text): **tentado e
  descartado** na task 082 — o Monaco real cancela deterministicamente a
  requisição do provider por causa da própria máquina de debounce/versionamento
  interna do editor (`InlineCompletionsSource`), não por um bug no produto.
  Não reabrir sem uma estratégia diferente (ex. mockar o provider em vez de
  depender do ciclo real do Monaco).
- Smoke E2E dedicado para `propose_workspace_edit` e para as ferramentas
  de símbolo (tasks 083/084 cobriram esses caminhos com testes de unidade;
  estender o double do Ollama da task 082 para emitir os `tool_calls`
  correspondentes fica como possibilidade futura, não bloqueante).

## Produto e fluxos operacionais

- [ ] Executar caso ou `describe` de teste específico e persistir relatórios de
  cobertura — dividir em entregas separadas antes de implementar, porque os
  runners e formatos de relatório diferem.
- [ ] Adicionar projetos recentes por workspace, complementando os favoritos
  já entregues — próxima entrega, task 089; requer semântica e persistência
  próprias.
- [ ] Avaliar GitHub CLI somente depois de definir seu modelo de autorização.

## Descoberta e projetos complexos

- [ ] Detectar monorepos e oferecer scans recursivos opt-in com limites de
  profundidade, quantidade, timeout e diretórios ignorados — a task 086
  confirmou que a descoberta atual lê apenas filhos diretos e que a recursão
  depende também de política explícita para symlinks e deduplicação.
- [ ] Definir e implementar uma política explícita para symlinks.

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Qualidade e manutenção

- [ ] Expandir o Playwright para os fluxos privilegiados e para a matriz de
  vazio, carregamento, erro, sucesso e troca de projeto.
- [ ] Avaliar Prettier e uma política de formatação automática em entrega
  própria, evitando um diff massivo misturado com mudanças funcionais.
- [ ] Medir cobertura e definir metas por camada.
- [ ] Fazer uma revisão dirigida do `npm audit`, inventariando dependências
  transitivas e upgrades seguros sem `npm audit fix --force`.

A task 086 confirmou que esses itens não formam uma única frente coerente:
cada um deve ganhar uma task própria quando houver motivação, escopo e critério
de saída concretos.

## Distribuição, governança e compatibilidade

- [ ] Automatizar release e tags de versão. Fica pendente de uma decisão de
  política de versionamento (cadência de release, formato de tag, se o
  projeto algum dia será publicado — hoje `package.json` raiz tem
  `"private": true`) que não cabe a uma única frente paralela decidir
  sozinha; ver task 093 para o raciocínio da redução de escopo.
- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Publicar a matriz de suporte de sistemas operacionais e runtimes.
- [ ] Validar e implementar compatibilidade com macOS.
- [ ] Definir uma estratégia específica para Windows, considerando diferenças
  de processos, sinais e filesystem.

## Extensibilidade futura

- [ ] Definir um manifesto declarativo de extensões e capacidades.
- [ ] Criar adaptadores versionados e revisados.
- [ ] Permitir temas e painéis adicionais sem execução remota.

## Avaliado e adiado

- `dev-kill-port`: não deve ser portado enquanto não houver validação segura da
  identidade do processo dono da porta; o comando atual pode encerrar um PID
  alheio ao dashboard.

## Fora do escopo atual

- shell livre, plugins remotos arbitrários e exposição da API na rede;
- integrações de IA como dependência do fluxo principal (o assistente
  continua opcional, local e isolado em seu próprio painel).

## Como manter este inventário

Ao concluir uma atividade, remova-a daqui, reconcilie `docs/roadmap.md`, `docs/tasks/NEXT.md` e o mapa acima.
