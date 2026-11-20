# Reconciliação do histórico de migrations — diagnóstico

**Projeto Supabase:** `wfwohnssvftegnhwdzmt`  
**Branch analisada:** `chore/foundation-reconciliation-verify`  
**Diagnóstico:** somente leitura. Nenhuma migration foi aplicada, reparada ou removida no banco remoto.

## Inventário confirmado — reconciliação final em 20/11/2026

- Histórico remoto: **60 migrations aplicadas**.
- Arquivos locais em `supabase/migrations`: **62**.
- Versões remotas sem arquivo local correspondente: **0**.
- Arquivos locais sem versão remota: **2**, ambos hardening novo, com timestamps posteriores à última migration remota.
- Correspondência exata por versão e SQL: **60/60**.

A tabela remota `supabase_migrations.schema_migrations` contém as colunas `statements` e `rollback`. Os SQLs originais das 23 versões que faltavam no Git foram recuperados diretamente de `statements`, sem reconstrução manual. Os 60 arquivos locais foram comparados com o SQL armazenado no ledger; todos correspondem ao conteúdo original após normalização de espaços/quebra de linha.

As quatro migrations locais intermediárias que tinham identificadores alternativos foram removidas e substituídas pelos quatro arquivos originais recuperados do ledger. Também foi removido o arquivo local intermediário `20261113060000_grant_platform_owner_check_to_authenticated.sql`; sua alteração de ACL foi incorporada à migration nova `20261120110000`, que restaura EXECUTE para `authenticated` e mantém `PUBLIC`/`anon` bloqueados. A função em si já é criada pela migration original `20261112024141_foundation.sql`.

As seis migrations de versão remota cujo arquivo local havia sido modificado foram restauradas ao SQL original armazenado no ledger. As correções necessárias foram mantidas nas migrations posteriores de hardening, em vez de alterar retroativamente migrations já aplicadas. A migration destrutiva `20261107165527_rebuild_rental_core_and_clear_legacy_records.sql` foi comparada e permanece idêntica ao SQL remoto; como já está aplicada, não deve ser reaplicada.

A migration legada `202611090001_foundation.sql` continua excluída por pertencer a uma fundação antiga e não constar no ledger remoto.

As duas migrations novas foram posicionadas depois da última versão remota `20261117015419`:
- `20261120110000_normalize_platform_and_company_roles.sql`
- `20261120120000_manage_company_member_transactionally.sql`

**Nota histórica:** as seções abaixo registram etapas intermediárias da auditoria, anteriores à recuperação dos SQLs. Qualquer menção nelas a 23 arquivos remotos ausentes, sete arquivos locais sem correspondência, pares locais alternativos ou SQLs não recuperáveis está superada por esta reconciliação final e pela seção de encerramento ao fim do documento.

## Estado remoto observado por consultas SQL

- Todas as 27 tabelas base encontradas no schema `public` estavam com RLS habilitado.
- Foram encontrados FKs compostos que vinculam `company_id` ao registro pai em áreas importantes: inventário, locações, clientes, pagamentos, documentos, ocorrências e equipe.
- Esses FKs compostos são evidência de proteções de integridade entre empresas no estado remoto; ainda é necessário comparar integralmente suas definições com as migrations que os criaram.
- `company_members` ainda possui **3 vínculos com o papel `owner`**. Uma das três linhas pertence ao platform owner e está vinculada à empresa `Festejando`; essa empresa tem somente esse vínculo e zero registros nas 25 tabelas públicas auditadas que possuem `company_id`. As outras duas linhas são os vínculos operacionais de `Sonho Kids Brinquedos` e `Nobre Paladar`.
- A função remota `invite_company_member(uuid, uuid, text)` ainda aceita os papéis antigos `admin`, `manager` e `staff`; a função `add_company_member(uuid, uuid, text)` também aceita `manager`.
- A função remota `is_company_member(uuid)` ainda trata o platform owner como membro global para fins de autorização.
- `has_company_role(uuid, text[])` ainda mapeia o platform owner para o papel `owner`.
- A função remota `ensure_team_group(uuid)` ainda permite que o platform owner acione a garantia do grupo, embora as policies atuais impeçam o platform owner de inserir mensagens.
- A migration `20261120110000_normalize_platform_and_company_roles.sql` não está registrada no histórico remoto; por isso, seu novo modelo de cargos não pode ser considerado ativo em produção.
- A Edge Function `manage-employees` publicada não foi alterada por esta análise; sua publicação permanece pendente de autorização explícita.

### Políticas e funções que ainda refletem o modelo antigo

Consultas somente leitura adicionais em 2026-11-19 confirmaram que o isolamento estrutural por `company_id` está presente em diversos relacionamentos, mas isso não significa que as permissões estejam no modelo novo:

- A policy `platform_owner_all` em `public.company_members` concede `ALL` ao platform owner.
- A policy `team_conversations_select` permite leitura por `has_company_role(company_id, ['owner'])`; como `is_company_member(company_id)` também trata o platform owner como membro global, o platform owner consegue ler conversas e mensagens de empresas. As policies de escrita de mensagens e participação bloqueiam o platform owner. Isso corresponde a um modelo de leitura global somente, não ao isolamento mais restrito definido pela migration local de normalização.
- As policies de `team_conversation_members` ainda contêm exceções baseadas em `owner` e bypass explícito para platform owner.
- `add_company_member(uuid, uuid, text)` ainda aceita `manager`; `invite_company_member(uuid, uuid, text)` também aceita `manager` e autoriza um ator com papel `owner`.
- As funções acima são `SECURITY DEFINER`; suas validações de identidade e autorização e os privilégios EXECUTE precisam ser revisados como endpoints privilegiados, não apenas como helpers internos.
- A função remota `public.manage_company_member(uuid, uuid, text, text)` ainda não existe no catálogo; o fluxo transacional de alteração/remoção presente na branch depende da migration local posterior.

### Remoção de funcionário e revogação de acesso — verificação concluída

Consultas somente leitura no catálogo do Postgres confirmaram uma proteção importante já ativa:

- Existe a FK composta `team_members_company_member_fkey` em `team_conversation_members`: `(company_id, user_id) REFERENCES company_members(company_id, user_id) ON DELETE CASCADE`.
- Portanto, ao excluir o vínculo do funcionário em `company_members`, o banco remove automaticamente os vínculos correspondentes em `team_conversation_members`. Isso evita que a pessoa continue como participante de conversas após a remoção.
- As policies de leitura de `team_conversations`, `team_messages` e `team_conversation_members` também verificam `is_company_member(company_id)`; o acesso a dados da empresa é reavaliado no banco, não depende apenas de esconder a interface.
- Não foram encontrados triggers de usuário em `company_members` nem em `team_conversation_members`; a limpeza de participantes é garantida pela FK composta, não por trigger.
- A FK de participação tem `ON DELETE CASCADE`; a FK composta que referencia `team_conversations(company_id, id)` também tem `ON DELETE CASCADE`. A integridade entre empresa, conversa e participante está presente no estado remoto.

**Conclusão específica:** o mecanismo estrutural de remoção do participante do chat está ativo e foi confirmado no catálogo. A migration remota `20261117010919_revoke_company_data_access_after_member_removal` não deve ser considerada ausente em efeito apenas porque seu arquivo não está na branch; a FK composta correspondente existe. Ainda falta comparar a definição completa dessa migration remota com a FK e as policies atuais para reconciliar o histórico com segurança.

### Auditoria adicional de RPCs privilegiadas e RLS — 2026-11-19

A inspeção das definições efetivamente publicadas no Postgres identificou caminhos antigos que ainda estão executáveis por usuários autenticados:

- `public.add_company_member(uuid, uuid, text)` é `SECURITY DEFINER` e pode ser executada por `authenticated`. Sua versão remota aceita `admin`, `manager` e `staff`; o platform owner é reconhecido globalmente como `owner` por `has_company_role`. A função remota não verifica se o usuário de destino pertence a `private.platform_owners`. Assim, o platform owner pode inserir uma conta da plataforma em `company_members` como `admin`/ `staff`, inclusive a própria conta. A versão local de normalização adiciona a verificação explícita que impede vincular qualquer platform owner a uma empresa.
- `public.invite_company_member(uuid, uuid, text)` também é `SECURITY DEFINER` e executável por `authenticated`. A versão remota exige que o ator tenha vínculo real com papel `owner` ou `admin` na empresa; não concede convite global ao platform owner apenas por ser platform owner. Contudo, ainda aceita `manager` quando o ator é `owner`. A migration local de normalização troca a regra para `admin`/ `staff` e exige que o platform owner seja tratado separadamente.
- `public.ensure_team_group(uuid)` é `SECURITY DEFINER` e executável por `authenticated`. A versão remota permite explicitamente que o platform owner passe pela verificação sem vínculo em `company_members`, podendo criar o grupo geral da empresa e inserir todos os membros atuais como participantes. A migration local de normalização bloqueia platform owner e exige vínculo real em `company_members`.
- `public.has_company_role(company_id, roles)` retorna verdadeiro para platform owner quando a lista de papéis contém `owner`; `public.is_company_member(company_id)` também retorna verdadeiro globalmente para platform owner. As policies antigas usam esses helpers para acesso às conversas e para a exclusão de membros.
- `public.company_members` concede privilégios SQL de INSERT/UPDATE/DELETE a `authenticated`, mas a inspeção de RLS encontrou apenas policy de SELECT por membro, policy de DELETE por papel e policy ALL para platform owner; não há policies separadas de INSERT ou UPDATE para membros comuns. Portanto, os privilégios SQL não devem ser confundidos com autorização efetiva: para membros comuns, RLS continua restringindo essas operações. RPCs `SECURITY DEFINER` são os caminhos relevantes a auditar.
- As três funções antigas (`add_company_member`, `invite_company_member`, `ensure_team_group`) têm EXECUTE para `authenticated`, não para `anon`. Não foi encontrada a função remota `manage_company_member`; o fluxo transacional novo não está ativo em produção.
- No instante da consulta, `company_members` continha 3 vínculos `owner` e nenhum vínculo `admin`, `manager` ou `staff`. A consulta de associação com `private.platform_owners` confirmou que 1 dos 3 vínculos é do platform owner, na empresa `Festejando`; a empresa tem somente esse vínculo e nenhum registro nas 25 tabelas públicas auditadas com `company_id`. A migration remove essa associação global e converte os outros dois vínculos para `admin`, preservando o acesso administrativo a Sonho Kids Brinquedos e Nobre Paladar. A empresa Festejando permanece cadastrada, mas sem membros; isso deve ser revisado antes da aplicação em produção.

**Risco e ação requerida:** a migration local `20261120110000_normalize_platform_and_company_roles.sql` corrige os comportamentos descritos ao substituir as funções e policies, impedir a associação de platform owner como membro, restringir os papéis e bloquear o acesso global às conversas. Entretanto, essa migration ainda não foi aplicada. A suíte `platform_company_role_model.test.sql` agora cobre as tentativas diretas de inserir platform owner em `company_members`, convite com `manager`, uso de `ensure_team_group` pelo platform owner, leitura de conversas/mensagens/participantes pelo platform owner e alterações diretas de membros fora do RPC. As verificações validam a negação no banco, não apenas na interface.


### Auditoria de funções `SECURITY DEFINER` — estado remoto

- Foram encontradas 12 funções `SECURITY DEFINER` no schema `public`. Todas definem `search_path` vazio (`SET search_path = ''`) e nenhuma concede `EXECUTE` a `anon`.
- Oito dessas funções podem ser executadas por `authenticated`; incluem RPCs de onboarding/equipe e helpers de autorização. As validações de identidade e autorização foram revisadas individualmente para `add_company_member`, `invite_company_member` e `ensure_team_group`.
- `manage_company_member(uuid, uuid, text, text)` ainda não existe no remoto; será criada pela sequência local após a revisão do histórico. A Edge Function publicada `manage-employees` ainda é a implementação antiga e não foi atualizada em produção.
### Divergência da regra de cargos e acesso do platform owner

- O constraint remoto `company_members_role_check` ainda aceita `owner`, `admin`, `manager` e `staff`; a migration local de normalização pretende migrar vínculos `owner` para `admin`, `manager` para `staff` e restringir o constraint a `admin`/ `staff`.
- O estado remoto atual ainda permite leitura de conversas pelo platform owner, mas não escrita. A migration local `20261120110000_normalize_platform_and_company_roles.sql` altera esse comportamento e bloqueia o acesso do platform owner ao conteúdo das conversas. Essa diferença precisa ser mantida explícita na revisão de segurança e no plano de implantação.
- A migration local `20261120110000` já cria uma versão inicial de `manage_company_member`; `20261120120000` redefine a mesma função com validações adicionais (por exemplo, exige `p_role` nulo na remoção e impede gerenciar a conta do platform owner). A segunda migration é um hardening incremental, não deve ser tratada como função independente.

**Conclusão parcial:** os efeitos de integridade referencial de remoção de membro e de escopo por empresa estão presentes no banco. Em contrapartida, o modelo de cargos e a separação entre platform owner e membros da empresa continuam divergentes do estado proposto na branch. Não marcar uma migration como reconciliada apenas porque alguns efeitos relacionados já existem; constraints, policies e funções são camadas diferentes.

### Auditoria das migrations remotas de 13/11 — políticas e privilégios

- `20261113134849_tighten_public_schema_default_privileges`: no ACL padrão do proprietário `postgres` para o schema `public`, não há concessões padrão a `anon` em tabelas, sequências ou funções. `authenticated` mantém privilégios de tabela sujeitos a RLS. O catálogo atual confirma esse estado; ainda não foi recuperado o SQL original.
- `20261113135835_restrict_customer_and_product_deletes`: o estado final remoto tem DELETE de clientes permitido somente a owner/admin e DELETE de produtos protegido por policy restritiva owner/admin. A branch agora reproduz a regra de clientes em `20261112050000_prevent_customer_deletion.sql` e mantém a policy restritiva de produtos.
- `20261113140033_fix_rental_creator_and_assignee_read_access`, `20261113140039_avoid_rental_policy_recursion`, `20261113144522_remove_broad_rental_child_select_policies`, `20261113144740_allow_rental_creator_to_manage_rental` e `20261113152713_allow_authorized_rental_updates`: o estado remoto usa `private.is_team_conversation_member` para evitar recursão no chat e policies explícitas para criador/funcionário designado em locações, itens, unidades, eventos e responsáveis. A branch foi atualizada para reproduzir as políticas de leitura/edição/exclusão por criador ou designado e remove as policies amplas de `company_members_all` nas tabelas-filhas. A função `can_manage_rental` também foi atualizada para incluir o criador da locação, além de owner/admin e funcionário designado.
- `20261113141219_restrict_finance_document_and_stock_permissions` e `20261113141653_restrict_product_unit_and_maintenance_deletes`: no remoto, documentos, transações financeiras, movimentações de estoque, manutenção e unidades têm leitura/operações de membro conforme tabela, mas DELETE restrito a owner/admin. A migration local de normalização remove `company_members_all` dessas tabelas e cria policies explícitas, preservando `platform_owner_all`.
- `20261113142519_revoke_authenticated_maintain_privilege`: o catálogo confirma que `authenticated` não tem privilégio `MAINTAIN` em nenhuma tabela pública auditada.

Essas alterações foram incorporadas à migration local `20261120110000_normalize_platform_and_company_roles.sql` para que um banco limpo reproduza o estado de segurança final observado, em vez de herdar permissões amplas da migration inicial.

### Comparação dos quatro pares de migrations com nomes/versões diferentes

- **Catálogo de produtos:** `20261112030000_product_catalog` + `20261113025749_add_machine_catalog_type` + `20261113040000_allow_machine_product_units` formam, em conjunto, o modelo que existe no remoto: tipos `toy`, `machine` e `service`, preços por diária/evento, trigger de regras de catálogo e bloqueio de unidades físicas para serviços. A função remota também contém a proteção adicional de limite de unidades que aparece na migration local `20261113203747_protect_individual_unit_reservations_and_counts`.
- **Conversas somente leitura do platform owner:** a migration local `20261113050000_platform_owner_readonly_conversations` corresponde ao estado remoto anterior: platform owner pode ler, mas não escrever. A migration local posterior `20261120110000_normalize_platform_and_company_roles` altera a política proposta para bloquear também a leitura; os novos testes pgTAP cobrem esse estado final da branch.
- **Prevenção de exclusão de clientes:** o par `20261113003334_prevent_customer_deletion` / `20261112050000_prevent_customer_deletion` **não é equivalente no estado final**. O remoto não tem a policy restritiva `customers_prevent_delete_authenticated`; possui uma policy permissiva `customers_delete_owner_admin`, que permite DELETE por owner/admin (além do acesso global do platform owner). O arquivo local `20261112050000` originalmente criava uma policy restritiva `USING (false)`, que bloquearia DELETE também para administradores. A branch foi corrigida para remover essa policy antiga e criar `customers_delete_owner_admin`, reproduzindo o estado remoto final. A suíte `role_permissions.test.sql` agora verifica que staff não exclui clientes e admin pode excluí-los.
- **Unidades de máquinas:** a função remota `prevent_service_product_units` aceita `toy` e `machine`, rejeita `service`, exige inventário individual e mesma empresa, e também verifica o limite de unidades cadastradas. A cadeia local `20261113040000` + `20261113203747` cobre esses efeitos.

### Auditoria das migrations remotas de 17/11 — verificação do estado efetivo

Consultas somente leitura ao catálogo confirmaram os seguintes efeitos:

- As três migrations de FKs company-scoped (`20261117005923`, `20261117005941`, `20261117005958`) correspondem a **26 FKs compostas** atualmente presentes no banco, incluindo vínculos empresa-produto, empresa-locação, empresa-cliente, empresa-membro, empresa-conversa e empresa-transação. As definições verificadas incluem o mesmo `company_id` nos dois lados da referência, evitando referências cruzadas entre empresas. As 26/26 possuem índice válido com as colunas da FK no prefixo; nenhuma FK composta auditada ficou sem índice de suporte.
- A migration `20261117010018_index_company_scoped_foreign_keys`: os índices de prefixo das FKs compostas auditadas estão presentes. A auditoria não declara que toda FK simples do schema tenha índice; o foco desta confirmação é o conjunto company-scoped.
- A migration `20261117010059_enforce_product_unit_and_payment_rental_consistency`: estão presentes as FKs compostas que ligam unidades ao produto da mesma empresa e pagamentos à locação/transação da mesma empresa, inclusive a constraint de correspondência entre `company_id`, `rental_id` e `transaction_id`.
- A migration `20261117010616_ensure_single_team_group_per_company`: o índice único parcial `team_conversations_one_team_group_per_company_idx` está presente em `(company_id)` com predicado `conversation_type = 'team'`.
- A migration `20261117010919_revoke_company_data_access_after_member_removal`: a FK composta `team_members_company_member_fkey` mantém `ON DELETE CASCADE`; a remoção do vínculo da empresa remove a participação nas conversas.
- A migration `20261117011036_allow_authorized_company_member_removal`: a policy `company_members_delete_authorized_admins` está presente. Sua expressão impede apagar registros com papel `owner`; permite remoção por papel `owner` e permite que `admin` remova somente registros `staff`. No modelo novo, após a conversão dos cargos, o administrador da empresa remove apenas funcionários.
- A migration `20261117014514_prevent_company_members_from_changing_own_role`: não há policy de UPDATE para `company_members` nem trigger de usuário nessa tabela. O papel `authenticated` ainda possui privilégio SQL UPDATE, mas o RLS sem policy de UPDATE bloqueia a alteração direta por membros comuns. A policy `platform_owner_all` continua concedendo acesso total ao proprietário da plataforma. Portanto, a proteção efetiva para administradores/funcionários vem do RLS, não de trigger.

**Novo achado de segurança:** a policy remota `company_members_delete_authorized_admins` permite ao administrador excluir funcionários diretamente pela Data API, contornando o novo RPC transacional `manage_company_member` e os locks de concorrência. A branch foi corrigida para remover essa policy e também `platform_owner_all` de `company_members` na migration `20261120110000_normalize_platform_and_company_roles.sql`. A leitura continua pela policy de SELECT; toda escrita, inclusive pelo platform owner, passa pelos RPCs transacionais.

A revisão do catálogo também revelou que o estado remoto não tinha `platform_owner_all` nas tabelas de chat, enquanto a migration histórica `20261107165500_global_platform_owner_and_company_settings` criava essas policies no banco limpo. A migration local `20261120110000` foi corrigida para removê-las explicitamente de `team_conversations`, `team_messages` e `team_conversation_members`, antes de aplicar as policies de isolamento. Os testes diretos de leitura de chat pelo platform owner verificam esse cenário.

Os arquivos SQL originais de `20261117011036` e `20261117014514` não estão no diretório atual da branch e não foram encontrados no histórico Git do repositório. Os efeitos acima foram classificados a partir do catálogo remoto; não se deve inventar ou reconstruir o SQL original nem marcar a reconciliação de histórico como concluída apenas por semelhança de efeitos.

### Testes de isolamento do chat e gerenciamento transacional

- A suíte `platform_company_role_model.test.sql` foi ampliada para **36 verificações**; `foundation.test.sql` agora tem 26 verificações de políticas e `role_permissions.test.sql` tem 5 verificações de catálogo e exclusão por cargo.
- Além de validar que platform owner não consegue executar `ensure_team_group`, agora cria uma conversa e mensagem como administrador e verifica que platform owner não consegue ler conversas, mensagens nem participantes diretamente via RLS.
- Também valida que administrador não pode remover a própria associação pela RPC nem contornar a RPC transacional usando DELETE direto na tabela; platform owner também não pode inserir vínculo diretamente na tabela.
- A migration de normalização remove a policy de DELETE direto de membros comuns; a remoção autorizada de funcionários fica concentrada no RPC transacional.

## Próxima sequência de trabalho

1. Comparar cada uma das migrations remotas ausentes com o estado real de constraints, índices, triggers, funções e policies.
2. Classificar separadamente constraints, índices, policies e funções. FKs compostos observados não comprovam que as policies e funções de autorização também estejam atualizadas.
3. Comparar os sete arquivos locais sem registro remoto, incluindo os quatro pares de intenção semelhante e os três arquivos locais sem equivalente remoto; o arquivo histórico `202611090001_foundation.sql` foi recuperado e classificado como fundação obsoleta, fora da branch atual.
4. Criar migrations corretivas com versões inéditas apenas para efeitos comprovadamente ausentes ou incorretos, sem no-op e sem reaplicar a migration destrutiva de reconstrução do núcleo de locações.
5. Reexecutar CI e revisar o plano de aplicação. A execução remota exige autorização explícita separada.

## Regra operacional

Não executar `db push`, `migration repair`, aplicação de migrations, publicação de Edge Functions ou merge como parte deste diagnóstico. O objetivo é primeiro produzir uma sequência reproduzível e segura para a fundação.

### Revalidação do catálogo remoto — 19/11

Uma nova leitura direta de `pg_policies`, `pg_constraint` e `pg_trigger` confirmou o estado efetivo após a auditoria anterior:

- `company_members_role_check` ainda aceita exatamente os quatro papéis antigos/atuais: `owner`, `admin`, `manager` e `staff`. Não há trigger de usuário em `company_members`; a normalização de cargos depende da migration, não de trigger.
- O banco continua com 3 vínculos `owner`; a associação com `private.platform_owners` confirma que 1 deles pertence ao platform owner. Assim, a migration de normalização removerá somente esse vínculo global, converterá os outros dois para `admin` e deixará a empresa Festejando sem membros. Essa consequência continua pendente de revisão antes de qualquer implantação.
- As policies efetivamente publicadas em `team_conversations`, `team_messages` e `team_conversation_members` ainda usam exceções `owner` para leitura e administração. Em particular, `team_conversations_select`, `team_messages_select_participant` e `team_members_select_participants` não excluem explicitamente o platform owner; como os helpers remotos ainda o reconhecem como membro global/`owner`, ele mantém leitura global do chat. As policies de INSERT/DELETE do chat têm bloqueios explícitos ao platform owner, mas isso não remove a leitura.
- `company_members_delete_authorized_admins` e `platform_owner_all` ainda estão presentes no remoto. Não há policy de UPDATE para membros comuns, e não há trigger; a policy `platform_owner_all` permanece como caminho global de escrita até a migration local removê-la.
- As três RPCs antigas `add_company_member`, `invite_company_member` e `ensure_team_group` continuam `SECURITY DEFINER`, com `search_path` vazio e EXECUTE para `authenticated`; `manage_company_member` ainda não existe remotamente.

**Implicação:** o estado remoto continua divergente do modelo final da branch em constraints, policies de chat, escrita de memberships e RPCs. As migrations locais `20261120110000` e `20261120120000` cobrem parte dessas correções no banco reconstruído e nos testes, mas ainda não foram aplicadas ao projeto remoto. Não executar repair, push ou deploy nesta etapa.



### Rechecagem pontual de escrita em `company_members` — 19/11, leitura direta do catálogo

- A policy remota `company_members_delete_authorized_admins` está ativa para `authenticated`. Sua expressão efetiva permite ao papel antigo `owner` excluir qualquer vínculo que não seja `owner`, e permite a `admin` excluir apenas linhas cujo cargo seja `staff`.
- A policy remota `platform_owner_all` também está ativa para `authenticated`, com comando `ALL` e condição `is_platform_owner()` tanto em USING quanto em WITH CHECK. Ela é o caminho de escrita global do platform owner até a migration de normalização removê-la.
- `authenticated` possui grants SQL de SELECT/INSERT/UPDATE/DELETE na tabela. Esses grants, isoladamente, não autorizam a operação: INSERT e UPDATE continuam sem policy RLS específica para esse papel; DELETE é controlado pela policy acima; o platform owner recebe a exceção da policy ALL.
- Não há triggers de usuário em `company_members`. O constraint remoto continua aceitando `owner`, `admin`, `manager` e `staff`.
- A consulta de privilégios de rotina confirmou EXECUTE para `authenticated` em `add_company_member` e `invite_company_member`; `manage_company_member` ainda não existe no remoto.
- A migration `20261120110000` remove as duas policies de escrita direta; `20261120120000` endurece a RPC transacional, rejeitando cargo não nulo em remoção e impedindo que o vínculo do platform owner seja alvo de gerenciamento. A sequência local é coerente com os testes, mas não está implantada.



### Reconsulta do ledger remoto e tentativa de recuperação dos SQLs — 19/11

- A função de listagem de migrations do próprio Supabase retornou novamente o ledger remoto completo, incluindo as versões `20261113003334`, `20261113012143`, `20261113030743`, `20261113043836`, `20261117011036` e `20261117014514`. O inventário de **60 versões remotas** permanece consistente.
- Foram consultados os históricos de commits do GitHub para os seis caminhos SQL dessas migrations remotas sem correspondência local (os quatro pares com versão/nome alternativo e as duas migrations de gerenciamento de membros). Todos retornaram lista vazia: esses caminhos não aparecem no histórico de commits acessível deste repositório. Isso não prova que nunca existiram fora deste repositório, mas significa que não temos o SQL original recuperável por esse histórico.
- A reconsulta direta das policies confirma que `company_members_delete_authorized_admins` e `platform_owner_all` permanecem ativas em `company_members`; no chat, as policies de leitura continuam usando `has_company_role(..., ['owner'])` e `is_company_member(...)`, enquanto as policies de escrita de conversa/mensagem/participantes bloqueiam explicitamente o platform owner. Assim, a leitura global atual decorre dos helpers de autorização legados, não de uma policy `platform_owner_all` nas tabelas de chat.
- As migrations remotas `20261117011036` e `20261117014514` não podem ser reconstruídas com segurança como SQL original. O catálogo observado permite descrever os efeitos atuais: DELETE autorizado por policy para owner/admin; ausência de policy RLS de UPDATE e de trigger de usuário para impedir alteração direta de cargo. Os grants SQL de UPDATE existem, mas RLS sem policy impede a escrita por membros comuns; a policy `platform_owner_all` ainda é a exceção global até a normalização local.
- A decisão segura permanece: preservar as versões remotas no ledger; não usar `migration repair` para fingir equivalência; não criar arquivos placeholder com os IDs remotos; e manter a sequência local reproduzível como fonte de estado desejado. Qualquer baseline ou migration corretiva futura deve ser criada somente após comparar o schema completo e executar uma validação em banco isolado, sem aplicar no projeto de produção nesta etapa.



## Rechecagem do efeito de remover o vínculo global — 20/11/2026

Consulta somente leitura ao catálogo remoto confirmou que a migration de normalização removerá o único vínculo de platform owner da empresa **Festejando**, mantendo a empresa cadastrada, mas sem membros. Os vínculos de Sonho Kids Brinquedos e Nobre Paladar permanecem e serão convertidos de `owner` para `admin`.

Foram identificadas três FKs que referenciam `company_members(company_id, user_id)`:
- `fcm_device_tokens(company_id, user_id)`: `ON DELETE CASCADE`.
- `team_conversation_members(company_id, user_id)`: `ON DELETE CASCADE`.
- `rental_responsibles(company_id, user_id)`: `ON DELETE SET NULL (user_id)`.

Na empresa Festejando, a consulta específica encontrou zero registros relacionados nas três tabelas filhas (tokens FCM, participantes de conversa e responsáveis de locação). A auditoria anterior também encontrou zero registros nas 25 tabelas públicas operacionais com `company_id`. Portanto, a remoção não deve apagar dados operacionais conhecidos dessa empresa; ainda assim, a empresa ficará sem administrador e precisará de uma decisão antes de qualquer implantação: manter como empresa legada vazia, atribuir outro administrador válido ou remover a empresa em uma operação futura separada (não incluída nesta migration).

Nenhuma linha foi alterada. Esta verificação foi somente leitura e não autoriza a aplicação da migration.


### Rechecagem do identificador `20261117015419` e do fluxo de convite — 20/11/2026

A versão `20261117015419_invite_company_member_transactionally.sql` existe tanto no ledger remoto quanto na branch. Porém, a presença do mesmo identificador **não comprova equivalência do conteúdo SQL**:

- A definição remota de `public.invite_company_member(uuid, uuid, text)` ainda aceita `manager` e exige vínculo real do ator com papel `owner` ou `admin`.
- O arquivo local com esse mesmo identificador define somente `admin` e `staff`, trata o platform owner separadamente e impede vinculá-lo como membro de empresa.
- O arquivo local posterior `20261120110000_normalize_platform_and_company_roles.sql` também redefine a RPC para o modelo final; `20261120120000_manage_company_member_transactionally.sql` adiciona a operação transacional de alteração/remoção de membros.
- Portanto, a função atualmente publicada diverge do conteúdo desejado pela branch, mesmo que o identificador conste como aplicado no ledger. Não se deve editar o ledger nem reaplicar a versão `20261117015419`; a correção de produção precisa ocorrer por migration nova e inédita, após validação integral do plano.

### CI do commit documental `34a2705a535082dd35bcc11f626c347db61004a3` — 20/11/2026

Os três workflows associados a esse commit terminaram com sucesso:
- `Web - test and deploy GitHub Pages` — sucesso.
- `Web - pull request checks` — sucesso.
- `Supabase migration checks` — sucesso, incluindo type-check, `supabase db reset`, Auth/onboarding E2E e pgTAP.

Essa aprovação valida a reconstrução local da branch; não prova igualdade total com o banco remoto nem autoriza implantação.


### Rechecagem de privilégios padrão e catálogo de produtos — 20/11/2026

A auditoria dos privilégios padrão foi refinada por proprietário dos objetos, para não generalizar o resultado:

- Para objetos criados por `postgres` no schema `public`, os privilégios padrão consultados não concedem acesso a `anon` em tabelas, sequências ou funções.
- Existem, porém, ACLs padrão separadas para `supabase_admin` que incluem `anon` em tabelas, sequências e funções. Isso não se traduz em acesso aos objetos atuais auditados: as 28 tabelas e 2 sequências públicas encontradas pertencem a `postgres` e `anon` não possui SELECT/INSERT/UPDATE/DELETE nelas; nenhuma das 18 funções públicas auditadas concede EXECUTE a `anon`.
- Assim, o estado atual dos objetos públicos está fechado a `anon`, mas a ACL padrão de `supabase_admin` continua sendo uma questão separada a esclarecer. Não marcar a migration `20261113134849_tighten_public_schema_default_privileges` como reconciliada apenas pela ausência de grants nos objetos atuais.

A comparação adicional do catálogo de produtos confirmou que o estado remoto corresponde à cadeia local `20261112030000`, `20261113025749`, `20261113040000` e `20261113203747`:
- Constraints aceitam `toy`, `machine` e `service` e impõem as regras de preço/inventário esperadas.
- `enforce_product_catalog_rules` impede reduzir a quantidade total abaixo das unidades físicas cadastradas e impede alterar tipo/controle quando há histórico ou unidades.
- `prevent_service_product_units` bloqueia serviços, exige controle individual e mesma empresa, trava o produto com `FOR UPDATE` e limita a quantidade de unidades cadastradas ao estoque total.
- Os triggers correspondentes estão presentes no remoto. A função e os triggers observados correspondem ao SQL da cadeia local, inclusive à proteção incremental de contagem.

Nenhum dado ou privilégio foi alterado nesta verificação.


### Mapeamento do arquivo local `20261113060000` — 20/11/2026

A função `public.is_platform_owner_for_company()` existe no remoto com a mesma implementação funcional do arquivo local `20261113060000_grant_platform_owner_check_to_authenticated.sql`: `SECURITY DEFINER`, `search_path` vazio, consulta defensiva a `private.is_platform_owner()` e retorno booleano. O ACL remoto permite EXECUTE a `authenticated` e `service_role`, não a `anon`. Portanto, o efeito funcional deste arquivo local sem versão remota correspondente já está presente no catálogo remoto; a divergência é do identificador/histórico, não da função observada.

Com isso, os arquivos locais sem identificador remoto foram mapeados por categoria:
- Arquivo legado `202611090001_foundation.sql`: excluído da branch por ser obsoleto.
- `20261112030000`, `20261112050000`, `20261113040000` e `20261113050000`: pares funcionais avaliados junto com as versões remotas de identificadores diferentes e as migrations locais subsequentes.
- `20261113060000`: efeito funcional já confirmado no catálogo remoto.
- `20261120110000` e `20261120120000`: novas correções/hardening ainda ausentes do remoto e não aplicadas.

Este mapeamento não substitui a revisão dos SQLs originais ausentes, nem significa que o histórico de migrations esteja reconciliado.


### Integração da tela de equipe com as RPCs transacionais — 20/11/2026

A revisão do fluxo da tela `/equipe/` encontrou duas incompatibilidades com a migration de normalização:

- A remoção de funcionário ainda tentava executar `DELETE` direto em `company_members`. A migration `20261120110000` remove a policy que permitia essa escrita direta, concentrando as alterações no RPC transacional.
- A tela ainda oferecia o cargo legado `manager` para contas com papel `owner`; a nova regra permite somente `admin` e `staff`. A Edge Function antiga poderia criar/enviar o convite antes de a RPC rejeitar `manager`, deixando uma conta convidada sem vínculo.

Correções realizadas na branch:
- A tela agora usa `manage_company_member` para mudança de cargo e remoção, em vez de `add_company_member` para tudo e `DELETE` direto na tabela.
- Para administradores de empresa, a interface mostra o cargo dos funcionários e oferece remoção; não apresenta um seletor de cargo que só permitiria escolher novamente `staff`.
- O cargo `manager` foi removido das opções de convite/alteração.
- A Edge Function `invite-company-member` agora rejeita `manager` antes de enviar o e-mail.

Arquivos alterados:
- `web/nextjs_app/app/equipe/team-management.tsx`
- `supabase/functions/invite-company-member/index.ts`

As alterações estão na branch `chore/foundation-reconciliation-verify`. Os workflows de validação foram disparados para o novo commit e ainda precisam terminar antes de considerar a correção validada. Nenhuma Edge Function foi publicada e nenhuma alteração foi aplicada ao Supabase remoto.

### Rechecagem de ACL padrão, tabela de entregas de lembretes e Security Advisors — 2026-11-20

- A consulta de `pg_default_acl` confirmou que, para objetos criados por `postgres` no schema `public`, os privilégios padrão não concedem acesso a `anon`. `authenticated` recebe grants padrão de tabela, sequência e execução de funções; o acesso efetivo continua sujeito a RLS e às validações das funções.
- Também existem ACLs padrão distintas para o role administrativo `supabase_admin`, incluindo grants a `anon` em tabelas, sequências e funções. A auditoria de propriedade confirmou que **nenhum objeto atualmente existente no schema `public` é de propriedade de `supabase_admin`**; os objetos públicos consultados pertencem a `postgres`. Portanto, não foi identificado acesso atual de `anon` decorrente desses defaults. O risco é prospectivo para objetos que venham a ser criados por `supabase_admin`; não alterar defaults gerenciados pela plataforma sem identificar a origem e o propósito.
- A tabela `public.rental_event_reminder_deliveries` tem RLS habilitado e nenhuma policy. A migration de origem `20261107165534_event_reminder_notifications_schema.sql` documenta explicitamente que é um ledger de idempotência exclusivo do `service_role`, revoga todos os privilégios de `anon`/`authenticated` e concede `ALL` a `service_role`. A checagem de privilégios efetivos confirmou que `anon` e `authenticated` não têm SELECT nem INSERT, enquanto `service_role` tem SELECT. Portanto, a ausência de policy é intencional e não representa exposição pela Data API; o Advisor `rls_enabled_no_policy` é informativo neste caso.
- Os Security Advisors também apontaram oito funções `SECURITY DEFINER` executáveis por `authenticated`: `add_company_member`, `can_manage_rental`, `create_company`, `ensure_team_group`, `has_company_role`, `invite_company_member`, `is_company_member` e `is_platform_owner_for_company`. Todas as oito têm `search_path` vazio e EXECUTE negado a `anon`; a execução por `authenticated` é explícita e deve ser avaliada função a função, pois algumas são RPCs de produto e outras helpers usados por RLS.
- A rechecagem das definições remotas confirmou que ainda estão ativos os comportamentos antigos já descritos: `add_company_member` e `invite_company_member` aceitam `manager`; `add_company_member` reconhece o platform owner pelo papel global e não bloqueia destino que seja platform owner; `ensure_team_group` ainda permite bypass para platform owner sem vínculo empresarial. As migrations locais `20261120110000` e `20261120120000` contêm as correções propostas, mas não estão aplicadas no projeto remoto.
- O Advisor de Auth também informa que a proteção contra senhas vazadas está desativada. É uma configuração de Auth separada das migrations; não foi alterada.
- Nenhuma alteração foi feita no banco remoto, nos privilégios, em Auth ou nas Edge Functions. Os resultados acima foram obtidos por consultas somente leitura e pelo Security Advisor.

### Revalidação direta das policies de membros e chat — 20/11/2026

Nova leitura de `pg_policies`, `pg_constraint` e `pg_proc` confirma os seguintes efeitos atuais no banco remoto:

- `company_members_role_check` continua aceitando `owner`, `admin`, `manager` e `staff`. Não há triggers de usuário em `company_members`; portanto, a restrição atual de cargos depende da constraint e das RPCs, não de trigger.
- A policy `company_members_delete_authorized_admins` continua permitindo DELETE direto: o papel legado `owner` pode remover qualquer vínculo que não seja `owner`, e `admin` pode remover `staff`. A policy `platform_owner_all` continua permitindo ao platform owner SELECT/INSERT/UPDATE/DELETE global nessa tabela. A branch remove ambas as policies para obrigar o uso das RPCs validadas.
- Não há policy RLS de UPDATE para membros comuns nem trigger de usuário que proteja a coluna `role`. Com grants SQL de UPDATE, a ausência de policy impede alteração direta por membros comuns; a exceção remota continua sendo `platform_owner_all`. Assim, o efeito observado da migration remota `20261117014514_prevent_company_members_from_changing_own_role` não equivale a uma proteção completa contra a exceção global do platform owner.
- As policies remotas de leitura de chat ainda permitem acesso global indireto: `team_conversations_select` usa `is_company_member(company_id)` e `has_company_role(company_id, ['owner'])`; `team_messages_select_participant` e `team_members_select_participants` também usam os helpers legados. No remoto, `is_company_member` retorna verdadeiro para platform owner e `has_company_role(..., ['owner'])` também o reconhece como owner global. As policies de INSERT/DELETE do chat já bloqueiam explicitamente o platform owner, mas as policies SELECT não o fazem.
- Correção importante de interpretação do relatório: a migration local `20261120110000_normalize_platform_and_company_roles.sql` **não redefine** os helpers globais `is_company_member`/ `has_company_role`. Ela remove as policies globais de chat e recria as policies SELECT com `NOT private.is_platform_owner()`, além de trocar as exceções de papel `owner` por `admin`. O bloqueio proposto decorre dessas policies explícitas, não de uma alteração dos helpers. O relatório deve ser lido com essa distinção.
- A migration local também redefine `ensure_team_group` para exigir membership real e negar platform owner; no remoto a função ainda permite bypass global. A versão local de `invite_company_member` rejeita `manager` e separa platform owner de membros de empresa; a função remota ainda aceita `manager` e só permite ator com vínculo `owner/admin`.
- A função remota `add_company_member` ainda aceita `manager`, trata platform owner como owner global por meio de `has_company_role` e não bloqueia explicitamente o usuário-alvo caso ele seja o próprio platform owner. A versão local restringe os cargos a `admin/staff`, trata o platform owner como ator global de forma explícita e impede vinculá-lo como alvo.
- A função local `manage_company_member` na migration `20261120120000` bloqueia autoalteração/autorremoção, bloqueia como alvo qualquer conta registrada em `private.platform_owners`, exige `p_role IS NULL` em remoção e serializa as alterações com `FOR UPDATE` sobre ator e alvo. Essa função não existe no banco remoto.

#### Classificação das migrations remotas sem SQL recuperável

- `20261117011036_allow_authorized_company_member_removal`: o catálogo atual comprova que existe uma policy de DELETE autorizada para owner/admin, mas não comprova o SQL original nem toda a intenção da migration. A policy permite escrita direta fora da RPC transacional; a branch propõe removê-la e centralizar a operação em `manage_company_member`.
- `20261117014514_prevent_company_members_from_changing_own_role`: o catálogo atual comprova ausência de policy UPDATE para membros comuns e ausência de trigger, mas também mostra a policy global `platform_owner_all`. Não é possível atribuir com segurança esse estado ao SQL original da migration nem afirmar que ela protege todos os atores. O hardening local remove o caminho global e exige RPC.
- As duas migrations permanecem sem SQL original recuperável. Não foram reconstruídas nem declaradas equivalentes; a classificação acima descreve apenas o catálogo efetivamente observado.

Nenhum dado, policy, função ou privilégio foi alterado no Supabase remoto. Esta atualização é documental e baseada em consultas somente leitura.

### Endurecimento da RPC legada `add_company_member` — 20/11/2026

- A busca no código da branch confirmou que a tela atual de equipe não chama `add_company_member`; usa `manage_company_member` para alteração/remoção e a Edge Function de convite chama `invite_company_member`. A RPC `add_company_member` continua, contudo, executável por `authenticated` e é coberta por testes pgTAP, portanto não foi removida nem teve seu grant revogado nesta etapa.
- A revisão identificou que a versão local da RPC verificava o papel do administrador por `has_company_role`, mas não bloqueava a linha de membership do ator. Uma mudança concorrente de cargo/remoção poderia ocorrer entre a autorização e a inclusão do novo membro.
- A migration local `20261120110000_normalize_platform_and_company_roles.sql` foi endurecida: para ator que não seja platform owner, agora lê e bloqueia com `SELECT ... FOR UPDATE` o vínculo do próprio ator e confirma que seu cargo ainda é `admin` antes de continuar. Isso serializa a autorização com a RPC transacional de alteração/remoção, que também bloqueia a linha do ator/alvo.
- A lógica de destino foi preservada: somente platform owner pode atribuir `admin`; administrador de empresa só gerencia `staff`; contas registradas como platform owner não podem ser vinculadas como membros. A RPC continua no código para compatibilidade, mas não é usada pela UI atual.
- Esta alteração está somente na branch. Ainda precisa passar pelo reset do banco local, pgTAP e workflows CI; não foi aplicada no Supabase remoto.

### Pré-condições de normalização de cargos e singleton — 20/11/2026

Consulta somente leitura ao remoto confirmou:
- `private.platform_owners` contém exatamente 1 linha e 1 usuário distinto; portanto, o índice único parcial/constraint singleton proposto não encontrará duplicidade no estado observado.
- `company_members` contém exatamente 3 vínculos, todos com papel `owner`; não há vínculos remotos com `admin`, `manager` ou `staff` neste momento.
- Os três vínculos correspondem às empresas Sonho Kids Brinquedos, Nobre Paladar e Festejando. A conta registrada como platform owner possui 1 vínculo, na Festejando; os outros dois vínculos owner serão convertidos para admin.
- Assim, após a normalização prevista, Sonho Kids Brinquedos e Nobre Paladar terão um admin cada; Festejando continuará cadastrada, porém sem membros, salvo decisão de atribuir outro administrador antes da implantação.
- Essa verificação confirma que o índice singleton não falha por duplicidade e quantifica a conversão de cargos, mas não resolve a decisão operacional sobre Festejando. Nenhuma linha foi alterada.


### Revalidação independente de integridade referencial e função de platform owner — 20/11/2026

Nova consulta somente leitura ao catálogo remoto confirmou:

- Existem **26 FKs compostas com escopo empresarial** (incluindo `company_id` na relação); as **26/26 possuem índice válido e pronto** com as colunas da FK no prefixo. Não foi encontrado índice ausente nessa família.
- Permanecem presentes as FKs compostas que vinculam pagamentos, transações financeiras e locações; o vínculo de pagamento com transação também exige correspondência de `company_id` e `rental_id`, além do identificador da transação.
- O índice único parcial `team_conversations_one_team_group_per_company_idx` existe e limita a uma conversa do tipo `team` por empresa.
- A tabela `private.platform_owners` tem RLS habilitado. O ACL observado concede SELECT a `authenticated`, sujeito à policy `platform_owners_select_self`, que limita a leitura ao próprio `auth.uid()`.
- A função `private.is_platform_owner()` é `SECURITY DEFINER`, tem `search_path` vazio e EXECUTE concedido a `authenticated`, não a `anon`. A implementação consulta a tabela privada pelo usuário autenticado. Não foi encontrada exposição anônima nessa função.

### Busca de SQLs originais ausentes no histórico Git — 20/11/2026

A busca no histórico de commits do repositório para os caminhos abaixo retornou zero commits; portanto, não há cópia desses arquivos recuperável pelo histórico de caminhos do repositório:

- `20261113134849_tighten_public_schema_default_privileges.sql`
- `20261117005923_enforce_company_scoped_inventory_foreign_keys.sql`
- `20261117010919_revoke_company_data_access_after_member_removal.sql`
- `20261117011036_allow_authorized_company_member_removal.sql`
- `20261117014514_prevent_company_members_from_changing_own_role.sql`

Isso não prova que os SQLs não existam em backups externos ou em outro repositório; apenas confirma que não foram localizados no histórico de caminhos deste repositório. Os efeitos devem continuar sendo descritos a partir do catálogo observado, sem inventar o conteúdo original.

A contagem foi recalculada diretamente em 20/11/2026: **60 migrations remotas**, **44 arquivos locais**, **23 versões remotas sem ID local exato** e **7 arquivos locais sem ID remoto exato**. A divergência de identificadores não foi reparada nem mascarada.

Nenhum dado, privilégio, policy, função, migration ou configuração remota foi alterado nesta revalidação.


### Auditoria ampliada de superfície pública, Storage e Security Advisors — 20/11/2026

Nova rechecagem somente leitura do catálogo e dos Security Advisors:

- O schema `public` contém **28 tabelas base e todas as 28 têm RLS habilitado**. Não foram encontradas views nem materialized views no schema `public`.
- As **18 funções públicas** observadas não concedem EXECUTE efetivo a `anon`; nenhuma das 28 tabelas concede SELECT/INSERT/UPDATE/DELETE efetivo a `anon`. Isso confirma a ausência de acesso anônimo efetivo nos objetos públicos consultados, sem generalizar essa conclusão para objetos futuros criados por outros proprietários.
- Os oito avisos do Advisor sobre funções `SECURITY DEFINER` executáveis por `authenticated` correspondem a funções já inventariadas. A inspeção de definições confirmou `search_path = ''` em todas as funções privilegiadas consultadas e ausência de EXECUTE para `anon`. O fato de o Advisor sinalizar execução autenticada não é, isoladamente, prova de vulnerabilidade; cada função precisa manter validação de `auth.uid()` e autorização adequada. As RPCs antigas de membros continuam sendo diferenças reais a corrigir pela sequência local.
- O aviso `rls_enabled_no_policy` em `rental_event_reminder_deliveries` permanece intencional: tabela de idempotência exclusiva de `service_role`, sem grants efetivos para `anon` ou `authenticated`.
- Os quatro buckets observados no Storage — `company-branding`, `occurrence-photos`, `product-images` e `rental-contracts` — estão configurados como **privados**. Os limites observados são 5 MiB para branding, 8 MiB para fotos/imagens e 10 MiB para contratos; os tipos MIME permitidos estão restritos a JPEG/PNG, JPEG/PNG/WebP ou PDF conforme o bucket. As policies de `storage.objects` vinculam os caminhos a empresa e registros correspondentes, com regras de autorização por função/associação.
- O Advisor de performance aponta **26 FKs simples sem índice de cobertura**, distintas das **26 FKs compostas com escopo empresarial** já verificadas e indexadas 26/26. Portanto, a afirmação anterior sobre os índices compostos continua correta, mas não significa que todas as FKs do banco estejam indexadas. Os 26 avisos simples devem ser avaliados por frequência de consulta, cardinalidade e custo de escrita antes de criar índices; nenhum índice foi criado nesta auditoria.
- O Advisor também aponta 18 índices sem uso observado e 69 ocorrências de policies permissivas sobrepostas. São avisos de análise, não autorização para remover índices ou policies: a amostra de uso pode ser curta, e várias sobreposições decorrem deliberadamente das policies globais do platform owner ou de políticas complementares. Nenhuma foi removida nesta etapa.
- O Advisor de Auth continua apontando proteção contra senhas vazadas desativada. É uma configuração de Auth independente e não foi alterada.

**Classificação:** não foi identificado acesso anônimo efetivo às 28 tabelas ou às 18 funções públicas consultadas. Permanecem diferenças funcionais conhecidas no modelo de cargos/RPCs, questões prospectivas de ACL padrão de `supabase_admin`, avisos de performance e a configuração de proteção contra senhas vazadas. Nenhum dado, privilégio, policy, índice, bucket, função, migration ou configuração remota foi alterado.


### Esclarecimento sobre ACLs padrão de `supabase_admin` e extensões — 20/11/2026

A investigação foi aprofundada com o catálogo de extensões e a documentação oficial atual do Supabase:

- As ACLs padrão amplas de `supabase_admin` são gerenciadas pela plataforma. A documentação do Supabase informa que o usuário `postgres` não pode alterá-las; o role interno é usado em tarefas administrativas e na criação de objetos de extensões.
- A documentação esclarece que serviços Supabase não criam tabelas, views ou funções em `public` como `supabase_admin`; o caso relevante é principalmente a instalação de extensões em `public`. As ACLs padrão do role só afetam objetos que ele próprio cria.
- A consulta de `pg_extension` encontrou `pg_stat_statements`, `pgcrypto` e `uuid-ossp` no schema `extensions`, `supabase_vault` no schema `vault` e `plpgsql` em `pg_catalog`. **Nenhuma extensão está instalada em `public`**.
- A auditoria anterior também confirmou que nenhum objeto atual do schema `public` pertence a `supabase_admin`. Assim, não há objeto público atual exposto por essas ACLs padrão.
- A ação preventiva correta é continuar instalando extensões no schema `extensions` quando suportado e verificar a propriedade dos objetos após upgrades; não tentar revogar ou alterar diretamente os defaults internos de `supabase_admin`.

**Reclassificação:** a ACL padrão de `supabase_admin` deixa de ser tratada como alteração pendente do projeto. É um comportamento interno documentado do Supabase, sem objetos públicos atuais afetados. O efeito dos defaults de `postgres` continua confirmado como restrito para `anon`; o SQL original da migration remota não foi recuperado, então a equivalência histórica exata permanece não comprovada.


### Correção da herança de EXECUTE para novas funções — 20/11/2026

Uma revisão mais profunda de `pg_default_acl` identificou uma nuance que a checagem anterior por schema não cobria:

- O ACL padrão específico de `public` para funções criadas por `postgres` não inclui `anon`, mas não havia entrada global de default ACL para funções de `postgres`.
- No PostgreSQL, a ausência dessa revogação global mantém o EXECUTE padrão de `PUBLIC`; como `anon` herda privilégios de `PUBLIC`, uma função nova criada por `postgres` poderia ficar executável anonimamente, mesmo sem grant direto a `anon` no ACL específico do schema.
- A documentação oficial do Supabase confirma que um REVOKE limitado a `IN SCHEMA public` não remove o EXECUTE global de `PUBLIC`; a revogação precisa ser global: https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema-448af9 e https://supabase.com/docs/guides/api/securing-your-api.
- **Correção incluída na branch:** a migration local `20261120110000_normalize_platform_and_company_roles.sql` agora executa `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`. Os grants diretos de RPCs necessários permanecem explícitos; a alteração não revoga EXECUTE de funções já existentes.
- **Teste incluído:** `platform_company_role_model.test.sql` passou de 38 para 42 verificações e agora exige uma entrada global de default ACL sem EXECUTE para `PUBLIC`, ausência de grants anônimos em tabelas/funções públicas e acesso autenticado exclusivo à RPC `is_platform_owner_for_company()`.
- As 18 funções públicas existentes continuam sem EXECUTE efetivo para `anon`; esta correção trata a exposição potencial de funções futuras criadas por `postgres`.

A alteração está somente na branch e aguarda CI com reset do banco local, E2E e pgTAP. Não foi executada no projeto remoto. A migration remota `20261113134849_tighten_public_schema_default_privileges` continua sem SQL original recuperável; a análise do catálogo agora distingue corretamente ACL de schema e ACL global.


### Reconstituição integral do histórico remoto — 20/11/2026

A auditoria descobriu que o ledger remoto guarda o SQL executado em `supabase_migrations.schema_migrations.statements`. A partir dessa fonte, foram recuperadas as 23 migrations que não tinham arquivo no repositório. Nenhum SQL foi inventado.

- As 23 migrations ausentes foram criadas com seus identificadores e nomes originais.
- As 6 migrations locais com conteúdo diferente do ledger foram restauradas ao SQL remoto original: `20261112024141`, `20261113054337`, `20261113203648`, `20261113203657`, `20261113203747` e `20261117015419`.
- Os quatro arquivos intermediários com versões alternativas foram removidos: `20261112030000`, `20261112050000`, `20261113040000` e `20261113050000`. Seus equivalentes oficiais são agora os arquivos recuperados `20261113012143`, `20261113003334`, `20261113030743` e `20261113043836`, junto com as migrations remotas subsequentes que completam as regras finais.
- O arquivo `20261113060000` foi removido como versão intermediária, mas seu efeito não foi descartado: a migration nova `20261120110000` recria a função de forma defensiva e concede EXECUTE a `authenticated`, revogando `PUBLIC` e `anon`. A função-base já consta da migration original `20261112024141`.
- A migration original `20261117015419` foi restaurada sem alterações. A regra nova de convite e cargos passa a ser aplicada pela migration posterior `20261120110000`, evitando modificar o conteúdo de uma versão já aplicada remotamente.
- A migration de normalização de cargos foi renomeada para `20261120110000` e a RPC transacional para `20261120120000`, ambas posteriores à última versão remota. Isso evita que migrations locais novas tenham timestamp anterior ao fim do ledger remoto.
- O arquivo `20261107165527_rebuild_rental_core_and_clear_legacy_records.sql` foi comparado diretamente com o SQL do ledger e é idêntico. Continua proibido reaplicá-lo em produção, pois sua finalidade histórica inclui reconstrução destrutiva do núcleo de locações.

**Resultado do inventário:** 60/60 migrations remotas têm agora arquivo local com o mesmo identificador, nome e SQL original; existem somente duas migrations novas pendentes. Não foi usado `migration repair`, não houve edição do ledger remoto e nenhuma migration foi aplicada ao projeto.

A migration `20261120110000` também contém a revogação global do EXECUTE padrão de `PUBLIC` para funções futuras criadas por `postgres`, e a suíte pgTAP valida essa configuração. A migration `20261120120000` mantém o gerenciamento transacional de membros.

**Validação final concluída no commit de código `7fdc7050e7b4f0aa7942b288112448245b92d7e`:** Web PR checks passaram; type-check das Edge Functions passou; `supabase db reset` passou; E2E Auth/onboarding passou; pgTAP passou com **73 testes no total** (`foundation.test.sql`, `platform_company_role_model.test.sql` com 42 verificações e `role_permissions.test.sql`). O workflow separado de GitHub Pages foi cancelado e não executou deploy; o build/verificações Web independentes passaram. O estado remoto permanece inalterado.


### Correção da policy de exclusão do catálogo — 20/11/2026

O primeiro pgTAP após a recuperação integral do histórico encontrou uma falha real: `product_delete_owner_admin_only` estava marcada como **RESTRICTIVE**, mas não havia policy permissiva de DELETE para administradores da empresa. A policy global permissiva atendia somente o platform owner; por isso o teste `company admin can delete company products` falhava.

- A auditoria do catálogo confirmou que esta era a única policy DELETE restritiva no schema `public`; a policy restritiva de SELECT em `rentals` tem policies permissivas complementares e permanece intencional.
- A migration nova `20261120110000` agora cria a policy permissiva `products_delete_owner_admin`, limitada a `owner/admin`, mantendo a policy restritiva histórica como segunda barreira.
- Funcionários continuam sem policy permissiva para excluir produtos; platform owner mantém acesso pelo caminho global já previsto.
- O teste existente em `role_permissions.test.sql` cobre tanto a negação para funcionário quanto a exclusão permitida para administrador.

O primeiro CI também confirmou: `supabase db reset` passou e os testes E2E de Auth/onboarding passaram. O pgTAP apontou ainda a falta do grant autenticado da RPC `is_platform_owner_for_company()`; esse grant foi preservado na migration `20261120110000`. A correção da policy de produtos está na branch e aguarda nova execução de pgTAP. Nenhuma alteração foi feita no Supabase remoto.

### Correção final — preservação do vínculo legado da Festejando — 20/11/2026

A leitura de algumas seções históricas deste diagnóstico ficou desatualizada após o endurecimento final da migration `20261120110000_normalize_platform_and_company_roles.sql`. **A conclusão antiga de que a migration removeria o vínculo do platform owner com Festejando está supersedida e não descreve o SQL final.**

A versão atual da migration:
- preserva a linha existente em `public.company_members` para o mesmo par `(company_id, user_id)`;
- normaliza o papel legado `owner` para `admin`, conforme o novo conjunto de papéis `admin/staff`;
- não apaga a empresa Festejando nem remove ou substitui o usuário vinculado;
- impede novos vínculos de contas platform owner por meio das RPCs de gerenciamento.

A suíte `supabase/tests/platform_company_role_model.test.sql` contém duas asserções explícitas: uma confirma que o platform owner continua com exatamente um vínculo empresarial e outra confirma que esse mesmo vínculo permanece com papel `admin`. Essa cobertura foi executada no CI, junto com os demais testes pgTAP.

Portanto, o requisito de preservação da associação legado é atendido no SQL final: **o vínculo entre a conta platform owner e a empresa Festejando permanece; somente o rótulo de papel é normalizado**. Esta correção documental não altera dados nem executa migrations no Supabase remoto.


## Atualização após rollout de produção — 20/11/2026

O diagnóstico acima descrevia o estado anterior ao rollout. Após backup manual confirmado pelo usuário e autorização explícita, foram aplicadas as três migrations novas. O histórico remoto agora contém **63 migrations**, com os seguintes IDs gerados pelo Supabase:

- `20261120140755_normalize_platform_and_company_roles`
- `20261120140813_manage_company_member_transactionally`
- `20261120140835_leadfesta_module`

Os arquivos locais foram renomeados para usar exatamente esses IDs. Não reaplicar essas migrations nem criar arquivos locais com os timestamps antigos.

Verificações remotas após a aplicação:
- A associação original do platform owner com **Festejando** continua com o mesmo `company_id` e `user_id`; o papel foi normalizado para `admin`.
- Os vínculos de **Sonho Kids Brinquedos** e **Nobre Paladar** foram preservados, ambos com papel `admin`.
- Não há papéis diferentes de `admin`/ `staff` em `company_members`; no momento da verificação, as três associações existentes estavam como `admin`.
- As tabelas `leads`, `lead_activities` e `lead_pipeline_stages` existem e têm RLS habilitado.
- Seis etapas padrão foram criadas para cada empresa existente; nenhum lead foi criado durante a migration.
- As funções de gestão de membros mantêm EXECUTE negado a `anon` e concedido a `authenticated`.
- Edge Functions `manage-employees` e `invite-company-member` estão ativas na versão 3, ambas com JWT verification habilitada.

O entitlement LeadFesta permanece desativado por padrão; a ativação por empresa deve ser decidida pelo platform owner. As PRs #87 e #88 foram mescladas e o workflow de GitHub Pages publicou o frontend com sucesso em 20/11/2026 no commit `fb2eb3a78f4436711b311ee6693a8cc9655e3dbb`.
