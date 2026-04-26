import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

const CATEGORIAS_RECEITA = [
  { value: "venda_produto",      label: "Venda de produto" },
  { value: "prestacao_servico",  label: "Prestação de serviço" },
  { value: "outros_receita",     label: "Outras receitas" },
] as const;

const CATEGORIAS_DESPESA = [
  { value: "aluguel",        label: "Aluguel" },
  { value: "material",       label: "Material" },
  { value: "transporte",     label: "Transporte" },
  { value: "alimentacao",    label: "Alimentação" },
  { value: "marketing",      label: "Marketing" },
  { value: "das",            label: "DAS" },
  { value: "outros_despesa", label: "Outras despesas" },
] as const;

interface LancamentoEditavel {
  id?: string;
  data?: string;
  tipo?: "receita" | "despesa";
  categoria?: string;
  descricao?: string | null;
  valor_cents?: number;
  status?: "confirmado" | "pendente";
}

export interface NovoLancamentoModalProps {
  lancamento?: LancamentoEditavel | null;
  defaultMes?: number;
  defaultAno?: number;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

/** Formata centavos como string "0,00" para exibição no input. */
function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Converte string de input para centavos. Retorna null se inválido. */
function strToCents(raw: string): number | null {
  const num = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num * 100);
}

export function NovoLancamentoModal({
  lancamento,
  onClose,
  onSaved,
}: NovoLancamentoModalProps) {
  const isEdit = Boolean(lancamento?.id);

  const [tipo, setTipo] = useState<"receita" | "despesa">(lancamento?.tipo ?? "receita");
  const [categoria, setCategoria] = useState(lancamento?.categoria ?? "");
  const [valor, setValor] = useState(lancamento?.valor_cents ? centsToStr(lancamento.valor_cents) : "");
  const [data, setData] = useState(lancamento?.data ?? todayISO());
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? "");
  const [status, setStatus] = useState<"confirmado" | "pendente">(lancamento?.status ?? "confirmado");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const valorRef = useRef<HTMLInputElement>(null);

  // Reset categoria se mudar tipo
  useEffect(() => {
    const cats = tipo === "receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
    const valid = cats.some((c) => c.value === categoria);
    if (!valid) setCategoria("");
  }, [tipo, categoria]);

  // Focus no valor ao abrir
  useEffect(() => {
    valorRef.current?.focus();
  }, []);

  const cats = tipo === "receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;

  async function handleSave() {
    const valorCents = strToCents(valor);
    if (!valorCents) {
      setError("Informe um valor válido.");
      return;
    }
    if (!categoria) {
      setError("Selecione uma categoria.");
      return;
    }
    if (!data) {
      setError("Informe a data.");
      return;
    }

    setSaving(true);
    setError("");

    const body = {
      tipo,
      categoria,
      valor_cents: valorCents,
      data,
      descricao: descricao.trim() || null,
      status,
    };

    try {
      if (isEdit && lancamento?.id) {
        await api.put(`/financeiro/lancamentos/${lancamento.id}`, body);
      } else {
        await api.post("/financeiro/lancamentos", body);
      }
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar lançamento.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!lancamento?.id) return;
    if (!confirm("Excluir este lançamento?")) return;

    setDeleting(true);
    try {
      await api.delete(`/financeiro/lancamentos/${lancamento.id}`);
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir.";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "Editar lançamento" : "Novo lançamento"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Toggle Receita/Despesa */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-5">
          <button
            onClick={() => setTipo("receita")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tipo === "receita" ? "bg-green-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            ↑ Receita
          </button>
          <button
            onClick={() => setTipo("despesa")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tipo === "despesa" ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            ↓ Despesa
          </button>
        </div>

        {/* Categoria */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Categoria <span className="text-red-500">*</span>
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecione...</option>
            {cats.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Valor */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Valor (R$) <span className="text-red-500">*</span>
          </label>
          <input
            ref={valorRef}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Data */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Data <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Descrição */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Descrição (opcional)</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Conserto elétrico para cliente João"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status */}
        <div className="mb-5 flex items-center gap-4">
          <span className="text-xs font-medium text-gray-600">Status:</span>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="radio"
              checked={status === "confirmado"}
              onChange={() => setStatus("confirmado")}
              className="accent-green-500"
            />
            Confirmado
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm">
            <input
              type="radio"
              checked={status === "pendente"}
              onChange={() => setStatus("pendente")}
              className="accent-yellow-500"
            />
            Pendente
          </label>
        </div>

        {/* Botões */}
        <div className="flex gap-2">
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="py-2 px-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-60 transition-colors"
            >
              {deleting ? "..." : "Excluir"}
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
