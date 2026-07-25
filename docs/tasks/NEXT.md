# Próxima atividade — 007: Execução segura do catálogo

## Objetivo

Permitir executar itens do catálogo já detectado sem aceitar comandos arbitrários, com processo observável, cancelável e confirmação proporcional ao risco.

## Plano detalhado

1. Definir contratos de ação, execução, estado, risco e trechos de log.
2. Criar allowlist fechada que reconstrói comando e argumentos no servidor a partir do identificador catalogado.
3. Selecionar npm, pnpm, Yarn ou Bundler pelo lockfile, rejeitando ambiguidades inseguras e ausência do gerenciador.
4. Classificar ações em risco baixo, médio e alto; exigir confirmação explícita e vinculada à ação para os níveis previstos.
5. Integrar ao Process Manager sem `shell: true`, sempre com `cwd` canônico fornecido pelo `ProjectStore`.
6. Persistir metadados mínimos, limitar logs e permitir cancelamento com `SIGTERM`, tolerância e `SIGKILL` somente quando necessário.
7. Impedir concorrência incompatível por projeto e tratar PID reutilizado e estado obsoleto.
8. Expor rotas com schemas explícitos, IDs em vez de caminhos/comandos e códigos de erro estáveis.
9. Implementar UI de confirmação, progresso, cancelamento e logs, invalidando estado ao trocar de projeto.
10. Cobrir allowlist, lockfiles, confirmação, concorrência, cancelamento, limites de log e rejeição de entradas manipuladas.
11. Atualizar arquitetura, segurança, README e registro da task.

## Fora do escopo

- terminal arbitrário no navegador;
- execução remota ou multiusuário;
- elevação de privilégio genérica;
- pipelines distribuídos ou histórico permanente completo.

## Critérios de aceite

- nenhuma string livre do navegador chega a `spawn`;
- cada execução corresponde a item atual da allowlist e usa o gerenciador determinado por lockfile;
- ações de risco exigem confirmação adequada e não reutilizável;
- processos podem ser cancelados e seus logs permanecem limitados;
- API e UI tratam concorrência, expiração e troca de projeto;
- typecheck, build e testes passam.
