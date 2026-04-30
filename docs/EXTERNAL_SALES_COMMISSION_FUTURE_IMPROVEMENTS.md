# Melhorias futuras — comissão de vendedores externos (assinatura)

Backlog opcional após o núcleo implementado (ledger, webhook, cadastro `?ref=`, admin, payouts, estorno de comissão, CSV, atribuições).

## 1. Portal do vendedor externo

- Associar `external_sales_representatives` a `auth.users` (coluna opcional ou tabela de vínculo).
- Rotas e telas só para o representante: saldo, histórico do ledger, dados mínimos (somente leitura ou edição limitada).
- RLS/policies específicas (não usar apenas admin global).

## 2. Estorno Mercado Pago × vigência de plano

- Hoje o webhook trata **comissão** em estorno/chargeback; a **assinatura na empresa** não é revertida automaticamente.
- Definir regra de produto: downgrade, suspensão, ou só alerta operacional — e então implementar na Edge ou em job de reconciliação.

## 3. Auditoria

- Registrar quem criou/alterou atribuição empresa↔vendedor e pagamentos manuais (`recorded_by_user_id` já existe em payouts; estender se necessário).
- Opcional: tabela de audit log ou triggers com `auth.uid()` e timestamp em `company_external_sales_attributions`.

## 4. Testes

- Testes e2e ou de integração: cadastro com `?ref=` → atribuição; pagamento de plano (mock MP) → linha no ledger; estorno → reversal.
- Testes de RPC idempotentes (`external_sales_record_accrual`, `external_sales_record_reversal_for_payment`).

## 5. Performance (se o volume crescer)

- Export CSV com paginação ou job assíncrono para extratos muito grandes.
- Índices adicionais conforme relatórios lentos (monitorar `external_sales_commission_ledger`).

---

**Referência de implementação atual:** migrações `20260629100000_*`, `20260629120000_*`; Edge `mercadopago-webhook`, `register-company-and-user`; UI `/admin-dashboard/vendedores-externos`.
