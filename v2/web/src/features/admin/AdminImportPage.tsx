import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import Loader from '../../components/Loader';

interface CsvRow {
  player_id: number;
  kills: number;
  deaths: number;
  match_id: string | null;
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: 12, color: colors.muted, fontSize: 12, background: colors.cardAlt };

/** AdminImportPage — puerto de admin-import.js (CSV player_id,kills,deaths[,match_id]). */
function Import() {
  const [params] = useSearchParams();
  const currentMatchId = params.get('match_id');
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.name.endsWith('.csv')) { setError('Solo archivos CSV'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => parseAndPreview(String(e.target?.result || ''));
    reader.readAsText(file);
  }

  function parseAndPreview(csvText: string) {
    const lines = csvText.split('\n').filter((l) => l.trim());
    const results: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 3) {
        const pid = parseInt(cols[0].trim());
        const kills = parseInt(cols[1].trim()) || 0;
        const deaths = parseInt(cols[2].trim()) || 0;
        const mid = cols[3] ? cols[3].trim() : null;
        if (pid) results.push({ player_id: pid, kills, deaths, match_id: mid });
      }
    }
    setRows(results.slice(0, 300));
    setTotalRows(results.length);
  }

  async function importAll() {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    setError('');
    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const matchId = r.match_id || currentMatchId;
        if (!matchId) continue;
        const { error: uErr } = await publicDb.from('match_results').upsert(
          { match_id: matchId, player_id: r.player_id, kills: r.kills, deaths: r.deaths },
          { onConflict: 'match_id,player_id' },
        );
        if (uErr) throw uErr;
      }
      showToast(rows.length + ' resultados importados');
      setRows(null);
    } catch (e: any) {
      setError(e.message || 'Error importando');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Importar Resultados (Legacy)</h1>
      <p style={{ color: colors.muted, margin: '0 0 8px' }}>
        Formato: <code style={{ color: colors.accent }}>player_id,kills,deaths[,match_id]</code>
      </p>
      {currentMatchId && <p style={{ color: colors.info, fontSize: 13, margin: '0 0 16px' }}>Partida destino: {currentMatchId}</p>}

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}
      {toast && <div style={{ background: colors.success + '20', color: colors.success, padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{toast}</div>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? colors.accent : colors.border}`, borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer', color: colors.muted }}
      >
        Arrastra un CSV aquí o haz clic para seleccionar
      </div>
      <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />

      {rows && (
        <div style={{ marginTop: 24 }}>
          <div style={{ overflowX: 'auto', background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Player ID</th>
                  <th style={thStyle}>Kills</th>
                  <th style={thStyle}>Deaths</th>
                  <th style={thStyle}>Match ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: 12 }}>{r.player_id}</td>
                    <td style={{ padding: 12 }}>{r.kills}</td>
                    <td style={{ padding: 12 }}>{r.deaths}</td>
                    <td style={{ padding: 12 }}>{r.match_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalRows > rows.length && <p style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>… y {totalRows - rows.length} filas más (se importarán todas)</p>}
          <div style={{ marginTop: 16 }}>
            {importing ? <Loader label="Importando…" /> : (
              <Button onClick={importAll}>Importar {totalRows} resultados</Button>
            )}
          </div>
        </div>
      )}
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
