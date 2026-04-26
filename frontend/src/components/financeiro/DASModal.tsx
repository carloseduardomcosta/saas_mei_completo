import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface DASInfo {
  id?: string;
  competencia_mes: number;
  competencia_ano: number;
  valor_cents: number | null;
  data_vencimento?: string;
}

export interface DASModalProps {
  das: DASInfo | null;
  onClose: () => void;
  onSaved: () => void;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function DASModal({ das, onClose, onSaved }: DASModalProps) {
  const [valor, setValor] = useState("");
  const [dataPagamento, setDataPagamento] = useState(todayISO());
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (das?.valor_cents) {
      setValor(String(das.valor_cents / 100).replace(".", ","));
    }
    inputRef.current?.focus();
  }, [das]);

  if (!das) return null;

  const competenciaStr = `${MESES[das.competencia_mes - 1]}/${das.competencia_ano}`;

  function parseCents(raw: string): number | null {
    const num = parseFloat(raw.replace(",", "."));
    if (isNaN(num) || num <= 0) return null;
    return Math.round(num * 100);
  }

  async function handleSave() {
    if (!das) return;
    const valorCents = parseCents(valor);
    if (!valorCents) {
      setError("Informe um valor válido maior que zero.");
      return;
    }
    if (!dataPagamento) {
      setError("Informe a data de pagamento.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let s3Key: string | undefined;

      // Upload do comprovante (opcional — erro não bloqueia o save)
      if (arquivo && das.id) {
        try {
          setUploadProgress(0);
          const { upload_url, s3_key } = await api.post<{ upload_url: string; s3_key: string }>(
            `/financeiro/das/${das.id}/comprovante-upload-url`,
            { content_type: arquivo.type, filename: arquivo.name }
          );

          // PUT direto para S3
          const xhr = new XMLHttpRequest();
          await new Promise<void>((resolve, reject) => {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
            };
            xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou: ${xhr.status}`)));
            xhr.onerror = () => reject(new Error("Erro de rede no upload"));
            xhr.open("PUT", upload_url);
            xhr.setRequestHeader("Content-Type", arquivo.type);
            xhr.send(arquivo);
          });

          s3Key = s3_key;
          setUploadProgress(100);
        } catch {
          // Upload falhou — continua sem comprovante
          setUploadProgress(null);
        }
      }

      const body: Record<string, unknown> = {
        competencia_mes: das.competencia_mes,
        competencia_ano: das.competencia_ano,
        valor_cents: valorCents,
        data_pagamento: dataPagamento,
        observacao: observacao || null,
      };

      if (s3Key) body.comprovante_s3_key = s3Key;

      if (das.id) {
        // Atualiza DAS existente
        await api.put(`/financeiro/das/${das.id}`, body);
      } else {
        // Cria novo DAS
        await api.post("/financeiro/das", body);
      }

      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar DAS.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            Registrar pagamento DAS — {competenciaStr}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Competência (read-only) */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Competência</label>
          <input
            type="text"
            value={competenciaStr}
            readOnly
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600"
          />
        </div>

        {/* Valor pago */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Valor pago (R$) <span className="text-red-500">*</span>
          </label>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Data de pagamento */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Data de pagamento <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Upload comprovante */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Comprovante (opcional — PDF, JPG, PNG)
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {uploadProgress !== null && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{uploadProgress}% enviado</p>
            </div>
          )}
        </div>

        {/* Observação */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-gray-600 mb-1">Observação (opcional)</label>
          <textarea
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex: Pago via PIX"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3">
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
