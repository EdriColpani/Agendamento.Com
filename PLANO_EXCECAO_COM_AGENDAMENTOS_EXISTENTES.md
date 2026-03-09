# Plano: Exceção de horário com agendamentos já existentes

## Contexto

Na tela **Horários do colaborador** (ícone do relógio no menu do colaborador), é possível cadastrar **exceções de horário**: períodos ou dias em que o colaborador não pode trabalhar. Hoje o sistema:

- Salva a exceção normalmente.
- Na **consulta de disponibilidade** (novos agendamentos), exceções e agendamentos existentes são considerados: o horário da exceção deixa de aparecer como disponível.
- **Não há** nenhuma verificação ao **cadastrar** a exceção: se já existirem agendamentos naquele período, eles continuam ativos. O colaborador fica com “compromisso” no horário em que declarou indisponibilidade.

O objetivo deste plano é definir o que fazer quando o colaborador **lança uma exceção** em um período em que **já há agendamentos**.

---

## Opções possíveis

### Opção A — Avisar e bloquear (não permitir salvar)

- **Comportamento:** Ao salvar a exceção, o sistema consulta agendamentos do colaborador na data da exceção que se sobrepõem ao intervalo (ou ao dia inteiro, se `is_day_off`).
  - Se houver **qualquer** conflito → **não salva** a exceção e exibe mensagem do tipo:  
    *"Existem X agendamento(s) neste período. Remova ou reagende os agendamentos antes de cadastrar esta exceção."*
- **Prós:** Evita inconsistência (nunca fica exceção + agendamento no mesmo horário).
- **Contras:** O usuário é obrigado a ir em outro lugar (lista de agendamentos) para resolver antes; mais um passo manual.

---

### Opção B — Avisar e permitir escolher (recomendada)

- **Comportamento:**
  1. Ao tentar salvar a exceção, o sistema verifica se há agendamentos do colaborador na data que **sobrepõem** o intervalo da exceção (ou todo o dia, se for dia de folga).
  2. Se **não houver** conflito → salva a exceção normalmente.
  3. Se **houver** conflito → **não salva** ainda; abre um passo extra (modal ou etapa) mostrando:
     - Quantos agendamentos conflitam e em quais horários (resumo: data, hora, cliente/serviço).
     - Opções:
       - **"Cancelar estes agendamentos e salvar a exceção"** → cancela os agendamentos listados (status `cancelado`) e em seguida salva a exceção; opcionalmente dispara notificação/WhatsApp de cancelamento, se o projeto já tiver esse fluxo.
       - **"Apenas avisar e salvar a exceção"** → salva a exceção mesmo com conflito; os agendamentos permanecem. Mensagem clara: "A exceção foi salva. Você ainda possui X agendamento(s) neste horário; gerencie-os na lista de agendamentos."
       - **"Voltar"** → fecha o passo extra sem salvar a exceção; o usuário pode ajustar a exceção ou resolver os agendamentos antes.
- **Prós:** Dá controle explícito (cancelar em lote ou manter e resolver depois), evita surpresa e mantém consistência se o usuário escolher cancelar.
- **Contras:** Um fluxo a mais na tela de exceção (modal/etapa de conflito).

---

### Opção C — Salvar sempre e apenas listar conflitos

- **Comportamento:** Sempre permite salvar a exceção. Após salvar, se houver agendamentos no período, exibe um aviso:  
  *"Exceção salva. Atenção: existem X agendamento(s) neste período. Verifique na lista de agendamentos."* (com link para a lista, se fizer sentido).
- **Prós:** Fluxo mais simples; não bloqueia nada.
- **Contras:** Fica possível ter exceção e agendamento no mesmo horário; a responsabilidade de corrigir fica toda com o usuário, sem ação integrada (ex.: cancelar em lote).

---

### Opção D — Salvar e cancelar automaticamente

- **Comportamento:** Ao salvar a exceção, o sistema cancela automaticamente todos os agendamentos do colaborador que se sobrepõem ao período da exceção (e opcionalmente notifica cliente/sistema).
- **Prós:** Nunca fica exceção + agendamento no mesmo horário; uma única ação.
- **Contras:** Pode surpreender o usuário (cancelamentos em massa sem confirmação); risco de cancelar algo que ele queria manter (ex.: exceção errada).

---

## Abordagem escolhida: resolução por agendamento (Cancelar ou Reagendar)

1. Ao tentar **salvar a exceção**, o sistema verifica se há agendamentos que se sobrepõem ao período.
2. Se **não houver** conflito → salva a exceção normalmente.
3. Se **houver** conflito → **não salva** ainda; abre **popup** ou **página** listando os agendamentos do período; por item: **Cancelar** ou **Reagendar** (trocar data/hora). “apenas avisar e salvar” 4. Quando o usuário tiver resolvido os conflitos (cancelou ou reagendou cada um), pode **confirmar e salvar a exceção**. Opcionalmente: "Salvar exceção mesmo assim" se ainda restar algum agendamento.

**Vantagens:** Mais profissional; controle por agendamento (cancelar ou reagendar); evita cancelamento em massa; o cliente pode ser remanejado em vez de só cancelado.

---

## Detalhes técnicos (abordagem escolhida)

1. **Onde:** Na tela de exceção (`CollaboratorSchedulePage`), no fluxo de **salvar exceção** (antes do `insert`/`update` em `schedule_exceptions`).
2. **Verificação de conflito:**
   - Dados da exceção: `exception_date`, `is_day_off`, `start_time`, `end_time` (ou dia inteiro).
   - Buscar em `appointments`: mesmo `collaborator_id` e `company_id`, `appointment_date = exception_date`, `status != 'cancelado'`.
   - Para cada agendamento: calcular intervalo `[appointment_time, appointment_time + total_duration_minutes]` e verificar sobreposição com o intervalo da exceção (ou com o dia inteiro se `is_day_off`).
3. **UI — Popup vs página:**
   - **Popup (modal):** Mantém o contexto (exceção que está sendo cadastrada). Lista os agendamentos conflitantes; cada linha com botões "Cancelar" e "Reagendar". Ao reagendar, pode abrir um sub-modal ou inline (seleção de data/hora). Botão final "Todos resolvidos — Salvar exceção" (e opcional "Salvar exceção mesmo assim").
   - **Página dedicada:** Redirecionar para algo como `/colaboradores/:id/excecao-conflitos` com state (data da exceção, intervalo, payload da exceção). Na página: mesma lista + Cancelar/Reagendar por item. Ao terminar, botão "Salvar exceção" e retorno à tela de horários. Útil se a lista for longa ou o fluxo de reagendamento for mais rico.
4. **Reagendamento:** Reutilizar o fluxo existente de edição de agendamento (troca de data/hora); validar disponibilidade do colaborador na nova data/hora.
5. **Cancelamento:** Atualizar `appointments` (status `cancelado`); reutilizar fluxo de notificação (ex.: WhatsApp) se existir.
6. **Salvar exceção:** Após o usuário confirmar (e, se desejado, quando não houver mais conflitos, ou permitir "salvar mesmo assim" com aviso).
7. **Permissões/RLS:** Verificação, cancelamento e reagendamento devem respeitar as políticas atuais de `appointments`.

---

## Resumo do fluxo

| Etapa | Ação |
|-------|------|
| 1 | Usuário preenche exceção e clica em "Salvar exceção". |
| 2 | Sistema verifica agendamentos no período da exceção. |
| 3a | Sem conflitos → salva exceção e fecha. |
| 3b | Com conflitos → abre popup ou vai para página de resolução. |
| 4 | Lista agendamentos conflitantes; por item: **Cancelar** ou **Reagendar**. |
| 5 | Usuário resolve cada um; em seguida **Salvar exceção** (e opcionalmente "Salvar mesmo assim" se ainda houver itens). |
