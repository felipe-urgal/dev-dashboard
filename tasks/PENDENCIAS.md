# Atividades pendentes

Inventário do que ainda falta implementar no Dev Dashboard. Este documento
lista só trabalho em aberto; itens concluídos ficam registrados em
`tasks/<NNN>-*.md` — `docs/` guarda apenas documentação viva do produto, não
o histórico de entregas.

## Regras para qualquer entrega

O Dev Dashboard evolui sem interromper o CLI Bash. Toda entrega web deve manter
a API em `127.0.0.1`, usar catálogo fechado de ações, receber apenas IDs e
valores validados do navegador e preservar schemas explícitos de resposta.

Antes de concluir uma entrega:

```bash
npm run typecheck
npm run build
npm test
```

## Assistente de IA e IDE embutida — candidatos ainda sem plano detalhado

- [ ] Contexto semântico via embeddings locais e restauração de abas/estado
  entre sessões — exigem desenho próprio de índice, política de exclusão e
  tela de configurações; duas frentes distintas, grandes e não bloqueantes,
  atrás de melhorias operacionais menores.
- Smoke E2E dedicado para `propose_workspace_edit` e para as ferramentas de
  símbolo (já cobertos por testes de unidade; estender o double do Ollama
  para emitir os `tool_calls` correspondentes fica como possibilidade futura,
  não bloqueante).

## Produto e fluxos operacionais

- [ ] Executar caso ou `describe` de teste específico e persistir relatórios de
  cobertura — dividir em entregas separadas antes de implementar, porque os
  runners e formatos de relatório diferem.
- [ ] Avaliar GitHub CLI somente depois de definir seu modelo de autorização.

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Qualidade e manutenção

- [ ] Expandir o Playwright para operações de banco de dados
  (snapshot/restore) — exige um serviço de banco na fixture.
- [ ] Avaliar Prettier e uma política de formatação automática em entrega
  própria, evitando um diff massivo misturado com mudanças funcionais.
- [ ] Medir cobertura e definir metas por camada.

Esses itens não formam uma única frente coerente: cada um deve ganhar uma
task própria quando houver motivação, escopo e critério de saída concretos.

## Distribuição, governança e compatibilidade

- [ ] Automatizar release e tags de versão. Fica pendente de uma decisão de
  política de versionamento (cadência de release, formato de tag, se o
  projeto algum dia será publicado — hoje `package.json` raiz tem
  `"private": true`) que não cabe a uma única frente paralela decidir
  sozinha.
- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Publicar a matriz de suporte de sistemas operacionais e runtimes.
- [ ] Validar e implementar compatibilidade com macOS.
- [ ] Definir uma estratégia específica para Windows, considerando diferenças
  de processos, sinais e filesystem.

## Extensibilidade futura

- [ ] Definir um manifesto declarativo de extensões e capacidades.
- [ ] Criar adaptadores versionados e revisados.
- [ ] Permitir temas e painéis adicionais sem execução remota.
