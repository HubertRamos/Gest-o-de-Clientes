import type {
  AutomaticDispatchResponse,
  CampaignCreatePayload,
  CampaignDetail,
  CampaignSummary,
  Client,
  ClientPayload,
  DashboardSummary,
  DemoSeedResponse,
  ImportConfirmResponse,
  ImportPreviewResponse,
  MessageTemplate,
  MessageTemplatePayload,
} from '../types/api';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : {'Content-Type': 'application/json'}),
      ...(init?.headers || {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ApiError(
          'Resposta inesperada do servidor. Verifique se o backend está em execução.',
          response.status
        );
      }
      data = text;
    }
  }

  if (!response.ok) {
    let message = 'Não foi possível concluir a operação.';
    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as {detail: unknown}).detail;
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        if (first && typeof first === 'object' && 'msg' in first) {
          message = String((first as {msg: string}).msg);
        }
      }
    }
    throw new ApiError(message, response.status);
  }

  if (data === null || typeof data !== 'object') {
    throw new ApiError(
      'Resposta inválida do backend. Verifique se o servidor FastAPI está ativo.',
      response.status
    );
  }

  return data as T;
}

export const api = {
  getDashboard: () => request<DashboardSummary>('/dashboard'),

  listClients: (params?: {
    search?: string;
    status?: 'all' | 'active' | 'inactive';
    opt_in?: 'all' | 'authorized' | 'revoked';
    eligible_only?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.opt_in) query.set('opt_in', params.opt_in);
    if (params?.eligible_only) query.set('eligible_only', 'true');
    const qs = query.toString();
    return request<Client[]>(`/clients${qs ? `?${qs}` : ''}`);
  },

  createClient: (payload: ClientPayload) =>
    request<Client>('/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateClient: (id: number, payload: Partial<ClientPayload>) =>
    request<Client>(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  setClientStatus: (id: number, is_active: boolean) =>
    request<Client>(`/clients/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({is_active}),
    }),

  setClientOptIn: (id: number, whatsapp_opt_in: boolean) =>
    request<Client>(`/clients/${id}/opt-in`, {
      method: 'PATCH',
      body: JSON.stringify({whatsapp_opt_in}),
    }),

  deleteClient: (id: number) =>
    request<void>(`/clients/${id}`, {
      method: 'DELETE',
    }),

  listTemplates: () => request<MessageTemplate[]>('/templates'),

  createTemplate: (payload: MessageTemplatePayload) =>
    request<MessageTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTemplate: (id: number, payload: Partial<MessageTemplatePayload>) =>
    request<MessageTemplate>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteTemplate: (id: number) =>
    request<void>(`/templates/${id}`, {
      method: 'DELETE',
    }),

  previewTemplate: (content: string, clientName: string) =>
    request<{rendered_message: string}>('/templates/preview', {
      method: 'POST',
      body: JSON.stringify({content, client_name: clientName}),
    }),

  listCampaigns: () => request<CampaignSummary[]>('/campaigns'),

  getCampaign: (id: number) => request<CampaignDetail>(`/campaigns/${id}`),

  createCampaign: (payload: CampaignCreatePayload) =>
    request<CampaignDetail>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteCampaign: (id: number) =>
    request<void>(`/campaigns/${id}`, {
      method: 'DELETE',
    }),

  openRecipientWhatsApp: (campaignId: number, recipientId: number) =>
    request<CampaignDetail>(
      `/campaigns/${campaignId}/recipients/${recipientId}/open-whatsapp`,
      {method: 'POST'}
    ),

  confirmRecipientManual: (campaignId: number, recipientId: number) =>
    request<CampaignDetail>(
      `/campaigns/${campaignId}/recipients/${recipientId}/confirm-manual`,
      {method: 'POST'}
    ),

  markRecipientFailed: (
    campaignId: number,
    recipientId: number,
    errorMessage?: string
  ) =>
    request<CampaignDetail>(
      `/campaigns/${campaignId}/recipients/${recipientId}/mark-failed`,
      {
        method: 'POST',
        body: JSON.stringify({error_message: errorMessage || 'Falha informada pelo operador.'}),
      }
    ),

  dispatchAutomaticCampaign: (campaignId: number) =>
    request<AutomaticDispatchResponse>(`/campaigns/${campaignId}/dispatch-automatic`, {
      method: 'POST',
    }),

  seedDemoData: () =>
    request<DemoSeedResponse>('/demo/seed', {
      method: 'POST',
    }),

  clearDemoData: () =>
    request<{message: string}>('/demo/clear', {
      method: 'DELETE',
    }),

  downloadImportTemplate: async () => {
    const response = await fetch(`${API_BASE}/clients/import/template`);
    if (!response.ok) {
      throw new ApiError('Não foi possível baixar o modelo Excel.', response.status);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'modelo_importacao_clientes.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  previewClientImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<ImportPreviewResponse>('/clients/import/preview', {
      method: 'POST',
      body: formData,
    });
  },

  confirmClientImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<ImportConfirmResponse>('/clients/import/confirm', {
      method: 'POST',
      body: formData,
    });
  },
};
