# Descrições de serviços com Gemini

O formulário de serviço extra oferece **Gerar com IA** quando a descrição está vazia e **Melhorar com IA** quando há um rascunho. A sugestão aparece separada do campo: o usuário revisa e escolhe **Aplicar sugestão** ou **Descartar**, depois salva o serviço normalmente. Se o título ou rascunho mudar durante a geração, é necessário gerar novamente antes de aplicar.

O navegador chama a API autenticada do ExtraOK, que consulta o Gemini via HTTPS. Somente o título e o rascunho fornecidos são enviados; a integração não consulta clientes, atendimentos, pagamentos ou outros registros. Não há migração de banco nem persistência de conversas. A API não grava nem envia automaticamente a sugestão ao cliente.

## Ativar localmente

1. Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey) e confirme o modelo disponível no seu projeto. Consulte [modelos](https://ai.google.dev/gemini-api/docs/models) e [preços](https://ai.google.dev/gemini-api/docs/pricing). O padrão é o [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), uma versão estável voltada a tarefas que exigem maior capacidade. O modelo continua configurável.
2. Em `apps/api/.env`, acrescente estas variáveis e preencha a chave apenas no arquivo local, que não deve ser versionado:

   ```dotenv
   AI_ENABLED=true
   GEMINI_API_KEY=preencha_localmente
   GEMINI_MODEL=gemini-3.8-flash
   AI_DAILY_LIMIT=20
   ```

3. Reinicie a API e o frontend. Na raiz, em PowerShell, execute `pnpm.cmd dev`.
4. Entre na sua conta, abra um atendimento e escolha adicionar ou editar um serviço extra pendente. Preencha um título, como “Higienização de estofado”, e clique em **Gerar com IA**. Teste também um rascunho com **Melhorar com IA**.
5. Confira o texto, aplique e salve. Descartar ou falhar a geração deve preservar os campos. Teste inicialmente com dados fictícios e confira o consumo no AI Studio.

Com `AI_ENABLED=false` (padrão), os controles não aparecem e a rota de geração retorna 503. Habilitar sem chave impede a API de iniciar. O frontend consulta a disponibilidade ao abrir o formulário, com cache de até um minuto; recarregue a página após ativar.

## Publicação

No Render, configure as quatro variáveis acima em **Environment** do serviço da API. Publique a API e o frontend com estas alterações e valide o fluxo pelo site. No Docker Compose, use as mesmas variáveis no `.env` da raiz; elas são repassadas apenas ao container da API. O recurso não exige variáveis no Worker/Cloudflare ou no build do frontend.

Nunca use `VITE_GEMINI_API_KEY`, coloque a chave no navegador, em commits ou no chat. A [documentação de chaves](https://ai.google.dev/gemini-api/docs/api-key) recomenda manter as chamadas no servidor.

## Contrato, limites e falhas

- `GET /api/v1/ai/capabilities`: exige sessão e retorna apenas `{ "descriptionsEnabled": true }` quando habilitado.
- `POST /api/v1/ai/extra-description`: exige sessão e origem autorizada. Recebe `title` (3–160 caracteres) e `description` opcional (até 2.000). Retorna `{ "description": "..." }`.
- Há limite de 5 tentativas por minuto por IP e `AI_DAILY_LIMIT` solicitações válidas por conta em uma janela de 24 horas iniciada na primeira solicitação. Falhas do provedor também consomem a cota. Esses contadores são locais ao processo, sujeitos a reinício e evicção de cache; não representam um teto financeiro. Antes de escalar réplicas, adote armazenamento compartilhado/persistente. Configure também controles de uso e alertas no projeto Google.
- A chamada ao Gemini tem prazo de 20 segundos e até 2.048 tokens de saída, incluindo o raciocínio. Para `gemini-3.8-flash`, usamos `thinkingLevel: low`, apropriado para redação breve; `minimal` não é suportado nesse modelo. Outros modelos usam o raciocínio padrão do provedor. Consulte os [controles de raciocínio](https://ai.google.dev/gemini-api/docs/generate-content/thinking). A descrição final continua limitada a 2.000 caracteres.
- Não há repetição automática de chamadas pagas. A cota e a disponibilidade do Google dependem do projeto e do modelo; consulte os [limites atuais](https://ai.google.dev/gemini-api/docs/rate-limits).
- Respostas bloqueadas, interrompidas, vazias, malformadas ou maiores que 2.000 caracteres são recusadas. Erros do provedor são substituídos por mensagens genéricas, sem devolver o corpo bruto, a chave ou detalhes internos.
- A geração é uma sugestão: as instruções pedem para preservar o escopo e evitar promessas inventadas, mas a revisão humana continua necessária. Os textos enviados são processados pelo Google; revise os termos do plano escolhido antes de enviar dados reais de clientes.

## Validação

Os testes automatizados usam transporte Gemini e sessões simulados, sem chave real, cobrança ou banco de produção. Cobrem autenticação/origem, entradas inválidas, ativação, limites por conta/IP, resposta completa e saneamento de falhas. A validação com a chave real e a confirmação do deploy são etapas separadas.

Referência do contrato utilizado: [geração de texto via REST](https://ai.google.dev/gemini-api/docs/generate-content/text-generation).
