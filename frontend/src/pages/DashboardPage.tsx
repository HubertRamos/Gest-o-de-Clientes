import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowRight, BellRing, Plus, Send, Users} from 'lucide-react';
import {api} from '../api/client';
import {CampaignStatusLabel} from '../components/StatusText';
import type {ToastMessage} from '../components/ToastBanner';
import {formatDateTime} from '../utils/format';

interface DashboardPageProps {
  onNavigate: (page: 'clients' | 'templates' | 'new-campaign' | 'history') => void;
  onOpenCampaign: (campaignId: number) => void;
  onStartCampaignForClients: (clientIds: number[]) => void;
  onToast: (toast: ToastMessage) => void;
}

export function DashboardPage({
  onNavigate,
  onOpenCampaign,
  onStartCampaignForClients,
  onToast,
}: DashboardPageProps) {
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
  });

  const seedMutation = useMutation({
    mutationFn: api.seedDemoData,
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      onToast({
        type: 'success',
        text: `${res.message} (${res.created_clients} clientes, ${res.created_templates} modelos, ${res.created_campaigns} campanhas)`,
      });
    },
    onError: (err: Error) => {
      onToast({type: 'error', text: err.message});
    },
  });

  if (dashboardQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white p-5" />
      </div>
    );
  }

  if (
    dashboardQuery.isError ||
    !dashboardQuery.data ||
    !dashboardQuery.data.delivery_summary
  ) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-6 text-sm text-red-700">
        <p>
          Não foi possível carregar o painel inicial. Verifique se o backend está em execução.
        </p>
        <button
          type="button"
          onClick={() => dashboardQuery.refetch()}
          className="mt-3 min-h-9 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const data = dashboardQuery.data;
  const recentCampaigns = data.recent_campaigns || [];
  const reminders = data.inactive_contact_reminders || [];
  const isEmpty = data.total_clients === 0 && data.total_campaigns === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Painel inicial</h1>
          <p className="mt-1 text-sm text-slate-600">
            Visão geral dos clientes cadastrados, campanhas criadas e envios realizados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('clients')}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Gerenciar clientes
          </button>
          <button
            type="button"
            onClick={() => onNavigate('new-campaign')}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova campanha
          </button>
        </div>
      </div>

      {isEmpty && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">
            Comece com dados de demonstração ou cadastre seu primeiro cliente
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Você pode inserir clientes fictícios, modelos de mensagem e campanhas de exemplo para
            testar todas as funções imediatamente.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="min-h-10 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {seedMutation.isPending
                ? 'Carregando demonstração...'
                : 'Carregar dados de demonstração'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('clients')}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Cadastrar cliente manualmente
            </button>
          </div>
        </div>
      )}

      {/* Métricas principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Total de clientes</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {data.total_clients}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.opted_in_clients} autorizados para WhatsApp
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Clientes ativos</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {data.active_clients}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.total_clients - data.active_clients} inativos
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Campanhas criadas</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {data.total_campaigns}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.total_templates} modelos salvos
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Resumo dos envios</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {data.delivery_summary.sent_manual +
              data.delivery_summary.sent_simulated +
              data.delivery_summary.sent_api}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {data.delivery_summary.pending} pendentes · {data.delivery_summary.failed} falhas
          </p>
        </div>
      </div>

      {/* Resumo detalhado de envios */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Situação geral das mensagens</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-5">
          <div>
            <p className="text-xs text-slate-500">Confirmadas manualmente</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-700">
              {data.delivery_summary.sent_manual}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Simuladas</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-sky-700">
              {data.delivery_summary.sent_simulated}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">API oficial</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-700">
              {data.delivery_summary.sent_api}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pendentes</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-700">
              {data.delivery_summary.pending}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Falhas</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-700">
              {data.delivery_summary.failed}
            </p>
          </div>
        </div>
      </div>

      {/* Lembretes: clientes sem mensagens há mais de 30 dias */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Lembretes de contato (mais de 30 dias sem mensagem)
              </h2>
              <p className="text-xs text-slate-500">
                Clientes ativos e autorizados que não recebem mensagens há mais de 30 dias.
              </p>
            </div>
          </div>

          {reminders.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onStartCampaignForClients(reminders.map((r) => r.client_id))
              }
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Criar campanha para estes clientes ({reminders.length})
            </button>
          )}
        </div>

        {reminders.length === 0 ? (
          <div className="px-5 py-4 text-sm text-slate-600">
            Nenhum cliente ativo está há mais de 30 dias sem receber mensagens.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reminders.slice(0, 8).map((reminder) => (
              <div
                key={reminder.client_id}
                className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{reminder.client_name}</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-500">
                    {reminder.phone_formatted}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-medium tabular-nums text-amber-700">
                    {reminder.never_messaged
                      ? `Sem envios há ${reminder.days_without_message} dias desde o cadastro`
                      : `Última mensagem há ${reminder.days_without_message} dias`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onStartCampaignForClients([reminder.client_id])}
                    className="min-h-8 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Enviar mensagem
                  </button>
                </div>
              </div>
            ))}
            {reminders.length > 8 && (
              <div className="px-5 py-3 text-xs text-slate-500">
                Mostrando os 8 mais antigos de{' '}
                <strong className="tabular-nums text-slate-700">
                  {reminders.length}
                </strong>{' '}
                clientes pendentes.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campanhas recentes */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Campanhas recentes</h2>
          {recentCampaigns.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
            >
              Ver histórico completo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {recentCampaigns.length === 0 ? (
          <div className="p-8 text-center">
            <Send className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-slate-900">
              Nenhuma campanha criada até o momento
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Crie uma campanha geral ou segmentada para enviar mensagens aos seus clientes.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenCampaign(campaign.id)}
                      className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-700"
                    >
                      {campaign.name}
                    </button>
                    {campaign.is_demo && (
                      <span className="text-xs text-slate-500">· Demonstração</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
                    <span>{formatDateTime(campaign.created_at)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{campaign.format === 'general' ? 'Geral' : 'Segmentada'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{campaign.send_mode === 'manual' ? 'Manual' : 'Automático'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{campaign.counts.total_recipients} destinatários</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <CampaignStatusLabel status={campaign.status} />
                  <button
                    type="button"
                    onClick={() => onOpenCampaign(campaign.id)}
                    className="min-h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Abrir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
