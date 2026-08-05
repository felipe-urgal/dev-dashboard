# Frentes paralelas

`NEXT.md` continua reservado para o plano detalhado da **próxima entrega
única**, atualizado só quando a task corrente é concluída (ver
`tasks/README.md`). Este documento é diferente: uma lista curada de
candidatas do inventário (`PENDENCIAS.md`) que **não competem pelos mesmos
arquivos**, para quando mais de uma pessoa/agente está implementando ao
mesmo tempo. Antes de pegar uma linha daqui, confira a coluna "Conflito
conhecido" contra o que já está em andamento.

Ao começar uma atividade desta lista, marque-a com o branch/PR em uso; ao
terminar, mova o resultado para `tasks/README.md` (com o número de task
seguinte livre) e remova a linha daqui.

## Em andamento

Nenhuma frente paralela registrada no momento.

## Livres para pegar em paralelo

Nenhuma candidata livre no momento — ver "Exigem decisão de arquitetura"
abaixo para o que falta destravar.

## Exigem decisão de arquitetura antes de começar (não pegar direto)

Não são "livres" — cada uma precisa de uma definição de escopo antes de
virar código:

- caso/`describe` de teste específico e cobertura (por runner);
- detecção de monorepos e scans recursivos (`packages/project-discovery`);
- Prettier e política de formatação automática — definir regras antes,
  porque rodar `--fix` depois toca praticamente todo `apps/`/`packages/` e
  colide com qualquer branch aberto.

## Concluídas recentemente (referência)

- Task 103 — Segunda etapa de refatoração: `GitService` e
  `ScriptExecutionService` divididos por domínio, sem mudar API pública.
- Task 104 — ESLint 9 em flat config para TypeScript/Vue/scripts, com
  `npm run lint`/`lint:fix` ligados ao CI.
- Task 105 — Revisão dirigida do `npm audit`: os dois únicos achados vêm de
  uma cópia vendorizada de DOMPurify dentro do `monaco-editor` (já na versão
  estável mais recente, sem upgrade patch/minor real disponível); risco
  documentado, nenhuma dependência alterada.
