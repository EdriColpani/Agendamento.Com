import { useMemo, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/utils/toast";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  mercado_pago: "Mercado Pago (online)",
};

const GuestAppointmentConfirmationPage = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [retryLoading, setRetryLoading] = useState(false);

  const flow = params.get("flow");
  const companyName = params.get("companyName");
  const courtName = params.get("courtName");
  const appointmentDate = params.get("appointmentDate");
  const appointmentTime = params.get("appointmentTime");
  const slotPrice = Number(params.get("slotPrice") || "0");
  const paymentMethod = params.get("paymentMethod") || "";
  const mpReturn = params.get("mp");

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
  const mpStatus = mpReturn === "1" ? "ok" : mpReturn === "0" ? "fail" : null;

  const title =
    mpStatus === "fail"
      ? "Pagamento não concluído"
      : mpStatus === "ok"
        ? "Pagamento recebido"
        : "Agendamento confirmado!";

  const canRetryCheckout = isCourtFlow && mpStatus === "fail" && Boolean(appointmentId);

  const handleRetryCheckout = async () => {
    if (!appointmentId) return;
    setRetryLoading(true);
    try {
      const response = await supabase.functions.invoke("create-court-booking-checkout", {
        body: JSON.stringify({ appointment_id: appointmentId }),
      });

      if (response.error || (response.data && typeof response.data === "object" && "error" in response.data)) {
        const msg = response.error?.message ||
          String((response.data as { error?: string })?.error || "Falha ao reabrir checkout.");
        throw new Error(msg);
      }

      const payload = response.data as { init_point?: string };
      if (!payload?.init_point) {
        throw new Error("Checkout indisponível para esta reserva.");
      }

      window.location.href = payload.init_point;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro ao tentar pagar novamente.";
      showError(msg);
    } finally {
      setRetryLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">
          {title}
        </h1>
        <p className="text-gray-700 mb-2">
          {mpStatus === "fail"
            ? "Sua reserva continua pendente na arena. Você pode tentar pagar novamente pelo link enviado pela empresa ou falar com o estabelecimento."
            : mpStatus === "ok"
              ? "O Mercado Pago registrou o pagamento. Em alguns segundos o sistema confirma a reserva automaticamente; se o status ainda aparecer pendente, aguarde um instante."
              : "Seu agendamento foi registrado com sucesso."}
        </p>
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
        {canRetryCheckout ? (
          <button
            type="button"
            onClick={handleRetryCheckout}
            disabled={retryLoading}
            className="inline-block px-6 py-2 mb-3 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-900 font-medium rounded-full transition-colors"
          >
            {retryLoading ? "Abrindo checkout..." : "Tentar pagar novamente"}
          </button>
        ) : null}
        <Link
          to="/"
          className="inline-block px-6 py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-full transition-colors"
        >
          Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
};

export default GuestAppointmentConfirmationPage;


