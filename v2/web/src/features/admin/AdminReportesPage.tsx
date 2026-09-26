import SectionTabs, { useTabParam } from '../../components/SectionTabs';
import AdminReportsPage from './AdminReportsPage';
import AdminChatReportsPage from './AdminChatReportsPage';
import AdminInboxPage from './AdminInboxPage';

const TABS = [
  { id: 'jugadores', label: '🚩 Reportes de jugadores' },
  { id: 'chat', label: '💬 Reportes de chat' },
  { id: 'bandeja', label: '📥 Bandeja de entrada' },
];

/**
 * AdminReportesPage — bandeja unificada: reportes de jugadores, reportes de
 * chat y mensajes a la bandeja como pestanas de una sola pagina. Antes eran
 * tres paginas (y tres entradas de nav) para "cosas pendientes de revisar".
 */
export default function AdminReportesPage() {
  const [tab, setTab] = useTabParam(TABS.map((t) => t.id));
  return (
    <div>
      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'jugadores' && <AdminReportsPage />}
      {tab === 'chat' && <AdminChatReportsPage />}
      {tab === 'bandeja' && <AdminInboxPage />}
    </div>
  );
}
