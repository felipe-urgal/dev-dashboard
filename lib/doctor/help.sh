#!/usr/bin/env bash
# ============================================================
# DOCTOR HELP — Mensagem de ajuda
# ============================================================
dev-help() {
  cat <<EOF
Dev Dashboard — Comandos disponíveis

Gerenciamento:
  dev-tools              → Dashboard interativo (funciona sem gum, modo texto)
  dev-servers            → Lista servidores em execução
  dev-status             → Status de portas e servidores
  dev-status-all         → Status detalhado de todos os projetos
  dev-stop <projeto>     → Para um servidor
  dev-stop-all           → Para TODOS os servidores
  dev-start-all          → Inicia todos os servidores parados
  dev-logs <projeto>     → Exibe logs (less +F ou tail -f)
  dev-kill-port <porta>  → Mata processo na porta
  dev-clean              → Remove PIDs órfãos

Abrir projetos:
  dev-open <projeto>     → Abre o projeto no navegador (http://localhost:porta)
  dev-sublime <projeto>  → Abre o projeto no editor (Sublime Text ou \$DEV_EDITOR)
  dev-terminal <projeto> → Abre um terminal (subshell) no diretório do projeto

IA (requer o comando 'claude'):
  dev-claude <projeto>      → Abre uma sessão nova do Claude Code no projeto
  dev-ai-continue <projeto> → Continua a conversa mais recente no projeto (--continue)
  dev-ai-resume <projeto>   → Abre o seletor de sessões anteriores (--resume)
  dev-ai-review <projeto>   → Abre o Claude Code já pedindo /code-review do diff atual
  dev-ai-qa <projeto>       → Abre o Claude Code já pedindo /verify das mudanças atuais
  dev-ai-security <projeto> → Abre o Claude Code já pedindo /security-review das mudanças
  dev-ai-simplify <projeto> → Abre o Claude Code já pedindo /simplify (reuso/eficiência)

Rails (apenas para projetos Rails):
  (via menu interativo) - comandos: migration, model, db:migrate, db:create, db:rollback, rspec, rake
  (via menu Banco) - db:snapshot / db:restore: backup rápido do banco antes de trocar de branch

Git (via menu interativo git-tools, ou diretamente):
  git-tools              → Menu interativo do Git Helper
  git-new                → Cria uma nova branch
  git-switch             → Troca para outra branch local
  git-commit             → Commit guiado (amend, mensagem, add)
  git-save "mensagem"    → Commit rápido (add + commit com prefixo automático)
  git-publish            → Publica a branch atual (com opção --force)
  git-pr                 → Cria/gerencia a Pull Request da branch atual (via gh)
  git-update             → Atualiza a main a partir do remote
  git-delete             → Remove uma branch local
  git-undo               → Desfaz alterações em arquivos selecionados
  git-status-diff        → Visualiza alterações e diffs
  git-log                → Visualiza histórico de commits

Backup e restauração do estado local:
  dev-backup [--include-secrets] → Empacota config/estado do dashboard web num .tar.gz (~/.dev-dashboard-backups)
  dev-restore <arquivo.tar.gz>   → Restaura um backup criado por dev-backup (pede confirmação)

Outros:
  dev-doctor             → Verifica dependências
  dev-help               → Esta ajuda

Dica: configure \$DEV_EDITOR para seu editor preferido (ex: export DEV_EDITOR="code").
EOF
}