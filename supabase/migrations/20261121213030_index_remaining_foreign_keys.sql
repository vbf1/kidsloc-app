create index if not exists idx_company_feature_entitlements_updated_by_fk
  on private.company_feature_entitlements (updated_by);
create index if not exists idx_companies_created_by_fk on public.companies (created_by);
create index if not exists idx_company_event_reminder_settings_updated_by_fk
  on public.company_event_reminder_settings (updated_by);
create index if not exists idx_documents_created_by_fk on public.documents (created_by);
create index if not exists idx_documents_rental_id_fk on public.documents (rental_id);
create index if not exists idx_fcm_device_tokens_user_id_fk on public.fcm_device_tokens (user_id);
create index if not exists idx_financial_transactions_created_by_fk on public.financial_transactions (created_by);
create index if not exists idx_financial_transactions_rental_id_fk on public.financial_transactions (rental_id);
create index if not exists idx_lead_activities_created_by_fk on public.lead_activities (created_by);
create index if not exists idx_leads_converted_customer_id_fk on public.leads (converted_customer_id);
create index if not exists idx_leads_created_by_fk on public.leads (created_by);
create index if not exists idx_maintenance_records_product_id_fk on public.maintenance_records (product_id);
create index if not exists idx_maintenance_records_product_unit_id_fk on public.maintenance_records (product_unit_id);
create index if not exists idx_marketing_ads_approved_by_fk on public.marketing_ads (approved_by);
create index if not exists idx_marketing_ads_created_by_fk on public.marketing_ads (created_by);
create index if not exists idx_marketing_ads_product_id_fk on public.marketing_ads (product_id);
create index if not exists idx_marketing_settings_updated_by_fk on public.marketing_settings (updated_by);
create index if not exists idx_payments_created_by_fk on public.payments (created_by);
create index if not exists idx_payments_rental_id_fk on public.payments (rental_id);
create index if not exists idx_payments_transaction_id_fk on public.payments (transaction_id);
create index if not exists idx_push_subscriptions_user_id_fk on public.push_subscriptions (user_id);
create index if not exists idx_rental_event_reminder_settings_updated_by_fk
  on public.rental_event_reminder_settings (updated_by);
create index if not exists idx_rental_events_created_by_fk on public.rental_events (created_by);
create index if not exists idx_rental_events_rental_id_fk on public.rental_events (rental_id);
create index if not exists idx_rental_items_product_id_fk on public.rental_items (product_id);
create index if not exists idx_rental_quote_items_company_product_fk
  on public.rental_quote_items (company_id, product_id);
create index if not exists idx_rental_quotes_company_customer_fk
  on public.rental_quotes (company_id, customer_id);
create index if not exists idx_rental_quotes_created_by_fk on public.rental_quotes (created_by);
create index if not exists idx_rentals_created_by_fk on public.rentals (created_by);
create index if not exists idx_stock_movements_created_by_fk on public.stock_movements (created_by);
create index if not exists idx_stock_movements_product_id_fk on public.stock_movements (product_id);
create index if not exists idx_team_conversation_members_user_id_fk
  on public.team_conversation_members (user_id);
create index if not exists idx_team_conversations_created_by_fk on public.team_conversations (created_by);
create index if not exists idx_team_messages_sender_id_fk on public.team_messages (sender_id);
