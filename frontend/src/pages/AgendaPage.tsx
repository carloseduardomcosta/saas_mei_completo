// Painel da Agenda — área logada do MEI
// Tabs: Hoje | Serviços | Disponibilidade | Configurações

import { useEffect, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled" | "completed";
  client_name: string;
  client_email: string;
  client_phone: string | null;
  notes: string | null;
  service_name: string;
  duration_minutes: number;
  price_cents: number;
  financial_launch_id: string | null;
}

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
  display_order: number;
}

interface AvailRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface Profile {
  slug: string;
  business_name: string;
  description: string | null;
  booking_advance_days: number;
  min_advance_hours: number;
}

type Tab = "today" | "services" | "availability" | "config";

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const DAY_NAMES_FULL = [
  "Domingo","Segunda-feira","Terça-feira","Quarta-feira",
  "Quinta-feira","Sexta-feira","Sábado",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function todaySP(): string {
  const [dd, mm, yyyy] = new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Hook de fetch genérico ─────────────────────────────────────────────────

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(url, { headers: authHeader() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Agenda do Dia
// ══════════════════════════════════════════════════════════════════════════════

function TodayTab() {
  const [date, setDate] = useState(todaySP());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/agenda/bookings/day?date=${date}`, {
        headers: authHeader(),
      });
      setBookings(await r.json());
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(
    id: string,
    status: "confirmed" | "cancelled" | "completed"
  ) {
    setActionLoading(id);
    try {
      await fetch(`${API_BASE}/api/agenda/bookings/${id}/status`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ status }),
      });
      await load();
      showToast(`Status atualizado para "${STATUS_LABEL[status]}"`);
    } finally {
      setActionLoading(null);
    }
  }

  async function launchFinancial(booking: Booking) {
    setActionLoading(booking.id);
    try {
      const r = await fetch(
        `${API_BASE}/api/agenda/bookings/${booking.id}/launch-financial`,
        { method: "POST", headers: authHeader() }
      );
      const d = await r.json();
      if (!r.ok) { showToast(d.error); return; }
      showToast(d.message ?? "Lançado no financeiro!");
      await load();
    } finally {
      setActionLoading(null);
    }
  }

  const dateLabel = new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div>
      {/* Seletor de data */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-500 capitalize">{dateLabel}</span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm
                        px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-2">📅</p>
          <p className="text-sm">Nenhum agendamento neste dia</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b.id}
              className={`border rounded-xl p-4 ${
                b.status === "cancelled" ? "opacity-60 bg-gray-50" : "bg-white"
              }`}>
              {/* Linha 1: horário + status */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">
                    {formatTimeSP(b.starts_at)}
                  </span>
                  <span className="text-sm text-gray-400">→ {formatTimeSP(b.ends_at)}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[b.status]}`}>
                  {STATUS_LABEL[b.status]}
                </span>
              </div>

              {/* Linha 2: cliente + serviço */}
              <p className="font-semibold text-gray-900">{b.client_name}</p>
              <p className="text-sm text-gray-500">{b.service_name} · {b.duration_minutes}min</p>
              {b.client_phone && (
                <p className="text-sm text-gray-400 mt-0.5">📱 {b.client_phone}</p>
              )}
              {b.notes && (
                <p className="text-sm text-gray-500 mt-1 italic">"{b.notes}"</p>
              )}

              {/* Preço */}
              {b.price_cents > 0 && (
                <p className="text-sm font-semibold text-gray-700 mt-2">
                  {formatBRL(b.price_cents)}
                </p>
              )}

              {/* Ações */}
              {b.status !== "cancelled" && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                  {b.status === "confirmed" && (
                    <>
                      <button
                        disabled={actionLoading === b.id}
                        onClick={() => updateStatus(b.id, "completed")}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white
                                   px-3 py-1.5 rounded-lg font-medium transition-colors
                                   disabled:opacity-50">
                        ✓ Concluir
                      </button>
                      <button
                        disabled={actionLoading === b.id}
                        onClick={() => updateStatus(b.id, "cancelled")}
                        className="text-xs bg-red-50 hover:bg-red-100 text-red-600
                                   px-3 py-1.5 rounded-lg font-medium transition-colors
                                   disabled:opacity-50">
                        Cancelar
                      </button>
                    </>
                  )}
                  {b.status === "completed" && !b.financial_launch_id && b.price_cents > 0 && (
                    <button
                      disabled={actionLoading === b.id}
                      onClick={() => launchFinancial(b)}
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700
                                 px-3 py-1.5 rounded-lg font-medium transition-colors
                                 disabled:opacity-50">
                      💰 Lançar no financeiro
                    </button>
                  )}
                  {b.status === "completed" && b.financial_launch_id && (
                    <span className="text-xs text-green-600 font-medium">
                      ✓ Lançado no financeiro
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Serviços
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_SERVICE = {
  name: "", description: "", duration_minutes: 60, price_cents: 0, display_order: 0,
};

function ServicesTab() {
  const { data, loading, reload } = useFetch<Service[]>(`${API_BASE}/api/agenda/services`);
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const isNew = !editing?.id;
      const url = isNew
        ? `${API_BASE}/api/agenda/services`
        : `${API_BASE}/api/agenda/services/${editing!.id}`;
      const r = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: authHeader(),
        body: JSON.stringify({
          name: editing!.name,
          description: editing!.description || undefined,
          duration_minutes: Number(editing!.duration_minutes),
          price_cents: Number(editing!.price_cents),
          display_order: Number(editing!.display_order ?? 0),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Erro"); return; }
      setEditing(null);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Desativar este serviço? Ele não aparecerá mais na página de agendamento.")) return;
    await fetch(`${API_BASE}/api/agenda/services/${id}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    reload();
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-900">Serviços ({data?.filter(s => s.active).length ?? 0} ativos)</h3>
        <button
          onClick={() => setEditing(EMPTY_SERVICE)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors">
          + Novo serviço
        </button>
      </div>

      {/* Modal de edição */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editing.id ? "Editar serviço" : "Novo serviço"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing((d) => ({ ...d, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Corte feminino"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing((d) => ({ ...d, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duração (min) *</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={editing.duration_minutes ?? 60}
                    onChange={(e) => setEditing((d) => ({ ...d, duration_minutes: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={((editing.price_cents ?? 0) / 100).toFixed(2)}
                    onChange={(e) =>
                      setEditing((d) => ({ ...d, price_cents: Math.round(+e.target.value * 100) }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 mt-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg
                           text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg
                           text-sm font-medium disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de serviços */}
      <div className="space-y-2">
        {data?.map((s) => (
          <div
            key={s.id}
            className={`border rounded-xl p-4 flex items-center justify-between gap-3
              ${!s.active ? "opacity-40 bg-gray-50" : "bg-white"}`}>
            <div>
              <p className="font-medium text-gray-900">{s.name}</p>
              <p className="text-sm text-gray-500">
                {s.duration_minutes}min
                {s.price_cents > 0 ? ` · ${formatBRL(s.price_cents)}` : " · Gratuito"}
              </p>
              {s.description && <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>}
            </div>
            {s.active && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditing(s)}
                  className="text-xs text-blue-600 hover:underline px-2 py-1">
                  Editar
                </button>
                <button
                  onClick={() => deactivate(s.id)}
                  className="text-xs text-red-500 hover:underline px-2 py-1">
                  Remover
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Disponibilidade Semanal
// ══════════════════════════════════════════════════════════════════════════════

function AvailabilityTab() {
  const [avail, setAvail] = useState<AvailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/agenda/availability`, { headers: authHeader() })
      .then((r) => r.json())
      .then((data: AvailRow[]) => {
        setAvail(data);
        setLoading(false);
      });
  }, []);

  // Matriz de trabalho: indexed por day_of_week
  const matrix = Array.from({ length: 7 }, (_, i) => {
    const row = avail.find((a) => a.day_of_week === i);
    return { day_of_week: i, active: !!row, start_time: row?.start_time ?? "09:00", end_time: row?.end_time ?? "18:00" };
  });

  function toggle(dow: number) {
    if (matrix[dow].active) {
      setAvail((a) => a.filter((r) => r.day_of_week !== dow));
    } else {
      setAvail((a) => [...a, { day_of_week: dow, start_time: "09:00", end_time: "18:00" }]);
    }
  }

  function update(dow: number, field: "start_time" | "end_time", val: string) {
    setAvail((a) =>
      a.map((r) => (r.day_of_week === dow ? { ...r, [field]: val } : r))
    );
  }

  async function save() {
    setSaving(true);
    await fetch(`${API_BASE}/api/agenda/availability`, {
      method: "PUT",
      headers: authHeader(),
      body: JSON.stringify(avail),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Carregando...</div>;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-5">
        Configure os dias e horários em que você atende.
        Dias sem ativação não aparecerão para agendamento.
      </p>

      <div className="space-y-2 mb-6">
        {matrix.map((row) => (
          <div
            key={row.day_of_week}
            className={`border rounded-xl p-3 transition-all ${
              row.active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100"
            }`}>
            <div className="flex items-center gap-3">
              {/* Toggle */}
              <button
                onClick={() => toggle(row.day_of_week)}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                  row.active ? "bg-blue-600" : "bg-gray-300"
                }`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                  transition-transform ${row.active ? "translate-x-5" : ""}`} />
              </button>

              <span className={`text-sm font-medium w-32 shrink-0 ${
                row.active ? "text-gray-900" : "text-gray-400"
              }`}>
                {DAY_NAMES_FULL[row.day_of_week]}
              </span>

              {row.active && (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={row.start_time}
                    onChange={(e) => update(row.day_of_week, "start_time", e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-400 text-sm">até</span>
                  <input
                    type="time"
                    value={row.end_time}
                    onChange={(e) => update(row.day_of_week, "end_time", e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors
          ${saved
            ? "bg-green-600 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          }`}>
        {saving ? "Salvando..." : saved ? "✓ Disponibilidade salva!" : "Salvar disponibilidade"}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Configurações (perfil da página pública)
// ══════════════════════════════════════════════════════════════════════════════

function ConfigTab() {
  const [profile, setProfile] = useState<Profile>({
    slug: "",
    business_name: "",
    description: "",
    booking_advance_days: 30,
    min_advance_hours: 1,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/agenda/profile`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d) => {
        if (d) setProfile(d);
        setLoaded(true);
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/agenda/profile`, {
        method: "PUT",
        headers: authHeader(),
        body: JSON.stringify(profile),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Erro"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="py-12 text-center text-gray-400">Carregando...</div>;

  const appUrl = import.meta.env.VITE_APP_URL ?? window.location.origin;
  const publicUrl = profile.slug ? `${appUrl}/agendar/${profile.slug}` : null;

  return (
    <form onSubmit={save} className="space-y-4">
      {publicUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium mb-1">Seu link de agendamento</p>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-700 font-semibold hover:underline break-all">
            {publicUrl}
          </a>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Link personalizado *
          <span className="text-xs text-gray-400 font-normal ml-1">(meuapp.com/agendar/LINK)</span>
        </label>
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden
                        focus-within:ring-2 focus-within:ring-blue-500">
          <span className="bg-gray-50 px-3 py-2.5 text-sm text-gray-400 border-r border-gray-300 shrink-0">
            /agendar/
          </span>
          <input
            type="text"
            required
            value={profile.slug}
            onChange={(e) =>
              setProfile((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))
            }
            className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
            placeholder="nome-do-negocio"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do negócio *</label>
        <input
          type="text"
          required
          value={profile.business_name}
          onChange={(e) => setProfile((p) => ({ ...p, business_name: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Studio da Ana"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
        <textarea
          rows={3}
          value={profile.description ?? ""}
          onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Especialista em cabelos, atendimento no centro de Timbó/SC"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Agendamento até
            <span className="text-xs text-gray-400 font-normal ml-1">(dias)</span>
          </label>
          <input
            type="number"
            min={1}
            max={90}
            value={profile.booking_advance_days}
            onChange={(e) => setProfile((p) => ({ ...p, booking_advance_days: +e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Antecedência mínima
            <span className="text-xs text-gray-400 font-normal ml-1">(horas)</span>
          </label>
          <input
            type="number"
            min={0}
            max={72}
            value={profile.min_advance_hours}
            onChange={(e) => setProfile((p) => ({ ...p, min_advance_hours: +e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors
          ${saved
            ? "bg-green-600 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          }`}>
        {saving ? "Salvando..." : saved ? "✓ Configurações salvas!" : "Salvar configurações"}
      </button>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════

export default function AgendaPage() {
  const [tab, setTab] = useState<Tab>("today");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "today", label: "Agenda", icon: "📅" },
    { id: "services", label: "Serviços", icon: "✂️" },
    { id: "availability", label: "Horários", icon: "🕐" },
    { id: "config", label: "Config", icon: "⚙️" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2
                        rounded-lg text-sm font-medium transition-all
              ${tab === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
              }`}>
            <span className="text-base">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div>
        {tab === "today" && <TodayTab />}
        {tab === "services" && <ServicesTab />}
        {tab === "availability" && <AvailabilityTab />}
        {tab === "config" && <ConfigTab />}
      </div>
    </div>
  );
}
