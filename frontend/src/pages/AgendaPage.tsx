// Painel da Agenda — área logada do MEI
// Tabs: Hoje | Serviços | Horários | Config

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarX, CheckCircle, XCircle, DollarSign } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Sidebar } from "../components/ui/Sidebar";
import { Topbar } from "../components/ui/Topbar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import toast, { Toaster } from "react-hot-toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// ── Types ──────────────────────────────────────────────────────────────────

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

const STATUS_BADGE: Record<string, "amber" | "green" | "gray"> = {
  confirmed: "amber",
  completed: "green",
  cancelled: "gray",
};

const DAY_NAMES_FULL = [
  "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb",
];

const DAY_NAMES_LONG = [
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
  const [date] = useState(todaySP());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const dateLabel = new Date(`${date}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

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

  async function updateStatus(id: string, status: "confirmed" | "cancelled" | "completed") {
    setActionLoading(id);
    try {
      await fetch(`${API_BASE}/api/agenda/bookings/${id}/status`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ status }),
      });
      await load();
      toast.success(`Status atualizado para "${STATUS_LABEL[status]}"`);
    } catch {
      toast.error("Erro ao atualizar status");
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
      if (!r.ok) { toast.error(d.error ?? "Erro"); return; }
      toast.success(d.message ?? "Lançado no financeiro!");
      await load();
    } catch {
      toast.error("Erro ao lançar no financeiro");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-700 capitalize">{dateLabel}</p>
        <Button variant="ghost" size="sm">Bloquear horário</Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-12">
          <CalendarX size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">Nenhum agendamento hoje</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => (
            <div
              key={b.id}
              className={`flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 mb-2 ${
                b.status === "cancelled" ? "opacity-60" : ""
              }`}
            >
              <span className="text-sm font-bold text-gray-700 w-12 flex-shrink-0">
                {formatTimeSP(b.starts_at)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{b.client_name}</p>
                <p className="text-xs text-gray-500">{b.service_name} · {b.duration_minutes}min</p>
                {b.price_cents > 0 && (
                  <p className="text-xs text-gray-600 font-medium">{formatBRL(b.price_cents)}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={STATUS_BADGE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                {b.status === "confirmed" && (
                  <div className="flex gap-1 mt-1">
                    <button
                      disabled={actionLoading === b.id}
                      onClick={() => updateStatus(b.id, "completed")}
                      aria-label="Concluir agendamento"
                      className="p-1 rounded-lg bg-success-light hover:bg-success/20 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={14} className="text-success" />
                    </button>
                    <button
                      disabled={actionLoading === b.id}
                      onClick={() => updateStatus(b.id, "cancelled")}
                      aria-label="Cancelar agendamento"
                      className="p-1 rounded-lg bg-danger-light hover:bg-danger/20 transition-colors disabled:opacity-50"
                    >
                      <XCircle size={14} className="text-danger" />
                    </button>
                  </div>
                )}
                {b.status === "completed" && !b.financial_launch_id && b.price_cents > 0 && (
                  <button
                    disabled={actionLoading === b.id}
                    onClick={() => launchFinancial(b)}
                    aria-label="Lançar no financeiro"
                    className="p-1 rounded-lg bg-brand-light hover:bg-brand/20 transition-colors disabled:opacity-50"
                  >
                    <DollarSign size={14} className="text-brand" />
                  </button>
                )}
                {b.status === "completed" && b.financial_launch_id && (
                  <span className="text-[10px] text-success font-medium">Lançado</span>
                )}
              </div>
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
      toast.success(isNew ? "Serviço criado!" : "Serviço atualizado!");
    } catch {
      toast.error("Erro ao salvar serviço");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Desativar este serviço?")) return;
    try {
      await fetch(`${API_BASE}/api/agenda/services/${id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      reload();
      toast.success("Serviço removido");
    } catch {
      toast.error("Erro ao remover serviço");
    }
  }

  if (loading) return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">
          Serviços ({data?.filter((s) => s.active).length ?? 0} ativos)
        </h3>
        <Button variant="primary" size="sm" onClick={() => setEditing(EMPTY_SERVICE)}>
          + Novo serviço
        </Button>
      </div>

      {/* Modal de edição */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {editing.id ? "Editar serviço" : "Novo serviço"}
            </h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="svc-name" className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  id="svc-name"
                  type="text"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing((d) => ({ ...d, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Ex: Corte feminino"
                />
              </div>
              <div>
                <label htmlFor="svc-desc" className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  id="svc-desc"
                  rows={2}
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing((d) => ({ ...d, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="svc-dur" className="block text-sm font-medium text-gray-700 mb-1">Duração (min) *</label>
                  <input
                    id="svc-dur"
                    type="number"
                    min={5} max={480} step={5}
                    value={editing.duration_minutes ?? 60}
                    onChange={(e) => setEditing((d) => ({ ...d, duration_minutes: +e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label htmlFor="svc-price" className="block text-sm font-medium text-gray-700 mb-1">Preço (R$)</label>
                  <input
                    id="svc-price"
                    type="number"
                    min={0} step={0.01}
                    value={((editing.price_cents ?? 0) / 100).toFixed(2)}
                    onChange={(e) => setEditing((d) => ({ ...d, price_cents: Math.round(+e.target.value * 100) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-danger mt-3 bg-danger-light px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-3 mt-5">
              <Button variant="ghost" size="md" className="flex-1" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button variant="primary" size="md" className="flex-1" onClick={save} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de serviços */}
      <div className="space-y-2">
        {data?.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum serviço cadastrado ainda</p>
        )}
        {data?.map((s) => (
          <div
            key={s.id}
            className={`border rounded-xl p-3 flex items-center justify-between gap-3 ${
              !s.active ? "opacity-40 bg-gray-50 border-gray-100" : "bg-white border-gray-100"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
              <p className="text-xs text-gray-500">
                {s.duration_minutes}min
                {s.price_cents > 0 ? ` · ${formatBRL(s.price_cents)}` : " · Gratuito"}
              </p>
            </div>
            {s.active && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditing(s)}
                  className="text-xs text-brand hover:underline px-2 py-1"
                >
                  Editar
                </button>
                <button
                  onClick={() => deactivate(s.id)}
                  className="text-xs text-danger hover:underline px-2 py-1"
                >
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

  useEffect(() => {
    fetch(`${API_BASE}/api/agenda/availability`, { headers: authHeader() })
      .then((r) => r.json())
      .then((data: AvailRow[]) => {
        setAvail(data);
        setLoading(false);
      });
  }, []);

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
    try {
      await fetch(`${API_BASE}/api/agenda/availability`, {
        method: "PUT",
        headers: authHeader(),
        body: JSON.stringify(avail),
      });
      toast.success("Disponibilidade salva!");
    } catch {
      toast.error("Erro ao salvar disponibilidade");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="space-y-2">
      {[1,2,3,4,5].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">
        Configure os dias e horários em que você atende.
      </p>
      <div className="space-y-1 mb-5">
        {matrix.map((row) => (
          <div key={row.day_of_week} className="flex items-center gap-3 py-2 border-b border-gray-50">
            <span className="text-sm text-gray-700 w-8 flex-shrink-0">
              {DAY_NAMES_FULL[row.day_of_week]}
            </span>
            <input
              type="checkbox"
              checked={row.active}
              onChange={() => toggle(row.day_of_week)}
              aria-label={`Ativar ${DAY_NAMES_LONG[row.day_of_week]}`}
              className="accent-brand"
            />
            {row.active && (
              <>
                <input
                  type="time"
                  value={row.start_time}
                  onChange={(e) => update(row.day_of_week, "start_time", e.target.value)}
                  aria-label={`Horário de início — ${DAY_NAMES_LONG[row.day_of_week]}`}
                  className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <span className="text-gray-400 text-xs">às</span>
                <input
                  type="time"
                  value={row.end_time}
                  onChange={(e) => update(row.day_of_week, "end_time", e.target.value)}
                  aria-label={`Horário de fim — ${DAY_NAMES_LONG[row.day_of_week]}`}
                  className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </>
            )}
          </div>
        ))}
      </div>
      <Button variant="primary" size="lg" onClick={save} disabled={saving}>
        {saving ? "Salvando..." : "Salvar disponibilidade"}
      </Button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Configurações
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
    try {
      const r = await fetch(`${API_BASE}/api/agenda/profile`, {
        method: "PUT",
        headers: authHeader(),
        body: JSON.stringify(profile),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Erro ao salvar"); return; }
      toast.success("Configurações salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  }

  function copiarLink() {
    const appUrl = import.meta.env.VITE_APP_URL ?? window.location.origin;
    const url = `${appUrl}/agendar/${profile.slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado!"));
  }

  if (!loaded) return (
    <div className="space-y-2">
      {[1,2,3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-4">
      {/* Link preview */}
      {profile.slug && (
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-gray-600 truncate">
            {(import.meta.env.VITE_APP_URL ?? window.location.origin)}/agendar/{profile.slug}
          </span>
          <Button size="sm" variant="ghost" type="button" onClick={copiarLink}>
            Copiar
          </Button>
        </div>
      )}

      <div>
        <label htmlFor="cfg-slug" className="block text-sm font-medium text-gray-700 mb-1">
          Link personalizado *
        </label>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand">
          <span className="bg-gray-50 px-3 py-2.5 text-sm text-gray-400 border-r border-gray-200 shrink-0">
            /agendar/
          </span>
          <input
            id="cfg-slug"
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
        <label htmlFor="cfg-name" className="block text-sm font-medium text-gray-700 mb-1">
          Nome do negócio *
        </label>
        <input
          id="cfg-name"
          type="text"
          required
          value={profile.business_name}
          onChange={(e) => setProfile((p) => ({ ...p, business_name: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          placeholder="Studio da Ana"
        />
      </div>

      <div>
        <label htmlFor="cfg-desc" className="block text-sm font-medium text-gray-700 mb-1">
          Descrição
        </label>
        <textarea
          id="cfg-desc"
          rows={3}
          value={profile.description ?? ""}
          onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          placeholder="Especialista em cabelos, atendimento no centro..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cfg-adv" className="block text-sm font-medium text-gray-700 mb-1">
            Agend. até (dias)
          </label>
          <input
            id="cfg-adv"
            type="number"
            min={1} max={90}
            value={profile.booking_advance_days}
            onChange={(e) => setProfile((p) => ({ ...p, booking_advance_days: +e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="cfg-min" className="block text-sm font-medium text-gray-700 mb-1">
            Antecedência (h)
          </label>
          <input
            id="cfg-min"
            type="number"
            min={0} max={72}
            value={profile.min_advance_hours}
            onChange={(e) => setProfile((p) => ({ ...p, min_advance_hours: +e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <Button type="submit" variant="primary" size="lg" disabled={saving}>
        {saving ? "Salvando..." : "Salvar configurações"}
      </Button>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════

export default function AgendaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("today");

  const tabs: { id: Tab; label: string }[] = [
    { id: "today",        label: "Agenda do Dia" },
    { id: "services",     label: "Serviços" },
    { id: "availability", label: "Horários" },
    { id: "config",       label: "Config" },
  ];

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar
          activeRoute="/agenda"
          onNavigate={navigate}
          userName={user?.name || user?.email || ""}
        />

        <main className="flex-1 md:ml-[52px] pb-16 md:pb-0">
          <div className="p-4 max-w-2xl mx-auto">
            <Topbar userName={user?.name || user?.email || ""} />

            {/* Tab bar */}
            <div className="flex border-b border-gray-200 mt-4 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                    tab === t.id
                      ? "border-b-2 border-brand text-brand font-medium"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="mt-4">
              {tab === "today"        && <TodayTab />}
              {tab === "services"     && <ServicesTab />}
              {tab === "availability" && <AvailabilityTab />}
              {tab === "config"       && <ConfigTab />}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
