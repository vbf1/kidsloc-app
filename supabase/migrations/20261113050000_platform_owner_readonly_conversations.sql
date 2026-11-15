-- The KidsLoc platform owner may inspect every company conversation,
-- but must never create conversations, add/remove participants, or send messages.
-- Company owners and team members keep their existing permissions.

drop policy if exists team_conversations_insert_creator on public.team_conversations;
create policy team_conversations_insert_creator
on public.team_conversations
for insert
to authenticated
with check (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and created_by = (select auth.uid())
);

drop policy if exists team_messages_insert_participant on public.team_messages;
create policy team_messages_insert_participant
on public.team_messages
for insert
to authenticated
with check (
  not private.is_platform_owner()
  and sender_id = (select auth.uid())
  and is_company_member(company_id)
  and char_length(body) between 1 and 4000
  and (
    exists (
      select 1
      from public.team_conversation_members m
      where m.conversation_id = team_messages.conversation_id
        and m.user_id = (select auth.uid())
        and m.company_id = team_messages.company_id
    )
    or has_company_role(company_id, array['owner'::text])
  )
);

drop policy if exists team_members_insert_creator_or_owner on public.team_conversation_members;
create policy team_members_insert_creator_or_owner
on public.team_conversation_members
for insert
to authenticated
with check (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = team_conversation_members.company_id
      and cm.user_id = team_conversation_members.user_id
  )
  and exists (
    select 1
    from public.team_conversations c
    where c.id = team_conversation_members.conversation_id
      and c.company_id = team_conversation_members.company_id
      and (
        c.created_by = (select auth.uid())
        or has_company_role(team_conversation_members.company_id, array['owner'::text])
      )
  )
);

drop policy if exists team_members_delete_creator on public.team_conversation_members;
create policy team_members_delete_creator
on public.team_conversation_members
for delete
to authenticated
using (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and exists (
    select 1
    from public.team_conversations c
    where c.id = team_conversation_members.conversation_id
      and c.company_id = team_conversation_members.company_id
      and c.created_by = (select auth.uid())
  )
);

drop policy if exists team_members_delete_owner on public.team_conversation_members;
create policy team_members_delete_owner
on public.team_conversation_members
for delete
to authenticated
using (
  not private.is_platform_owner()
  and is_company_member(company_id)
  and has_company_role(company_id, array['owner'::text])
  and exists (
    select 1
    from public.team_conversations c
    where c.id = team_conversation_members.conversation_id
      and c.company_id = team_conversation_members.company_id
  )
);
