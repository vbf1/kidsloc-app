# KidsLoc App

Plataforma SaaS de gestão para locadoras de brinquedos, equipamentos e serviços para eventos.

## Arquitetura
- `mobile/flutter_app`: Flutter + Riverpod + Supabase + GoRouter.
- `web/nextjs_app`: Next.js App Router + TypeScript + Tailwind + Supabase; exportação estática para GitHub Pages.
- `supabase`: migrations, Edge Functions e testes do banco.
- `docs`: decisões arquiteturais, segurança e implantação.

## Ambientes
Crie três projetos Supabase independentes: desenvolvimento, homologação e produção. Nunca reutilize credenciais entre ambientes. Após aplicar a migration inicial e criar o primeiro usuário pelo Supabase Auth, invoque `create_company(nome, slug)` autenticado para registrar a empresa e conceder o papel inicial de administrador. Para o primeiro tenant, use Sonho Kids Brinquedos; confirme o slug disponível antes de executar.

### Web
Copie `web/nextjs_app/.env.example` para `.env.local` e preencha URL e publishable key do projeto Supabase correspondente.

```bash
cd web/nextjs_app
npm install
npm run dev
```

Build estático:
```bash
npm run build
```
A saída é gerada em `web/nextjs_app/out`.

### Mobile
Copie `mobile/flutter_app/.env.example` para `mobile/flutter_app/.env` (ou passe `--dart-define` no build). Configure somente URL e publishable key.

```bash
cd mobile/flutter_app
flutter pub get
flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_PUBLISHABLE_KEY=...
```

### Banco local
```bash
supabase start
supabase db reset
```

> Esta entrega é a fundação da Fase 1. Antes de produção, execute as migrations em ambiente de desenvolvimento, valide RLS com usuários de empresas distintas e configure os secrets das Edge Functions no painel/CLI do Supabase. Não coloque `service_role` em nenhum cliente.
