
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE public.products
  ADD CONSTRAINT products_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE public.product_units
  ADD CONSTRAINT product_units_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE public.rental_items
  ADD CONSTRAINT rental_items_company_id_id_key UNIQUE (company_id, id);

ALTER TABLE public.product_units
  ADD CONSTRAINT product_units_company_product_fkey
  FOREIGN KEY (company_id, product_id)
  REFERENCES public.products (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.maintenance_records
  ADD CONSTRAINT maintenance_records_company_product_fkey
  FOREIGN KEY (company_id, product_id)
  REFERENCES public.products (company_id, id)
  NOT VALID;

ALTER TABLE public.maintenance_records
  ADD CONSTRAINT maintenance_records_company_product_unit_fkey
  FOREIGN KEY (company_id, product_unit_id)
  REFERENCES public.product_units (company_id, id)
  ON DELETE SET NULL (product_unit_id) NOT VALID;

ALTER TABLE public.rental_items
  ADD CONSTRAINT rental_items_company_product_fkey
  FOREIGN KEY (company_id, product_id)
  REFERENCES public.products (company_id, id)
  NOT VALID;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_company_product_fkey
  FOREIGN KEY (company_id, product_id)
  REFERENCES public.products (company_id, id)
  NOT VALID;

ALTER TABLE public.rental_item_units
  ADD CONSTRAINT rental_item_units_company_item_fkey
  FOREIGN KEY (company_id, rental_item_id)
  REFERENCES public.rental_items (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.rental_item_units
  ADD CONSTRAINT rental_item_units_company_product_unit_fkey
  FOREIGN KEY (company_id, product_unit_id)
  REFERENCES public.product_units (company_id, id)
  NOT VALID;

ALTER TABLE public.product_units VALIDATE CONSTRAINT product_units_company_product_fkey;
ALTER TABLE public.maintenance_records VALIDATE CONSTRAINT maintenance_records_company_product_fkey;
ALTER TABLE public.maintenance_records VALIDATE CONSTRAINT maintenance_records_company_product_unit_fkey;
ALTER TABLE public.rental_items VALIDATE CONSTRAINT rental_items_company_product_fkey;
ALTER TABLE public.stock_movements VALIDATE CONSTRAINT stock_movements_company_product_fkey;
ALTER TABLE public.rental_item_units VALIDATE CONSTRAINT rental_item_units_company_item_fkey;
ALTER TABLE public.rental_item_units VALIDATE CONSTRAINT rental_item_units_company_product_unit_fkey;
