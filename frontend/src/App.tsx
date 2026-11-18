import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {
  History,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PlusCircle,
  Users,
  X,
} from 'lucide-react';
import {useState} from 'react';
import {ToastBanner, type ToastMessage} from './components/ToastBanner';
import {CampaignDetailPage} from './pages/CampaignDetailPage';
import {CampaignHistoryPage} from './pages/CampaignHistoryPage';
import {ClientsPage} from './pages/ClientsPage';
import {DashboardPage} from './pages/DashboardPage';
import {NewCampaignPage} from './pages/NewCampaignPage';
import {TemplatesPage} from './pages/TemplatesPage';

type NavPage = 'dashboard' | 'clients' | 'templates' | 'new-campaign' | 'history';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: 1500,
      staleTime: 10_000,
    },
  },
});

const NAV_ITEMS: {id: NavPage; label: string; icon: typeof LayoutDashboard}[] = [
  {id: 'dashboard', label: 'Painel inicial', icon: LayoutDashboard},
  {id: 'clients', label: 'Clientes', icon: Users},
  {id: 'templates', label: 'Mensagens', icon: MessageSquareText},
  {id: 'new-campaign', label: 'Nova campanha', icon: PlusCircle},
  {id: 'history', label: 'Histórico', icon: History},
];

function AppShell() {
  const [page, setPage] = useState<NavPage>('dashboard');
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [preselectedClientIds, setPreselectedClientIds] = useState<number[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const navigateTo = (target: NavPage) => {
    setPage(target);
    setSelectedCampaignId(null);
    setPreselectedClientIds([]);
    setMobileMenuOpen(false);
  };

  const startCampaignForClients = (clientIds: number[]) => {
    setPreselectedClientIds(clientIds);
    setSelectedCampaignId(null);
    setPage('new-campaign');
    setMobileMenuOpen(false);
  };

  const openCampaign = (campaignId: number) => {
    setSelectedCampaignId(campaignId);
    setPage('history');
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {/* Barra superior apenas no celular */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => navigateTo('dashboard')}
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Entregas & Clientes
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={mobileMenuOpen}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Menu lateral desktop e gaveta mobile */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 border-r border-slate-200 bg-white transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Entregas & Clientes
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-1 p-3" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Área principal */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

          {page === 'dashboard' && (
            <DashboardPage
              onNavigate={navigateTo}
              onOpenCampaign={openCampaign}
              onStartCampaignForClients={startCampaignForClients}
              onToast={setToast}
            />
          )}

          {page === 'clients' && <ClientsPage onToast={setToast} />}

          {page === 'templates' && <TemplatesPage onToast={setToast} />}

          {page === 'new-campaign' && (
            <NewCampaignPage
              key={preselectedClientIds.join(',') || 'default'}
              initialClientIds={preselectedClientIds}
              onOpenCampaign={openCampaign}
              onNavigateClients={() => navigateTo('clients')}
              onToast={setToast}
            />
          )}

          {page === 'history' && selectedCampaignId === null && (
            <CampaignHistoryPage
              onOpenCampaign={openCampaign}
              onCreateNew={() => navigateTo('new-campaign')}
              onToast={setToast}
            />
          )}

          {page === 'history' && selectedCampaignId !== null && (
            <CampaignDetailPage
              campaignId={selectedCampaignId}
              onBack={() => setSelectedCampaignId(null)}
              onToast={setToast}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
