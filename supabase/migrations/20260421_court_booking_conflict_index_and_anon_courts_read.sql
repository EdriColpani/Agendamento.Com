-- Conflito em RPCs create_court_booking* / get_court_public_day_view: EXISTS por court_id + appointment_date + status.
-- Leitura pública opcional de quadras (anon) quando reserva pública está permitida — alinhado aos RPCs SECURITY DEFINER.

CREATE INDEX IF NOT EXISTS idx_appointments_court_date_active_court_booking
  ON public.appointments (court_id, appointment_date)
  WHERE booking_kind = 'court'
    AND court_id IS NOT NULL
    AND COALESCE(status, '') <> 'cancelado';

COMMENT ON INDEX public.idx_appointments_court_date_active_court_booking IS
  'Acelera detecção de sobreposição por quadra e dia (exclui cancelados; booking_kind = court).';

-- Permite .from('courts') como anon com as mesmas regras de company_public_court_booking_allowed (segmento court + flag).
GRANT SELECT ON TABLE public.courts TO anon;

DROP POLICY IF EXISTS "anon_can_select_courts_when_public_booking_allowed" ON public.courts;

CREATE POLICY "anon_can_select_courts_when_public_booking_allowed"
  ON public.courts
  FOR SELECT
  TO anon
  USING (
    is_active = true
    AND public.company_public_court_booking_allowed(company_id)
  );
