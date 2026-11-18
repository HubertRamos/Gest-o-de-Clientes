export type CampaignFormat = 'general' | 'segmented';
export type CampaignSendMode = 'manual' | 'automatic';
export type CampaignStatus =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'completed_with_errors';
export type RecipientStatus =
  | 'prepared'
  | 'whatsapp_opened'
  | 'sent_manual'
  | 'sent_simulated'
  | 'sent_api'
  | 'failed';

export interface Client {
  id: number;
  name: string;
  phone_normalized: string;
  phone_formatted: string;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  whatsapp_opt_in: boolean;
  opt_out_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientPayload {
  name: string;
  phone: string;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  whatsapp_opt_in: boolean;
}

export interface MessageTemplate {
  id: number;
  title: string;
  content: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageTemplatePayload {
  title: string;
  content: string;
}

export interface CampaignSummaryCounts {
  total_recipients: number;
  prepared: number;
  whatsapp_opened: number;
  sent_manual: number;
  sent_simulated: number;
  sent_api: number;
  failed: number;
  pending: number;
  sent_total: number;
}

export interface CampaignGroup {
  id: number;
  name: string;
  template_id: number | null;
  message_content: string;
  position: number;
  recipient_count: number;
}

export interface CampaignRecipient {
  id: number;
  campaign_id: number;
  group_id: number | null;
  group_name: string | null;
  client_id: number | null;
  client_name: string;
  client_phone_normalized: string;
  client_phone_formatted: string;
  rendered_message: string;
  status: RecipientStatus;
  whatsapp_url: string;
  opened_at: string | null;
  sent_at: string | null;
  external_message_id: string | null;
  error_message: string | null;
}

export interface CampaignSummary {
  id: number;
  name: string;
  format: CampaignFormat;
  send_mode: CampaignSendMode;
  status: CampaignStatus;
  provider_mode: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  counts: CampaignSummaryCounts;
}

export interface CampaignDetail extends CampaignSummary {
  template_id: number | null;
  message_content: string | null;
  groups: CampaignGroup[];
  recipients: CampaignRecipient[];
}

export interface CampaignCreatePayload {
  name: string;
  format: CampaignFormat;
  send_mode: CampaignSendMode;
  template_id?: number | null;
  message_content?: string | null;
  client_ids?: number[];
  groups?: {
    name: string;
    template_id?: number | null;
    message_content: string;
    client_ids: number[];
  }[];
}

export interface AutomaticDispatchResponse {
  campaign: CampaignDetail;
  is_simulation: boolean;
  notice: string;
  processed_count: number;
  simulated_count: number;
  sent_api_count: number;
  failed_count: number;
}

export interface InactiveContactReminder {
  client_id: number;
  client_name: string;
  phone_formatted: string;
  last_sent_at: string | null;
  days_without_message: number;
  never_messaged: boolean;
}

export interface DashboardSummary {
  total_clients: number;
  active_clients: number;
  opted_in_clients: number;
  total_campaigns: number;
  total_templates: number;
  delivery_summary: {
    total_recipients: number;
    sent_manual: number;
    sent_simulated: number;
    sent_api: number;
    pending: number;
    failed: number;
  };
  recent_campaigns: CampaignSummary[];
  inactive_contact_reminders: InactiveContactReminder[];
  database_mode: string;
  whatsapp_provider_mode: string;
}

export interface DemoSeedResponse {
  created_clients: number;
  created_templates: number;
  created_campaigns: number;
  message: string;
}

export type ImportRowStatus = 'valid' | 'duplicate' | 'error';

export interface ImportRowPreview {
  row_number: number;
  name: string;
  phone_raw: string;
  phone_normalized: string | null;
  phone_formatted: string | null;
  address: string | null;
  notes: string | null;
  whatsapp_opt_in: boolean;
  status: ImportRowStatus;
  reason: string | null;
}

export interface ImportPreviewSummary {
  total_rows: number;
  valid_count: number;
  duplicate_count: number;
  error_count: number;
}

export interface ImportPreviewResponse {
  filename: string;
  summary: ImportPreviewSummary;
  rows: ImportRowPreview[];
}

export interface ImportConfirmResponse {
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  imported_clients: Client[];
  skipped_rows: ImportRowPreview[];
  message: string;
}
