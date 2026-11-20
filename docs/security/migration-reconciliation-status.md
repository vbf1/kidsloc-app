# Reconciliação do histórico de migrations — diagnóstico

**Projeto Supabase:** `wfwohnssvftegnhwdzmt`  
**Branch analisada:** `chore/foundation-reconciliation-verify`  
**Diagnóstico:** somente leitura. Nenhuma migration foi aplicada, reparada ou removida no banco remoto.

## Inventário confirmado

- Histórico remoto: **60 versões**.
- Arquivos presentes em `supabase/migrations` na branch: **44 arquivos**.
- Versões remotas sem arquivo local com o mesmo identificador: **23**.
- Versões locais sem registro remoto correspondente: **7**.
- Interseção exata: **37 versões**.

Os pares abaixo parecem representar a mesma intenção funcional com identificadores diferentes, mas não devem ser tratados como equivalentes sem comparar SQL e estado final:

| Remota | Arquivo local semelhante |
|---|---|
| `20261113003334_prevent_customer_deletion` | `20261112050000_prevent_customer_deletion` |
| `20261113012143_product_catalog_20261112030000` | `20261112030000_product_catalog` |
| `20261113030743_allow_machine_product_units` | `20261113040000_allow_machine_product_units` |
| `20261113043836_platform_owner_readonly_conversations` | `20261113050000_platform_owner_readonly_conversations` |

### Versões remotas sem arquivo local correspondente

```text
20261113134849_tighten_public_schema_default_privileges
20261113135835_restrict_customer_and_product_deletes
20261113140033_fix_rental_creator_and_assignee_read_access
20261113140039_avoid_rental_policy_recursion
20261113141219_restrict_finance_document_and_stock_permissions
20261113141653_restrict_product_unit_and_maintenance_deletes
20261113142519_revoke_authenticated_maintain_privilege
20261113144522_remove_broad_rental_child_select_policies
20261113144740_allow_rental_creator_to_manage_rental
20261113152713_allow_authorized_rental_updates
20261117005923_enforce_company_scoped_inventory_foreign_keys
20261117005941_enforce_company_scoped_rental_finance_and_team_foreign_keys
20261117005958_enforce_company_scoped_customer_events_and_assets
20261117010018_index_company_scoped_foreign_keys
20261117010059_enforce_product_unit_and_payment_rental_consistency
20261117010616_ensure_single_team_group_per_company
20261117010919_revoke_company_data_access_after_member_removal
20261117011036_allow_authorized_company_member_removal
20261117014514_prevent_company_members_from_changing_own_role
```

As quatro versões remotas com nomes semelhantes acima completam as 23 ausências remotas. A contagem local é 37 correspondências exatas + 7 arquivos sem versão remota = 44.

### Versões locais sem registro remoto correspondente

```text
20261112030000_product_catalog
20261112050000_prevent_customer_deletion
20261113040000_allow_machine_product_units
20261113050000_platform_owner_readonly_conversations
20261113060000_grant_platform_owner_check_to_authenticated
20261116090000_normalize_platform_and_company_roles
20261119090000_manage_company_member_transactionally
```

Os quatro arquivos que aparecem como pares têm versões remotas diferentes, embora a intenção funcional pareça semelhante. O arquivo `20261112024141_foundation` é a correspondência exata da versão remota `20261112024141_foundation`. O inventário atual da branch contém 44 arquivos e não contém `202611090001_foundation.sql`. Esse arquivo foi recuperado do histórico Git no commit `3a4b068570ffde2e2fce7e85505c2e6c9e0fdb62`: ele pertence a uma fundação antiga, com `company_users`, enums `company_role/company_status` e uma estrutura diferente da atual `company_members`. Não consta no ledger remoto nem no diretório atual; é um artefato histórico substituído pela fundação posterior `20261112024141_foundation.sql`, não deve ser restaurado nem aplicado.

## Estado remoto observado por consultas SQL

- Todas as 27 tabelas base encontradas no schema `public` estavam com RLS habilitado.
- Foram encontrados FKs compostos que vinculam `company_id` ao registro pai em áreas importantes: inventário, locações, clientes, pagamentos, documentos, ocorrências e equipe.
- Esses FKs compostos são evidência de proteções de integridade entre empresas no estado remoto; ainda é necessário comparar integralmente suas definições com as migrations que os criaram.
- `company_members` ainda possui **3 vínculos com o papel `owner`**. Uma das três linhas pertence ao platform owner e está vinculada à empresa `Festejando`; essa empresa tem somente esse vínculo e zero registros nas 25 tabelas públicas auditadas que possuem `company_id`. As outras duas linhas são os vínculos operacionais de `Sonho Kids Brinquedos` e `Nobre Paladar`.
- A função remota `invite_company_member(uuid, uuid, text)` ainda aceita os papéis antigos `admin`, `manager` e `staff`; a função `add_company_member(uuid, uuid, text)` também aceita `manager`.
- A função remota `is_company_member(uuid)` ainda trata o platform owner como membro global para fins de autorização.
- `has_company_role(uuid, text[])` ainda mapeia o platform owner para o papel `owner`.
- A função remota `ensure_team_group(uuid)` ainda permite que o platform owner acione a garantia do grupo, embora as policies atuais impeçam o platform owner de inserir mensagens.
- A migration `20261116090000_normalize_platform_and_company_roles.sql` não está registrada no histórico remoto; por isso, seu novo modelo de cargos não pode ser considerado ativo em produção.
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

**Risco e ação requerida:** a migration local `20261116090000_normalize_platform_and_company_roles.sql` corrige os comportamentos descritos ao substituir as funções e policies, impedir a associação de platform owner como membro, restringir os papéis e bloquear o acesso global às conversas. Entretanto, essa migration ainda não foi aplicada. A suíte `platform_company_role_model.test.sql` agora cobre as tentativas diretas de inserir platform owner em `company_members`, convite com `manager`, uso de `ensure_team_group` pelo platform owner, leitura de conversas/mensagens/participantes pelo platform owner e alterações diretas de membros fora do RPC. As verificações validam a negação no banco, não apenas na interface.


### Auditoria de funções `SECURITY DEFINER` — estado remoto

- Foram encontradas 12 funções `SECURITY DEFINER` no schema `public`. Todas definem `search_path` vazio (`SET search_path = ''`) e nenhuma concede `EXECUTE` a `anon`.
- Oito dessas funções podem ser executadas por `authenticated`; incluem RPCs de onboarding/equipe e helpers de autorização. As validações de identidade e autorização foram revisadas individualmente para `add_company_member`, `invite_company_member` e `ensure_team_group`.
- `manage_company_member(uuid, uuid, text, text)` ainda não existe no remoto; será criada pela sequência local após a revisão do histórico. A Edge Function publicada `manage-employees` ainda é a implementação antiga e não foi atualizada em produção.
### Divergência da regra de cargos e acesso do platform owner

- O constraint remoto `company_members_role_check` ainda aceita `owner`, `admin`, `manager` e `staff`; a migration local de normalização pretende migrar vínculos `owner` para `admin`, `manager` para `staff` e restringir o constraint a `admin`/ `staff`.
- O estado remoto atual ainda permite leitura de conversas pelo platform owner, mas não escrita. A migration local `20261116090000_normalize_platform_and_company_roles.sql` altera esse comportamento e bloqueia o acesso do platform owner ao conteúdo das conversas. Essa diferença precisa ser mantida explícita na revisão de segurança e no plano de implantação.
- A migration local `20261116090000` já cria uma versão inicial de `manage_company_member`; `20261119090000` redefine a mesma função com validações adicionais (por exemplo, exige `p_role` nulo na remoção e impede gerenciar a conta do platform owner). A segunda migration é um hardening incremental, não deve ser tratada como função independente.

**Conclusão parcial:** os efeitos de integridade referencial de remoção de membro e de escopo por empresa estão presentes no banco. Em contrapartida, o modelo de cargos e a separação entre platform owner e membros da empresa continuam divergentes do estado proposto na branch. Não marcar uma migration como reconciliada apenas porque alguns efeitos relacionados já existem; constraints, policies e funções são camadas diferentes.

### Auditoria das migrations remotas de 13/11 — políticas e privilégios

- `20261113134849_tighten_public_schema_default_privileges`: no ACL padrão do proprietário `postgres` para o schema `public`, não há concessões padrão a `anon` em tabelas, sequências ou funções. `authenticated` mantém privilégios de tabela sujeitos a RLS. O catálogo atual confirma esse estado; ainda não foi recuperado o SQL original.
- `20261113135835_restrict_customer_and_product_deletes`: o estado final remoto tem DELETE de clientes permitido somente a owner/admin e DELETE de produtos protegido por policy restritiva owner/admin. A branch agora reproduz a regra de clientes em `20261112050000_prevent_customer_deletion.sql` e mantém a policy restritiva de produtos.
- `20261113140033_fix_rental_creator_and_assignee_read_access`, `20261113140039_avoid_rental_policy_recursion`, `20261113144522_remove_broad_rental_child_select_policies`, `20261113144740_allow_rental_creator_to_manage_rental` e `20261113152713_allow_authorized_rental_updates`: o estado remoto usa `private.is_team_conversation_member` para evitar recursão no chat e policies explícitas para criador/funcionário designado em locações, itens, unidades, eventos e responsáveis. A branch foi atualizada para reproduzir as políticas de leitura/edição/exclusão por criador ou designado e remove as policies amplas de `company_members_all` nas tabelas-filhas. A função `can_manage_rental` também foi atualizada para incluir o criador da locação, além de owner/admin e funcionário designado.
- `20261113141219_restrict_finance_document_and_stock_permissions` e `20261113141653_restrict_product_unit_and_maintenance_deletes`: no remoto, documentos, transações financeiras, movimentações de estoque, manutenção e unidades têm leitura/operações de membro conforme tabela, mas DELETE restrito a owner/admin. A migration local de normalização remove `company_members_all` dessas tabelas e cria policies explícitas, preservando `platform_owner_all`.
- `20261113142519_revoke_authenticated_maintain_privilege`: o catálogo confirma que `authenticated` não tem privilégio `MAINTAIN` em nenhuma tabela pública auditada.

Essas alterações foram incorporadas à migration local `20261116090000_normalize_platform_and_company_roles.sql` para que um banco limpo reproduza o estado de segurança final observado, em vez de herdar permissões amplas da migration inicial.

### Comparação dos quatro pares de migrations com nomes/versões diferentes

- **Catálogo de produtos:** `20261112030000_product_catalog` + `20261113025749_add_machine_catalog_type` + `20261113040000_allow_machine_product_units` formam, em conjunto, o modelo que existe no remoto: tipos `toy`, `machine` e `service`, preços por diária/evento, trigger de regras de catálogo e bloqueio de unidades físicas para serviços. A função remota também contém a proteção adicional de limite de unidades que aparece na migration local `20261113203747_protect_individual_unit_reservations_and_counts`.
- **Conversas somente leitura do platform owner:** a migration local `20261113050000_platform_owner_readonly_conversations` corresponde ao estado remoto anterior: platform owner pode ler, mas não escrever. A migration local posterior `20261116090000_normalize_platform_and_company_roles` altera a política proposta para bloquear também a leitura; os novos testes pgTAP cobrem esse estado final da branch.
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

**Novo achado de segurança:** a policy remota `company_members_delete_authorized_admins` permite ao administrador excluir funcionários diretamente pela Data API, contornando o novo RPC transacional `manage_company_member` e os locks de concorrência. A branch foi corrigida para remover essa policy e também `platform_owner_all` de `company_members` na migration `20261116090000_normalize_platform_and_company_roles.sql`. A leitura continua pela policy de SELECT; toda escrita, inclusive pelo platform owner, passa pelos RPCs transacionais.

A revisão do catálogo também revelou que o estado remoto não tinha `platform_owner_all` nas tabelas de chat, enquanto a migration histórica `20261107165500_global_platform_owner_and_company_settings` criava essas policies no banco limpo. A migration local `20261116090000` foi corrigida para removê-las explicitamente de `team_conversations`, `team_messages` e `team_conversation_members`, antes de aplicar as policies de isolamento. Os testes diretos de leitura de chat pelo platform owner verificam esse cenário.

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

**Implicação:** o estado remoto continua divergente do modelo final da branch em constraints, policies de chat, escrita de memberships e RPCs. As migrations locais `20261116090000` e `20261119090000` cobrem parte dessas correções no banco reconstruído e nos testes, mas ainda não foram aplicadas ao projeto remoto. Não executar repair, push ou deploy nesta etapa.



### Rechecagem pontual de escrita em `company_members` — 19/11, leitura direta do catálogo

- A policy remota `company_members_delete_authorized_admins` está ativa para `authenticated`. Sua expressão efetiva permite ao papel antigo `owner` excluir qualquer vínculo que não seja `owner`, e permite a `admin` excluir apenas linhas cujo cargo seja `staff`.
- A policy remota `platform_owner_all` também está ativa para `authenticated`, com comando `ALL` e condição `is_platform_owner()` tanto em USING quanto em WITH CHECK. Ela é o caminho de escrita global do platform owner até a migration de normalização removê-la.
- `authenticated` possui grants SQL de SELECT/INSERT/UPDATE/DELETE na tabela. Esses grants, isoladamente, não autorizam a operação: INSERT e UPDATE continuam sem policy RLS específica para esse papel; DELETE é controlado pela policy acima; o platform owner recebe a exceção da policy ALL.
- Não há triggers de usuário em `company_members`. O constraint remoto continua aceitando `owner`, `admin`, `manager` e `staff`.
- A consulta de privilégios de rotina confirmou EXECUTE para `authenticated` em `add_company_member` e `invite_company_member`; `manage_company_member` ainda não existe no remoto.
- A migration `20261116090000` remove as duas policies de escrita direta; `20261119090000` endurece a RPC transacional, rejeitando cargo não nulo em remoção e impedindo que o vínculo do platform owner seja alvo de gerenciamento. A sequência local é coerente com os testes, mas não está implantada.



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
- O arquivo local posterior `20261116090000_normalize_platform_and_company_roles.sql` também redefine a RPC para o modelo final; `20261119090000_manage_company_member_transactionally.sql` adiciona a operação transacional de alteração/remoção de membros.
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
- `20261116090000` e `20261119090000`: novas correções/hardening ainda ausentes do remoto e não aplicadas.

Este mapeamento não substitui a revisão dos SQLs originais ausentes, nem significa que o histórico de migrations esteja reconciliado.


### Integração da tela de equipe com as RPCs transacionais — 20/11/2026

A revisão do fluxo da tela `/equipe/` encontrou duas incompatibilidades com a migration de normalização:

- A remoção de funcionário ainda tentava executar `DELETE` direto em `company_members`. A migration `20261116090000` remove a policy que permitia essa escrita direta, concentrando as alterações no RPC transacional.
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
- A rechecagem das definições remotas confirmou que ainda estão ativos os comportamentos antigos já descritos: `add_company_member` e `invite_company_member` aceitam `manager`; `add_company_member` reconhece o platform owner pelo papel global e não bloqueia destino que seja platform owner; `ensure_team_group` ainda permite bypass para platform owner sem vínculo empresarial. As migrations locais `20261116090000` e `20261119090000` contêm as correções propostas, mas não estão aplicadas no projeto remoto.
- O Advisor de Auth também informa que a proteção contra senhas vazadas está desativada. É uma configuração de Auth separada das migrations; não foi alterada.
- Nenhuma alteração foi feita no banco remoto, nos privilégios, em Auth ou nas Edge Functions. Os resultados acima foram obtidos por consultas somente leitura e pelo Security Advisor.
