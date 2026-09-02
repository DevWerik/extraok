# ExtraOK

Monorepo do ExtraOK, uma aplicação para prestadores de serviço administrarem clientes, atendimentos e a aprovação de serviços extras.

O fluxo principal usa dados reais: a API persiste no PostgreSQL, o login cria sessões no banco e o frontend consome a API HTTP. Não há mais banco em memória nem credenciais demonstrativas.

## Estrutura

- `apps/web`: React, TypeScript e Vite; servido por Nginx no container de produção.
- `apps/api`: Node.js, TypeScript, Fastify e Prisma.
- PostgreSQL: usuários, sessões, clientes, atendimentos, extras e links de aprovação.
- `compose.yaml`: PostgreSQL, migração, API e frontend em uma rede privada.

Use exclusivamente o `pnpm`. O workspace fixa `pnpm@11.10.0` e Node.js 24.19.x, a mesma linha usada nas imagens de produção.

## Desenvolvimento local

Habilite o gerenciador e instale exatamente o lockfile:

```bash
corepack enable
corepack prepare pnpm@11.10.0 --activate
pnpm install --frozen-lockfile
```

Crie o ambiente da API:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Edite `apps/api/.env` e informe um PostgreSQL acessível em `DATABASE_URL`. Se
ainda não tiver um, execute primeiro `pnpm db:local:create` e copie a URL
exibida pelo comando. Gere um pepper independente com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use a saída em `PASSWORD_PEPPER`. Para o Vite, `apps/web/.env.example` já contém os valores locais esperados e só precisa ser copiado se você quiser sobrescrevê-los.

Prepare o banco e inicie os dois aplicativos:

```bash
pnpm db:generate
pnpm db:migrate:dev
pnpm dev
```

O banco local efêmero criado por `pnpm db:local:create` pode ser religado com
`pnpm db:local:start` e encerrado com `pnpm db:local:stop`.

O frontend fica em `http://localhost:5173`, a API em `http://localhost:3333` e o Vite encaminha `/api` para a API. Não use `prisma migrate dev` em produção.

## Execução completa com Docker Compose

É necessário ter Docker com suporte a Compose. Crie o arquivo de ambiente:

```powershell
Copy-Item .env.example .env
```

Preencha todos os campos vazios. Para desenvolvimento local com Compose, um exemplo de origem e URL é:

```dotenv
WEB_ORIGIN=http://localhost:8080
DATABASE_URL=postgresql://extraok:SENHA_URL_SAFE@postgres:5432/extraok?schema=public
```

Gere valores diferentes para `POSTGRES_PASSWORD` e `PASSWORD_PEPPER`. A senha embutida na `DATABASE_URL` deve representar exatamente `POSTGRES_PASSWORD`; se ela tiver caracteres reservados, aplique percent-encoding somente ao inseri-la na URL. Depois que o volume do PostgreSQL for inicializado, mudar apenas o arquivo `.env` não altera a senha já gravada no banco.

Valide a interpolação e suba os serviços:

```bash
docker compose config
docker compose up --build -d
docker compose ps
```

O serviço `migrate` executa `prisma migrate deploy` antes da API. O site fica disponível em `http://localhost:8080` por padrão. Verifique:

```powershell
Invoke-RestMethod http://localhost:8080/health
Invoke-RestMethod http://localhost:8080/ready
```

`/health` confirma que o processo responde; `/ready` também consulta o banco. Veja falhas com `docker compose logs api migrate postgres`.

## Validação

Na raiz do workspace:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Os scripts de banco disponíveis são:

- `pnpm db:generate`: gera o Prisma Client.
- `pnpm db:studio`: abre uma única instância do Prisma Studio em `http://localhost:5555`.
- `pnpm db:migrate:dev`: cria/aplica migrações durante o desenvolvimento.
- `pnpm db:migrate:deploy`: aplica somente migrações versionadas em um ambiente publicado.

## Checklist de produção

O Compose publica o Nginx e o PostgreSQL apenas em `127.0.0.1`. Em um servidor, mantenha esse isolamento e coloque um proxy confiável com HTTPS na frente de `127.0.0.1:${WEB_PORT}`. Configure `WEB_ORIGIN` com a origem pública HTTPS exata. `TRUST_PROXY=true` pressupõe esse caminho através do Nginx; fora dessa topologia, deixe-o desativado até configurar proxies confiáveis.

O proxy TLS deve remover qualquer `X-Forwarded-For` recebido do cliente e aplicar rate limiting por IP. O Nginx interno envia à API o endereço do par imediato para não confiar em cabeçalhos arbitrários; por isso, sem uma configuração `real_ip_header`/`set_real_ip_from` específica para o endereço conhecido do proxy TLS, a API agrupará os acessos sob o IP desse proxy. Só habilite a propagação do IP real depois de conhecer e restringir essa origem.

Antes de liberar acesso público:

- armazene `.env` fora do versionamento e entregue segredos por um cofre ou mecanismo seguro da plataforma;
- faça backup e teste a restauração do volume PostgreSQL;
- monitore `/ready`, logs, uso de disco e expiração do certificado TLS;
- mantenha a rotação de logs configurada no Compose ou envie-os a um coletor externo;
- execute e acompanhe as migrações antes de receber tráfego da nova versão;
- mantenha uma única réplica da API ou adicione um rate limiter compartilhado antes de escalar horizontalmente;
- fixe imagens por digest no ambiente de deploy e defina limites de CPU, memória e processos após medir a carga real;
- publique termos e política de privacidade revisados para o valor configurado em `TERMS_VERSION`.

O núcleo do MVP está persistente e autenticado, mas uma operação pública completa ainda depende de infraestrutura externa. Recuperação de senha, verificação de e-mail, segundo fator, envio transacional, observabilidade centralizada e rotina automatizada de backup não estão implementados neste repositório. Domínio, TLS, banco gerenciado e credenciais de deploy também precisam ser fornecidos pelo ambiente de hospedagem.

## Segurança operacional

A aplicação usa cookie de sessão `HttpOnly`, links de aprovação com token e expiração, validação de origem, limites de requisição e cabeçalhos de segurança. Mesmo assim, nunca registre nem compartilhe URLs de aprovação: o token presente nelas concede acesso ao fluxo público daquele atendimento.
