# Próxima atividade

Após o merge do **PR #292 — fallback `offer`**, concluir o **hardening pós-roadmap da arquitetura multi-provider**.

O objetivo é fechar os gaps encontrados na revisão final sem ampliar o escopo funcional dos oito PRs já entregues.

## Escopo obrigatório

1. Registrar `provider` e `mode` no snapshot de cada execution de implementation.
2. Congelar provider/modo no início da execução para evitar race com mudanças posteriores de seleção.
3. Fazer o fallback usar o provider realmente registrado na execução, não a seleção atual da UI.
4. Tornar `PUT /ai/selection` transacional na interface: falha deve restaurar provider/modo persistidos.
5. Não esconder nem preparar um fallback se a troca de provider não for persistida.
6. Remover mensagens específicas do Ollama da fachada genérica `AiAssistantService`.
7. Atualizar schema HTTP e referência de API para expor provider/modo da execução.
8. Atualizar documentação arquitetural e marcar o PR 8 como concluído.
9. Manter `fallback off/offer` como preferência apenas da sessão nesta fase; não ampliar o schema persistido sem necessidade.
10. Manter fallback automático, novo provider e seleção multi-provider da Code review fora do escopo.
11. Rodar typecheck, lint, format, build, docs API, testes e smoke E2E antes do merge.

## Critério de conclusão

O hardening termina quando o snapshot identifica corretamente quem executou, falhas de persistência não deixam UI/backend divergentes, as mensagens genéricas não vazam detalhes do Ollama e toda a suíte obrigatória está verde.
