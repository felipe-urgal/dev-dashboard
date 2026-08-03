# Próxima atividade

A task 077 já possui leitura, busca, edição versionada, salvamento atômico e
operações estruturais com preview e confirmação proporcional ao risco. A última
fatia fecha coerência externa e mudanças em múltiplos arquivos antes do LSP.

## Conclusão da Task 077 — WorkspaceEdit, watcher e conflito em três vias

Introduzir uma unidade central de mudanças que possa ser reutilizada pelo LSP e
pela assistência local sem permitir aplicação autônoma ou estado parcial.

### Escopo proposto

- criar um contrato `WorkspaceEdit` com criação, alteração, renomeação e
  exclusão de um ou mais arquivos;
- gerar preview consolidado por arquivo antes de qualquer aplicação;
- exigir confirmação explícita para o conjunto completo;
- vincular a confirmação às versões e fingerprints observadas no preview;
- aplicar mudanças em ordem determinística;
- criar backups temporários privados somente durante a aplicação;
- executar rollback quando uma etapa intermediária falhar;
- reportar claramente operações aplicadas, revertidas e que exigem intervenção;
- adicionar watcher limitado somente aos arquivos abertos no Monaco;
- sinalizar alteração, renomeação ou exclusão externa sem polling global;
- apresentar comparação em três vias: versão aberta, disco atual e edição;
- permitir escolher recarregar disco, manter edição ou copiar trechos, sem merge
  automático;
- atualizar explorer, abas e modelos incrementalmente;
- cobrir rollback, colisão, expiração, TOCTOU e eventos externos duplicados.

### Critérios principais

- nenhuma mudança múltipla é aplicada sem preview e confirmação;
- versões divergentes invalidam o conjunto inteiro antes da primeira escrita;
- rollback restaura o estado anterior quando todas as etapas são reversíveis;
- falha parcial nunca é apresentada como sucesso;
- watcher observa somente caminhos já autorizados e abertos;
- eventos externos não descartam modelos sujos;
- arquivos sensíveis continuam bloqueados por padrão;
- build, typecheck, testes de API, testes montados e smoke E2E passam.

### Sequência posterior

- **078:** LSP JavaScript/TypeScript;
- **079:** Ruby/Rails LSP;
- **080:** assistência de IA gratuita e local com Ollama;
- **081:** completion inline, fill-in-the-middle e contexto semântico opt-in.

Terminal livre, extensões arbitrárias, provedores cloud e aplicação autônoma de
alterações continuam fora do escopo aprovado.
