
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE public.team_conversations
  ADD CONSTRAINT team_conversations_company_id_id_key UNIQUE (company_id, id);

ALTER TABLE public.documents
  ADD CONSTRAINT documents_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE SET NULL (rental_id) NOT VALID;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE SET NULL (rental_id) NOT VALID;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE SET NULL (rental_id) NOT VALID;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_company_transaction_fkey
  FOREIGN KEY (company_id, transaction_id)
  REFERENCES public.financial_transactions (company_id, id)
  ON DELETE SET NULL (transaction_id) NOT VALID;

ALTER TABLE public.rental_responsibles
  ADD CONSTRAINT rental_responsibles_company_rental_fkey
  FOREIGN KEY (company_id, rental_id)
  REFERENCES public.rentals (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.rental_responsibles
  ADD CONSTRAINT rental_responsibles_company_member_fkey
  FOREIGN KEY (company_id, user_id)
  REFERENCES public.company_members (company_id, user_id)
  ON DELETE SET NULL (user_id) NOT VALID;

ALTER TABLE public.team_conversation_members
  ADD CONSTRAINT team_members_company_conversation_fkey
  FOREIGN KEY (company_id, conversation_id)
  REFERENCES public.team_conversations (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.team_conversation_members
  ADD CONSTRAINT team_members_company_member_fkey
  FOREIGN KEY (company_id, user_id)
  REFERENCES public.company_members (company_id, user_id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.team_messages
  ADD CONSTRAINT team_messages_company_conversation_fkey
  FOREIGN KEY (company_id, conversation_id)
  REFERENCES public.team_conversations (company_id, id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.fcm_device_tokens
  ADD CONSTRAINT fcm_tokens_company_member_fkey
  FOREIGN KEY (company_id, user_id)
  REFERENCES public.company_members (company_id, user_id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE public.documents VALIDATE CONSTRAINT documents_company_rental_fkey;
ALTER TABLE public.financial_transactions VALIDATE CONSTRAINT financial_transactions_company_rental_fkey;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_company_rental_fkey;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_company_transaction_fkey;
ALTER TABLE public.rental_responsibles VALIDATE CONSTRAINT rental_responsibles_company_rental_fkey;
ALTER TABLE public.rental_responsibles VALIDATE CONSTRAINT rental_responsibles_company_member_fkey;
ALTER TABLE public.team_conversation_members VALIDATE CONSTRAINT team_members_company_conversation_fkey;
ALTER TABLE public.team_conversation_members VALIDATE CONSTRAINT team_members_company_member_fkey;
ALTER TABLE public.team_messages VALIDATE CONSTRAINT team_messages_company_conversation_fkey;
ALTER TABLE public.fcm_device_tokens VALIDATE CONSTRAINT fcm_tokens_company_member_fkey;
