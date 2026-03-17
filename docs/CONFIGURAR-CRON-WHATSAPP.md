# Configurar o cron do WhatsApp (corrigir 401)

O cron que envia as mensagens de WhatsApp precisa de uma **chave** para a Edge Function aceitar a chamada. Sem isso, todas as invocações retornam **401**.

---

## Passo a passo (3 passos)

### 1. Copiar a Service Role Key no Supabase

1. Abra o **Supabase** no navegador e entre no seu projeto.
2. No menu da esquerda, clique em **Settings** (Configurações).
3. Clique em **API**.
4. Na página, procure **Project API keys**.
5. Ache a chave **`service_role`** (diz "secret" e não deve ser exposta no front).
6. Clique no ícone de **copiar** ao lado dela e guarde em um lugar seguro (você vai colar no próximo passo).

![Onde fica: Settings → API → service_role (copiar)](https://supabase.com/docs/img/api-keys.png)

---

### 2. Colar a chave na tabela `app_config`

1. No Supabase, no menu da esquerda, clique em **Table Editor**.
2. Abra a tabela **`app_config`**.
3. Procure a linha em que a coluna **`key`** é **`service_role_key`**.
4. Clique na célula da coluna **`value`** dessa mesma linha.
5. **Apague** o que estiver (se tiver vazio, deixe em branco).
6. **Cole** a chave que você copiou no passo 1 (a `service_role`).
7. Salve (Enter ou clique fora da célula; em alguns projetos há botão Save).

Se não existir a linha com `key = service_role_key`:

- Clique em **Insert row** (ou “Inserir linha”).
- Em **key** escreva: `service_role_key`
- Em **value** cole a chave do passo 1.
- Salve.

---

### 3. Rodar a migration e dar deploy da função

No terminal, na pasta do projeto (`c:\V3\tipoagenda.com`):

```bash
# Aplicar a migration que configura o cron para usar essa chave
supabase db push

# Publicar a Edge Function atualizada
supabase functions deploy whatsapp-message-scheduler
```

Se você não usa `supabase db push`, abra no Supabase: **SQL Editor**, cole o conteúdo do arquivo  
`supabase/migrations/20260306_whatsapp_cron_auth_fix.sql` e execute.

---

## Resumo em uma frase

**Copiar a chave `service_role` em Settings → API e colar no campo `value` da linha `service_role_key` na tabela `app_config`; depois rodar a migration e o deploy da função.**

Depois disso, o cron deve parar de retornar 401 e as mensagens agendadas devem passar a ser enviadas.
