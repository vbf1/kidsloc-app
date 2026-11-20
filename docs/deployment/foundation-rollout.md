# Foundation rollout — produção

Status verificado: 20/11/2026. O rollout de banco e Edge Functions foi aplicado ao projeto Supabase de produção após confirmação do usuário de que os dumps manuais foram guardados em local privado.

## Estado atual confirmado

- Projeto Supabase: `kidsloc-app` (`wfwohnssvftegnhwdzmt`), status `ACTIVE_HEALTHY`.
- Histórico remoto: **63 migrations**. As três migrations novas foram registradas com os timestamps atribuídos pelo Supabase:
  1. `20261120140755_normalize_platform_and_company_roles`
  2. `20261120140813_manage_company_member_transactionally`
  3. `20261120140835_leadfesta_module`
- Os arquivos versionados no Git foram renomeados para corresponder exatamente aos IDs remotos. Não editar nem reaplicar migrations já aplicadas.
- Edge Functions `manage-employees` e `invite-company-member`: versão **3**, status `ACTIVE`, JWT verification habilitada.
- Tabelas `leads`, `lead_activities` e `lead_pipeline_stages` existem com RLS habilitado.
- Cada empresa existente recebeu seis etapas padrão do LeadFesta. Nenhum lead foi criado durante o rollout.
- A ativação comercial do entitlement LeadFesta permanece controlada pelo platform owner e não foi ligada automaticamente.

## Preservação de empresas e vínculos

- **Festejando:** a linha original de `company_members` foi preservada com os mesmos `company_id` e `user_id`; somente o papel mudou de `owner` para `admin`.
- **Sonho Kids Brinquedos** e **Nobre Paladar:** os vínculos originais também foram preservados e os papéis normalizados para `admin`.
- A tabela `company_members` foi verificada e contém somente papéis `admin` no estado atual.
- As marcas Sonho Kids e Nobre Paladar continuam separadas por `company_id`.

## Verificações pós-aplicação realizadas

- Projeto permaneceu `ACTIVE_HEALTHY`.
- Ledger remoto confirmou as três migrations novas (63 no total).
- Festejando permaneceu vinculada ao mesmo usuário e empresa.
- Sonho Kids e Nobre Paladar mantiveram seus vínculos.
- Funções `manage_company_member`, `invite_company_member`, `add_company_member` e `is_platform_owner_for_company`: execução negada a `anon` e permitida a `authenticated`, conforme desenho.
- Tabelas LeadFesta com RLS habilitado.
- Seis etapas padrão confirmadas para cada empresa.
- Duas Edge Functions ativas na versão 3, com JWT verification ligada.
- CI anterior: web tests, lint, build, auditoria de dependências, Supabase reset, Auth/onboarding E2E e pgTAP (73/73) aprovados.

## Limites e itens ainda não ativados

- O entitlement LeadFesta não foi habilitado automaticamente para Sonho Kids ou Nobre Paladar. O platform owner pode ativar cada empresa no painel administrativo depois de decidir onde o módulo será usado.
- A proteção de senha vazada do Supabase Auth permanece desativada porque exige plano Pro ou superior; não houve upgrade nem cobrança.
- Os avisos de segurança do advisor sobre funções SECURITY DEFINER existentes e leaked-password protection devem ser revisados separadamente; não foram alteradas permissões fora das migrations aprovadas.
- Frontend publicado no GitHub Pages em 20/11/2026 pelo workflow `44751385522`; build e deploy concluídos com sucesso. URL: https://vbf1.github.io/kidsloc-app/.

## Procedimento de continuidade

1. PR #87 e PR #88 foram mescladas em `main`.
2. O workflow de GitHub Pages concluiu build e deploy com sucesso no commit `fb2eb3a78f4436711b311ee6693a8cc9655e3dbb`.
3. Próxima verificação operacional: login real e teste de navegação KidsLoc, acesso ao CRM, prospecção, criação de lead, histórico e conversão em cliente.
4. Ativar o entitlement apenas nas empresas escolhidas pelo platform owner.

Não executar migrations antigas novamente, especialmente `20261107165527_rebuild_rental_core_and_clear_legacy_records.sql`, que é destrutiva e já está aplicada.
