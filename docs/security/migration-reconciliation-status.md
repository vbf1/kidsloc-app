# Reconciliação do histórico de migrations — diagnóstico

**Projeto Supabase:** `wfwohnssvftegnhwdzmt`  
**Branch analisada:** `chore/foundation-reconciliation-verify`  
**Diagnóstico:** somente leitura. Nenhuma migration foi aplicada, reparada ou removida no banco remoto.

## Inventário confirmado

- Histórico remoto: **60 versões**.
- Arquivos presentes em `supabase/migrations` na branch: **45 arquivos**.
- Versões remotas sem arquivo local com o mesmo identificador: **23**.
- Versões locais sem registro remoto correspondente: **8**.
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

As quatro versões remotas com nomes semelhantes acima completam as 23 ausências remotas. A contagem local é 37 correspondências exatas + 8 arquivos sem versão remota = 45.

### Versões locais sem registro remoto correspondente

```text
202611090001_foundation (arquivo legado com identificador de 12 dígitos)
20261112030000_product_catalog
20261112050000_prevent_customer_deletion
20261113040000_allow_machine_product_units
20261113050000_platform_owner_readonly_conversations
20261113060000_grant_platform_owner_check_to_authenticated
20261116090000_normalize_platform_and_company_roles
20261119090000_manage_company_member_transactionally
```

Os quatro arquivos que aparecem como pares têm versões remotas diferentes, embora a intenção funcional pareça semelhante. O arquivo `20261112024141_foundation` é a correspondência exata da versão remota `20261112024141_foundation`. Já `202611090001_foundation` não tem registro remoto equivalente e sua leitura pela API de conteúdo do GitHub retornou 404, apesar de constar na listagem da PR; precisa de recuperação/verificação do arquivo antes de qualquer conclusão. Não renomear nem registrar como aplicada sem determinar sua origem e efeitos.

## Estado remoto observado por consultas SQL

- Todas as 27 tabelas base encontradas no schema `public` estavam com RLS habilitado.
- Foram encontrados FKs compostos que vinculam `company_id` ao registro pai em áreas importantes: inventário, locações, clientes, pagamentos, documentos, ocorrências e equipe.
- Esses FKs compostos são evidência de proteções de integridade entre empresas no estado remoto; ainda é necessário comparar integralmente suas definições com as migrations que os criaram.
- `company_members` ainda possui **3 vínculos com o papel `owner`**.
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

### Divergência da regra de cargos e acesso do platform owner

- O constraint remoto `company_members_role_check` ainda aceita `owner`, `admin`, `manager` e `staff`; a migration local de normalização pretende migrar vínculos `owner` para `admin`, `manager` para `staff` e restringir o constraint a `admin`/ `staff`.
- O estado remoto atual ainda permite leitura de conversas pelo platform owner, mas não escrita. A migration local `20261116090000_normalize_platform_and_company_roles.sql` altera esse comportamento e bloqueia o acesso do platform owner ao conteúdo das conversas. Essa diferença precisa ser mantida explícita na revisão de segurança e no plano de implantação.
- A migration local `20261116090000` já cria uma versão inicial de `manage_company_member`; `20261119090000` redefine a mesma função com validações adicionais (por exemplo, exige `p_role` nulo na remoção e impede gerenciar a conta do platform owner). A segunda migration é um hardening incremental, não deve ser tratada como função independente.

**Conclusão parcial:** os efeitos de integridade referencial de remoção de membro e de escopo por empresa estão presentes no banco. Em contrapartida, o modelo de cargos e a separação entre platform owner e membros da empresa continuam divergentes do estado proposto na branch. Não marcar uma migration como reconciliada apenas porque alguns efeitos relacionados já existem; constraints, policies e funções são camadas diferentes.

## Próxima sequência de trabalho

1. Comparar cada uma das migrations remotas ausentes com o estado real de constraints, índices, triggers, funções e policies.
2. Classificar separadamente constraints, índices, policies e funções. FKs compostos observados não comprovam que as policies e funções de autorização também estejam atualizadas.
3. Comparar os oito arquivos locais sem registro remoto, identificando os quatro pares de intenção semelhante e os quatro arquivos locais sem equivalente remoto; recuperar e inspecionar separadamente `202611090001_foundation`.
4. Criar migrations corretivas com versões inéditas apenas para efeitos comprovadamente ausentes ou incorretos, sem no-op e sem reaplicar a migration destrutiva de reconstrução do núcleo de locações.
5. Reexecutar CI e revisar o plano de aplicação. A execução remota exige autorização explícita separada.

## Regra operacional

Não executar `db push`, `migration repair`, aplicação de migrations, publicação de Edge Functions ou merge como parte deste diagnóstico. O objetivo é primeiro produzir uma sequência reproduzível e segura para a fundação.
