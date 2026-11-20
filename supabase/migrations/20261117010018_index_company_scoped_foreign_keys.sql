
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE INDEX documents_company_rental_fk_idx ON public.documents (company_id, rental_id);
CREATE INDEX financial_transactions_company_rental_fk_idx ON public.financial_transactions (company_id, rental_id);
CREATE INDEX payments_company_rental_fk_idx ON public.payments (company_id, rental_id);
CREATE INDEX payments_company_transaction_fk_idx ON public.payments (company_id, transaction_id);
CREATE INDEX maintenance_records_company_product_fk_idx ON public.maintenance_records (company_id, product_id);
CREATE INDEX maintenance_records_company_product_unit_fk_idx ON public.maintenance_records (company_id, product_unit_id);
CREATE INDEX rental_items_company_product_fk_idx ON public.rental_items (company_id, product_id);
CREATE INDEX rental_items_company_rental_fk_idx ON public.rental_items (company_id, rental_id);
CREATE INDEX rental_item_units_company_item_fk_idx ON public.rental_item_units (company_id, rental_item_id);
CREATE INDEX rental_item_units_company_unit_fk_idx ON public.rental_item_units (company_id, product_unit_id);
CREATE INDEX stock_movements_company_product_fk_idx ON public.stock_movements (company_id, product_id);
CREATE INDEX rental_responsibles_company_member_fk_idx ON public.rental_responsibles (company_id, user_id);
CREATE INDEX team_conversation_members_company_conversation_fk_idx ON public.team_conversation_members (company_id, conversation_id);
CREATE INDEX team_messages_company_conversation_fk_idx ON public.team_messages (company_id, conversation_id);
CREATE INDEX rentals_company_customer_fk_idx ON public.rentals (company_id, customer_id);
CREATE INDEX rental_events_company_rental_fk_idx ON public.rental_events (company_id, rental_id);
CREATE INDEX reminder_settings_company_rental_fk_idx ON public.rental_event_reminder_settings (company_id, rental_id);
CREATE INDEX reminder_deliveries_company_rental_fk_idx ON public.rental_event_reminder_deliveries (company_id, rental_id);
CREATE INDEX rental_contracts_company_rental_fk_idx ON public.rental_contracts (company_id, rental_id);
