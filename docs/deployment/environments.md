# Ambientes e publicação

## Web (GitHub Pages)

O Next.js usa exportação estática. O projeto é publicado em:

- https://vbf1.github.io/kidsloc-app/

Configure as seguintes **Actions variables** no repositório:

- `NEXT_PUBLIC_BASE_PATH`: `/kidsloc-app`
- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase do ambiente publicado.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave publicável do mesmo projeto.

A publishable key é destinada ao cliente e não substitui políticas RLS. Nunca configure `service_role` ou uma secret key em variáveis `NEXT_PUBLIC_*`.

## Supabase Auth

No painel Supabase, em Authentication → URL Configuration, configure:

- Site URL: `https://vbf1.github.io/kidsloc-app/`
- Redirect URLs: `https://vbf1.github.io/kidsloc-app/**` e `http://localhost:3000/**`.

O fluxo de cadastro e recuperação de senha usa redirecionamento explícito para páginas hospedadas no GitHub Pages.

## Banco de dados

A migration inicial deve ser aplicada primeiro em um projeto Supabase de desenvolvimento descartável. Não aplicar diretamente no projeto atual até reconciliar o histórico e o esquema remoto. Validar RLS com usuários de teste antes de qualquer promoção.
