import {useMutation, useQueryClient} from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {type DragEvent, useRef, useState} from 'react';
import {api} from '../api/client';
import type {ToastMessage} from './ToastBanner';
import type {ImportConfirmResponse, ImportPreviewResponse} from '../types/api';

interface ClientImportModalProps {
  open: boolean;
  onClose: () => void;
  onToast: (toast: ToastMessage) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function ClientImportModal({open, onClose, onToast}: ClientImportModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportConfirmResponse | null>(null);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);

  const previewMutation = useMutation({
    mutationFn: (file: File) => api.previewClientImport(file),
    onSuccess: (data) => {
      setPreview(data);
      setErrorText(null);
    },
    onError: (err: Error) => {
      setPreview(null);
      setErrorText(err.message);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (file: File) => api.confirmClientImport(file),
    onSuccess: (data) => {
      setResult(data);
      setErrorText(null);
      queryClient.invalidateQueries({queryKey: ['clients']});
      queryClient.invalidateQueries({queryKey: ['dashboard']});
      onToast({type: 'success', text: data.message});
    },
    onError: (err: Error) => {
      setErrorText(err.message);
    },
  });

  if (!open) return null;

  const resetState = () => {
    setSelectedFile(null);
    setDragActive(false);
    setErrorText(null);
    setPreview(null);
    setResult(null);
    setShowSkippedDetails(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChosen = (file: File | undefined | null) => {
    if (!file) return;
    setErrorText(null);
    setResult(null);

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setSelectedFile(null);
      setPreview(null);
      setErrorText(
        'Formato não suportado. Selecione uma planilha Excel no formato .xlsx.'
      );
      return;
    }

    if (file.size === 0) {
      setSelectedFile(null);
      setPreview(null);
      setErrorText('O arquivo selecionado está vazio.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setPreview(null);
      setErrorText('O arquivo excede o tamanho máximo permitido de 5 MB.');
      return;
    }

    setSelectedFile(file);
    previewMutation.mutate(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    handleFileChosen(file);
  };

  const handleDownloadTemplate = async () => {
    try {
      await api.downloadImportTemplate();
    } catch (err) {
      setErrorText(
        err instanceof Error
          ? err.message
          : 'Não foi possível baixar o modelo Excel.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 id="import-modal-title" className="text-base font-semibold text-slate-900">
              Importar clientes por Excel
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Envie uma planilha .xlsx, confira a prévia e confirme o cadastro dos registros
              válidos.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar janela de importação"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {/* Etapa 1: Modelo e seleção de arquivo */}
          {!result && (
            <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-700">
                <p className="font-semibold text-slate-900">
                  Colunas aceitas: Nome, Telefone, Endereço, Observações e Autorizado para
                  mensagens
                </p>
                <p className="mt-0.5 text-slate-600">
                  Use o modelo pronto com orientações e linha de exemplo (demonstração).
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Baixar modelo Excel
              </button>
            </div>
          )}

          {!result && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragActive
                  ? 'border-emerald-600 bg-emerald-50/60'
                  : 'border-slate-300 bg-white'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => handleFileChosen(e.target.files?.[0])}
                className="sr-only"
                id="excel-file-input"
              />

              <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-900">
                {selectedFile
                  ? `Arquivo selecionado: ${selectedFile.name}`
                  : 'Arraste a planilha .xlsx para cá ou clique para selecionar'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Somente arquivos .xlsx até 5 MB.
              </p>

              <div className="mt-4">
                <label
                  htmlFor="excel-file-input"
                  className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  {selectedFile ? 'Escolher outra planilha' : 'Selecionar arquivo .xlsx'}
                </label>
              </div>
            </div>
          )}

          {errorText && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
              <span>{errorText}</span>
            </div>
          )}

          {previewMutation.isPending && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              Analisando planilha e validando telefones no servidor...
            </div>
          )}

          {/* Etapa 3: Prévia dos registros */}
          {preview && !result && !previewMutation.isPending && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-white p-3.5">
                  <p className="text-xs text-slate-500">Total encontrado</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {preview.summary.total_rows}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3.5">
                  <p className="text-xs text-slate-500">Válidos para importar</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-700">
                    {preview.summary.valid_count}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3.5">
                  <p className="text-xs text-slate-500">Duplicados</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-700">
                    {preview.summary.duplicate_count}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3.5">
                  <p className="text-xs text-slate-500">Com erro</p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-700">
                    {preview.summary.error_count}
                  </p>
                </div>
              </div>

              <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">Linha</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Nome</th>
                      <th className="px-3 py-2.5">Telefone</th>
                      <th className="px-3 py-2.5">Autorização</th>
                      <th className="px-3 py-2.5">Observação / Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((row) => (
                      <tr key={row.row_number} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                          {row.row_number}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.status === 'valid' && (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Válido
                            </span>
                          )}
                          {row.status === 'duplicate' && (
                            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Duplicado
                            </span>
                          )}
                          {row.status === 'error' && (
                            <span className="inline-flex items-center gap-1 font-medium text-red-700">
                              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Com erro
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {row.name || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {row.phone_formatted || row.phone_raw || '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                          {row.whatsapp_opt_in ? 'Autorizado' : 'Não autorizado'}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.reason || row.address || 'Pronto para importação'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500">
                  Apenas os registros marcados como <strong>Válido</strong> serão cadastrados.
                  Clientes já existentes não serão modificados.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      preview.summary.valid_count === 0 ||
                      confirmMutation.isPending ||
                      !selectedFile
                    }
                    onClick={() => {
                      if (selectedFile) confirmMutation.mutate(selectedFile);
                    }}
                    className="min-h-10 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {confirmMutation.isPending
                      ? 'Importando...'
                      : 'Importar clientes válidos'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Etapa 5: Resultado final */}
          {result && (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">{result.message}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Importados com sucesso</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
                    {result.imported_count}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Ignorados por duplicidade</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700">
                    {result.duplicate_count}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Rejeitados por erros</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-red-700">
                    {result.error_count}
                  </p>
                </div>
              </div>

              {result.skipped_rows.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowSkippedDetails((prev) => !prev)}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    {showSkippedDetails
                      ? 'Ocultar registros não importados'
                      : `Visualizar ${result.skipped_rows.length} registro(s) não importado(s) e motivos`}
                  </button>

                  {showSkippedDetails && (
                    <div className="max-h-60 overflow-auto rounded-md border border-slate-200">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                          <tr>
                            <th className="px-3 py-2">Linha</th>
                            <th className="px-3 py-2">Nome</th>
                            <th className="px-3 py-2">Telefone</th>
                            <th className="px-3 py-2">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {result.skipped_rows.map((row) => (
                            <tr key={row.row_number}>
                              <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                                {row.row_number}
                              </td>
                              <td className="px-3 py-2 text-slate-900">{row.name || '—'}</td>
                              <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                                {row.phone_raw || '—'}
                              </td>
                              <td className="px-3 py-2 text-red-700">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={resetState}
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Importar outra planilha
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-10 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
