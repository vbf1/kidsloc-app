# Configuração do WhatsApp Business — Coexistence

Este guia prepara o KidsLoc para conectar um número que já está ativo no WhatsApp Business App ao WhatsApp Business Platform (Cloud API), mantendo o uso do aplicativo móvel. O fluxo foi implementado para aceitar somente o evento de conclusão de onboarding do WhatsApp Business App; ele não chama o endpoint tradicional de registro do número.

## 1. Pré-requisitos na Meta

1. Abra o [Meta for Developers](https://developers.facebook.com/apps/) e crie ou selecione um aplicativo com o caso de uso **WhatsApp**.
2. Conecte o aplicativo ao portfólio empresarial correto.
3. Conclua a verificação da empresa no Meta Business.
4. Em **Use cases → Customize → WhatsApp → Tech Provider onboarding**, conclua o onboarding de Tech Provider.
5. Envie o aplicativo para App Review e solicite acesso avançado às permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Configure **Facebook Login for Business → Configurations → Create configuration**:
   - Login variation: **Embedded Signup**
   - Use a experiência v4.
   - Selecione WhatsApp Cloud API e o onboarding de usuários do WhatsApp Business App.
   - Copie o **Configuration ID**.
7. Em OAuth settings, adicione o domínio HTTPS do site KidsLoc à lista de domínios permitidos e às URLs de redirecionamento válidas. Para o site GitHub Pages atual, o domínio é `vbf1.github.io`; inclua o caminho do app quando a tela da Meta solicitar uma URI completa.

A Meta exige verificação empresarial e revisão do aplicativo para o Tech Provider operar em nome de empresas clientes. A criação de um portfólio Meta Business, sozinha, não libera essas permissões.

## 2. Variáveis públicas do site

No GitHub, abra **Settings → Secrets and variables → Actions → Variables** e cadastre:

| Nome | Valor |
| --- | --- |
| `NEXT_PUBLIC_META_APP_ID` | App ID do aplicativo Meta |
| `NEXT_PUBLIC_META_CONFIG_ID` | Configuration ID do Embedded Signup v4 |

São identificadores públicos do fluxo de login, não tokens de acesso. O build do site lê essas variáveis.

## 3. Segredos do Supabase

No Supabase, abra **Project Settings → Edge Functions → Secrets** e cadastre:

| Nome | Conteúdo |
| --- | --- |
| `WHATSAPP_META_APP_ID` | Mesmo App ID da Meta |
| `WHATSAPP_META_APP_SECRET` | App Secret do aplicativo Meta |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Segredo aleatório criado para validar a inscrição do webhook |
| `WHATSAPP_TOKEN_ENCRYPTION_KEY` | Chave aleatória de 32 bytes codificada em Base64 |

Gere a chave de criptografia localmente com `openssl rand -base64 32`. Não envie App Secret, tokens ou chave de criptografia por mensagens ou commits.

## 4. Webhook na Meta

Quando as Edge Functions forem implantadas, configure no produto WhatsApp:

- Callback URL: `https://wfwohnssvftegnhwdzmt.supabase.co/functions/v1/whatsapp-webhook`
- Verify token: o mesmo valor definido em `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Assinatura do webhook: a função valida `X-Hub-Signature-256` com o App Secret.
- Campos mínimos para a primeira etapa: `account_update` e `messages`.

O endpoint registra somente metadados resumidos dos eventos e atualiza estados de entrega; ele não grava o conteúdo das conversas recebido nos webhooks.

## 5. Conectar no KidsLoc

Depois de:
- aprovar o aplicativo e as permissões na Meta;
- cadastrar as duas variáveis públicas no GitHub;
- cadastrar os quatro segredos no Supabase;
- implantar a migração e as Edge Functions;
- configurar o webhook;

acesse **KidsLoc → WhatsApp Business → Conectar WhatsApp Business** e conclua o fluxo da Meta. A função de conexão verifica se a Meta confirma `is_on_biz_app = true` e `platform_type = CLOUD_API`. Se a confirmação não ocorrer, a conexão fica em atenção e o KidsLoc não registra nem migra o número.

## 6. Antes de ativar mensagens automáticas

- Crie e obtenha aprovação dos modelos de mensagem necessários na Meta.
- Registre o consentimento de cada cliente para as categorias de mensagens que receberá.
- Ative as automações apenas depois de validar a conexão, os modelos, o consentimento e as regras de cobrança da Meta.

A política da Meta exige que a pessoa forneça o número e autorize receber mensagens da empresa identificada. O consentimento deve ser claro e as opções de saída precisam ser respeitadas.

## Limites desta etapa

A estrutura inicial já contempla conexão, armazenamento criptografado do token, consentimentos, modelos, fila, logs e webhook. O envio automático e os gatilhos de orçamento/locação/contrato/cobrança ainda não estão liberados. A migração e as funções deste PR não foram implantadas no projeto Supabase de produção; nenhuma mensagem foi enviada.

## Documentação oficial

- [Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4/)
- [Implementação do Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/)
- [Onboarding de clientes como Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider/)
- [Como se tornar Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers/)
- [Obter opt-in para WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in/)
