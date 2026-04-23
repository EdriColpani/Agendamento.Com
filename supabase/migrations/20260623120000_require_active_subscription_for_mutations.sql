-- ============================================================================
-- Fase 4: impedir mutações (INSERT/UPDATE/DELETE) em tabelas da empresa
-- enquanto não houver assinatura ativa e em vigência.
-- Bypass: service_role (Edge), administrador global (type_user), leitura não afetada.
--
-- Operacional / limitações:
-- - TRUNCATE não dispara estes gatilhos; não use TRUNC em produção com credenciais
--   que não devam ignorar a regra, ou reavalie a política de acesso.
-- - Migrations SQL que fazem INSERT/UPDATE/DELETE nessas tabelas geralmente não
--   têm request.jwt (service_role falso, auth.uid() nulo) → a operação falha.
--   Use cliente com service key (script/Edge), ou desabilite o gatilho de forma
--   explícita nessa migration de manutenção, ou insira/altere dados antes
--   desta migration ser aplicada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.jwt_context_is_service_role()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  claims text;
  role text;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '');
  IF claims IS NULL OR btrim(claims) = '' THEN
    RETURN false;
  END IF;
  role := (claims::jsonb ->> 'role');
  RETURN coalesce(role, '') = 'service_role';
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.jwt_context_is_service_role() IS
'true quando o JWT corrente é o service role (chamadas de backend / Edge com service key).';

CREATE OR REPLACE FUNCTION public.auth_is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT bool_or(upper(tu.cod) = ANY (ARRAY[
      'GLOBAL_ADMIN', 'ADMIN_GLOBAL', 'ADMINISTRADOR_GLOBAL', 'SUPER_ADMIN'
    ]))
    FROM public.type_user tu
    WHERE tu.user_id = auth.uid()
  ), false);
$$;

COMMENT ON FUNCTION public.auth_is_global_admin() IS
'Indica se auth.uid() é administrador global (tabela type_user).';

CREATE OR REPLACE FUNCTION public.company_has_valid_subscription(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT true
    FROM public.company_subscriptions cs
    WHERE cs.company_id = p_company_id
      AND cs.status = 'active'
      AND (cs.end_date IS NULL OR (cs.end_date::date >= CURRENT_DATE))
    LIMIT 1
  ), false);
$$;

COMMENT ON FUNCTION public.company_has_valid_subscription(uuid) IS
'true se a empresa possui assinatura ativa (status active e ainda em vigor por end_date).';

-- -------------------------------------------------------------------------
-- 1) Tabelas com company_id no próprio registro
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_company_mutation_by_company_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  cid uuid;
  op text;
BEGIN
  IF public.jwt_context_is_service_role() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF public.auth_is_global_admin() THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  op := TG_OP;
  IF op = 'DELETE' THEN
    cid := OLD.company_id;
  ELSE
    cid := NEW.company_id;
  END IF;

  IF cid IS NULL THEN
    RAISE EXCEPTION 'Dados de empresa inválidos para alteração.';
  END IF;

  IF NOT public.company_has_valid_subscription(cid) THEN
    RAISE EXCEPTION
      'É necessário um plano de assinatura ativo para realizar esta operação. Acesse Planos para aderir ou renovar.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

-- -------------------------------------------------------------------------
-- 2) appointment_services: resolver company via appointments
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_company_mutation_appointment_services()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  aid uuid;
  cid uuid;
  op text;
BEGIN
  IF public.jwt_context_is_service_role() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF public.auth_is_global_admin() THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  op := TG_OP;
  IF op = 'DELETE' THEN
    aid := OLD.appointment_id;
  ELSE
    aid := NEW.appointment_id;
  END IF;

  SELECT a.company_id INTO cid
  FROM public.appointments a
  WHERE a.id = aid;

  IF cid IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar a empresa do agendamento.';
  END IF;

  IF NOT public.company_has_valid_subscription(cid) THEN
    RAISE EXCEPTION
      'É necessário um plano de assinatura ativo para realizar esta operação. Acesse Planos para aderir ou renovar.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

-- -------------------------------------------------------------------------
-- 3) tabelas com court_id: resolver company_id via public.courts
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_company_mutation_by_court_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  cid uuid;
  c_id uuid;
  op text;
BEGIN
  IF public.jwt_context_is_service_role() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF public.auth_is_global_admin() THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  op := TG_OP;
  IF op = 'DELETE' THEN
    c_id := OLD.court_id;
  ELSE
    c_id := NEW.court_id;
  END IF;

  IF c_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de quadra inválido.';
  END IF;

  SELECT ct.company_id INTO cid
  FROM public.courts ct
  WHERE ct.id = c_id;

  IF cid IS NULL THEN
    RAISE EXCEPTION 'Quadra sem empresa vinculada.';
  END IF;

  IF NOT public.company_has_valid_subscription(cid) THEN
    RAISE EXCEPTION
      'É necessário um plano de assinatura ativo para realizar esta operação. Acesse Planos para aderir ou renovar.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

-- -------------------------------------------------------------------------
-- Aplicar triggers
-- Nomes fixos idempotentes (drop + create)
-- -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_require_subscriptions_appointments ON public.appointments;
CREATE TRIGGER trg_require_subscriptions_appointments
BEFORE INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_clients ON public.clients;
CREATE TRIGGER trg_require_subscriptions_clients
BEFORE INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_services ON public.services;
CREATE TRIGGER trg_require_subscriptions_services
BEFORE INSERT OR UPDATE OR DELETE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_courts ON public.courts;
CREATE TRIGGER trg_require_subscriptions_courts
BEFORE INSERT OR UPDATE OR DELETE ON public.courts
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_collaborators ON public.collaborators;
CREATE TRIGGER trg_require_subscriptions_collaborators
BEFORE INSERT OR UPDATE OR DELETE ON public.collaborators
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_collaborator_services ON public.collaborator_services;
CREATE TRIGGER trg_require_subscriptions_collaborator_services
BEFORE INSERT OR UPDATE OR DELETE ON public.collaborator_services
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

-- company_payment_credentials: credenciais MP muitas vezes configuradas antes/sem plano; não forçar aqui.

DROP TRIGGER IF EXISTS trg_require_subscriptions_cash_register_closures ON public.cash_register_closures;
CREATE TRIGGER trg_require_subscriptions_cash_register_closures
BEFORE INSERT OR UPDATE OR DELETE ON public.cash_register_closures
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_commission_payments ON public.commission_payments;
CREATE TRIGGER trg_require_subscriptions_commission_payments
BEFORE INSERT OR UPDATE OR DELETE ON public.commission_payments
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_appointment_services ON public.appointment_services;
CREATE TRIGGER trg_require_subscriptions_appointment_services
BEFORE INSERT OR UPDATE OR DELETE ON public.appointment_services
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_appointment_services();

DROP TRIGGER IF EXISTS trg_require_subscriptions_court_price_bands ON public.court_slot_price_bands;
CREATE TRIGGER trg_require_subscriptions_court_price_bands
BEFORE INSERT OR UPDATE OR DELETE ON public.court_slot_price_bands
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_court_id();

DROP TRIGGER IF EXISTS trg_require_subscriptions_court_working_hours ON public.court_working_hours;
CREATE TRIGGER trg_require_subscriptions_court_working_hours
BEFORE INSERT OR UPDATE OR DELETE ON public.court_working_hours
FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_court_id();

-- Tabelas opcionais: criar somente se existir (fases posteriores)
DO $$
BEGIN
  IF to_regclass('public.court_booking_refund_attempts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_require_subscriptions_court_refund_attempts ON public.court_booking_refund_attempts;
    CREATE TRIGGER trg_require_subscriptions_court_refund_attempts
    BEFORE INSERT OR UPDATE OR DELETE ON public.court_booking_refund_attempts
    FOR EACH ROW EXECUTE FUNCTION public.assert_company_mutation_by_company_id();
  END IF;
END $$;

-- Funções de apoio (RPC/policies futuras podem reutilizar)
GRANT EXECUTE ON FUNCTION public.jwt_context_is_service_role() TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_global_admin() TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.company_has_valid_subscription(uuid) TO service_role, authenticated, anon;
