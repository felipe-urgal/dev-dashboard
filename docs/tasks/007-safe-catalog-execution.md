# Task 007 — Execução segura do catálogo

## Status

Concluída em 25/07/2026.

## Objetivo e resultado

O catálogo somente leitura passou a executar scripts Node, tarefas Rails e executáveis conhecidos sem aceitar comando, argumentos ou caminho do navegador. A API redetecta a ação pelo ID, seleciona npm, pnpm ou Yarn por lockfile único, usa o projeto canônico como `cwd` e cria o filho com `shell: false`.

Cada execução expõe estado e trecho limitado de log, aceita cancelamento gradual e bloqueia concorrência no mesmo projeto. A UI confirma ações mutáveis, mantém destrutivas desabilitadas, acompanha progresso e logs e invalida o polling ao trocar de projeto.

Uma correção posterior passou a recuperar a execução mais recente ao reabrir a aba de scripts. Assim, o estado e o log continuam visíveis após navegar para outra página, e uma execução ainda ativa volta a ser acompanhada sem manter o polling do componente desmontado. A restauração também é invalidada quando uma execução nova começa, evitando que uma resposta antiga sobrescreva o acompanhamento atual.

## Decisões de segurança

- IDs são validados contra o catálogo atual; entradas manipuladas são recusadas.
- Mais de um lockfile ou nenhum lockfile bloqueia scripts Node.
- A confirmação de ação mutável usa um token aleatório, vinculado ao projeto e ao ID atual, com validade de um minuto e consumo único.
- Ações destrutivas continuam fora da allowlist executável.
- Logs ficam em arquivo `0600`, retornam no máximo 262144 bytes e preferem o final.
- Existe somente uma execução ativa por projeto.
- O cancelamento usa `SIGTERM`, espera três segundos e escala para `SIGKILL`; no Linux, exige correspondência de `/proc/<pid>/cwd`.
- Todas as rotas possuem schemas explícitos e recebem IDs, nunca caminhos.

## Testes e critérios de aceite

- [x] execução de item atual da allowlist e leitura do log;
- [x] confirmação vinculada para ação mutável;
- [x] rejeição de ID manipulado e lockfiles ambíguos;
- [x] rejeição de confirmação reutilizada e de concorrência durante a detecção;
- [x] localização por ID considera o catálogo completo, inclusive após os primeiros 100 itens;
- [x] estados de execução são apresentados em português brasileiro na UI;
- [x] última execução é restaurada ao sair da página e voltar;
- [x] contratos, API e UI tipados;
- [x] typecheck, build e testes passam.

## Limitações

O histórico de execuções vive na instância atual da API; os arquivos de log sobrevivem ao processo, mas ainda não há índice persistente para recuperá-los após reinício. Scripts Node sem lockfile são deliberadamente recusados. Ações destrutivas não podem ser habilitadas nesta entrega. O conteúdo dos logs ainda não possui mascaramento automático de segredos.

## PR

Título: `feat: executar catálogo com segurança`

Referência: criada após o commit desta entrega.
