import { useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
};

const GuestAppointmentConfirmationPage = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const flow = params.get("flow");
  const companyName = params.get("companyName");
  const courtName = params.get("courtName");
  const appointmentDate = params.get("appointmentDate");
  const appointmentTime = params.get("appointmentTime");
  const slotPrice = Number(params.get("slotPrice") || "0");
  const paymentMethod = params.get("paymentMethod") || "";

  const formattedDate = useMemo(() => {
    if (!appointmentDate) return null;
    try {
      return format(parseISO(appointmentDate), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return appointmentDate;
    }
  }, [appointmentDate]);

  const paymentLabel = PAYMENT_METHOD_LABELS[paymentMethod] || "A combinar no local";
  const isCourtFlow = flow === "court";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">
          Agendamento Confirmado!
        </h1>
        <p className="text-gray-700 mb-2">Seu agendamento foi registrado com sucesso.</p>
        {appointmentId && (
          <p className="text-sm text-gray-500 mb-4">
            Código do agendamento: <span className="font-mono">{appointmentId}</span>
          </p>
        )}
        {isCourtFlow ? (
          <div className="text-sm text-left border rounded-md bg-gray-50 p-3 mb-4 space-y-1">
            {companyName ? <p><strong>Empresa:</strong> {companyName}</p> : null}
            {courtName ? <p><strong>Quadra:</strong> {courtName}</p> : null}
            {formattedDate && appointmentTime ? (
              <p><strong>Data/Hora:</strong> {formattedDate} às {appointmentTime}</p>
            ) : null}
            <p><strong>Pagamento:</strong> {paymentLabel}</p>
            {slotPrice > 0 ? (
              <p><strong>Valor estimado:</strong> R$ {slotPrice.toFixed(2).replace(".", ",")}</p>
            ) : null}
          </div>
        ) : null}
        <p className="text-gray-600 mb-6">Caso precise alterar ou cancelar, entre em contato com o estabelecimento.</p>
        <Link
          to="/"
          className="inline-block px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-black font-medium rounded-full transition-colors"
        >
          Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
};

export default GuestAppointmentConfirmationPage;


