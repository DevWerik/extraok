-- Execute no SQL Editor com a BRANCH DE AUDITORIA selecionada.
-- Leitura apenas; não retorna conteúdo dos registros.
BEGIN READ ONLY;
SELECT current_database() AS banco, current_setting('server_version') AS versao;
SELECT 'migrations' AS tabela, count(*) AS registros FROM _prisma_migrations
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'clients', count(*) FROM clients
UNION ALL SELECT 'jobs', count(*) FROM jobs
UNION ALL SELECT 'extras', count(*) FROM extras
UNION ALL SELECT 'approval_links', count(*) FROM approval_links
UNION ALL SELECT 'password_reset_states', count(*) FROM password_reset_states
UNION ALL SELECT 'password_reset_challenges', count(*) FROM password_reset_challenges
UNION ALL SELECT 'password_reset_grants', count(*) FROM password_reset_grants
UNION ALL SELECT 'password_reset_deliveries', count(*) FROM password_reset_deliveries
UNION ALL SELECT 'billing_payments', count(*) FROM billing_payments
UNION ALL SELECT 'billing_periods', count(*) FROM billing_periods
UNION ALL SELECT 'approval_usage', count(*) FROM approval_usage;
SELECT count(*) AS migracoes_incompletas FROM _prisma_migrations
WHERE finished_at IS NULL AND rolled_back_at IS NULL;
SELECT count(*) AS atendimentos_sem_cliente_ou_dono_divergente
FROM jobs j LEFT JOIN clients c ON c.id = j.client_id
WHERE c.id IS NULL OR c.owner_id <> j.owner_id;
SELECT count(*) AS extras_sem_atendimento
FROM extras e LEFT JOIN jobs j ON j.id = e.job_id WHERE j.id IS NULL;
SELECT count(*) FILTER (WHERE contype='f') AS chaves_estrangeiras,
       count(*) FILTER (WHERE contype='c') AS checks,
       count(*) FILTER (WHERE NOT convalidated) AS constraints_nao_validadas
FROM pg_constraint WHERE connamespace='public'::regnamespace;
COMMIT;
