# ExtraOK API

API HTTP do ExtraOK construída com Fastify, TypeScript, Prisma e PostgreSQL. A aplicação expõe autenticação por sessão, clientes, atendimentos, serviços extras, dashboard e aprovação pública por link.

## Configuração

Copie `.env.example` para `.env` neste diretório. As variáveis obrigatórias são:

- `NODE_ENV`: modo explícito de execução (`development`, `test` ou `production`).
- `DATABASE_URL`: conexão PostgreSQL.
- `WEB_ORIGIN`: origem exata permitida pelo CORS e pela proteção de requisições mutáveis.
- `PASSWORD_PEPPER`: segredo aleatório com pelo menos 32 caracteres.

As demais variáveis possuem valores de desenvolvimento documentados no exemplo. Em produção, use HTTPS em `WEB_ORIGIN`, mantenha o pepper em um cofre de segredos e preserve-o entre deploys; trocá-lo invalida a verificação das senhas existentes.

## Comandos

Execute preferencialmente a partir da raiz do monorepo:

```bash
pnpm --filter @extraok/api dev
pnpm --filter @extraok/api typecheck
pnpm --filter @extraok/api test
pnpm --filter @extraok/api build
pnpm --filter @extraok/api start
```

Banco de dados:

```bash
pnpm db:generate
pnpm db:migrate:dev
pnpm db:migrate:deploy
```

Use `db:migrate:dev` somente no desenvolvimento. Imagens e servidores publicados devem executar `db:migrate:deploy` com as migrações já versionadas.

## Saúde

- `GET /health`: processo ativo, retorna `{ "status": "ok" }`.
- `GET /ready`: processo pronto e PostgreSQL acessível.

As rotas de negócio ficam sob `/api/v1`. Rotas privadas exigem o cookie de sessão emitido no login; os endpoints públicos de aprovação carregam um token na URL e não devem ser enviados a logs ou ferramentas de analytics.

## Planos e pagamento por Pix

Gratuito, Pro e Negócio controlam o primeiro link de cada atendimento. A compra de um plano pago libera 30 dias somente após confirmação do Mercado Pago; renovações são manuais. O recurso vem com cobranças desativadas (`BILLING_ENABLED=false`). A migration `0003_pix_billing` é necessária também para o plano Gratuito.

Consulte [Planos e Pix](BILLING.md) para limites, preços, configuração do provedor, variáveis por ambiente e validação antes da ativação.

Na raiz, `pnpm.cmd billing:check` identifica configurações pendentes e confere a migration no banco em modo de leitura, sem gerar pagamentos ou exibir credenciais.

## Recuperação de senha por e-mail

A página `/recuperar-senha` solicita um OTP de 8 dígitos, valida o código e permite cadastrar uma nova senha. O envio usa a API HTTPS do Resend pelo `fetch` nativo do Node, com cancelamento após 8 segundos. Nenhuma chave de e-mail é necessária no frontend.

### Ativar no ambiente

1. Verifique um domínio e um remetente no [Resend](https://resend.com/docs/add-a-domain) e crie uma chave com permissão de envio. Para destinatários reais, use seu próprio domínio verificado.
2. Configure `RESEND_API_KEY`, `EMAIL_FROM` (por exemplo, `ExtraOK <seguranca@seu-dominio.com.br>`) e `PASSWORD_RESET_OTP_SECRET` em `apps/api/.env` para desenvolvimento ou em **Environment** do serviço da API no Render. O `.env` da raiz atende ao Docker Compose; ele já repassa essas variáveis ao container.
3. Gere o segredo de OTP com 32 bytes aleatórios. Ele deve ser diferente de `PASSWORD_PEPPER` e ficar estável entre deploys:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

4. Aponte `DATABASE_URL` explicitamente para o banco correto e aplique as migrations versionadas com `pnpm db:migrate:deploy`. A migration `0002_password_reset` cria as tabelas de recuperação. Use um banco descartável para testes; não use `db push` em produção.
5. Configure `PASSWORD_RESET_ENABLED=true`, publique a API e publique o frontend. A configuração falha na inicialização se o recurso estiver habilitado sem as credenciais necessárias. Com `false` (padrão), as rotas de recuperação retornam HTTP 503 e o restante da autenticação continua disponível.
6. Pelo domínio do frontend, teste solicitação, recebimento real, validação, troca de senha e novo login. Verifique que a senha anterior e as sessões anteriores deixaram de funcionar.

Mantenha `VITE_API_URL=/api/v1` e o proxy do site: a autorização temporária é enviada em cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção, com caminho `/api/v1/auth/password-reset`. Preserve `WEB_ORIGIN` e a proteção de origem; não exponha `RESEND_API_KEY` ou o segredo de OTP em variáveis `VITE_*`.

### Contrato e limites

| POST | Corpo | Resposta |
|---|---|---|
| `/api/v1/auth/password-reset/request` | `email` | 202 com mensagem genérica, `retryAfterSeconds`, `expiresInSeconds` e `codeLength` |
| `/api/v1/auth/password-reset/verify` | `email`, `code` | 200 com `expiresInSeconds` e cookie de autorização |
| `/api/v1/auth/password-reset/confirm` | `password`, `confirmPassword` + cookie | 204, encerra as sessões e remove os cookies |

O OTP vale por 10 minutos desde a solicitação, possui 5 tentativas e é consumido ao validar. O reenvio exige 60 segundos, invalida códigos e autorizações anteriores e permite até 3 envios por conta em uma janela móvel de uma hora. Há um orçamento adicional de 5 falhas de validação por conta durante uma hora; pedir outro código não zera esse orçamento e não bloqueia o login normal. A autorização de redefinição vale 5 minutos, é de uso único e não inicia uma sessão de login.

Os limites de conta são persistidos no PostgreSQL e as operações são serializadas por conta no banco. Os limites por IP do plugin Fastify são locais ao processo: antes de ampliar réplicas, configure um armazenamento compartilhado e valide qual IP chega pela cadeia Cloudflare/Render. Não habilite confiança irrestrita em cabeçalhos encaminhados pelo cliente.

### Entrega e manutenção

O pedido grava uma fila persistente na mesma transação que cria o desafio; a resposta HTTP não aguarda o provedor de e-mail. O OTP usa HMAC no desafio e AES-256-GCM no conteúdo pendente de envio, com contextos e chaves derivadas separados. O código em texto não é salvo no banco, nos logs ou na resposta HTTP.

Cada instância habilitada processa a fila em intervalos curtos. A chave de idempotência e o conteúdo permanecem iguais nos retries; falhas temporárias têm espera progressiva e limite de tentativas. Erros permanentes encerram a entrega. O aviso de senha alterada também é enfileirado. Os logs registram apenas identificadores e resultados, sem corpo do e-mail ou resposta do provedor. Monitore falhas e o painel de entregas do Resend; aceitação pela API não garante chegada à caixa de entrada.

O processo limpa conteúdo pendente expirado a cada minuto e conserva registros pelo período necessário aos limites. A validade é conferida em cada operação mesmo antes da limpeza. O segredo de OTP deve ser preservado enquanto houver desafios ativos; uma rotação invalida códigos e entregas pendentes. A instância precisa estar ativa para processar a fila: serviços que suspendem por inatividade podem atrasar envios. A API HTTPS funciona mesmo quando as portas SMTP estão bloqueadas no [Render Free](https://render.com/docs/free#other-limitations).

### Testes

`pnpm test` inclui configuração, criptografia, transporte simulado e fluxo HTTP. Os testes de integração só executam quando `TEST_DATABASE_URL` aponta para um PostgreSQL **exclusivo de testes**, já migrado. Os e-mails desses testes são capturados por um remetente simulado e não saem para o Resend. Há cobertura de expiração, reenvio, limites, uso único, concorrência, falha/retry do provedor e login simultâneo à troca de senha. A entrega real requer as credenciais do ambiente e uma caixa de e-mail de teste.

Em bancos locais que multiplexam conexões, como PGlite, execute os arquivos da API em sequência para evitar interferência de sessões do próprio servidor de testes:

```bash
pnpm --filter @extraok/api exec tsx --test --test-concurrency=1 tests/*.test.ts
```

Esse comando preserva as requisições simultâneas dentro dos testes de concorrência. A validação de concorrência com múltiplas conexões independentes deve usar PostgreSQL nativo.
