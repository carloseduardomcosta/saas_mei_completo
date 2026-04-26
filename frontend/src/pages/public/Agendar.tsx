// Página pública de agendamento — acessada pelo cliente final em /agendar/:slug
// Mobile-first, sem libs de calendário externas.
// Fluxo: Serviço → Data → Horário → Formulário → Sucesso

import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "../../components/ui/Button";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ── Types ──────────────────────────────────────────────────────────────────

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

type Step = 1 | 2 | 3 | 4;

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

function todaySP(): string {
  const [dd, mm, yyyy] = new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function datesInMonth(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= lastDate; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  return cells;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DAY_NAMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ── Component ──────────────────────────────────────────────────────────────

export default function Agendar() {
  const { slug = "" } = useParams<{ slug: string }>();

  const [step, setStep] = useState<Step>(1);
  const [success, setSuccess] = useState(false);

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
  const [pageLoading, setPageLoading] = useState(true);

  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    notes: "",
  });

  // ── Load profile + services ────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/agenda/public/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setProfile(data.profile);
        setServices(data.services);
      })
      .catch(() => setError("Erro ao carregar página de agendamento."))
      .finally(() => setPageLoading(false));
  }, [slug]);

  // ── Load slots when date selected ──────────────────────────────────────
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
    if (selectedDate && step === 2) loadSlots(selectedDate);
  }, [selectedDate, step, loadSlots]);

  // ── Calendar navigation ────────────────────────────────────────────────
  const today = todaySP();
  const maxDate = (() => {
    if (!profile) return today;
    const d = new Date(`${today}T00:00:00-03:00`);
    d.setDate(d.getDate() + profile.booking_advance_days);
    return d.toISOString().slice(0, 10);
  })();

  const isDateDisabled = (date: string) => date < today || date > maxDate;

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  const canGoPrev = new Date(calYear, calMonth, 1) > new Date(
    parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)) - 1, 1
  );

  // ── Submit booking ─────────────────────────────────────────────────────
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
      setSuccess(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / Error states ─────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl p-8 shadow text-center max-w-sm w-full">
          <h1 className="text-lg font-semibold text-gray-800 mb-2">Página não encontrada</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const initials = profile ? getInitials(profile.business_name) : "?";

  // ── Success screen ─────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center">
        <div className="w-full max-w-[480px]">
          <div className="bg-brand p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-white/25 flex items-center justify-center mx-auto text-brand font-bold text-xl">
              {initials}
            </div>
            <h1 className="text-white text-lg font-semibold mt-3">{profile?.business_name}</h1>
            {profile?.description && (
              <p className="text-white/80 text-sm mt-1">{profile.description}</p>
            )}
          </div>

          <div className="bg-white rounded-b-2xl p-4 shadow-sm text-center py-12">
            <div className="w-16 h-16 bg-success-light rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-success" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Agendamento confirmado!</h3>
            <p className="text-sm text-gray-500 mt-2">
              Você receberá um email com os detalhes em <strong>{form.client_email}</strong>.
            </p>

            {/* Resumo */}
            <div className="bg-gray-50 rounded-xl p-4 text-left mt-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Serviço</span>
                <span className="font-medium text-gray-900">{selectedService?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Data</span>
                <span className="font-medium text-gray-900">
                  {selectedDate && new Date(`${selectedDate}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                    weekday: "long", day: "numeric", month: "long",
                  })}
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

            <button
              onClick={() => {
                setSuccess(false);
                setStep(1);
                setSelectedService(null);
                setSelectedDate(null);
                setSelectedSlot(null);
                setSlots([]);
                setForm({ client_name: "", client_email: "", client_phone: "", notes: "" });
                setError(null);
              }}
              className="mt-6 text-sm text-brand hover:underline"
            >
              Fazer outro agendamento
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main booking flow ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-[480px]">

        {/* Header */}
        <div className="bg-brand p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-white/25 flex items-center justify-center mx-auto text-brand font-bold text-xl">
            {initials}
          </div>
          <h1 className="text-white text-lg font-semibold mt-3">{profile?.business_name}</h1>
          {profile?.description && (
            <p className="text-white/80 text-sm mt-1">{profile.description}</p>
          )}

          {/* Progress bar */}
          <div className="flex gap-1 mt-4">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  step >= s ? "bg-white" : "bg-white/30"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="bg-white rounded-b-2xl p-4 shadow-sm">

          {/* ── STEP 1: Escolher serviço ──────────────────────────────── */}
          {step === 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Escolha o serviço</h3>
              {services.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum serviço disponível</p>
              ) : (
                services.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => { setSelectedService(s); setStep(2); }}
                    className={`p-3 rounded-xl border cursor-pointer mb-2 transition-all ${
                      selectedService?.id === s.id
                        ? "border-brand bg-brand-light"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDuration(s.duration_minutes)} · {s.price_cents > 0 ? formatBRL(s.price_cents) : "Gratuito"}
                    </p>
                    {s.description && <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── STEP 2: Escolher data + horário ──────────────────────── */}
          {step === 2 && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-brand mb-4 hover:underline"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Escolha a data</h3>

              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  disabled={!canGoPrev}
                  aria-label="Mês anterior"
                  className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-gray-800">
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <button
                  onClick={nextMonth}
                  aria-label="Próximo mês"
                  className="p-1 rounded-lg hover:bg-gray-100"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="text-center text-[10px] font-medium text-gray-400 pb-1">
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
                      onClick={() => setSelectedDate(date)}
                      className={`aspect-square rounded-lg text-sm font-medium transition-all ${
                        disabled
                          ? "text-gray-300 cursor-not-allowed"
                          : selected
                          ? "bg-brand text-white"
                          : isToday
                          ? "border-2 border-brand text-brand hover:bg-brand-light"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {parseInt(date.slice(8))}
                    </button>
                  );
                })}
              </div>

              {/* Slots */}
              {selectedDate && (
                <>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Escolha o horário</h3>
                  {loadingSlots ? (
                    <div className="grid grid-cols-4 gap-2">
                      {[1,2,3,4,5,6,7,8].map((i) => (
                        <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Nenhum horário disponível neste dia
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.starts_at}
                          onClick={() => { setSelectedSlot(slot); setStep(3); }}
                          className={`border rounded-lg py-2 text-xs font-semibold transition-all ${
                            selectedSlot?.starts_at === slot.starts_at
                              ? "bg-brand text-white border-brand"
                              : "bg-white border-gray-100 text-gray-700 hover:border-brand hover:bg-brand-light"
                          }`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 3: Dados de contato ──────────────────────────────── */}
          {step === 3 && (
            <div>
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-sm text-brand mb-4 hover:underline"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Seus dados</h3>

              {/* Booking summary */}
              <div className="bg-brand-light border border-brand/10 rounded-xl p-3 mb-4">
                <p className="text-sm font-medium text-gray-900">{selectedService?.name}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {selectedDate && new Date(`${selectedDate}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                    weekday: "long", day: "numeric", month: "long",
                  })} às {selectedSlot?.label}
                </p>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); setStep(4); }} className="space-y-3">
                <div>
                  <label htmlFor="pub-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome completo *
                  </label>
                  <input
                    id="pub-name"
                    type="text"
                    required
                    value={form.client_name}
                    onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="João da Silva"
                  />
                </div>
                <div>
                  <label htmlFor="pub-phone" className="block text-sm font-medium text-gray-700 mb-1">
                    WhatsApp *
                  </label>
                  <input
                    id="pub-phone"
                    type="tel"
                    required
                    value={form.client_phone}
                    onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label htmlFor="pub-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    id="pub-email"
                    type="email"
                    value={form.client_email}
                    onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="voce@email.com"
                  />
                </div>
                <Button type="submit" variant="primary" size="lg">
                  Continuar
                </Button>
              </form>
            </div>
          )}

          {/* ── STEP 4: Confirmação ───────────────────────────────────── */}
          {step === 4 && (
            <div>
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-1 text-sm text-brand mb-4 hover:underline"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Confirme seu agendamento</h3>

              {/* Summary card */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Serviço</span>
                  <span className="font-medium text-gray-900">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Data</span>
                  <span className="font-medium text-gray-900">
                    {selectedDate && new Date(`${selectedDate}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
                      weekday: "short", day: "numeric", month: "long",
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Horário</span>
                  <span className="font-medium text-gray-900">{selectedSlot?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Nome</span>
                  <span className="font-medium text-gray-900">{form.client_name}</span>
                </div>
                {selectedService && selectedService.price_cents > 0 && (
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                    <span className="text-gray-500">Valor</span>
                    <span className="font-bold text-gray-900">{formatBRL(selectedService.price_cents)}</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-danger-light border border-danger/20 rounded-lg p-3 mb-3">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                disabled={submitting}
                onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
              >
                {submitting ? "Confirmando..." : "Confirmar agendamento"}
              </Button>
            </div>
          )}

        </div>

        <p className="text-center text-xs text-gray-400 mt-4 mb-6">
          Agendamento por <span className="font-semibold text-gray-500">MEI Completo</span>
        </p>
      </div>
    </div>
  );
}
