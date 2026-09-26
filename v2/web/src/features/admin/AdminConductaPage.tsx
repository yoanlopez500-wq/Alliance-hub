import SectionTabs, { useTabParam } from '../../components/SectionTabs';
import AdminStrikesPage from './AdminStrikesPage';
import AdminSanctionsEnginePage from './AdminSanctionsEnginePage';

const TABS = [
  { id: 'strikes', label: '⚡ Strikes' },
  { id: 'sanciones', label: '⚖️ Sanciones' },
];

/**
 * AdminConductaPage — conducta unificada: strikes y sanciones como pestanas
 * de una sola pagina (antes /admin/strikes y /admin/sanciones por separado;
 * esas rutas ahora redirigen aqui).
 */
export default function AdminConductaPage() {
  const [tab, setTab] = useTabParam(TABS.map((t) => t.id));
  return (
    <div>
      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'strikes' ? <AdminStrikesPage /> : <AdminSanctionsEnginePage />}
    </div>
  );
}
