# Próxima atividade

A primeira fatia da task 077 habilitou edição de arquivos existentes, estado
sujo por aba e salvamento atômico com `expectedVersion`. A próxima entrega
completa as operações estruturais sem ampliar a fronteira de confiança.

## Continuação da Task 077 — Operações estruturais e preview

Adicionar criação, renomeação e exclusão seguras, além de uma revisão explícita
para mudanças que afetem um ou mais arquivos.

### Escopo proposto

- criar arquivo e diretório por caminho relativo validado;
- renomear dentro da raiz canônica, recusando sobrescrita implícita;
- excluir arquivo vazio ou diretório vazio com confirmação inline;
- exigir confirmação reforçada para exclusões com conteúdo;
- gerar preview de diff antes de renomear, excluir ou aplicar múltiplas mudanças;
- mostrar conflito em três vias entre conteúdo original, disco atual e edição;
- introduzir um serviço central de `WorkspaceEdit` reutilizável por LSP e IA;
- aplicar múltiplas alterações somente após preview e confirmação;
- implementar rollback quando uma operação intermediária falhar;
- adicionar watcher limitado apenas aos arquivos abertos;
- atualizar explorer, abas e modelos sem recarregar toda a página;
- cobrir colisão de nomes, symlink, TOCTOU, rollback e mudanças externas.

### Critérios principais

- nenhuma operação aceita caminho absoluto ou comando vindo do navegador;
- criação não pode escapar por symlink do diretório pai;
- renomeação nunca substitui um destino existente silenciosamente;
- exclusão sempre mostra claramente o caminho e o impacto;
- mudanças em múltiplos arquivos possuem preview obrigatório;
- rollback não deixa estado parcial quando possível;
- arquivos sensíveis continuam bloqueados por padrão;
- o editor mantém modo somente leitura quando uma mutação falha;
- build, typecheck, testes de API, testes montados e smoke E2E passam.

### Sequência posterior

- **078:** LSP JavaScript/TypeScript;
- **079:** Ruby/Rails LSP;
- **080:** assistência de IA gratuita e local com Ollama;
- **081:** completion inline, fill-in-the-middle e contexto semântico opt-in.

Terminal livre, extensões arbitrárias, provedores cloud e aplicação autônoma de
alterações continuam fora do escopo aprovado.
