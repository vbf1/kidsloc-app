
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE public.customers
  ADD CONSTRAINT customers_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE public.occurrence_reports
  ADD CONSTRAINT occurrence_reports_company_id_id_key UNIQUE (company_id, id);

ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_company_customer_fkey
  FOREIGN KEY (company_id, customer_id)
  REFERENCES public.customers (company_id, id)
  ON DELETE SET NULL (customer_id) NOT VALID;

ALTER TABLE public.rental_events
  ADD CONSTRAINT rental_events_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.rental_event_reminder_settings
  ADD CONSTRAINT reminder_settings_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.rental_event_reminder_deliveries
  ADD CONSTRAINT reminder_deliveries_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.rental_contracts
  ADD CONSTRAINT rental_contracts_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE SET NULL (rental_id) NOT VALID;

ALTER TABLE public.occurrence_photos
  ADD CONSTRAINT occurrence_photos_company_occurrence_fkey
  FOREIGN KEY (company_id, occurrence_id)
  REFERENCES public.occurrence_reports (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.marketing_ads
  ADD CONSTRAINT marketing_ads_company_product_fkey
  FOREIGN KEY (company_id, product_id)
  REFERENCES public.products (company_id, id)
  ON DELETE SET NULL (product_id) NOT VALID;

ALTER TABLE public.rentals VALIDATE CONSTRAINT rentals_company_customer_fkey;
ALTER TABLE public.rental_events VALIDATE CONSTRAINT rental_events_company_rental_fkey;
ALTER TABLE public.rental_event_reminder_settings VALIDATE CONSTRAINT reminder_settings_company_rental_fkey;
ALTER TABLE public.rental_event_reminder_deliveries VALIDATE CONSTRAINT reminder_deliveries_company_rental_fkey;
ALTER TABLE public.rental_contracts VALIDATE CONSTRAINT rental_contracts_company_rental_fkey;
ALTER TABLE public.occurrence_photos VALIDATE CONSTRAINT occurrence_photos_company_occurrence_fkey;
ALTER TABLE public.marketing_ads VALIDATE CONSTRAINT marketing_ads_company_product_fkey;
