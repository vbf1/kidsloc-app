# Ambientes e publicação

## Web (GitHub Pages)

O Next.js usa exportação estática. O projeto está preparado para publicação em:

- https://vbf1.github.io/kidsloc-app/

O workflow usa a URL e a chave publicável do projeto Supabase conectado como valores padrão. As seguintes **Actions variables** podem sobrescrever esses valores por ambiente:

- `NEXT_PUBLIC_BASE_PATH`: `/kidsloc-app`
- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase do ambiente publicado.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave publicável do mesmo projeto.

A publishable key é destinada ao cliente e não substitui políticas RLS. Nunca configure `service_role` ou uma secret key em variáveis `NEXT_PUBLIC_*`.

O workflow instala dependências com `npm ci`, usa o `package-lock.json` versionado e interrompe o build se a auditoria detectar vulnerabilidades.

## Supabase Auth — configuração necessária antes de produção

No painel Supabase, em Authentication → URL Configuration, configure:

- Site URL: `https://vbf1.github.io/kidsloc-app/`
- Redirect URLs: `https://vbf1.github.io/kidsloc-app/**` e `http://localhost:3000/**`.

Antes de permitir cadastro de clientes reais:

1. Ative a confirmação de e-mail.
2. Configure um SMTP próprio em Authentication → SMTP Settings. O serviço de e-mail padrão do Supabase é limitado para testes e não deve ser tratado como serviço de envio de produção.
3. Ative a proteção contra senhas vazadas em Authentication → Password Security, se o projeto estiver em um plano que ofereça esse recurso (Pro ou superior; não incluído no Free). Se estiver no Free, registre essa limitação e avalie a mudança de plano ou controles compensatórios antes de produção.
4. Teste cadastro, confirmação, login, recuperação e redefinição de senha com uma conta de teste.

Os testes locais usam o Mailpit do Supabase local; isso não configura nem valida o SMTP do projeto hospedado.

## Banco de dados e histórico de migrations

A branch contém a migration local da fundação e testes pgTAP. O projeto Supabase remoto possui 30 versões de migration registradas, enquanto o repositório não contém a sequência SQL histórica correspondente. Essa divergência já existia na base do projeto.

**Não executar `supabase db push`, reparar o histórico remoto ou aplicar migrations no projeto conectado até reconciliar o histórico e revisar o snapshot do esquema.** A migration desta branch ainda não foi aplicada remotamente.

A validação local executa:

- `supabase db reset`
- 16 verificações pgTAP de RLS, privilégios e regras de criação de empresa
- teste E2E local de Auth e onboarding, com confirmação de e-mail capturada pelo Mailpit

## Flutter mobile

O código Dart passa por formatação, análise estática e testes. O diretório atual ainda não contém os projetos nativos Android/iOS; portanto, ainda não existe APK/IPA validado. Antes de gerar os projetos nativos, confirmar o identificador de pacote/bundle do aplicativo e os alvos de distribuição.

## Publicação

O PR de fundação permanece aberto. Build e artefato do GitHub Pages em PR não significam publicação. Não mesclar nem publicar sem autorização explícita.

Para reconciliar esse histórico sem alterar o banco remoto, o próximo passo seguro é gerar um dump **somente de esquema** com `supabase db dump --remote`, revisar o resultado e criar um baseline versionado. A CLI v3 exige o alvo remoto explícito; os comandos locais do CI não acessam o projeto hospedado.

Se esse procedimento for autorizado, configure no GitHub, em Settings → Secrets and variables → Actions, os secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`. Não envie esses valores pelo chat. O dump é leitura; a aplicação de migrations e qualquer reparo de histórico continuam exigindo autorização separada.
