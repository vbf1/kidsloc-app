# LeadFesta — implementação

## Estado

A primeira implementação funcional foi adicionada em `feat/leadfesta-module` e está em revisão na PR #88. Ela depende da branch de fundação `chore/foundation-reconciliation-verify`. Nenhuma migration foi aplicada no projeto Supabase de produção.

## Rotas

- `/app/leads/`: CRM da empresa. O menu só mostra o acesso quando o usuário é administrador e o entitlement está ativo.
- `/app/admin/leadfesta/`: painel do platform owner para ativar ou suspender o adicional por empresa.
- `/app/leads/prospeccao/`: pesquisa assistida de intenção de compra/contratação em fontes públicas indexadas, com consultas genéricas por produto/serviço e região, revisão manual da publicação original e registro no funil da empresa ativa. Mantém pesquisa complementar separada de estabelecimentos via OpenStreetMap.
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
- Pesquisa de intenção: gera consultas por termos como “procuro”, “preciso”, “alguém indica” e “quero contratar”, direcionadas a buscadores e domínios públicos (web, Facebook, Instagram, Reddit, TikTok, YouTube, LinkedIn, X, fóruns e classificados públicos), incluindo Google, DuckDuckGo e Bing. A pesquisa abre resultados no navegador; não extrai dados automaticamente nem acessa conteúdo privado. O usuário revisa a publicação e registra manualmente o nome/perfil público, link original, telefone público opcional e trecho relevante. O lead é gravado somente na empresa ativa, com fonte e publicação nas observações e verificação de duplicidade por nome/telefone.
- Pesquisa complementar de estabelecimentos via OpenStreetMap: permanece separada e identificada como pesquisa de empresas, não de clientes interessados. Resultados sem correspondência com o segmento não são exibidos.

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


## Prospecção por intenção — limites e evolução

- O mecanismo de consultas é independente do segmento: cada empresa informa o produto/serviço e, opcionalmente, a localização.
- As fontes são abertas em páginas de busca públicas. A presença de uma plataforma na lista não garante que todas as publicações estejam indexadas ou disponíveis sem login.
- Não se consultam pesquisas privadas de usuários, perfis privados, mensagens privadas ou dados não disponibilizados publicamente.
- APIs de plataformas com exigência de aprovação, contrato ou autorização comercial não são chamadas nesta versão. Integrações automatizadas só devem ser adicionadas após validação dos termos, custo, consentimento e isolamento multiempresa.
- A primeira versão prioriza custo zero e revisão humana; os resultados encontrados fora do sistema só viram leads após registro voluntário pelo usuário.
