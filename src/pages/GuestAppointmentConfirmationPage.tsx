import { useMemo, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Wallet,
  Clock,
  Building2,
} from "lucide-react";
import { showError } from "@/utils/toast";
import { invokeEdgePublicOrThrow } from "@/utils/edge-invoke";
import { Button } from "@/components/ui/button";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Pagamento no balcão",
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
  const isCounterPayment = isCourtFlow && paymentMethod === "dinheiro";
  const isMpSuccess = mpReturn === "1";
  const isMpFailure = isCourtFlow && mpReturn === "0" && !isCounterPayment;

  const canRetryCheckout = isMpFailure && Boolean(appointmentId);

  const handleRetryCheckout = async () => {
    if (!appointmentId) return;
    setRetryLoading(true);
    try {
      const payload = await invokeEdgePublicOrThrow<{ init_point?: string }>("create-court-booking-checkout", {
        body: { appointment_id: appointmentId },
      });
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

  const screenConfig = (() => {
    if (isCounterPayment) {
      return {
        icon: CalendarCheck,
        iconClass: "text-primary bg-primary/10",
        title: "Horário reservado!",
        subtitle:
          "Sua reserva foi registrada com sucesso. O pagamento ficará em aberto e deve ser feito presencialmente na arena.",
        badge: {
          text: "Pagamento pendente — acerto no local",
          className: "bg-amber-50 text-amber-900 border-amber-200",
        },
      };
    }
    if (isMpFailure) {
      return {
        icon: AlertTriangle,
        iconClass: "text-amber-700 bg-amber-100",
        title: "Pagamento não concluído",
        subtitle:
          "Sua reserva continua pendente na arena. Você pode tentar pagar novamente ou falar com o estabelecimento.",
        badge: null,
      };
    }
    if (isMpSuccess) {
      return {
        icon: CheckCircle2,
        iconClass: "text-green-600 bg-green-50",
        title: "Pagamento recebido",
        subtitle:
          "O Mercado Pago registrou o pagamento. Em alguns segundos o sistema confirma a reserva automaticamente.",
        badge: {
          text: "Pagamento confirmado online",
          className: "bg-green-50 text-green-800 border-green-200",
        },
      };
    }
    return {
      icon: CheckCircle2,
      iconClass: "text-green-600 bg-green-50",
      title: "Agendamento confirmado!",
      subtitle: "Seu agendamento foi registrado com sucesso.",
      badge: null,
    };
  })();

  const Icon = screenConfig.icon;
  const hasBookingDetails =
    isCourtFlow &&
    (companyName || courtName || (formattedDate && appointmentTime) || slotPrice > 0);

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6 sm:py-10 flex items-start sm:items-center justify-center">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="px-5 pt-8 pb-6 text-center">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${screenConfig.iconClass}`}
            >
              <Icon className="h-8 w-8" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{screenConfig.title}</h1>
            <p className="text-sm text-gray-600 leading-relaxed">{screenConfig.subtitle}</p>
            {screenConfig.badge ? (
              <p
                className={`mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${screenConfig.badge.className}`}
              >
                <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {screenConfig.badge.text}
              </p>
            ) : null}
          </div>

          {hasBookingDetails ? (
            <div className="mx-5 mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3 text-sm text-gray-800">
              {companyName ? (
                <div className="flex items-start gap-2.5">
                  <Building2 className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" aria-hidden />
                  <div>
                    <p className="text-xs text-gray-500">Arena</p>
                    <p className="font-medium">{companyName}</p>
                  </div>
                </div>
              ) : null}
              {courtName ? (
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" aria-hidden />
                  <div>
                    <p className="text-xs text-gray-500">Quadra</p>
                    <p className="font-medium">{courtName}</p>
                  </div>
                </div>
              ) : null}
              {formattedDate && appointmentTime ? (
                <div className="flex items-start gap-2.5">
                  <Clock className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" aria-hidden />
                  <div>
                    <p className="text-xs text-gray-500">Data e horário</p>
                    <p className="font-medium">
                      {formattedDate} às {appointmentTime}
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="flex items-start gap-2.5">
                <Wallet className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" aria-hidden />
                <div>
                  <p className="text-xs text-gray-500">Forma de pagamento</p>
                  <p className="font-medium">{paymentLabel}</p>
                  {slotPrice > 0 ? (
                    <p className="text-gray-600 mt-0.5">
                      Valor estimado:{" "}
                      <span className="font-semibold text-gray-900">
                        R$ {slotPrice.toFixed(2).replace(".", ",")}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {isCounterPayment ? (
            <div className="mx-5 mb-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-700 leading-relaxed">
              Apresente-se no horário reservado e realize o pagamento diretamente no balcão da arena.
              Guarde o código abaixo para facilitar o atendimento.
            </div>
          ) : null}

          {appointmentId ? (
            <div className="mx-5 mb-5 text-center">
              <p className="text-xs text-gray-500 mb-1">Código da reserva</p>
              <p className="font-mono text-xs text-gray-700 break-all bg-gray-50 border rounded-lg px-3 py-2">
                {appointmentId}
              </p>
            </div>
          ) : null}

          <div className="px-5 pb-6 space-y-3">
            {canRetryCheckout ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleRetryCheckout}
                disabled={retryLoading}
                className="w-full rounded-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              >
                {retryLoading ? "Abrindo checkout..." : "Tentar pagar novamente"}
              </Button>
            ) : null}
            <Button asChild className="w-full rounded-full">
              <Link to="/">Voltar para a página inicial</Link>
            </Button>
            <p className="text-center text-xs text-gray-500 pt-1">
              Para alterar ou cancelar, entre em contato com o estabelecimento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestAppointmentConfirmationPage;
