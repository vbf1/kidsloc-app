# Foundation rollout runbook

Status checked: 2026-11-20. This document is a preparation checklist only. It does not authorize or perform a production deployment.

## Verified production baseline

- Supabase project: `kidsloc-app` (`wfwohnssvftegnhwdzmt`), status `ACTIVE_HEALTHY`.
- Production migration ledger currently contains 60 entries, ending at `20261117015419`.
- The foundation branch contains those 60 exact historical migrations plus two new migrations. The LeadFesta feature branch adds a third migration after the foundation.
- Production currently does not contain the three new migrations:
  1. `20261120110000_normalize_platform_and_company_roles.sql`
  2. `20261120120000_manage_company_member_transactionally.sql`
  3. `20261120130000_leadfesta_module.sql`
- Production Edge Functions `manage-employees` and `invite-company-member` are active but still contain the older implementation. The branch contains the updated implementations.
- The production GitHub Pages deploy was not run as part of the successful PR checks.

## Mandatory decisions before rollout

1. Decide the treatment of company **Festejando**. The first new migration removes the only platform-owner membership from this company, leaving the company record in place but with no members. Do not run the migration until this is explicitly accepted or the data/membership plan is changed and revalidated.
2. Supabase Auth leaked-password protection is currently disabled. The linked Supabase organization is on the **Free** plan, while Supabase documents this feature as available on **Pro and above**. Enabling it therefore requires a plan upgrade and a cost decision first; do not change the plan or Auth settings without explicit approval. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).
3. Obtain explicit approval for production migration execution, Edge Function deployment, and PR merge. Validation success alone is not deployment approval.

## Pre-deployment safeguards

- Confirm the project is `ACTIVE_HEALTHY`.
- Take/verify a recoverable database backup and confirm the recovery procedure.
- Re-check the remote migration ledger. It must still end at `20261117015419`; if it has changed, stop and reconcile before proceeding.
- Re-check that all 60 historical migration files still match the remote ledger exactly.
- Review the exact SQL of all three new migrations and their effects, especially role normalization, the Festejando membership change, private feature entitlements and LeadFesta RLS.
- Never re-run `20261107165527_rebuild_rental_core_and_clear_legacy_records.sql`; it is already applied and is destructive.
- Confirm the branch commit and CI checks are the reviewed versions before using any source files.

## Controlled rollout sequence

Only after all mandatory decisions and approvals:

1. Apply `20261120110000_normalize_platform_and_company_roles.sql` once.
2. Verify the migration ledger records version `20261120110000`; inspect company memberships and confirm the expected admin/staff roles and Festejando outcome.
3. Apply `20261120120000_manage_company_member_transactionally.sql` once.
4. Verify the ledger records version `20261120120000`; confirm the member-management RPC has the intended grants and transactional checks.
5. Apply `20261120130000_leadfesta_module.sql` once, only after the foundation migrations are verified.
6. Verify the ledger records version `20261120130000`; confirm private entitlements, RLS policies, platform-owner-only entitlement RPCs and the default pipeline stages.
7. Deploy the branch versions of Edge Functions:
   - `manage-employees`
   - `invite-company-member`
   Keep JWT verification enabled.
8. Smoke-test the Edge Functions, LeadFesta authorization and database permissions before exposing the updated frontend.
9. Merge PR #88 into the foundation branch, then merge PR #87 only after the production schema and functions pass smoke tests. Confirm the intended frontend deployment completes successfully.

If any step fails, stop the sequence. Do not continue to the next step or attempt a rollback by replaying old migrations. Diagnose the failure and use a reviewed corrective migration or recovery plan.

## Post-deployment smoke checks

- Sign in and verify workspace routing for the platform owner.
- Verify Sonho Kids and Nobre Paladar each retain their expected admin membership and company data.
- Verify Festejando matches the approved membership decision.
- Invite a staff member; verify an administrator cannot invite another administrator.
- Change a staff role and remove a staff member; verify the transactional RPC path is used.
- Verify a company admin can delete a product while staff cannot.
- Verify staff cannot access another company's records or internal team conversations.
- Verify rentals, inventory, payments, contracts, and team chat continue to work for authorized users.
- Confirm no unauthenticated access to protected tables or RPCs.
- Confirm production migration ledger has 63 entries and both updated Edge Functions are active at the deployed versions.
- Verify LeadFesta is unavailable to staff and companies without an active entitlement, and that platform owner can activate/suspend it without deleting lead history.
- Verify two companies cannot read each other's leads or activities, and lead conversion creates a customer only in the same company.
- Confirm the frontend deployment is healthy and test login, navigation, and core workflows in the production site.

## Current validation evidence

- Web PR checks: passed.
- Supabase migration checks: passed.
- Edge Function type-check: passed.
- `supabase db reset`: passed.
- Auth/onboarding E2E: passed.
- pgTAP: 73/73 tests passed.

These are CI/staging validations, not proof that production rollout has occurred.
