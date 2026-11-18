import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {History, Plus, Trash2} from 'lucide-react';
import {useState} from 'react';
import {api} from '../api/client';
import {ConfirmDialog} from '../components/ConfirmDialog';
import {CampaignStatusLabel} from '../components/StatusText';
import type {ToastMessage} from '../components/ToastBanner';
import type {CampaignSummary} from '../types/api';
import {formatDateTime} from '../utils/format';

interface CampaignHistoryPageProps {
  onOpenCampaign: (campaignId: number) => void;
  onCreateNew: () => void;
  onToast: (toast: ToastMessage) => void;
}

export function CampaignHistoryPage({
  onOpenCampaign,
  onCreateNew,
  onToast,
}: CampaignHistoryPageProps) {
  const queryClient = useQueryClient();
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignSummary | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: api.listCampaigns,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['campaigns']});
      queryClient.invalidateQueries({queryKey: ['dashboard']});
      setCampaignToDelete(null);
      onToast({type: 'success', text: 'Campanha excluída do histórico.'});
    },
    onError: (err: Error) => {
      setCampaignToDelete(null);
      onToast({type: 'error', text: err.message});
    },
  });

  const campaigns = campaignsQuery.data || [];

  const sendModeLabel = (campaign: CampaignSummary) => {
    if (campaign.send_mode === 'manual') return 'Manual (WhatsApp)';
    if (campaign.provider_mode === 'meta_cloud') return 'Automático (API oficial)';
    return 'Automático (Simulado)';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Histórico de campanhas</h1>
          <p className="mt-1 text-sm text-slate-600">
            Consulte campanhas anteriores, acompanhe pendências e retome envios manuais.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova campanha
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {campaignsQuery.isLoading ? (
          <div className="divide-y divide-slate-100 p-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-16 animate-pulse py-3" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center">
            <History className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-slate-900">
              Nenhuma campanha registrada ainda
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Quando você criar uma campanha geral ou segmentada, ela aparecerá aqui.
            </p>
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-4 min-h-10 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Criar primeira campanha
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Campanha</th>
                  <th className="px-4 py-3">Formato e modo</th>
                  <th className="px-4 py-3 text-right">Destinatários</th>
                  <th className="px-4 py-3 text-right">Confirmadas</th>
                  <th className="px-4 py-3 text-right">Simuladas</th>
                  <th className="px-4 py-3 text-right">Pendentes</th>
                  <th className="px-4 py-3 text-right">Falhas</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => onOpenCampaign(campaign.id)}
                        className="text-left font-semibold text-slate-900 hover:text-emerald-700"
                      >
                        {campaign.name}
                      </button>
                      <div className="mt-0.5 text-xs tabular-nums text-slate-500">
                        {formatDateTime(campaign.created_at)}
                        {campaign.is_demo ? ' · Demonstração' : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top text-xs text-slate-700 whitespace-nowrap">
                      <div>{campaign.format === 'general' ? 'Geral' : 'Segmentada'}</div>
                      <div className="mt-0.5 text-slate-500">{sendModeLabel(campaign)}</div>
                    </td>

                    <td className="px-4 py-3 align-top text-right font-mono text-xs tabular-nums text-slate-800">
                      {campaign.counts.total_recipients}
                    </td>

                    <td className="px-4 py-3 align-top text-right font-mono text-xs tabular-nums text-emerald-700">
                      {campaign.counts.sent_manual + campaign.counts.sent_api}
                    </td>

                    <td className="px-4 py-3 align-top text-right font-mono text-xs tabular-nums text-sky-700">
                      {campaign.counts.sent_simulated}
                    </td>

                    <td className="px-4 py-3 align-top text-right font-mono text-xs tabular-nums text-amber-700">
                      {campaign.counts.pending}
                    </td>

                    <td className="px-4 py-3 align-top text-right font-mono text-xs tabular-nums text-red-700">
                      {campaign.counts.failed}
                    </td>

                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <CampaignStatusLabel status={campaign.status} />
                    </td>

                    <td className="px-4 py-3 align-top text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenCampaign(campaign.id)}
                          className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => setCampaignToDelete(campaign)}
                          aria-label={`Excluir campanha ${campaign.name}`}
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

      <ConfirmDialog
        open={Boolean(campaignToDelete)}
        title="Excluir campanha"
        description={`Tem certeza que deseja excluir a campanha "${campaignToDelete?.name}"? Todos os registros de envio dessa campanha serão removidos.`}
        confirmLabel="Excluir campanha"
        isLoading={deleteMutation.isPending}
        onCancel={() => setCampaignToDelete(null)}
        onConfirm={() => {
          if (campaignToDelete) deleteMutation.mutate(campaignToDelete.id);
        }}
      />
    </div>
  );
}
