# KidsLoc App

Plataforma SaaS de gestão para locadoras de brinquedos, equipamentos e serviços para eventos.

## Arquitetura
- `mobile/flutter_app`: Flutter + Riverpod + Supabase + GoRouter.
- `web/nextjs_app`: Next.js App Router + TypeScript + Tailwind + Supabase; exportação estática para GitHub Pages.
- `supabase`: migrations, Edge Functions e testes do banco.
- `docs`: decisões arquiteturais, segurança e implantação.

## Ambientes
Crie três projetos Supabase independentes: desenvolvimento, homologação e produção. Nunca reutilize credenciais entre ambientes. Após criar o primeiro usuário pelo Supabase Auth, invoque `create_company(p_name)` autenticado para registrar a empresa e conceder o papel inicial de proprietário (`owner`). O cadastro usa as tabelas existentes `companies`, `company_members` e `profiles`; não existe campo `slug` nesse contrato atual.

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

> A migration versionada nesta branch prepara somente o esquema mínimo da fundação para ambientes locais e testes. O histórico remoto possui migrations que ainda precisam ser reconciliadas com o repositório; não aplique `db push` nem esta migration diretamente no projeto remoto. Antes de produção, valide RLS com usuários distintos e configure os secrets das Edge Functions. Nunca coloque `service_role` em clientes.
