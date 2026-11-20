# LeadFesta — implementação

## Estado

A primeira implementação funcional foi adicionada em `feat/leadfesta-module` e está em revisão na PR #88. Ela depende da branch de fundação `chore/foundation-reconciliation-verify`. Nenhuma migration foi aplicada no projeto Supabase de produção.

## Rotas

- `/app/leads/`: CRM da empresa. O menu só mostra o acesso quando o usuário é administrador e o entitlement está ativo.
- `/app/admin/leadfesta/`: painel do platform owner para ativar ou suspender o adicional por empresa.
- O painel global do proprietário contém um atalho para a gestão do LeadFesta.

## Banco de dados

Migration: `20261120130000_leadfesta_module.sql`.

- `private.company_feature_entitlements`: concessão comercial privada por empresa. A tabela não é exposta pela Data API e não concede leitura direta a usuários.
- `public.lead_pipeline_stages`: etapas do funil, isoladas por `company_id`.
- `public.leads`: contatos e oportunidades, com origem, valor estimado, previsão de fechamento e próximo contato.
- `public.lead_activities`: histórico de notas, contatos, mudanças de etapa e conversões.

Seis etapas padrão são criadas para empresas existentes e automaticamente para novas empresas. O esquema não presume locação, brinquedos ou doces.

## Autorização

- `private.is_platform_owner()` é a origem de autoridade para administração global.
- `public.set_leadfesta_entitlement(uuid, boolean)` e `public.get_leadfesta_entitlements()` são exclusivos do platform owner.
- `public.leadfesta_is_available(uuid)` verifica o acesso do platform owner ou do administrador da empresa com entitlement ativo.
- `public.can_access_leadfesta(uuid)` é aplicada pelas políticas RLS das tabelas operacionais.
- Funcionários não recebem acesso automaticamente.
- A suspensão bloqueia novas consultas e alterações, sem apagar leads ou atividades.
- A conversão em cliente ocorre em uma RPC transacional, mantendo a empresa de origem e registrando a conversão no histórico.

## Interface incluída

- Cadastro de lead com nome, telefone, e-mail, organização, origem, valor estimado, previsão de fechamento, próximo contato e observações.
- Busca textual e filtro por etapa.
- Indicadores de volume, oportunidades abertas e valor estimado em aberto.
- Detalhes do lead e atualização de etapa.
- Histórico cronológico de atividades.
- Conversão em cliente no cadastro existente do KidsLoc.
- Painel do proprietário para ativar ou suspender o módulo empresa por empresa.

## Verificações

- Testes unitários em `web/nextjs_app/tests/leadfesta.test.ts`.
- Testes pgTAP em `supabase/tests/leadfesta.test.sql`.
- A CI deve validar lint, testes, build, reset do banco e pgTAP antes de a PR sair de rascunho.

## Próximas etapas de rollout

1. Revisar e aprovar a PR da fundação.
2. Resolver o item operacional da empresa Festejando antes da migration de normalização de cargos.
3. Aplicar as migrations da fundação e do LeadFesta na ordem validada, com backup e verificação do ledger.
4. Rodar smoke tests de isolamento, ativação, suspensão, criação de leads, histórico e conversão.
5. Publicar o frontend somente depois da validação das rotas e da autorização real no Supabase.

A CI localiza problemas de código e schema, mas não substitui a validação em produção. Não aplicar migrations, publicar Edge Functions, alterar configurações Auth, fazer upgrade de plano ou integrar PRs automaticamente.
