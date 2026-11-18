import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FlaskConical,
  Send,
} from 'lucide-react';
import type {CampaignStatus, RecipientStatus} from '../types/api';

export function CampaignStatusLabel({status}: {status: CampaignStatus}) {
  switch (status) {
    case 'draft':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          Preparada
        </span>
      );
    case 'in_progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <Clock className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
          Em andamento
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Concluída
        </span>
      );
    case 'completed_with_errors':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
          <AlertCircle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
          Concluída com falhas
        </span>
      );
  }
}

export function RecipientStatusLabel({status}: {status: RecipientStatus}) {
  switch (status) {
    case 'prepared':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          Mensagem preparada
        </span>
      );
    case 'whatsapp_opened':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <ExternalLink className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
          Link do WhatsApp aberto
        </span>
      );
    case 'sent_manual':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Envio confirmado manualmente
        </span>
      );
    case 'sent_simulated':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700">
          <FlaskConical className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
          Envio simulado
        </span>
      );
    case 'sent_api':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <Send className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Envio confirmado pela API oficial
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
          <AlertCircle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
          Falha no envio
        </span>
      );
  }
}
