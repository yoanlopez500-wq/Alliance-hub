import SectionTabs, { useTabParam } from '../../components/SectionTabs';
import AdminMatchesPage from './AdminMatchesPage';
import AdminGamesPage from './AdminGamesPage';

const TABS = [
  { id: 'partidas', label: '🎯 Partidas' },
  { id: 'games', label: '🕹 Games (v1)' },
];

/**
 * AdminPartidasPage — gestion de partidas unificada: el CRUD v2 y las
 * "games" heredadas del v1 como pestanas de una sola pagina (antes eran
 * dos paginas duplicadas, /admin/partidas y /admin/games).
 */
export default function AdminPartidasPage() {
  const [tab, setTab] = useTabParam(TABS.map((t) => t.id));
  return (
    <div>
      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'partidas' ? <AdminMatchesPage /> : <AdminGamesPage />}
    </div>
  );
}
