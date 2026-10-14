import { useSearchParams } from 'react-router-dom';
import { colors, styles } from '../../theme';
import AdminGate from '../../components/AdminGate';
import ImportWizard from './ImportWizard';

/**
 * AdminImportPage — importador global de resultados.
 * Reescrito sobre ImportWizard: acepta CSV/XLSX/XLS, autodetecta cabeceras,
 * valida UID contra players y recuerda mapeos. Cuando se abre con
 * ?match_id= ese destino se aplica a filas sin columna de partida.
 */
function Import() {
  const [params] = useSearchParams();
  const currentMatchId = params.get('match_id') || undefined;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Importar Resultados</h1>
      <p style={{ color: colors.muted, margin: '0 0 16px' }}>
        Asistente inteligente: acepta <code style={{ color: colors.accent }}>.csv</code>,{' '}
        <code style={{ color: colors.accent }}>.xlsx</code> y <code style={{ color: colors.accent }}>.xls</code>{' '}
        (incluidas descargas de Google Sheets). Detecta la cabecera, propone el mapeo de columnas,
        valida los UID contra el registro de jugadores y nunca inventa estadísticas.
      </p>
      {currentMatchId && (
        <p style={{ color: colors.info, fontSize: 13, margin: '0 0 16px' }}>
          Partida destino por defecto: {currentMatchId} (se usa solo en filas sin columna de partida).
        </p>
      )}
      <div style={{ ...styles.card, padding: 20 }}>
        <ImportWizard matchId={currentMatchId} allowMatchIdColumn />
      </div>
    </div>
  );
}

export default function AdminImportPage() {
  return (
    <AdminGate staffOnly>
      <Import />
    </AdminGate>
  );
}
