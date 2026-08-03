# Próxima atividade

A task 076 entregou a fundação somente leitura da IDE com Monaco, explorer,
abas, busca e acesso confinado aos arquivos do projeto. A próxima entrega
habilita edição e operações de arquivo sem perder a revisão explícita das
mudanças.

## Task 077 — Escrita segura no editor

Adicionar salvamento, conflitos externos e operações estruturais sobre a mesma
fronteira de segurança criada na task 076.

### Escopo proposto

- habilitar edição nos modelos Monaco de arquivos permitidos;
- manter dirty state por aba e confirmação ao descartar mudanças;
- salvar com `expectedVersion` para impedir sobrescrita silenciosa;
- responder `409 FILE_CHANGED_EXTERNALLY` quando o disco mudar;
- abrir diff entre conteúdo original, versão atual do disco e conteúdo editado;
- gravar atomicamente com arquivo temporário e `rename` no mesmo diretório;
- preservar permissões compatíveis do arquivo existente;
- criar arquivo e diretório por caminho relativo validado;
- renomear e excluir com preview e confirmação proporcional ao risco;
- autorizar `WorkspaceEdit` somente por um serviço central reutilizável pelas
  futuras integrações LSP e IA;
- adicionar watcher limitado para informar mudanças externas nos arquivos
  abertos;
- cobrir concorrência, symlink, TOCTOU, falha de gravação e rollback.

### Critérios principais

- toda mutação permanece dentro da raiz canônica do projeto;
- nenhum caminho absoluto ou comando chega do navegador;
- salvamento nunca substitui uma versão externa sem decisão explícita;
- alterações em múltiplos arquivos sempre possuem preview de diff;
- arquivo temporário não pode escapar do diretório autorizado;
- falhas intermediárias não deixam arquivo parcial;
- arquivos sensíveis continuam bloqueados por padrão;
- a IDE permanece utilizável em modo somente leitura quando a escrita falha;
- build, typecheck, testes de API, testes montados e smoke E2E passam.

### Sequência posterior

- **078:** LSP JavaScript/TypeScript;
- **079:** Ruby/Rails LSP;
- **080:** assistência de IA gratuita e local com Ollama;
- **081:** completion inline, fill-in-the-middle e contexto semântico opt-in.

Terminal livre, extensões arbitrárias, provedores cloud e aplicação autônoma de
alterações continuam fora do escopo aprovado.
