# Reconciliação do histórico de migrations — diagnóstico

**Projeto Supabase:** `wfwohnssvftegnhwdzmt`  
**Branch analisada:** `chore/foundation-reconciliation-verify`  
**Diagnóstico:** somente leitura. Nenhuma migration foi aplicada, reparada ou removida no banco remoto.

## Inventário confirmado

- Histórico remoto: **60 versões**.
- Arquivos presentes em `supabase/migrations` na branch: **45 arquivos**.
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

As quatro versões com nomes semelhantes acima completam as 23 ausências remotas.

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

Os quatro arquivos que aparecem como pares têm versões remotas diferentes, embora a intenção funcional pareça semelhante. O arquivo `202611090001_foundation` merece revisão separada: seu identificador tem 12 dígitos, enquanto as versões remotas atuais listadas usam 14 dígitos. Não renomear nem registrar como aplicada sem determinar sua origem e efeitos.

## Estado remoto observado por consultas SQL

- Todas as 27 tabelas base encontradas no schema `public` estavam com RLS habilitado.
- Foram encontrados FKs compostos que vinculam `company_id` ao registro pai em áreas importantes: inventário, locações, clientes, pagamentos, documentos, ocorrências e equipe.
- Esses FKs compostos são evidência de proteções de integridade entre empresas no estado remoto; ainda é necessário comparar integralmente suas definições com as migrations que os criaram.
- `company_members` ainda possui **3 vínculos com o papel `owner`**.
- A função remota `invite_company_member(uuid, uuid, text)` ainda aceita os papéis antigos `owner`, `admin`, `manager` e `staff`.
- A função remota `is_company_member(uuid)` ainda trata o platform owner como membro global para fins de autorização.
- `has_company_role(uuid, text[])` ainda mapeia o platform owner para o papel `owner`.
- A função remota `ensure_team_group(uuid)` ainda permite que o platform owner acione criação/garantia do grupo e adiciona membros atuais da empresa.
- A migration `20261116090000_normalize_platform_and_company_roles.sql` não está registrada no histórico remoto; por isso, seu novo modelo de cargos não pode ser considerado ativo em produção.
- A Edge Function `manage-employees` publicada não foi alterada por esta análise; sua publicação permanece pendente de autorização explícita.

## Próxima sequência de trabalho

1. Comparar cada uma das 23 migrations remotas ausentes com o estado real de constraints, índices, triggers, funções e policies.
2. Classificar cada diferença como: efeito já presente, efeito parcialmente presente, efeito ausente ou divergência intencional.
3. Comparar os oito arquivos locais sem registro remoto, identificando os quatro pares de intenção semelhante e os quatro arquivos locais sem equivalente remoto; revisar separadamente o arquivo legado com identificador de 12 dígitos.
4. Criar migrations corretivas com versões inéditas apenas para efeitos comprovadamente ausentes ou incorretos, sem no-op e sem reaplicar a migration destrutiva de reconstrução do núcleo de locações.
5. Reexecutar CI e revisar o plano de aplicação. A execução remota exige autorização explícita separada.

## Regra operacional

Não executar `db push`, `migration repair`, aplicação de migrations, publicação de Edge Functions ou merge como parte deste diagnóstico. O objetivo é primeiro produzir uma sequência reproduzível e segura para a fundação.
