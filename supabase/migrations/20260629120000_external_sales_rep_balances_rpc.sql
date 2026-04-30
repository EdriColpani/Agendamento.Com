-- Saldo por vendedor externo: soma(ledger) - soma(pagamentos). Somente admin global.

CREATE OR REPLACE FUNCTION public.external_sales_rep_balances()
RETURNS TABLE (
  representative_id uuid,
  balance numeric(14, 4)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_global_admin() THEN
    RAISE EXCEPTION 'external_sales_rep_balances: acesso negado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id AS representative_id,
    (
      COALESCE(l.sum_c, 0::numeric) - COALESCE(p.sum_p, 0::numeric)
    )::numeric(14, 4) AS balance
  FROM public.external_sales_representatives r
  LEFT JOIN (
    SELECT representative_id, SUM(commission_amount) AS sum_c
    FROM public.external_sales_commission_ledger
    GROUP BY representative_id
  ) l ON l.representative_id = r.id
  LEFT JOIN (
    SELECT representative_id, SUM(amount_paid) AS sum_p
    FROM public.external_sales_payouts
    GROUP BY representative_id
  ) p ON p.representative_id = r.id;
END;
$$;

COMMENT ON FUNCTION public.external_sales_rep_balances() IS
  'Saldo por representante: total comissões no ledger menos pagamentos registrados. Apenas administrador global.';

REVOKE ALL ON FUNCTION public.external_sales_rep_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.external_sales_rep_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.external_sales_rep_balances() TO service_role;
