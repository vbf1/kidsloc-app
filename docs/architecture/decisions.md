# Decisões arquiteturais — Fase 1

1. **Multi-tenancy desde o início:** `companies` representa cada locadora; `company_users` associa usuários e papéis. Todas as tabelas de negócio futuras terão `company_id` obrigatório.
2. **Backend único:** Supabase PostgreSQL/Auth/Storage/Realtime/Edge Functions. Flutter e Next.js são clientes não confiáveis.
3. **Chaves:** clientes recebem apenas Supabase publishable key. `service_role` fica exclusivamente em ambiente server-side seguro (Edge Function secret quando estritamente necessário), nunca nos apps.
4. **Web estática:** Next.js `output: export`; sem API Routes, Server Actions ou dependência de Node em produção. Operações autenticadas acontecem no Supabase.
5. **Concorrência:** reservas e disponibilidade serão validadas no PostgreSQL em transações, com restrições/locks adequados; não confiar em validação visual do cliente.
6. **Offline:** rascunhos e fila local são permitidos; confirmação de reserva depende de validação online do servidor.
7. **Conflitos:** registros mutáveis terão `version`/controle otimista; update condicionado à versão esperada retorna conflito explícito.
8. **Assinatura:** assinatura eletrônica simples com trilha de evidências; não anunciar como assinatura qualificada ICP-Brasil.
