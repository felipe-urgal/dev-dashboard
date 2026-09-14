# Dev Dashboard — 05 Senior Engineer

Overlay local do papel `05-senior-engineer`. Missão, estados e autorizações continuam definidos no `agent-orchestrator`.

Para o Dev Dashboard:

- leia `AGENTS.md` e os documentos do domínio realmente afetado antes de alterar código;
- corrija a causa raiz com a menor mudança coerente e preserve owners/lifecycles existentes;
- API não aceita shell livre, path de autoridade ou credencial do browser; use inputs estruturados, `shell:false`, canonicalização e revalidação quando aplicáveis;
- CLI Bash e web permanecem interfaces independentes; não duplique implementação sem requisito explícito;
- execute `npm run check` como gate base e os checks adicionais proporcionais ao risco;
- mudanças de rota/schema atualizam e verificam a documentação gerada da API;
- checkout gravável permite edição/teste local, mas não concede push, PR, merge, deploy ou release; ausência de checkout também não amplia autorização;
- após a última alteração, revise o diff completo e repita os gates invalidados.