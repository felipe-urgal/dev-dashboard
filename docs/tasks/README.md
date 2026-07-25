# Registro de tasks

Cada entrega funcional deve possuir um documento numerado nesta pasta. O documento registra objetivo, escopo, decisões, arquivos alterados, critérios de aceite, testes automatizados, roteiro de QA, limitações, resultado e referência do PR.

`NEXT.md` descreve a próxima atividade aprovada em detalhe. Ao concluir uma task, o registro atual deve ser atualizado com os resultados reais e `NEXT.md` deve ser substituído pelo próximo plano.

## Status

- `001-project-git.md` — implementação da visão Git somente leitura.
- `002-project-tests.md` — implementação da visão de testes do projeto.
- `003-project-database.md` — inspeção e inicialização segura de serviços locais de banco via systemd, com autorização polkit compatível com a API destacada.
- `004-project-scripts.md` — catálogo seguro e somente leitura de scripts Node, tarefas Rails e executáveis conhecidos, com encerramento do grupo da detecção Rails no timeout.
- `005-roadmap-audit.md` — reconciliação do roadmap com o produto atual e diagnóstico não destrutivo do ambiente web.
- `006-local-web-distribution.md` — distribuição local em origem única, frontend estático, sessão segura de navegador e comando `dev-web`.
- `007-safe-catalog-execution.md` — execução segura e cancelável dos itens reconhecidos do catálogo, com confirmação por risco, logs limitados e restauração da última execução ao voltar para a página.
