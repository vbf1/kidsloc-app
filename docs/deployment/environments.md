# Ambientes

Manter três projetos Supabase independentes: dev, staging e prod. Cada ambiente terá URL e publishable key próprias.

- Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BASE_PATH`.
- Flutter: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` via `--dart-define`.
- Segredos de Edge Functions: Supabase Secrets, nunca variáveis `NEXT_PUBLIC_*` nem `--dart-define` de cliente.

O GitHub Pages publica apenas o conteúdo estático de `out`. Configure a variável/repositório `NEXT_PUBLIC_BASE_PATH` vazia para domínio raiz ou `/<nome-do-repositorio>` para project pages.
