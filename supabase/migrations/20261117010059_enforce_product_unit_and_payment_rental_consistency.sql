
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE public.product_units
  ADD CONSTRAINT product_units_company_product_id_id_key UNIQUE (company_id, product_id, id);
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_company_rental_id_id_key UNIQUE (company_id, rental_id, id);

ALTER TABLE public.maintenance_records
  ADD CONSTRAINT maintenance_records_company_product_unit_match_fkey
  FOREIGN KEY (company_id, product_id, product_unit_id)
  REFERENCES public.product_units (company_id, product_id, id)
  ON DELETE SET NULL (product_unit_id) NOT VALID;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_company_rental_transaction_match_fkey
  FOREIGN KEY (company_id, rental_id, transaction_id)
  REFERENCES public.financial_transactions (company_id, rental_id, id)
  ON DELETE SET NULL (transaction_id) NOT VALID;

ALTER TABLE public.maintenance_records VALIDATE CONSTRAINT maintenance_records_company_product_unit_match_fkey;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_company_rental_transaction_match_fkey;

CREATE INDEX maintenance_records_company_product_unit_match_idx
  ON public.maintenance_records (company_id, product_id, product_unit_id);
CREATE INDEX payments_company_rental_transaction_match_idx
  ON public.payments (company_id, rental_id, transaction_id);
