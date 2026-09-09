# Security Center

O Security Center agrega findings locais de scanners opcionais sem transformar a API em scanner próprio e sem transportar material sensível além do necessário para a decisão do usuário.

## Contrato de provider

`apps/api/src/services/security-scanner-provider.ts` define uma fronteira independente de scanner para:

- disponibilidade (`available`, `missing`, `unavailable`);
- execução (`completed`, `failed`, `invalid-output`);
- timestamp e diagnóstico sanitizado;
- resultado tipado pelo provider.

Scanner ausente é capability opcional indisponível, não erro global do projeto.

## Primeiro provider: Trivy

O provider Trivy cobre somente:

- `secret`;
- `misconfiguration`.

Vulnerabilidades de dependências permanecem fora desta superfície para não duplicar o domínio de Dependency Health.

A disponibilidade usa `trivy --version` e preserva somente uma versão curta reconhecida. O scan usa argv fixo equivalente a:

```text
trivy fs --format json --scanners secret,misconfig --no-progress \
  --skip-dirs node_modules --skip-dirs dist --skip-dirs build \
  --skip-dirs coverage .
```

O `cwd` vem do `Project` conhecido pelo backend. O processo usa `execFile`, sem shell, com timeout de 60 segundos e limite de 4 MiB para stdout estruturado. O Dashboard não baixa nem instala Trivy automaticamente.

## Regra de segurança para secrets

A normalização usa **allowlist de campos públicos**. O adapter nunca copia o objeto bruto retornado pelo Trivy para o DTO normalizado.

Para secrets, somente estes dados podem sobreviver à normalização:

- provider;
- categoria;
- rule ID validado;
- severidade;
- título local derivado do rule ID;
- path relativo do arquivo;
- linha quando disponível;
- fingerprint derivado de metadados não secretos;
- timestamp da observação.

Campos como `Match`, título remoto, conteúdo de código, trechos, valores detectados e estruturas não reconhecidas são descartados por construção. Isso evita depender de masking visual ou de sanitização tardia.

O rule ID também passa por allowlist curta de caracteres. Assim um provider malformado não consegue usar esse campo como canal alternativo para transportar conteúdo livre/sensível.

Erros de execução, stderr e stdout inválido não são devolvidos pelo provider. A resposta contém apenas códigos/diagnósticos locais estáveis; um erro que carregue path, URL ou secret não vira DTO público.

## Paths, limites e referências

Findings com target absoluto, path Windows absoluto ou path que escape por `..` são descartados. Um path presente no relatório não concede autoridade de filesystem.

Strings públicas são bounded e o parser retém no máximo 1.000 findings por relatório normalizado. Referências externas só são preservadas quando usam `http` ou `https`.

Diretórios gerados/pesados conhecidos (`node_modules`, `dist`, `build`, `coverage`) são ignorados pelo argv do MVP. Isso não autoriza filtros vindos da UI nem paths arbitrários.

## Fingerprint

O fingerprint usa SHA-256 sobre categoria, rule ID, arquivo e linha. Ele serve para deduplicação sem persistir conteúdo do finding.

## API autenticada

O primeiro contrato HTTP público do domínio reutiliza a autenticação local global da API e expõe somente operações fechadas:

- `GET /api/security-center/availability` consulta a disponibilidade do provider configurado;
- `POST /api/projects/:projectId/security-center/scan` executa um scan manual para o projeto conhecido pelo backend.

O endpoint de scan não aceita target, path, executável, argumentos ou opções do scanner enviados pelo browser. O corpo é vazio e qualquer propriedade adicional é rejeitada pela validação da rota.

`projectId` é apenas um identificador de domínio. A API resolve o `Project` no `ProjectStore`; somente então o provider recebe o `Project.path` confiável. Projeto inexistente retorna `PROJECT_NOT_FOUND` sem executar o scanner.

Essa fronteira preserva a regra:

```text
browser -> intenção: scan do projectId
API -> resolve Project confiável -> provider com argv fechado -> DTO sanitizado
```

Scanner ausente continua retornando estado `missing` em availability. Ele não bloqueia outras ferramentas nem dispara instalação automática.

## UI do projeto

A primeira UI do Security Center é uma ferramenta explícita do projeto em `/projects/:projectId/security`.

Ela mantém a mesma fronteira de autoridade da API:

- consulta somente availability do provider;
- dispara scan manual enviando apenas `projectId` e body vazio;
- não expõe controles para path, executável, scanner args ou filtros livres;
- mostra somente o DTO sanitizado já produzido pelo backend;
- ordena findings por severidade/path para leitura determinística;
- scanner ausente ou indisponível desabilita a ação sem afetar outras ferramentas;
- resultados ficam somente em memória da tela neste recorte.

A UI não tenta mascarar segredo bruto porque esse conteúdo não deve chegar ao browser. Também não transforma `reference` retornada pelo provider em navegação automática; o MVP prioriza leitura local do finding sanitizado.

## Limites atuais

Availability, scan manual e UI básica já existem, porém este recorte ainda não adiciona persistência/histórico, instalação automática do binário nem política de bloquear Release Readiness por finding.

Qualquer evolução de persistência deve armazenar apenas o DTO sanitizado e metadados necessários. Integração futura com Release Readiness precisa preservar freshness e aplicar política explícita, em vez de transformar qualquer finding antigo em bloqueio implícito.
