export const legalContact = {
  name: 'ExtraOk',
  email: 'extraokweb@gmail.com',
  updatedAt: '09/10/2026',
} as const

export interface LegalSection {
  id: string
  title: string
  paragraphs: string[]
  items?: string[]
}

export const termsSections: LegalSection[] = [
  {
    id: 'servico', title: '1. O que o ExtraOK oferece',
    paragraphs: [
      'O ExtraOK é uma ferramenta para profissionais organizarem clientes, atendimentos e propostas de serviços extras, compartilharem links de aprovação e acompanharem as respostas. O responsável pelo serviço se apresenta como ExtraOk. O canal de suporte é extraokweb@gmail.com.',
      'A contratação e a execução do serviço proposto ao cliente são de responsabilidade do profissional. Aprovar um extra registra uma decisão sobre a proposta; não comprova pagamento, execução do trabalho nem a identidade de quem recebeu o link.',
    ],
  },
  {
    id: 'conta', title: '2. Cadastro e segurança da conta',
    paragraphs: [
      'Forneça dados corretos e mantenha seu e-mail acessível. Use a plataforma se tiver capacidade para contratar ou autorização para representar seu negócio. Guarde sua senha e não compartilhe a conta com pessoas não autorizadas.',
      'Avise o suporte se suspeitar de acesso indevido. A recuperação de acesso depende dos mecanismos disponíveis e pode exigir confirmação de titularidade; nunca pediremos sua senha ou código de recuperação por e-mail.',
    ],
  },
  {
    id: 'dados-clientes', title: '3. Dados dos seus clientes e uso permitido',
    paragraphs: [
      'Ao cadastrar dados de terceiros, você deve ter uma finalidade legítima para usá-los, informar seus clientes e respeitar os direitos deles. Insira apenas o necessário para o atendimento; evite informações sensíveis, documentos ou dados que não tenham relação com o serviço.',
      'Não use o ExtraOK para fraude, assédio, atividades ilícitas, acesso a contas alheias ou tentativas de comprometer a segurança da plataforma. Dados e propostas inseridos continuam sob responsabilidade de quem os fornece.',
    ],
  },
  {
    id: 'aprovacoes', title: '4. Links de aprovação',
    paragraphs: [
      'Quem possui um link válido pode consultar a proposta e responder aos extras disponíveis sem criar uma conta. Envie o link somente ao destinatário correto e não o publique em redes sociais ou páginas abertas.',
      'Gerar um novo link para o mesmo atendimento invalida o anterior. Os links têm prazo de validade. Confira descrição, valor e destinatário antes de compartilhar; uma resposta já registrada pode restringir a edição ou exclusão do extra.',
    ],
  },
  {
    id: 'planos', title: '5. Planos, pagamento e renovação',
    paragraphs: [
      'Os preços, limites e recursos de cada plano são exibidos na página de planos e em Meu plano antes da compra. O plano gratuito também possui limites. Pagamentos de planos são feitos por Pix, por meio do provedor informado no checkout.',
      'O acesso pago depende da confirmação do provedor; voltar do checkout não confirma pagamento. A compra concede o período e os benefícios exibidos na oferta. Não há cobrança recorrente automática por Pix: uma nova compra exige sua ação. Consulte em Meu plano as datas de vigência e eventual período seguinte.',
      'Ao terminar o período pago, recursos que exigem aquele plano deixam de estar disponíveis. Isso não equivale, por si só, à exclusão automática dos registros da conta. Novos preços ou mudanças na oferta devem ser informados antes de uma nova contratação.',
    ],
  },
  {
    id: 'cancelamento', title: '6. Cancelamento, reembolso e encerramento',
    paragraphs: [
      'Para solicitar cancelamento, correção de cobrança, reembolso ou encerramento da conta, escreva para extraokweb@gmail.com usando, de preferência, o e-mail do cadastro. Informe a referência da compra quando houver, sem enviar senha, código de acesso ou dados bancários completos.',
      'Quando a relação estiver sujeita ao Código de Defesa do Consumidor, permanecem assegurados os direitos aplicáveis, inclusive o direito de arrependimento em até sete dias nas contratações a distância abrangidas pela lei. Estes termos não afastam garantias legais.',
      'Solicitações são analisadas conforme a contratação e a legislação. Reembolsos ou contestações confirmados podem encerrar o período pago associado. Não existe, atualmente, exclusão de conta por botão; o atendimento dessa solicitação ocorre pelo suporte.',
    ],
  },
  {
    id: 'disponibilidade', title: '7. Disponibilidade e responsabilidades',
    paragraphs: [
      'O serviço pode passar por manutenção, falhas de infraestrutura ou indisponibilidade de terceiros. Não prometemos funcionamento ininterrupto. Comunique problemas ao suporte e mantenha cópias dos registros importantes pelos recursos de consulta e exportação disponíveis no seu plano.',
      'Podemos restringir acessos em caso de abuso ou risco de segurança e, quando possível, informar o motivo e orientar a regularização. A responsabilidade de cada parte será apurada conforme os fatos e a legislação, sem exclusão de direitos que não possam ser renunciados.',
    ],
  },
  {
    id: 'alteracoes', title: '8. Alterações e contato',
    paragraphs: [
      'A data desta página identifica sua última atualização. Mudanças relevantes devem ser comunicadas pelos canais disponíveis e, quando necessário, submetidas a novo aceite. A Política de Privacidade explica como os dados são tratados.',
      'Dúvidas sobre estes termos ou o uso do ExtraOK podem ser enviadas para extraokweb@gmail.com. Aplica-se a legislação brasileira, preservadas as regras de proteção e os direitos do consumidor quando cabíveis.',
    ],
  },
]

export const privacySections: LegalSection[] = [
  {
    id: 'responsavel', title: '1. Responsável e canal de privacidade',
    paragraphs: [
      'ExtraOk é o responsável pela operação do ExtraOK e pelas decisões de tratamento necessárias ao cadastro, à segurança e à administração das contas. Para dúvidas ou solicitações sobre dados pessoais, use extraokweb@gmail.com.',
      'O profissional que cadastra seus clientes define a finalidade desses registros e deve informá-los sobre o uso dos dados. Nesse contexto, o ExtraOK trata os registros para prestar a ferramenta ao profissional. Se você recebeu uma proposta, pode falar com o profissional e também com nosso canal para encaminhar uma solicitação.',
    ],
  },
  {
    id: 'dados', title: '2. Quais dados são tratados',
    paragraphs: ['Tratamos dados fornecidos por você e registros necessários ao funcionamento do serviço:'],
    items: [
      'Conta: nome, nome do negócio, e-mail, telefone, registro de aceite e representação protegida da senha. A aplicação não armazena a senha em texto legível.',
      'Atendimentos: nomes e contatos de clientes, observações, descrições, datas, preços e decisões sobre serviços extras.',
      'Sessão e segurança: identificadores de sessão, validade, revogação e registros técnicos das requisições. A infraestrutura pode tratar endereço IP, informações do navegador, horários e erros para operar e proteger o serviço.',
      'Cobrança de planos: referência da compra, plano, valor, status e período de acesso. Conforme o provedor e o fluxo, também podem ser necessários nome do pagador, e-mail, CPF e identificador de dispositivo para prevenção a fraude.',
      'Recuperação e suporte: dados necessários para validar pedidos de recuperação, enviar mensagens de acesso e responder ao contato iniciado por você.',
    ],
  },
  {
    id: 'finalidades', title: '3. Para que usamos os dados',
    paragraphs: [
      'Usamos os dados para criar e autenticar contas, manter os registros de atendimento, apresentar propostas, registrar respostas, processar planos e prestar suporte. Os tratamentos necessários à prestação do serviço se relacionam à execução do contrato ou a providências solicitadas antes dele.',
      'Também tratamos dados quando necessário para cumprir obrigações legais, exercer direitos e proteger contas e transações contra fraude e abuso, respeitando os direitos dos titulares. Quando uma atividade depender de consentimento, ele deverá ser solicitado de maneira específica; aceitar os termos não autoriza qualquer uso dos dados.',
      'Não vendemos os registros inseridos na plataforma nem os utilizamos para criar listas de publicidade de terceiros.',
    ],
  },
  {
    id: 'compartilhamento', title: '4. Fornecedores e links compartilhados',
    paragraphs: [
      'Usamos fornecedores de infraestrutura para disponibilizar o serviço: Cloudflare para entrega do site, Render para a API e Neon para PostgreSQL. Resend é a integração de e-mail de recuperação quando habilitada. Stripe processa as novas compras na configuração atual; registros antigos ou outra configuração podem usar Mercado Pago.',
      'Esses fornecedores recebem os dados necessários às suas funções. Provedores de pagamento também podem atuar segundo suas próprias obrigações e políticas de privacidade. Uma obrigação legal ou o exercício regular de direitos pode exigir compartilhamento adicional, limitado ao necessário.',
      'Os fornecedores podem operar em outros países. O uso desses serviços deve observar os mecanismos e as salvaguardas exigidos para transferências internacionais. Você pode pedir informações sobre fornecedores e transferências pelo canal de privacidade.',
      'Ao compartilhar um link de aprovação, o profissional disponibiliza a proposta e os dados nela exibidos a quem tiver esse link. O link funciona como uma autorização de acesso: trate-o como informação reservada.',
    ],
  },
  {
    id: 'cookies', title: '5. Cookies e tecnologias do navegador',
    paragraphs: [
      'Utilizamos cookies necessários para manter a sessão autenticada e, quando aplicável, concluir a recuperação de senha. Bloquear esses cookies pode impedir o login ou a recuperação. A aplicação não usa uma ferramenta de publicidade comportamental ou analytics de audiência no código atual.',
      'Quando a compra usa Mercado Pago, a página de pagamento pode carregar o script de segurança desse provedor para gerar um identificador de dispositivo e auxiliar a prevenção a fraude. O checkout hospedado da Stripe pode usar suas próprias tecnologias no domínio do provedor. Consulte também a política do provedor escolhido.',
    ],
  },
  {
    id: 'retencao', title: '6. Conservação e exclusão',
    paragraphs: [
      'Os registros de conta e de atendimento são mantidos para prestar o serviço enquanto necessários. O fim de um plano pago não apaga automaticamente esses registros. O encerramento da conta e a exclusão de dados podem ser solicitados pelo canal de privacidade.',
      'Alguns dados podem precisar ser conservados após o encerramento para obrigações legais, prevenção a fraude ou exercício de direitos. Nesses casos, o uso deve ficar limitado à justificativa de conservação. Não prometemos eliminação imediata de todas as cópias técnicas ou backups; solicite informações sobre o tratamento do seu pedido e eventuais restrições.',
      'Códigos de recuperação e sessões têm validade e controles de uso. Isso não significa que todos os registros técnicos sejam apagados automaticamente no instante de expiração.',
    ],
  },
  {
    id: 'direitos', title: '7. Seus direitos e como pedir atendimento',
    paragraphs: [
      'Você pode solicitar confirmação do tratamento, acesso, correção, informações sobre compartilhamentos e, nas hipóteses legais, anonimização, bloqueio, exclusão, portabilidade, oposição ou revogação de consentimento. Também pode pedir esclarecimentos e revisão quando aplicável a uma decisão exclusivamente automatizada que afete seus interesses.',
      'Envie sua solicitação para extraokweb@gmail.com. Para proteger seus dados, poderemos pedir apenas informações proporcionais à confirmação de identidade. Não envie senhas ou códigos de recuperação. Responderemos conforme os prazos e as condições da legislação e explicaremos eventual impossibilidade de atender integralmente.',
      'Se a questão não for resolvida, você pode recorrer aos canais da Autoridade Nacional de Proteção de Dados e aos órgãos competentes. As informações desta política não limitam seus direitos.',
    ],
  },
  {
    id: 'seguranca', title: '8. Proteção e atualizações',
    paragraphs: [
      'O ExtraOK adota autenticação, restrições de acesso por conta e medidas técnicas para proteger os dados. Nenhum serviço é imune a incidentes. Se identificar um problema de segurança, comunique-o pelo canal de contato sem acessar ou divulgar dados de outras pessoas.',
      'Esta política pode ser atualizada para refletir mudanças no serviço e nas práticas de tratamento. A data da última atualização aparece no início da página. Alterações relevantes devem ser comunicadas pelos canais disponíveis.',
    ],
  },
]
