import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Edit2, MessageSquareText, Plus, Trash2, X} from 'lucide-react';
import {type FormEvent, useState} from 'react';
import {api} from '../api/client';
import {ConfirmDialog} from '../components/ConfirmDialog';
import type {ToastMessage} from '../components/ToastBanner';
import type {MessageTemplate, MessageTemplatePayload} from '../types/api';
import {formatDateTime, renderTemplatePreview} from '../utils/format';

interface TemplatesPageProps {
  onToast: (toast: ToastMessage) => void;
}

const DEFAULT_CONTENT =
  'Olá, {{nome}}!\n\nEstou passando para saber se deseja fazer algum pedido hoje.\n\nQualquer coisa, estou à disposição!';

export function TemplatesPage({onToast}: TemplatesPageProps) {
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [sampleName, setSampleName] = useState('Ana Paula');
  const [formError, setFormError] = useState<string | null>(null);

  const [templateToDelete, setTemplateToDelete] = useState<MessageTemplate | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
  });

  const invalidateTemplates = () => {
    queryClient.invalidateQueries({queryKey: ['templates']});
    queryClient.invalidateQueries({queryKey: ['dashboard']});
  };

  const saveMutation = useMutation({
    mutationFn: (payload: MessageTemplatePayload) =>
      editingTemplate
        ? api.updateTemplate(editingTemplate.id, payload)
        : api.createTemplate(payload),
    onSuccess: () => {
      invalidateTemplates();
      setIsFormOpen(false);
      setEditingTemplate(null);
      setTitle('');
      setContent(DEFAULT_CONTENT);
      setFormError(null);
      onToast({
        type: 'success',
        text: editingTemplate
          ? 'Modelo de mensagem atualizado.'
          : 'Modelo de mensagem criado com sucesso.',
      });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTemplate(id),
    onSuccess: () => {
      invalidateTemplates();
      setTemplateToDelete(null);
      onToast({type: 'success', text: 'Modelo excluído.'});
    },
    onError: (err: Error) => {
      setTemplateToDelete(null);
      onToast({type: 'error', text: err.message});
    },
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setTitle('');
    setContent(DEFAULT_CONTENT);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (tpl: MessageTemplate) => {
    setEditingTemplate(tpl);
    setTitle(tpl.title);
    setContent(tpl.content);
    setFormError(null);
    setIsFormOpen(true);
  };

  const insertVariable = () => {
    setContent((prev) => (prev.endsWith(' ') || prev === '' ? `${prev}{{nome}}` : `${prev} {{nome}}`));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    saveMutation.mutate({title, content});
  };

  const templates = templatesQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Modelos de mensagens</h1>
          <p className="mt-1 text-sm text-slate-600">
            Prepare textos prontos com <code className="font-mono text-xs">{'{{nome}}'}</code> para
            reutilizar rapidamente nas campanhas.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo modelo
        </button>
      </div>

      {templatesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="h-44 animate-pulse rounded-lg border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">
            Nenhum modelo de mensagem cadastrado
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Crie modelos para agilizar seus contatos diários pelo WhatsApp.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 min-h-10 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Criar primeiro modelo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{tpl.title}</h2>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      Atualizado em {formatDateTime(tpl.updated_at)}
                      {tpl.is_demo ? ' · Demonstração' : ''}
                    </p>
                  </div>
                </div>

                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-700">
                  {tpl.content}
                </pre>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => openEdit(tpl)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateToDelete(tpl)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 id="template-modal-title" className="text-base font-semibold text-slate-900">
                {editingTemplate ? 'Editar modelo de mensagem' : 'Novo modelo de mensagem'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Fechar janela"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="tpl-title" className="block text-sm font-medium text-slate-700">
                  Nome do modelo *
                </label>
                <input
                  id="tpl-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Abertura de pedidos do dia"
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="tpl-content" className="block text-sm font-medium text-slate-700">
                    Conteúdo da mensagem *
                  </label>
                  <button
                    type="button"
                    onClick={insertVariable}
                    className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    + Inserir {'{{nome}}'}
                  </button>
                </div>
                <textarea
                  id="tpl-content"
                  required
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  A expressão <code className="font-mono">{'{{nome}}'}</code> será substituída pelo
                  nome de cada cliente antes do envio.
                </p>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Pré-visualização para um cliente
                  </span>
                  <input
                    type="text"
                    value={sampleName}
                    onChange={(e) => setSampleName(e.target.value)}
                    aria-label="Nome de exemplo para pré-visualização"
                    placeholder="Nome de exemplo"
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                <pre className="mt-2.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
                  {renderTemplatePreview(content, sampleName)}
                </pre>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="min-h-10 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar modelo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(templateToDelete)}
        title="Excluir modelo de mensagem"
        description={`Deseja excluir o modelo "${templateToDelete?.title}"? Campanhas já criadas não perderão seus textos preparados.`}
        confirmLabel="Excluir modelo"
        isLoading={deleteMutation.isPending}
        onCancel={() => setTemplateToDelete(null)}
        onConfirm={() => {
          if (templateToDelete) deleteMutation.mutate(templateToDelete.id);
        }}
      />
    </div>
  );
}
