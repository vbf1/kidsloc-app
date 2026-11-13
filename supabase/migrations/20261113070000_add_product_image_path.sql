-- Adiciona o caminho da foto principal de cada item do catálogo.
-- O arquivo permanece no bucket privado product-images; apenas o caminho é salvo aqui.
alter table public.products
  add column if not exists image_path text;
