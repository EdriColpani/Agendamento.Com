# Plano de ação: pacote mensal por período (Arena)

Status: **Fases 1–3 implementadas** (UI + RPCs). Evoluções futuras: estorno MP automático em lote, checkout único consolidado.

## Objetivo

Permitir gerar **vários pacotes mensais de uma vez** (mesmo cliente, quadra, dia da semana, horário, plano de benefício e forma de pagamento), escolhendo **quantos meses** contratar a partir do **mês de referência inicial**, sem lançar mês a mês manualmente.

---

## Decisões de produto (fechadas)

| Tema | Decisão |
|------|---------|
| **Duração do contrato** | Apenas opções fixas: **1, 3, 6, 9 ou 12 meses** (dropdown ou botões segmentados). |
| **Limite máximo** | **12 meses** — não existe opção nem intervalo livre acima disso. |
| **Mês inicial** | Campo **“Mês de referência (início)”** (`type="month"`) — o período conta a partir desse mês inclusive. |
| **Cálculo do fim** | `mês_final = mês_inicial + (N - 1) meses`, com N ∈ {1, 3, 6, 9, 12}. Ex.: início jun/2026 + **6 meses** → jun a nov/2026. |
| **Modo de criação** | Manter **“Mês único”** (atual) + **“Período (pacotes em lote)”**. |
| **Plano (opcional)** | Continua sendo **modelo de benefício** (`court_monthly_plans`); reutilizado em cada pacote gerado. |
| **Pagamento** | **Fase 1:** apenas **dinheiro/balcão** (interno). Mercado Pago permanece só no fluxo mês a mês / checkout atual. |
| **Conflito em um mês** | **Não abortar tudo** — criar os meses possíveis e exibir relatório dos que falharam. |

### Opções de UI sugeridas (período)

```
Duração do contrato *
[ 1 mês ] [ 3 meses ] [ 6 meses ] [ 9 meses ] [ 12 meses ]   ← uma seleção

Mês de referência (início) *
[ 2026-06        ]

Resumo: "Serão gerados 6 pacotes: jun/2026 a nov/2026"
```

---

## Experiência na tela (`CourtMonthlyPackagesPage`)

1. **Tipo de contratação:** `Mês único` | `Período`.
2. **Se período:**
   - Dropdown ou radio group: **1 / 3 / 6 / 9 / 12 meses**.
   - **Mês de referência (início)** — único campo de data.
   - Resumo dinâmico com lista implícita de meses (ex.: “6 pacotes: jun/2026 … nov/2026”).
3. **Demais campos** iguais ao formulário atual (cliente, quadra, dia, horário, duração, plano, pagamento, observações).
4. **Botão:** “Gerar pacotes do período”.
5. **Resultado:** modal/toast com criados / ignorados (duplicidade) / falhas (conflito), **por mês**.

**Mês único:** comportamento atual inalterado (1 mês = opção implícita de 1).

---

## Backend

### Nova RPC (recomendado)

`create_court_monthly_packages_for_period_internal`

**Parâmetros adicionais em relação ao fluxo atual:**

- `p_start_month` (date, primeiro dia do mês)
- `p_duration_months` (integer) — **CHECK** `p_duration_months IN (1, 3, 6, 9, 12)`

**Comportamento:**

1. Validar permissão, módulo habilitado, `p_start_month` obrigatório.
2. Rejeitar se `p_duration_months` ∉ {1, 3, 6, 9, 12}.
3. Gerar lista de `reference_month` (N meses consecutivos a partir de `p_start_month`).
4. Para cada mês, executar a lógica existente de `create_court_monthly_package_internal` (extrair núcleo compartilhado ou loop com savepoint por mês).
5. Retornar JSON com contadores e detalhe por mês (`created` | `skipped_duplicate` | `failed` + mensagem).

**Não** chamar a RPC atual N vezes a partir do frontend.

### Regras por mês

- Preço e ocorrências **recalculados por mês** (faixas de preço podem variar).
- Conflito de horário validado **por mês** (regra atual).
- Duplicidade: se já existir pacote equivalente no mês → `skipped` (recomendado).

---

## Fases de implementação

### Fase 1 — MVP

- UI: toggle mês único / período + **seletor 1|3|6|9|12 meses** + mês inicial.
- RPC em lote com validação estrita de duração.
- Apenas pagamento **dinheiro**.
- Relatório de resultado na tela.
- Atualizar tópicos no menu **Ajuda Arena**.

### Fase 2 — Operação

- `batch_id` opcional para agrupar pacotes do mesmo lançamento.
- Filtro “por lote” na listagem de pacotes recentes.
- Pré-visualização: quantidade de meses e meses que serão gerados (sem valor fixo total).

### Fase 3 — Avançado (implementada)

- Mercado Pago no período (`create_court_monthly_packages_for_period_internal` + diálogo de checkouts).
- `cancel_court_monthly_package_batch_internal` — cancela lote e agendamentos vinculados.
- `complement_court_monthly_package_batch_internal` — cria meses faltantes do lote original.

---

## Testes de validação

| Cenário | Resultado esperado |
|---------|-------------------|
| 1 mês (modo período) | 1 pacote — equivalente ao mês único |
| 3 meses sem conflito | 3 pacotes + agendamentos |
| 12 meses, 1 com conflito | 11 criados, 1 falha com motivo |
| Repetir mesmo período | Skipped nos meses já existentes |
| Tentativa de 24 meses via API | Erro (só 1/3/6/9/12 aceitos) |
| Início dez/2026 + 3 meses | dez, jan, fev (anos corretos) |

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| UI confundir “plano” com “período” | Rótulos claros: **Duração do contrato** vs **Plano (benefício)** |
| Valores diferentes por mês | Texto: “Valor calculado individualmente em cada mês” |
| Timeout com 12 meses | Máximo 12; processamento no servidor; relatório parcial |

---

## Fora do escopo (v1)

- Intervalo livre (ex.: “de mar/2026 a ago/2027”).
- Durações customizadas (2, 4, 5, 7, 8, 10, 11 meses).
- Mais de 12 meses em uma única operação.

---

## Aprovação pendente

Antes de implementar, confirmar:

- [ ] Bloquear geração para meses **anteriores** ao mês corrente?
- [ ] Comportamento em duplicidade: apenas `skipped` ou permitir segundo pacote no mesmo mês?
