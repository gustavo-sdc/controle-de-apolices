# Backend de seguros — Supabase Edge Functions

Implementação inicial compatível com `seguros_supabase_schema.sql` fornecido anteriormente.

## Pré-requisitos

- Banco SQL já executado; primeiro gestor ativo em `public.profiles`.
- Supabase CLI instalado, acesso ao projeto e `supabase login`.
- Login do frontend via Supabase Auth; passe `session.access_token` como bearer token.
- Autenticação **obrigatória** mesmo com `verify_jwt=false`: cada rota valida token junto ao Auth com `getUser()` e verifica perfil ativo e papel. Configuração usada para compatibilidade com chaves JWT modernas e legadas. Nunca remova a validação interna.

## Publicar

Na pasta que contém `supabase/`:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy insurance-api
supabase functions deploy insurance-users
supabase functions deploy insurance-dashboard
```

Ajuste `supabase/config.toml` com o project ref ou use o que o comando link configurar. Para restringir CORS ao frontend (recomendado):

```bash
supabase secrets set APP_ORIGIN=https://seu-dominio.com.br
```

Em produção, deixe o navegador com a chave **publishable/anon** apenas. As chaves `service_role`/secret ficam restritas ao runtime de Edge Functions. Valores padrão das variáveis do Supabase são fornecidos pelo ambiente hospedado.

## Endpoints

URL-base: `https://SEU_PROJECT_REF.supabase.co/functions/v1`

Todas as rotas: `Authorization: Bearer <access_token>`. Para escritas JSON: `Content-Type: application/json`.

### `insurance-api`

- `GET /insurance-api/{people|clients|insured_persons|policies|policy_insured_persons|policy_installments|documents}` — lista paginada (`?limit=20&offset=0&active=true`, filtros de UUID por `client_id`, `policy_id`, `person_id`, `insured_person_id` quando aplicáveis).
- `GET /insurance-api/{resource}/{uuid}` — busca por ID.
- `POST /insurance-api/{resource}` — cria.
- `PATCH /insurance-api/{resource}/{uuid}` — altera ou **desativa** (`{"is_active":false}`); gestor/editor.
- `DELETE /insurance-api/{resource}/{uuid}` — exclusão física apenas gestor; FKs podem impedir remoção se houver vínculos.
- `POST /insurance-api/documents/upload-url` — gera URL e token para upload direto no bucket privado (nome de arquivo seguro, mime permitido).
- `POST /insurance-api/documents/{uuid}/download-url` — gera URL assinada de 60 segundos para documento ativo.

Fluxo de upload: solicitar URL, enviar arquivo com método de upload assinado do SDK `storage.from('insurance-documents').uploadToSignedUrl(path, token, file)`; depois cadastrar o documento com `POST /insurance-api/documents` e `storage_path` retornado. O upload físico e registro no banco não são transacionais; fazer rotina periódica de limpeza de arquivos órfãos.

Cadastro PF: `POST /people` -> `POST /clients` com `kind=pf,person_id` -> `POST /insured_persons` com `person_id` -> `POST /policies` em `rascunho` -> `POST /policy_insured_persons` com `relation=titular` -> `PATCH /policies/{id}` alterando `status=ativa`. Isso atende o trigger SQL que exige um titular PF nas apólices fora de rascunho.

Cadastro PJ: `POST /clients` com `kind=pj,company_name,cnpj` -> `POST /policies` em `rascunho` -> vínculos com `relation=segurado` ou `dependente` -> ativação. PJ não usa titular.

Dependentes podem informar `responsible_insured_id`, que deve apontar para registro ativo de `policy_insured_persons` da mesma apólice, não para `insured_persons`.

Parcelas pagas precisam de `status=paga`, `paid_at` e `paid_amount` juntos; parcelas não pagas exigem ambos nulos (conforme CHECK do SQL).

### `insurance-users` (somente gestor)

- `GET /insurance-users` — lista perfis.
- `GET /insurance-users/{uuid}` — perfil.
- `POST /insurance-users` — criar usuário Auth + perfil ativo; corpo `{"email":"...","password":"senha-forte","full_name":"...","role":"editor"}`; a senha é provisória e deve ser transmitida em canal seguro, idealmente substituir por convite por email no próximo incremento.
- `PATCH /insurance-users/{uuid}` — `full_name`, `role`, `is_active`.
- `DELETE /insurance-users/{uuid}` — exclui definitivamente o perfil e usuário do Auth **somente depois de desativar**. O banco impede apagar o último gestor ativo. Se a exclusão do Auth falhar depois da exclusão do perfil, requer limpeza administrativa; o usuário fica sem perfil ativo e não consegue usar a API.

OBS: `createUser` cria usuário sem confirmação de email; o usuário deve confirmar antes de usar, conforme configuração do Auth. Recomenda-se usar fluxo de convite no desenvolvimento seguinte, não transmitir senhas por mensagens.

### `insurance-dashboard`

- `GET /insurance-dashboard` — totais e indicadores da view `dashboard_summary`.

## Exemplos de chamada

```bash
curl 'https://SEU_PROJECT_REF.supabase.co/functions/v1/insurance-dashboard' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -H 'apikey: CHAVE_PUBLICA'

curl -X POST 'https://SEU_PROJECT_REF.supabase.co/functions/v1/insurance-api/people' \
  -H 'Authorization: Bearer ACCESS_TOKEN' \
  -H 'apikey: CHAVE_PUBLICA' \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Maria Exemplo","cpf":"12345678909"}'
```

## Limites e pontos de evolução

- Os fluxos que criam vários registros não são atômicos (cada requisição é uma transação diferente). Antes de colocar em produção, implementar RPCs PostgreSQL para cadastro PF/apólice/segurados em transação única.
- `POST /policies` força rascunho para permitir relacionar titular antes da ativação.
- As rotas genéricas aceitam apenas campos permitidos, mas regras adicionais de autorização por campo, histórico financeiro e coerência de document owner podem ser necessárias.
- `PATCH` permite modificar qualquer campo editável (exceto vínculos críticos citados); aplicar políticas de imutabilidade e validações de transição de status antes de produção.
- Documento deletado do banco não exclui automaticamente o objeto do Storage.
- Não há rate limiting dedicado; configurar controle de abuso no gateway antes de produção.
- Executar testes integrados contra um projeto separado (staging), inclusive conta editor, gestor, inativa, RLS e integridade referencial.
- Nunca colocar chaves secretas ou service_role no cliente.
