import SectionTabs, { useTabParam } from '../../components/SectionTabs';
import NovedadesPage from '../changelog/NovedadesPage';
import FuncionesPage from '../guide/FuncionesPage';
import RulesPage from '../rules/RulesPage';
import ApplyLeaderPage from '../apply-leader/ApplyLeaderPage';

const TABS = [
  { id: 'novedades', label: '🆕 Novedades' },
  { id: 'funciones', label: '🧭 Funciones' },
  { id: 'reglas', label: '📜 Reglamento' },
  { id: 'liderazgo', label: '🛡 Cómo ser líder' },
];

/**
 * InfoPage — hub de informacion: novedades, funciones del proyecto,
 * reglamento y alta de liderazgo como secciones (pestanas) de una sola
 * pagina, en lugar de 4 paginas sueltas en el nav. Las rutas viejas
 * (/novedades, /funciones, /reglas, /lider/solicitud) siguen existiendo.
 */
export default function InfoPage() {
  const [tab, setTab] = useTabParam(TABS.map((t) => t.id));
  return (
    <div>
      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'novedades' && <NovedadesPage />}
      {tab === 'funciones' && <FuncionesPage />}
      {tab === 'reglas' && <RulesPage />}
      {tab === 'liderazgo' && <ApplyLeaderPage />}
    </div>
  );
}
