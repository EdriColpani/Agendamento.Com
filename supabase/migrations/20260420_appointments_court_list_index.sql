-- Lista de reservas arena (/quadras/reservas): acelera filtros por empresa + intervalo de datas + booking_kind court.

CREATE INDEX IF NOT EXISTS idx_appointments_company_court_booking_date
  ON public.appointments (company_id, appointment_date)
  WHERE booking_kind = 'court';

COMMENT ON INDEX public.idx_appointments_company_court_booking_date IS
  'Suporta listagem de reservas de quadra por empresa e período (partial index booking_kind = court).';
