create or replace function public.get_public_rental_contract(p_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_contract public.rental_contracts%rowtype;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 200 then return null; end if;
  update public.rental_contracts
  set viewed_at = coalesce(viewed_at, now()), status = case when status = 'sent' then 'viewed' else status end
  where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and token_expires_at > now() and status in ('sent', 'viewed')
  returning * into v_contract;
  if not found then
    select * into v_contract from public.rental_contracts
    where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex') and status = 'signed';
    if not found then return null; end if;
  end if;
  return jsonb_build_object(
    'id', v_contract.id, 'contract_number', v_contract.contract_number, 'status', v_contract.status,
    'snapshot', v_contract.contract_snapshot, 'signed_at', v_contract.signed_at,
    'signer_name', v_contract.signer_name, 'signer_document', v_contract.signer_document,
    'signer_phone', v_contract.signer_phone, 'signature_svg', v_contract.signature_svg,
    'consent_text', v_contract.consent_text
  );
end;
$function$;

create or replace function public.sign_public_rental_contract(
 p_token text, p_signer_name text, p_signer_document text, p_signer_phone text,
 p_signature_svg text, p_consent_text text, p_user_agent text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_id uuid;
begin
 if p_token is null or length(p_token) < 40 or length(p_token) > 200 then return false; end if;
 if nullif(trim(p_signer_name), '') is null or nullif(trim(p_signer_document), '') is null
    or nullif(trim(p_signature_svg), '') is null or nullif(trim(p_consent_text), '') is null then
   raise exception 'Preencha os dados e confirme o consentimento para assinar.';
 end if;
 if length(p_signer_name) > 180 or length(p_signer_document) > 40 or length(p_signer_phone) > 40
    or length(p_signature_svg) > 12000 or length(p_consent_text) > 1200 then
   raise exception 'Dados de assinatura excedem o limite permitido.';
 end if;
 if p_signature_svg not like '<svg%' then raise exception 'Assinatura inválida.'; end if;
 update public.rental_contracts
 set status = 'signed', signed_at = now(), signer_name = trim(p_signer_name),
     signer_document = trim(p_signer_document), signer_phone = nullif(trim(p_signer_phone), ''),
     signature_svg = p_signature_svg, consent_text = trim(p_consent_text),
     signer_user_agent = left(coalesce(p_user_agent, ''), 500)
 where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
   and token_expires_at > now() and status in ('sent', 'viewed')
 returning id into v_id;
 return v_id is not null;
end;
$function$;

create or replace function public.sync_rental_financial_income()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_existing uuid; v_paid numeric(12,2);
begin
 if tg_op = 'INSERT' then
  if new.total_amount > 0 then
   insert into public.financial_transactions(company_id,rental_id,transaction_type,category,description,amount,due_date,status,created_by)
   values(new.company_id,new.id,'income','locacao','Locação #'||new.rental_number,new.total_amount,new.start_date,
     case when new.status='cancelled' then 'cancelled' else 'pending' end,new.created_by);
  end if;
  return new;
 end if;
 select id into v_existing from public.financial_transactions
 where rental_id=new.id and company_id=new.company_id and category='locacao' order by created_at limit 1;
 if v_existing is not null then
  select coalesce(sum(amount),0) into v_paid from public.payments where transaction_id=v_existing;
  if new.total_amount >= v_paid then
   update public.financial_transactions set amount=new.total_amount,due_date=new.start_date,
    status=case when new.status='cancelled' and v_paid=0 then 'cancelled'
      when v_paid>=new.total_amount and new.total_amount>0 then 'paid'
      when v_paid>0 then 'pending'
      when status='cancelled' and new.status<>'cancelled' then 'pending' else status end
   where id=v_existing;
  end if;
 elsif new.total_amount>0 then
  insert into public.financial_transactions(company_id,rental_id,transaction_type,category,description,amount,due_date,status,created_by)
  values(new.company_id,new.id,'income','locacao','Locação #'||new.rental_number,new.total_amount,new.start_date,
    case when new.status='cancelled' then 'cancelled' else 'pending' end,new.created_by);
 end if;
 return new;
end;
$function$;

revoke execute on function public.sync_rental_financial_income() from public, anon, authenticated;
