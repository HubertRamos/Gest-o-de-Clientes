import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  CheckCircle2,
  Edit2,
  FileSpreadsheet,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {type FormEvent, useState} from 'react';
import {api} from '../api/client';
import {ClientImportModal} from '../components/ClientImportModal';
import {ConfirmDialog} from '../components/ConfirmDialog';
import type {ToastMessage} from '../components/ToastBanner';
import type {Client, ClientPayload} from '../types/api';

interface ClientsPageProps {
  onToast: (toast: ToastMessage) => void;
}

const EMPTY_FORM: ClientPayload = {
  name: '',
  phone: '',
  address: '',
  notes: '',
  is_active: true,
  whatsapp_opt_in: true,
};

export function ClientsPage({onToast}: ClientsPageProps) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [optInFilter, setOptInFilter] = useState<'all' | 'authorized' | 'revoked'>('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ['clients', {search, statusFilter, optInFilter}],
    queryFn: () =>
      api.listClients({
        search: search.trim() || undefined,
        status: statusFilter,
        opt_in: optInFilter,
      }),
  });

  const invalidateClients = () => {
    queryClient.invalidateQueries({queryKey: ['clients']});
    queryClient.invalidateQueries({queryKey: ['dashboard']});
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: ClientPayload) => {
      if (editingClient) {
        return api.updateClient(editingClient.id, payload);
      }
      return api.createClient(payload);
    },
    onSuccess: () => {
      invalidateClients();
      setIsFormOpen(false);
      setEditingClient(null);
      setForm(EMPTY_FORM);
      setFormError(null);
      onToast({
        type: 'success',
        text: editingClient
          ? 'Dados do cliente atualizados com sucesso.'
          : 'Cliente cadastrado com sucesso.',
      });
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({id, is_active}: {id: number; is_active: boolean}) =>
      api.setClientStatus(id, is_active),
    onSuccess: (updated) => {
      invalidateClients();
      onToast({
        type: 'success',
        text: updated.is_active
          ? `Cliente ${updated.name} reativado.`
          : `Cliente ${updated.name} desativado.`,
      });
    },
    onError: (err: Error) => onToast({type: 'error', text: err.message}),
  });

  const toggleOptInMutation = useMutation({
    mutationFn: ({id, whatsapp_opt_in}: {id: number; whatsapp_opt_in: boolean}) =>
      api.setClientOptIn(id, whatsapp_opt_in),
    onSuccess: (updated) => {
      invalidateClients();
      onToast({
        type: 'success',
        text: updated.whatsapp_opt_in
          ? `Autorização de WhatsApp registrada para ${updated.name}.`
          : `Autorização de WhatsApp retirada para ${updated.name}. Este contato não será incluído em campanhas.`,
      });
    },
    onError: (err: Error) => onToast({type: 'error', text: err.message}),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteClient(id),
    onSuccess: () => {
      invalidateClients();
      setClientToDelete(null);
      onToast({type: 'success', text: 'Cliente excluído.'});
    },
    onError: (err: Error) => {
      setClientToDelete(null);
      onToast({type: 'error', text: err.message});
    },
  });

  const seedDemoMutation = useMutation({
    mutationFn: api.seedDemoData,
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      onToast({type: 'success', text: res.message});
    },
    onError: (err: Error) => onToast({type: 'error', text: err.message}),
  });

  const clearDemoMutation = useMutation({
    mutationFn: api.clearDemoData,
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      setConfirmClearDemo(false);
      onToast({type: 'success', text: res.message});
    },
    onError: (err: Error) => {
      setConfirmClearDemo(false);
      onToast({type: 'error', text: err.message});
    },
  });

  const openCreateForm = () => {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (client: Client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      phone: client.phone_formatted || client.phone_normalized,
      address: client.address || '',
      notes: client.notes || '',
      is_active: client.is_active,
      whatsapp_opt_in: client.whatsapp_opt_in,
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    saveMutation.mutate({
      ...form,
      address: form.address?.trim() ? form.address.trim() : null,
      notes: form.notes?.trim() ? form.notes.trim() : null,
    });
  };

  const clients = clientsQuery.data || [];
  const hasDemoClients = clients.some((c) => c.is_demo);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cadastre, pesquise e controle quem está ativo e autorizado a receber mensagens.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasDemoClients ? (
            <button
              type="button"
              onClick={() => setConfirmClearDemo(true)}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Limpar demonstração
            </button>
          ) : (
            <button
              type="button"
              onClick={() => seedDemoMutation.mutate()}
              disabled={seedDemoMutation.isPending}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {seedDemoMutation.isPending ? 'Inserindo...' : 'Inserir dados de demonstração'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Importar clientes
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo cliente
          </button>
        </div>
      </div>

      {/* Barra de pesquisa e filtros */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome ou telefone..."
              aria-label="Pesquisar clientes por nome ou telefone"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
              {(
                [
                  {key: 'all', label: 'Todos'},
                  {key: 'active', label: 'Ativos'},
                  {key: 'inactive', label: 'Inativos'},
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStatusFilter(item.key)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === item.key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <select
              value={optInFilter}
              onChange={(e) =>
                setOptInFilter(e.target.value as 'all' | 'authorized' | 'revoked')
              }
              aria-label="Filtrar por autorização de mensagens"
              className="min-h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-700 focus:outline-none"
            >
              <option value="all">Autorização: Todas</option>
              <option value="authorized">Apenas autorizados</option>
              <option value="revoked">Sem autorização</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="rounded-lg border border-slate-200 bg-white">
        {clientsQuery.isLoading ? (
          <div className="divide-y divide-slate-100 p-4">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-14 animate-pulse py-3" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-900">Nenhum cliente encontrado</p>
            <p className="mt-1 text-sm text-slate-500">
              {search || statusFilter !== 'all' || optInFilter !== 'all'
                ? 'Tente limpar os filtros ou buscar por outro nome ou telefone.'
                : 'Cadastre seu primeiro cliente ou carregue os dados de demonstração.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Telefone / WhatsApp</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Autorização WhatsApp</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-900">
                        {client.name}
                        {client.is_demo && (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            · Demonstração
                          </span>
                        )}
                      </div>
                      {client.address && (
                        <div className="mt-0.5 text-xs text-slate-500">{client.address}</div>
                      )}
                      {client.notes && (
                        <div className="mt-0.5 text-xs text-slate-500">{client.notes}</div>
                      )}
                    </td>

                    <td className="px-4 py-3 align-top font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                      {client.phone_formatted}
                    </td>

                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {client.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                          Inativo
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {client.whatsapp_opt_in ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Autorizado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                          Não autorizado
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 align-top text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(client)}
                          className="inline-flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                          <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: client.id,
                              is_active: !client.is_active,
                            })
                          }
                          disabled={toggleActiveMutation.isPending}
                          className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                          {client.is_active ? 'Desativar' : 'Ativar'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            toggleOptInMutation.mutate({
                              id: client.id,
                              whatsapp_opt_in: !client.whatsapp_opt_in,
                            })
                          }
                          disabled={toggleOptInMutation.isPending}
                          className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                          {client.whatsapp_opt_in
                            ? 'Retirar autorização'
                            : 'Autorizar envio'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setClientToDelete(client)}
                          aria-label={`Excluir ${client.name}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de cadastro / edição de cliente */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 id="client-modal-title" className="text-base font-semibold text-slate-900">
                {editingClient ? 'Editar cliente' : 'Cadastrar novo cliente'}
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
                <label htmlFor="client-name" className="block text-sm font-medium text-slate-700">
                  Nome completo *
                </label>
                <input
                  id="client-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder="Ex: Maria Silva"
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="client-phone" className="block text-sm font-medium text-slate-700">
                  Telefone / WhatsApp *
                </label>
                <input
                  id="client-phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({...form, phone: e.target.value})}
                  placeholder="Ex: (11) 99999-0001"
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Informe DDD e número. O sistema padroniza o formato automaticamente e evita
                  duplicidade.
                </p>
              </div>

              <div>
                <label htmlFor="client-address" className="block text-sm font-medium text-slate-700">
                  Endereço (opcional)
                </label>
                <input
                  id="client-address"
                  type="text"
                  value={form.address || ''}
                  onChange={(e) => setForm({...form, address: e.target.value})}
                  placeholder="Rua, número e bairro"
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="client-notes" className="block text-sm font-medium text-slate-700">
                  Observações (opcional)
                </label>
                <textarea
                  id="client-notes"
                  rows={3}
                  value={form.notes || ''}
                  onChange={(e) => setForm({...form, notes: e.target.value})}
                  placeholder="Preferência de horário, ponto de referência, etc."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div className="space-y-2.5 border-t border-slate-100 pt-3">
                <label className="flex items-start gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({...form, is_active: e.target.checked})}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                  />
                  <span>
                    <span className="font-medium text-slate-900">Cliente ativo</span>
                    <span className="block text-xs text-slate-500">
                      Clientes inativos ficam guardados no cadastro, mas não recebem campanhas.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.whatsapp_opt_in}
                    onChange={(e) => setForm({...form, whatsapp_opt_in: e.target.checked})}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                  />
                  <span>
                    <span className="font-medium text-slate-900">
                      Autorizou receber mensagens pelo WhatsApp
                    </span>
                    <span className="block text-xs text-slate-500">
                      Contatos sem autorização são bloqueados automaticamente do envio de
                      campanhas.
                    </span>
                  </span>
                </label>
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
                  {saveMutation.isPending
                    ? 'Salvando...'
                    : editingClient
                      ? 'Salvar alterações'
                      : 'Cadastrar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(clientToDelete)}
        title="Excluir cliente"
        description={`Tem certeza que deseja excluir o cliente "${clientToDelete?.name}"? O histórico numérico de campanhas já realizadas será preservado, mas o contato sairá da sua lista.`}
        confirmLabel="Excluir cliente"
        isLoading={deleteMutation.isPending}
        onCancel={() => setClientToDelete(null)}
        onConfirm={() => {
          if (clientToDelete) deleteMutation.mutate(clientToDelete.id);
        }}
      />

      <ConfirmDialog
        open={confirmClearDemo}
        title="Limpar dados de demonstração"
        description="Isso removerá apenas os clientes, modelos e campanhas marcados como demonstração. Seus cadastros reais não serão afetados."
        confirmLabel="Limpar demonstração"
        isLoading={clearDemoMutation.isPending}
        onCancel={() => setConfirmClearDemo(false)}
        onConfirm={() => clearDemoMutation.mutate()}
      />

      <ClientImportModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onToast={onToast}
      />
    </div>
  );
}
