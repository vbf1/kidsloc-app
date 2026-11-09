# Segurança e RLS

A migration `202611090001_foundation.sql` cria as primeiras tabelas e políticas.

## Regras de implementação
- Toda tabela de negócio terá `company_id NOT NULL` e RLS habilitado.
- Leitura exige membership ativo na empresa.
- Escrita exige papel permitido para a operação; permissões financeiras e exclusão serão restritas.
- Não confiar em `company_id` enviado pelo cliente sem validar membership no banco.
- Não expor `service_role` em Flutter, navegador, repositório ou artefatos de build.
- Buckets privados para contratos/recibos; policies por empresa e URLs assinadas de curta duração.
- Auditar operações sensíveis sem armazenar segredos, tokens ou dados de cartão.

## Antes de produção
Adicionar testes pgTAP para isolamento entre duas empresas, escalonamento de privilégios, usuário desativado, acesso anônimo e chamadas diretas às funções SQL.
