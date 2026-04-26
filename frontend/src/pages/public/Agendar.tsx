// Página pública de agendamento — acessada pelo cliente final em /agendar/:slug
// Mobile-first, sem libs de calendário externas.
// Fluxo: Serviço → Data → Horário → Formulário → Sucesso

import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
}

interface Profile {
  slug: string;
  business_name: string;
  description: string | null;
  booking_advance_days: number;
  min_advance_hours: number;
}

interface TimeSlot {
  starts_at: string;
  label: string;
}

type Step = "service" | "date" | "time" | "form" | "success";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}min`;
}

// Retorna "YYYY-MM-DD" para hoje em SP
function todaySP(): string {
  const [dd, mm, yyyy] = new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .split("/");
  return `${yyyy}-${mm}-${dd}`;
}

// Retorna array de datas (YYYY-MM-DD) para o mês exibido
function datesInMonth(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=dom
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  return cells;
}

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ── Componente principal ───────────────────────────────────────────────────

export default function Agendar() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [step, setStep] = useState<Step>("service");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    notes: "",
  });

  // ── Carregar perfil + serviços ─────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/agenda/public/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setProfile(data.profile);
        setServices(data.services);
      })
      .catch(() => setError("Erro ao carregar página de agendamento."));
  }, [slug]);

  // ── Carregar slots ao selecionar data ──────────────────────────────────
  const loadSlots = useCallback(
    async (date: string) => {
      if (!selectedService) return;
      setLoadingSlots(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const r = await fetch(
          `${API_BASE}/api/agenda/public/${slug}/slots?service_id=${selectedService.id}&date=${date}`
        );
        const data = await r.json();
        setSlots(data.slots ?? []);
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [slug, selectedService]
  );

  useEffect(() => {
    if (selectedDate && step === "time") loadSlots(selectedDate);
  }, [selectedDate, step, loadSlots]);

  // ── Limites de navegação do calendário ────────────────────────────────
  const today = todaySP();
  const maxDate = (() => {
    if (!profile) return today;
    const d = new Date(`${today}T00:00:00-03:00`);
    d.setDate(d.getDate() + profile.booking_advance_days);
    return d.toISOString().slice(0, 10);
  })();

  const isDateDisabled = (date: string) => date < today || date > maxDate;

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  // Bloqueia navegação para meses totalmente no passado
  const canGoPrev = new Date(calYear, calMonth, 1) > new Date(
    parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)) - 1, 1
  );

  // ── Envio do agendamento ───────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !selectedService) return;
    setSubmitting(true);
    setError(null);

    try {
      const r = await fetch(`${API_BASE}/api/agenda/public/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: selectedService.id,
          starts_at: selectedSlot.starts_at,
          client_name: form.client_name.trim(),
          client_email: form.client_email.trim(),
          client_phone: form.client_phone.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        setError(data.error ?? "Erro ao criar agendamento.");
        return;
      }

      setBookingId(data.booking.id);
      setStep("success");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (error && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl p-8 shadow text-center max-w-sm w-full">
          <p className="text-4xl mb-3">😕</p>
          <h1 className="text-lg font-semibold text-gray-800 mb-2">Página não encontrada</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Cabeçalho */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{profile.business_name}</h1>
          {profile.description && (
            <p className="mt-1 text-sm text-gray-500">{profile.description}</p>
          )}
        </div>

        {/* Indicador de progresso */}
        {step !== "success" && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {(["service","date","time","form"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
                  ${step === s ? "bg-blue-600 text-white" :
                    ["service","date","time","form"].indexOf(step) > i
                      ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {i + 1}
                </div>
                {i < 3 && <div className="w-6 h-px bg-gray-300" />}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* ── STEP 1: Escolher serviço ──────────────────────────────── */}
          {step === "service" && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Escolha o serviço</h2>
              {services.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Nenhum serviço disponível no momento.
                </p>
              ) : (
                <div className="space-y-3">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedService(s); setStep("date"); }}
                      className="w-full text-left border border-gray-200 rounded-xl p-4
                                 hover:border-blue-500 hover:bg-blue-50 transition-all group">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 group-hover:text-blue-700">
                            {s.name}
                          </p>
                          {s.description && (
                            <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            ⏱ {formatDuration(s.duration_minutes)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {s.price_cents > 0 ? (
                            <span className="text-base font-bold text-gray-900">
                              {formatBRL(s.price_cents)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Gratuito</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Escolher data ─────────────────────────────────── */}
          {step === "date" && (
            <div className="p-6">
              <button
                onClick={() => setStep("service")}
                className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">
                ← Voltar
              </button>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Escolha a data</h2>
              <p className="text-sm text-gray-500 mb-5">
                Serviço: <strong>{selectedService?.name}</strong>
              </p>

              {/* Navegação do mês */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  disabled={!canGoPrev}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  ←
                </button>
                <span className="font-semibold text-gray-800">
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg hover:bg-gray-100">
                  →
                </button>
              </div>

              {/* Grade de dias */}
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 pb-2">
                    {d}
                  </div>
                ))}
                {datesInMonth(calYear, calMonth).map((date, i) => {
                  if (!date) return <div key={`null-${i}`} />;
                  const disabled = isDateDisabled(date);
                  const selected = date === selectedDate;
                  const isToday = date === today;
                  return (
                    <button
                      key={date}
                      disabled={disabled}
                      onClick={() => {
                        setSelectedDate(date);
                        setStep("time");
                      }}
                      className={`aspect-square rounded-lg text-sm font-medium transition-all
                        ${disabled
                          ? "text-gray-300 cursor-not-allowed"
                          : selected
                          ? "bg-blue-600 text-white"
                          : isToday
                          ? "border-2 border-blue-400 text-blue-700 hover:bg-blue-50"
                          : "text-gray-700 hover:bg-gray-100"
                        }`}>
                      {parseInt(date.slice(8))}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 3: Escolher horário ──────────────────────────────── */}
          {step === "time" && (
            <div className="p-6">
              <button
                onClick={() => setStep("date")}
                className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">
                ← Voltar
              </button>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Escolha o horário</h2>
              <p className="text-sm text-gray-500 mb-5">
                {selectedDate && new Date(`${selectedDate}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </p>

              {loadingSlots ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : slots.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-3xl mb-2">📅</p>
                  <p className="text-sm text-gray-500">
                    Nenhum horário disponível neste dia.
                  </p>
                  <button
                    onClick={() => setStep("date")}
                    className="mt-4 text-sm text-blue-600 hover:underline">
                    Escolher outra data
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.starts_at}
                      onClick={() => { setSelectedSlot(slot); setStep("form"); }}
                      className="border border-gray-200 rounded-xl py-3 text-sm font-semibold
                                 text-gray-700 hover:border-blue-500 hover:bg-blue-50
                                 hover:text-blue-700 transition-all">
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Formulário ────────────────────────────────────── */}
          {step === "form" && (
            <div className="p-6">
              <button
                onClick={() => setStep("time")}
                className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1">
                ← Voltar
              </button>
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Seus dados</h2>

              {/* Resumo do agendamento */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-blue-900">{selectedService?.name}</p>
                <p className="text-sm text-blue-700 mt-0.5">
                  {selectedDate && new Date(`${selectedDate}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                    weekday: "long", day: "numeric", month: "long",
                  })} às {selectedSlot?.label}
                </p>
                <p className="text-xs text-blue-500 mt-0.5">
                  ⏱ {selectedService && formatDuration(selectedService.duration_minutes)}
                  {selectedService && selectedService.price_cents > 0 &&
                    ` · ${formatBRL(selectedService.price_cents)}`}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.client_name}
                    onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="João da Silva"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mail <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={form.client_email}
                    onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="joao@email.com"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Você receberá a confirmação neste e-mail
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    WhatsApp <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="tel"
                    value={form.client_phone}
                    onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="(47) 99999-0000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observações <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               resize-none"
                    placeholder="Alguma informação adicional..."
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                             text-white font-semibold py-3 rounded-xl transition-colors
                             flex items-center justify-center gap-2">
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Confirmando...
                    </>
                  ) : (
                    "Confirmar agendamento"
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── STEP 5: Sucesso ───────────────────────────────────────── */}
          {step === "success" && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center
                              mx-auto mb-4 text-3xl">
                ✅
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Agendamento confirmado!
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Enviamos uma confirmação para <strong>{form.client_email}</strong>.
              </p>

              <div className="bg-gray-50 rounded-xl p-4 text-left mb-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Serviço</span>
                    <span className="font-medium text-gray-900">{selectedService?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Data</span>
                    <span className="font-medium text-gray-900">
                      {selectedDate && new Date(`${selectedDate}T12:00:00-03:00`)
                        .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Horário</span>
                    <span className="font-medium text-gray-900">{selectedSlot?.label}</span>
                  </div>
                  {bookingId && (
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                      <span className="text-gray-500">Código</span>
                      <span className="font-mono text-xs text-gray-600 bg-gray-200 px-2 py-0.5 rounded">
                        {bookingId.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  setStep("service");
                  setSelectedService(null);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                  setSlots([]);
                  setForm({ client_name: "", client_email: "", client_phone: "", notes: "" });
                  setError(null);
                }}
                className="text-sm text-blue-600 hover:underline">
                Fazer outro agendamento
              </button>
            </div>
          )}

        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Agendamento por{" "}
          <span className="font-semibold text-gray-500">MEI Completo</span>
        </p>
      </div>
    </div>
  );
}
