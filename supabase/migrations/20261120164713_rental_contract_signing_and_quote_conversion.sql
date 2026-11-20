create or replace function public.sync_rental_financial_income()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_existing uuid; v_paid numeric(12,2);
begin
 if tg_op='INSERT' then
  if new.total_amount>0 then
   insert into public.financial_transactions(company_id,rental_id,transaction_type,category,description,amount,due_date,status,created_by)
   values(new.company_id,new.id,'income','locacao','Locação #'||new.rental_number,new.total_amount,new.start_date,case when new.status='cancelled' then 'cancelled' else 'pending' end,new.created_by);
  end if; return new;
 end if;
 select id into v_existing from public.financial_transactions where rental_id=new.id and company_id=new.company_id and category='locacao' order by created_at limit 1;
 if v_existing is not null then
  select coalesce(sum(amount),0) into v_paid from public.payments where transaction_id=v_existing;
  if new.total_amount>=v_paid then
   update public.financial_transactions set amount=new.total_amount,due_date=new.start_date,
    status=case when new.status='cancelled' and v_paid=0 then 'cancelled' when v_paid>=new.total_amount and new.total_amount>0 then 'paid' when v_paid>0 then 'pending' when status='cancelled' and new.status<>'cancelled' then 'pending' else status end
   where id=v_existing;
  end if;
 elsif new.total_amount>0 then
  insert into public.financial_transactions(company_id,rental_id,transaction_type,category,description,amount,due_date,status,created_by)
  values(new.company_id,new.id,'income','locacao','Locação #'||new.rental_number,new.total_amount,new.start_date,case when new.status='cancelled' then 'cancelled' else 'pending' end,new.created_by);
 end if;
 return new;
end; $$;