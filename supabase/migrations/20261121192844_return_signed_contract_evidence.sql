-- Return the captured signature evidence to the public receipt view after signing.
-- The anonymous response is limited to the contract token holder and only returns
-- the minimum data needed to display the signed document and its receipt.
create or replace function public.get_public_rental_contract(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_contract public.rental_contracts%rowtype;
begin
  if p_token is null or length(p_token)<40 or length(p_token)>200 then
    return null;
  end if;

  update public.rental_contracts
  set viewed_at=coalesce(viewed_at,now()),
      status=case when status='sent' then 'viewed' else status end
  where token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and token_expires_at>now()
    and status in ('sent','viewed')
  returning * into v_contract;

  if not found then
    select * into v_contract
    from public.rental_contracts
    where token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
      and status='signed';
    if not found then return null; end if;
  end if;

  return jsonb_build_object(
    'id',v_contract.id,
    'contract_number',v_contract.contract_number,
    'status',v_contract.status,
    'snapshot',v_contract.contract_snapshot,
    'signed_at',v_contract.signed_at,
    'signer_name',v_contract.signer_name,
    'signer_document',v_contract.signer_document,
    'signer_phone',v_contract.signer_phone,
    'signature_svg',v_contract.signature_svg,
    'consent_text',v_contract.consent_text
  );
end;
$$;

revoke all on function public.get_public_rental_contract(text) from public;
grant execute on function public.get_public_rental_contract(text) to anon,authenticated;
