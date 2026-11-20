# LeadFesta — produto e modelo de acesso

## Objetivo

LeadFesta é um módulo comercial do KidsLoc para captação e gestão de leads. Ele deve atender empresas de qualquer ramo de atividade. Sonho Kids Brinquedos e Nobre Paladar são apenas duas empresas que poderão utilizar o módulo inicialmente; elas não definem nem limitam o produto.

Não implementar regras, campos, funis ou nomenclaturas que pressuponham locação de brinquedos ou venda de doces como requisito universal. O modelo deve permitir que empresas de serviços, comércio, eventos e outros segmentos usem o módulo com configurações próprias.

## Decisão comercial de acesso

- O proprietário da plataforma (platform owner) tem acesso ao LeadFesta por padrão e pode utilizar o módulo sem depender de concessão por empresa.
- O proprietário/administrador de cada empresa só recebe acesso quando o platform owner habilitar o recurso para aquela empresa no painel administrativo.
- LeadFesta é um adicional pago, separado do acesso normal ao KidsLoc.
- A ativação deve ser explícita e controlada pelo platform owner. Não habilitar automaticamente para toda empresa nova.
- A suspensão ou revogação deve bloquear o uso do módulo sem apagar os leads ou o histórico da empresa.
- No lançamento, a confirmação do pagamento e a ativação podem ser feitas manualmente pelo platform owner no painel. Integração automática de cobrança é uma etapa futura, não pressuposta.

## Modelo de autorização

- Tratar a disponibilidade como uma concessão de recurso por empresa (company feature entitlement), não como um tipo de empresa nem como um cargo de usuário.
- A autorização deve ser verificada no backend e no banco (RLS/RPC), além de ocultar ou exibir a navegação na interface. Não confiar apenas em controles visuais.
- Somente o platform owner pode conceder, suspender ou revogar o adicional.
- Dentro de uma empresa habilitada, o acesso inicial é do administrador/proprietário da empresa. Não conceder automaticamente a todos os funcionários. Uma futura opção de delegação poderá ser definida separadamente.
- A checagem deve sempre combinar empresa ativa, usuário autenticado, papel autorizado na empresa e concessão ativa do recurso.
- Os dados de leads devem ser isolados por company_id, com FKs e políticas que impeçam leitura ou associação cruzada entre empresas.
- A concessão comercial do módulo não deve ser confundida com o papel de acesso aos dados. O escopo de leitura e gestão dos leads de cada empresa deve respeitar as permissões de plataforma e da empresa definidas para o KidsLoc; habilitar o adicional não deve transformar um usuário em administrador de outra empresa.

## Estrutura funcional futura

- Leads e histórico pertencem à empresa, não ao ramo de atividade.
- Campos extras, etapas do funil, origens e categorias devem ser configuráveis ou extensíveis.
- O módulo não deve depender dos cadastros de brinquedos, doces, locações ou produtos de um segmento específico.
- A integração futura com clientes e oportunidades do KidsLoc deve evitar duplicação de contatos e manter a origem/histórico do lead.

## Critérios de aceite antes de liberar

1. Platform owner consegue habilitar e suspender LeadFesta por empresa no painel.
2. Empresa sem concessão ativa não consegue abrir, consultar ou alterar dados do módulo nem por chamadas diretas à API.
3. Empresa habilitada permite acesso ao seu administrador/proprietário autorizado, mas não libera automaticamente funcionários.
4. Um usuário de uma empresa não consegue consultar, alterar, associar ou inferir leads de outra empresa.
5. Revogar o adicional bloqueia o acesso sem apagar os dados.
6. Platform owner tem acesso administrativo à configuração da concessão, sem que a concessão em si amplie acesso aos leads privados.
7. O proprietário da plataforma já consegue utilizar o módulo por padrão, sem ativação adicional.
8. O modelo funciona para empresas de ramos diferentes, sem pressupor Sonho Kids ou Nobre Paladar.

## Estado

Este documento registra os requisitos aprovados para orientar a implementação futura. Não cria tabelas, não habilita o módulo e não altera o banco remoto. A implementação funcional começa somente depois da fundação e da reconciliação de migrations estarem seguras.
