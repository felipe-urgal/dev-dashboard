# Próxima atividade

A task 075 concluiu a primeira auditoria transversal de acessibilidade das
páginas globais e adicionou guardas de landmarks, comunicação de estado e
contraste. A próxima entrega inicia a IDE embutida aprovada no PR #161.

## Task 076 — Fundação da IDE embutida

Entregar a primeira fatia segura do editor dentro do Dev Dashboard, usando
Monaco desde o início e mantendo a experiência somente leitura nesta etapa.

O plano completo está em
[`076-embedded-ide-foundation-plan.md`](./076-embedded-ide-foundation-plan.md) e
a arquitetura em
[`../architecture/embedded-ide-ai-design.md`](../architecture/embedded-ide-ai-design.md).

### Escopo proposto

- adicionar uma nova aba **Editor** aos detalhes do projeto;
- integrar Monaco Editor e os workers necessários ao Vite;
- criar explorer, abas e modelos por URI lógica do projeto;
- listar diretórios e ler arquivos textuais por caminhos relativos validados;
- oferecer busca textual limitada;
- preservar a ação **Abrir no editor local** dentro da IDE;
- manter a primeira versão somente leitura;
- definir contratos compartilhados de arquivo, versão e erros públicos;
- adicionar testes de path traversal, symlink, binário, tamanho, paginação e
  troca de projeto;
- fixar e documentar as versões de Monaco e `monaco-languageclient` antes do
  primeiro código LSP.

### Critérios principais

- nenhum caminho fora da raiz canônica do projeto pode ser lido;
- symlinks que escapem da raiz são recusados;
- arquivos binários, sensíveis e acima do limite ficam fora da leitura padrão;
- projetos grandes não bloqueiam a interface;
- troca de projeto cancela requests e descarta modelos anteriores;
- tema, densidade, teclado e foco seguem os padrões do dashboard;
- nenhum código de escrita, LSP ou IA é habilitado nesta fatia.

### Sequência aprovada

- **076:** Monaco, explorer, abas e leitura segura;
- **077:** escrita atômica, conflitos e operações de arquivo;
- **078:** LSP JavaScript/TypeScript;
- **079:** Ruby/Rails LSP;
- **080:** assistência de IA gratuita e local com Ollama;
- **081:** completion inline, fill-in-the-middle e contexto semântico opt-in.

Terminal livre, extensões arbitrárias, provedores cloud e alterações autônomas
sem revisão em diff continuam fora do escopo aprovado.
