# Auditoria de segurança

Artefatos da revisão das cinco categorias solicitadas para o ExtraOK. A
auditoria-base foi realizada no commit
`bb164eb957eaf688a4f7a5322750c6b49e5e7df8` em 02 de setembro de 2026. A edição
atual também registra a correção e a validação dos dois achados, incluídas no
mesmo commit que publica estes artefatos.

Para regerar o relatório e as imagens de validação, execute na raiz do
monorepo:

```powershell
node docs/security-audit/generate-report.mjs
```

O gerador não baixa dependências. Ele usa Node.js e procura uma instalação
local do Google Chrome ou Microsoft Edge em modo headless. Se o navegador
estiver em outro local, defina `CHROME_PATH` antes da execução.

Saídas:

- `relatorio-auditoria-seguranca.pdf`: relatório final A4;
- `relatorio-auditoria-seguranca.html`: fonte visual intermediária;
- `previews/pagina-*.png`: rasterizações usadas para revisar legibilidade;
- `generate-report.mjs`: gerador reproduzível, com os dados desta auditoria.

O relatório preserva a fotografia da auditoria-base e apresenta separadamente
o estado pós-correção: dois achados históricos corrigidos e nenhum aberto. Se o
código mudar, revise evidências, status, severidades e contagens no gerador
antes de publicá-lo novamente.
