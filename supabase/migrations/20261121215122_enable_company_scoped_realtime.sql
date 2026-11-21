alter table public.company_members replica identity full;
alter table public.customers replica identity full;
alter table public.products replica identity full;
alter table public.product_units replica identity full;
alter table public.rentals replica identity full;
alter table public.rental_items replica identity full;
alter table public.rental_item_units replica identity full;
alter table public.rental_responsibles replica identity full;
alter table public.rental_events replica identity full;
alter table public.rental_quotes replica identity full;
alter table public.rental_quote_items replica identity full;
alter table public.rental_contracts replica identity full;
alter table public.financial_transactions replica identity full;
alter table public.payments replica identity full;
alter table public.leads replica identity full;
alter table public.lead_activities replica identity full;
alter table public.lead_pipeline_stages replica identity full;
alter table public.documents replica identity full;
alter table public.maintenance_records replica identity full;
alter table public.stock_movements replica identity full;
alter table public.occurrence_reports replica identity full;
alter table public.occurrence_photos replica identity full;
alter table public.team_conversations replica identity full;
alter table public.team_conversation_members replica identity full;
alter table public.team_messages replica identity full;

alter publication supabase_realtime add table
  public.company_members,
  public.customers,
  public.products,
  public.product_units,
  public.rentals,
  public.rental_items,
  public.rental_item_units,
  public.rental_responsibles,
  public.rental_events,
  public.rental_quotes,
  public.rental_quote_items,
  public.rental_contracts,
  public.financial_transactions,
  public.payments,
  public.leads,
  public.lead_activities,
  public.lead_pipeline_stages,
  public.documents,
  public.maintenance_records,
  public.stock_movements,
  public.occurrence_reports,
  public.occurrence_photos,
  public.team_conversations,
  public.team_conversation_members,
  public.team_messages;
