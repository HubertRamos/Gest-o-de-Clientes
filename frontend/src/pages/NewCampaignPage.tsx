import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {AlertCircle, FlaskConical, Plus, Search, Trash2, Users} from 'lucide-react';
import {type FormEvent, useMemo, useState} from 'react';
import {api} from '../api/client';
import type {ToastMessage} from '../components/ToastBanner';
import type {CampaignFormat, CampaignSendMode} from '../types/api';
import {renderTemplatePreview} from '../utils/format';

interface NewCampaignPageProps {
  initialClientIds?: number[];
  onOpenCampaign: (campaignId: number) => void;
  onNavigateClients: () => void;
  onToast: (toast: ToastMessage) => void;
}

interface SegmentDraft {
  localId: string;
  name: string;
  templateId: string;
  messageContent: string;
  clientIds: number[];
}

const DEFAULT_MESSAGE =
  'Olá, {{nome}}!\n\nEstou passando para saber se deseja fazer algum pedido hoje.\n\nQualquer coisa, estou à disposição!';

export function NewCampaignPage({
  initialClientIds,
  onOpenCampaign,
  onNavigateClients,
  onToast,
}: NewCampaignPageProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [format, setFormat] = useState<CampaignFormat>('general');
  const [sendMode, setSendMode] = useState<CampaignSendMode>('manual');

  // Campanha geral
  const [generalTemplateId, setGeneralTemplateId] = useState<string>('');
  const [generalMessage, setGeneralMessage] = useState(DEFAULT_MESSAGE);
  const [generalClientIds, setGeneralClientIds] = useState<number[]>(initialClientIds || []);
  const [clientSearch, setClientSearch] = useState('');

  // Campanha segmentada
  const [groups, setGroups] = useState<SegmentDraft[]>([
    {
      localId: 'g1',
      name: 'Clientes frequentes',
      templateId: '',
      messageContent: DEFAULT_MESSAGE,
      clientIds: [],
    },
    {
      localId: 'g2',
      name: 'Novos clientes',
      templateId: '',
      messageContent:
        'Olá, {{nome}}! Seja bem-vindo(a).\n\nEstou passando para avisar que já estou realizando entregas hoje.',
      clientIds: [],
    },
  ]);

  const [formError, setFormError] = useState<string | null>(null);

  const allClientsQuery = useQuery({
    queryKey: ['clients', 'all-for-campaign'],
    queryFn: () => api.listClients({status: 'all', opt_in: 'all'}),
  });

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
  });

  const allClients = allClientsQuery.data || [];
  const eligibleClients = useMemo(
    () => allClients.filter((c) => c.is_active && c.whatsapp_opt_in),
    [allClients]
  );
  const excludedCount = allClients.length - eligibleClients.length;

  const filteredEligibleClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return eligibleClients;
    const digits = q.replace(/\D/g, '');
    return eligibleClients.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (digits && c.phone_normalized.includes(digits)) return true;
      return c.phone_formatted.toLowerCase().includes(q);
    });
  }, [eligibleClients, clientSearch]);

  const templates = templatesQuery.data || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload =
        format === 'general'
          ? {
              name: name.trim(),
              format,
              send_mode: sendMode,
              template_id: generalTemplateId ? Number(generalTemplateId) : null,
              message_content: generalMessage,
              client_ids: generalClientIds,
            }
          : {
              name: name.trim(),
              format,
              send_mode: sendMode,
              groups: groups.map((g) => ({
                name: g.name.trim(),
                template_id: g.templateId ? Number(g.templateId) : null,
                message_content: g.messageContent,
                client_ids: g.clientIds,
              })),
            };

      const created = await api.createCampaign(payload);
      if (sendMode === 'automatic') {
        const dispatch = await api.dispatchAutomaticCampaign(created.id);
        return {campaign: dispatch.campaign, dispatchNotice: dispatch.notice};
      }
      return {campaign: created, dispatchNotice: null};
    },
    onSuccess: ({campaign, dispatchNotice}) => {
      queryClient.invalidateQueries({queryKey: ['campaigns']});
      queryClient.invalidateQueries({queryKey: ['dashboard']});
      onToast({
        type: 'success',
        text:
          dispatchNotice ||
          'Campanha preparada! Agora você pode abrir o WhatsApp cliente por cliente.',
      });
      onOpenCampaign(campaign.id);
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const toggleGeneralClient = (clientId: number) => {
    setGeneralClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const selectAllFilteredGeneral = () => {
    const ids = filteredEligibleClients.map((c) => c.id);
    setGeneralClientIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const handleGeneralTemplatePick = (templateId: string) => {
    setGeneralTemplateId(templateId);
    const tpl = templates.find((t) => String(t.id) === templateId);
    if (tpl) {
      setGeneralMessage(tpl.content);
    }
  };

  const updateGroup = (localId: string, patch: Partial<SegmentDraft>) => {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? {...g, ...patch} : g)));
  };

  const toggleGroupClient = (localId: string, clientId: number) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== localId) return g;
        const exists = g.clientIds.includes(clientId);
        return {
          ...g,
          clientIds: exists
            ? g.clientIds.filter((id) => id !== clientId)
            : [...g.clientIds, clientId],
        };
      })
    );
  };

  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      {
        localId: `g_${Date.now()}`,
        name: `Grupo ${prev.length + 1}`,
        templateId: '',
        messageContent: DEFAULT_MESSAGE,
        clientIds: [],
      },
    ]);
  };

  const removeGroup = (localId: string) => {
    if (groups.length <= 1) return;
    setGroups((prev) => prev.filter((g) => g.localId !== localId));
  };

  // Mapa para impedir seleção do mesmo cliente em dois grupos
  const clientGroupOwner = useMemo(() => {
    const map = new Map<number, {localId: string; groupName: string}>();
    for (const group of groups) {
      for (const cid of group.clientIds) {
        map.set(cid, {localId: group.localId, groupName: group.name || 'outro grupo'});
      }
    }
    return map;
  }, [groups]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (name.trim().length < 2) {
      setFormError('Informe um nome para a campanha.');
      return;
    }

    if (format === 'general') {
      if (!generalMessage.trim()) {
        setFormError('Escreva a mensagem da campanha.');
        return;
      }
      if (generalClientIds.length === 0) {
        setFormError('Selecione pelo menos um cliente para enviar.');
        return;
      }
    } else {
      for (const group of groups) {
        if (!group.name.trim()) {
          setFormError('Todos os grupos precisam ter um nome.');
          return;
        }
        if (!group.messageContent.trim()) {
          setFormError(`Informe a mensagem do grupo "${group.name}".`);
          return;
        }
        if (group.clientIds.length === 0) {
          setFormError(`Selecione pelo menos um cliente no grupo "${group.name}".`);
          return;
        }
      }
    }

    createMutation.mutate();
  };

  const sampleClientForGeneral =
    eligibleClients.find((c) => generalClientIds.includes(c.id))?.name ||
    eligibleClients[0]?.name ||
    'Maria Silva';

  const totalSelectedSegmented = groups.reduce((acc, g) => acc + g.clientIds.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Nova campanha</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escolha o formato, selecione os clientes autorizados e prepare as mensagens com{' '}
          <code className="font-mono text-xs">{'{{nome}}'}</code>.
        </p>
      </div>

      {allClientsQuery.isLoading ? (
        <div className="h-48 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ) : eligibleClients.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">
            Nenhum cliente disponível para receber campanhas
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Apenas clientes ativos e com autorização para WhatsApp podem ser incluídos em
            campanhas.
          </p>
          <button
            type="button"
            onClick={onNavigateClients}
            className="mt-4 min-h-10 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Ir para clientes
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {excludedCount > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              Mostrando <strong className="font-semibold text-slate-900">{eligibleClients.length}</strong>{' '}
              clientes aptos para envio.{' '}
              <span className="tabular-nums">{excludedCount}</span> contato(s) inativos ou sem
              autorização de WhatsApp foram ocultados automaticamente.
            </div>
          )}

          {/* Configurações básicas da campanha */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
            <div>
              <label htmlFor="campaign-name" className="block text-sm font-medium text-slate-700">
                Nome da campanha *
              </label>
              <input
                id="campaign-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Pedidos de hoje — Região Central"
                className="mt-1 min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <span className="block text-sm font-medium text-slate-700">
                  Formato da campanha
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormat('general')}
                    className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      format === 'general'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-semibold">Campanha geral</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Mesma mensagem para todos os escolhidos
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormat('segmented')}
                    className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      format === 'segmented'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-semibold">Campanha segmentada</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Grupos com mensagens diferentes
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700">Modo de envio</span>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSendMode('manual')}
                    className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      sendMode === 'manual'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-semibold">Manual (WhatsApp)</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Abre cada conversa para confirmar
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSendMode('automatic')}
                    className={`rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      sendMode === 'automatic'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-semibold">Automático (Simulado)</span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Testa envio em lote sem mandar real
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {sendMode === 'automatic' && (
              <div className="flex items-start gap-2.5 rounded-md border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-900">
                <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
                <span>
                  O envio automático está em <strong>modo de simulação</strong>. Nenhuma mensagem
                  real será enviada pelo WhatsApp até que a conta oficial da Meta seja conectada.
                </span>
              </div>
            )}
          </div>

          {format === 'general' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Mensagem geral */}
              <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="text-base font-semibold text-slate-900">Mensagem da campanha</h2>

                <div>
                  <label
                    htmlFor="general-template"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Usar modelo salvo (opcional)
                  </label>
                  <select
                    id="general-template"
                    value={generalTemplateId}
                    onChange={(e) => handleGeneralTemplatePick(e.target.value)}
                    className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                  >
                    <option value="">Escrever do zero ou escolher modelo...</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="general-message"
                      className="block text-xs font-medium text-slate-600"
                    >
                      Conteúdo da mensagem *
                    </label>
                    <button
                      type="button"
                      onClick={() => setGeneralMessage((prev) => `${prev} {{nome}}`)}
                      className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-100"
                    >
                      + {'{{nome}}'}
                    </button>
                  </div>
                  <textarea
                    id="general-message"
                    rows={5}
                    required
                    value={generalMessage}
                    onChange={(e) => setGeneralMessage(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-xs font-semibold text-slate-700">
                    Exemplo de como {sampleClientForGeneral} receberá:
                  </p>
                  <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
                    {renderTemplatePreview(generalMessage, sampleClientForGeneral)}
                  </pre>
                </div>
              </div>

              {/* Seleção de clientes para campanha geral */}
              <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    Destinatários ({generalClientIds.length} selecionado(s))
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllFilteredGeneral}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      Selecionar todos
                    </button>
                    <span className="text-slate-300" aria-hidden="true">
                      |
                    </span>
                    <button
                      type="button"
                      onClick={() => setGeneralClientIds([])}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Filtrar clientes por nome ou telefone..."
                    className="min-h-9 w-full rounded-md border border-slate-300 py-1.5 pr-3 pl-9 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                </div>

                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                  {filteredEligibleClients.map((client) => {
                    const checked = generalClientIds.includes(client.id);
                    return (
                      <label
                        key={client.id}
                        className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-slate-50"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGeneralClient(client.id)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                          />
                          <span className="truncate text-sm font-medium text-slate-900">
                            {client.name}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-slate-500 shrink-0">
                          {client.phone_formatted}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Campanha segmentada */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Grupos desta campanha ({groups.length} grupo(s) · {totalSelectedSegmented}{' '}
                    cliente(s))
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cada cliente pode participar de apenas um grupo na mesma campanha.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addGroup}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Adicionar grupo
                </button>
              </div>

              <div className="space-y-5">
                {groups.map((group, idx) => {
                  const sampleName =
                    eligibleClients.find((c) => group.clientIds.includes(c.id))?.name ||
                    eligibleClients[0]?.name ||
                    'Maria Silva';

                  return (
                    <div
                      key={group.localId}
                      className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex flex-1 items-center gap-3">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            Grupo {idx + 1}
                          </span>
                          <input
                            type="text"
                            required
                            value={group.name}
                            onChange={(e) =>
                              updateGroup(group.localId, {name: e.target.value})
                            }
                            placeholder="Nome do grupo (ex: Clientes frequentes)"
                            aria-label={`Nome do grupo ${idx + 1}`}
                            className="min-h-9 max-w-sm flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
                          />
                        </div>

                        {groups.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeGroup(group.localId)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Remover grupo
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600">
                              Modelo salvo (opcional)
                            </label>
                            <select
                              value={group.templateId}
                              onChange={(e) => {
                                const tplId = e.target.value;
                                const tpl = templates.find((t) => String(t.id) === tplId);
                                updateGroup(group.localId, {
                                  templateId: tplId,
                                  ...(tpl ? {messageContent: tpl.content} : {}),
                                });
                              }}
                              className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
                            >
                              <option value="">Escolher modelo...</option>
                              {templates.map((tpl) => (
                                <option key={tpl.id} value={tpl.id}>
                                  {tpl.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-medium text-slate-600">
                                Mensagem deste grupo *
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  updateGroup(group.localId, {
                                    messageContent: `${group.messageContent} {{nome}}`,
                                  })
                                }
                                className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 hover:bg-slate-100"
                              >
                                + {'{{nome}}'}
                              </button>
                            </div>
                            <textarea
                              rows={4}
                              required
                              value={group.messageContent}
                              onChange={(e) =>
                                updateGroup(group.localId, {messageContent: e.target.value})
                              }
                              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-emerald-700 focus:outline-none"
                            />
                          </div>

                          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold text-slate-700">
                              Prévia ({sampleName}):
                            </p>
                            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                              {renderTemplatePreview(group.messageContent, sampleName)}
                            </pre>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-600">
                            Clientes deste grupo ({group.clientIds.length} selecionado(s))
                          </p>
                          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                            {eligibleClients.map((client) => {
                              const owner = clientGroupOwner.get(client.id);
                              const inAnotherGroup = owner && owner.localId !== group.localId;
                              const checked = group.clientIds.includes(client.id);

                              return (
                                <label
                                  key={client.id}
                                  className={`flex items-center justify-between gap-3 px-3 py-2 ${
                                    inAnotherGroup
                                      ? 'cursor-not-allowed bg-slate-50 text-slate-400'
                                      : 'cursor-pointer hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="flex min-w-0 items-center gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={Boolean(inAnotherGroup)}
                                      onChange={() => toggleGroupClient(group.localId, client.id)}
                                      className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-700 disabled:opacity-40"
                                    />
                                    <span className="truncate text-sm font-medium">
                                      {client.name}
                                    </span>
                                  </span>

                                  <span className="text-xs shrink-0">
                                    {inAnotherGroup ? (
                                      <span className="text-slate-400">
                                        Já está em {owner.groupName}
                                      </span>
                                    ) : (
                                      <span className="font-mono tabular-nums text-slate-500">
                                        {client.phone_formatted}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4">
            <div className="text-sm text-slate-600">
              {format === 'general' ? (
                <span>
                  <strong className="font-semibold tabular-nums text-slate-900">
                    {generalClientIds.length}
                  </strong>{' '}
                  destinatário(s) selecionado(s)
                </span>
              ) : (
                <span>
                  <strong className="font-semibold tabular-nums text-slate-900">
                    {totalSelectedSegmented}
                  </strong>{' '}
                  destinatário(s) distribuído(s) em {groups.length} grupo(s)
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="min-h-10 rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {createMutation.isPending
                ? 'Preparando campanha...'
                : sendMode === 'manual'
                  ? 'Preparar campanha manual'
                  : 'Criar e simular envio automático'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
