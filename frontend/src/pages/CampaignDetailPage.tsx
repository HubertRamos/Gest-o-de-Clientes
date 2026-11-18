import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  FlaskConical,
  Send,
  XCircle,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {api} from '../api/client';
import {CampaignStatusLabel, RecipientStatusLabel} from '../components/StatusText';
import type {ToastMessage} from '../components/ToastBanner';
import type {CampaignRecipient} from '../types/api';
import {formatDateTime} from '../utils/format';

interface CampaignDetailPageProps {
  campaignId: number;
  onBack: () => void;
  onToast: (toast: ToastMessage) => void;
}

type RecipientFilter = 'all' | 'pending' | 'sent' | 'failed';

export function CampaignDetailPage({
  campaignId,
  onBack,
  onToast,
}: CampaignDetailPageProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<RecipientFilter>('all');

  const campaignQuery = useQuery({
    queryKey: ['campaigns', campaignId],
    queryFn: () => api.getCampaign(campaignId),
  });

  const syncAfterUpdate = () => {
    queryClient.invalidateQueries({queryKey: ['campaigns', campaignId]});
    queryClient.invalidateQueries({queryKey: ['campaigns']});
    queryClient.invalidateQueries({queryKey: ['dashboard']});
  };

  const openWhatsAppMutation = useMutation({
    mutationFn: (recipientId: number) =>
      api.openRecipientWhatsApp(campaignId, recipientId),
    onSuccess: () => {
      syncAfterUpdate();
    },
    onError: (err: Error) => onToast({type: 'error', text: err.message}),
  });

  const confirmManualMutation = useMutation({
    mutationFn: (recipientId: number) =>
      api.confirmRecipientManual(campaignId, recipientId),
    onSuccess: () => {
      syncAfterUpdate();
      onToast({type: 'success', text: 'Envio manual confirmado.'});
    },
    onError: (err: Error) => onToast({type: 'error', text: err.message}),
  });

  const markFailedMutation = useMutation({
    mutationFn: (recipientId: number) =>
      api.markRecipientFailed(
        campaignId,
        recipientId,
        'Não foi possível enviar para este contato.'
      ),
    onSuccess: () => {
      syncAfterUpdate();
      onToast({type: 'success', text: 'Destinatário marcado com falha no envio.'});
    },
    onError: (err: Error) => onToast({type: 'error', text: err.message}),
  });

  const dispatchAutoMutation = useMutation({
    mutationFn: () => api.dispatchAutomaticCampaign(campaignId),
    onSuccess: (res) => {
      syncAfterUpdate();
      onToast({type: 'success', text: res.notice});
    },
    onError: (err: Error) => onToast({type: 'error', text: err.message}),
  });

  const campaign = campaignQuery.data;

  const filteredRecipients = useMemo(() => {
    if (!campaign) return [];
    return campaign.recipients.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'pending') {
        return r.status === 'prepared' || r.status === 'whatsapp_opened';
      }
      if (filter === 'sent') {
        return (
          r.status === 'sent_manual' ||
          r.status === 'sent_simulated' ||
          r.status === 'sent_api'
        );
      }
      return r.status === 'failed';
    });
  }, [campaign, filter]);

  if (campaignQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
      </div>
    );
  }

  if (campaignQuery.isError || !campaign) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-6">
        <p className="text-sm text-red-700">Não foi possível carregar os dados da campanha.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 min-h-9 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Voltar para o histórico
        </button>
      </div>
    );
  }

  const isSimulation =
    campaign.send_mode === 'automatic' && campaign.provider_mode !== 'meta_cloud';
  const hasPendingForAuto = campaign.recipients.some(
    (r) => r.status === 'prepared' || r.status === 'failed'
  );

  const groupedRecipients: {title: string | null; items: CampaignRecipient[]}[] =
    campaign.format === 'segmented'
      ? campaign.groups.map((g) => ({
          title: g.name,
          items: filteredRecipients.filter((r) => r.group_id === g.id),
        }))
      : [{title: null, items: filteredRecipients}];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Voltar para o histórico
          </button>

          <h1 className="mt-2 text-xl font-semibold text-slate-900">{campaign.name}</h1>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
            <span>Criada em {formatDateTime(campaign.created_at)}</span>
            <span aria-hidden="true">·</span>
            <span>{campaign.format === 'general' ? 'Campanha geral' : 'Campanha segmentada'}</span>
            <span aria-hidden="true">·</span>
            <span>
              {campaign.send_mode === 'manual'
                ? 'Envio manual pelo WhatsApp'
                : isSimulation
                  ? 'Envio automático (simulação)'
                  : 'Envio automático (API oficial)'}
            </span>
            {campaign.is_demo && (
              <>
                <span aria-hidden="true">·</span>
                <span>Demonstração</span>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 pt-1">
          <CampaignStatusLabel status={campaign.status} />
        </div>
      </div>

      {/* Aviso específico do modo */}
      {isSimulation ? (
        <div className="flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-sm text-sky-950">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <p className="font-semibold">Modo de simulação ativo</p>
              <p className="mt-0.5 text-xs text-sky-900">
                Nenhuma mensagem real foi enviada pelo WhatsApp. Os envios abaixo são registrados
                como simulados até que as credenciais oficiais da Meta sejam configuradas.
              </p>
            </div>
          </div>

          {hasPendingForAuto && (
            <button
              type="button"
              onClick={() => dispatchAutoMutation.mutate()}
              disabled={dispatchAutoMutation.isPending}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {dispatchAutoMutation.isPending
                ? 'Simulando...'
                : 'Executar simulação pendente'}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Como funciona o envio manual:</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Clique em <strong>Abrir WhatsApp</strong> em um destinatário por vez. A conversa abrirá
            com a mensagem preenchida. Depois de enviar no WhatsApp, volte aqui e clique em{' '}
            <strong>Confirmar envio</strong>. Abrir o link não marca automaticamente a mensagem como
            enviada.
          </p>
        </div>
      )}

      {/* Resumo dos status */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Preparadas</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
            {campaign.counts.prepared}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Link aberto</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-700">
            {campaign.counts.whatsapp_opened}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Confirmadas manual</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-700">
            {campaign.counts.sent_manual}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Simuladas</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-sky-700">
            {campaign.counts.sent_simulated}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">API oficial</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-700">
            {campaign.counts.sent_api}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Falhas</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-700">
            {campaign.counts.failed}
          </p>
        </div>
      </div>

      {/* Filtro de destinatários */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
          {(
            [
              {key: 'all', label: `Todos (${campaign.counts.total_recipients})`},
              {key: 'pending', label: `Pendentes (${campaign.counts.pending})`},
              {key: 'sent', label: `Enviados (${campaign.counts.sent_total})`},
              {key: 'failed', label: `Falhas (${campaign.counts.failed})`},
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`rounded px-3 py-1.5 text-xs font-medium tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de destinatários */}
      <div className="space-y-5">
        {groupedRecipients.map((section, idx) => (
          <div
            key={section.title || `section-${idx}`}
            className="rounded-lg border border-slate-200 bg-white"
          >
            {section.title && (
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Grupo: {section.title} ({section.items.length})
                </h2>
              </div>
            )}

            {section.items.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                Nenhum destinatário neste filtro.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {section.items.map((recipient) => {
                  const isFinalSent =
                    recipient.status === 'sent_manual' ||
                    recipient.status === 'sent_simulated' ||
                    recipient.status === 'sent_api';

                  return (
                    <div
                      key={recipient.id}
                      className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-semibold text-slate-900">
                            {recipient.client_name}
                          </span>
                          <span className="font-mono text-xs tabular-nums text-slate-500">
                            {recipient.client_phone_formatted}
                          </span>
                          <RecipientStatusLabel status={recipient.status} />
                        </div>

                        <pre className="whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-700">
                          {recipient.rendered_message}
                        </pre>

                        {(recipient.opened_at || recipient.sent_at || recipient.error_message) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-slate-500">
                            {recipient.opened_at && (
                              <span>Link aberto em {formatDateTime(recipient.opened_at)}</span>
                            )}
                            {recipient.sent_at && (
                              <span>
                                {recipient.status === 'sent_simulated'
                                  ? 'Simulado em '
                                  : 'Registrado em '}
                                {formatDateTime(recipient.sent_at)}
                              </span>
                            )}
                            {recipient.error_message && (
                              <span className="inline-flex items-center gap-1 text-red-700">
                                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                {recipient.error_message}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {campaign.send_mode === 'manual' && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0 lg:pt-1">
                          <a
                            href={recipient.whatsapp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => openWhatsAppMutation.mutate(recipient.id)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Abrir WhatsApp
                          </a>

                          {!isFinalSent && (
                            <>
                              <button
                                type="button"
                                onClick={() => confirmManualMutation.mutate(recipient.id)}
                                disabled={confirmManualMutation.isPending}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-700 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                Confirmar envio
                              </button>

                              {recipient.status !== 'failed' && (
                                <button
                                  type="button"
                                  onClick={() => markFailedMutation.mutate(recipient.id)}
                                  disabled={markFailedMutation.isPending}
                                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                                >
                                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Falha
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
