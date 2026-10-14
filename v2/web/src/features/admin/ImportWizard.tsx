import { useMemo, useRef, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors, styles } from '../../theme';
import Button from '../../components/Button';
import Loader from '../../components/Loader';
import { Select } from '../../components/Field';
import { parseFileToMatrix } from '../../lib/importer/parse';
import { detectHeaderRow, buildColumns } from '../../lib/importer/analyze';
import {
  targetFields, suggestMapping, headerSignature,
  loadRememberedMapping, saveRememberedMapping,
  type ColumnMapping,
} from '../../lib/importer/mapping';
import {
  buildRows, applyExistence, summarize, importableRows, computeKd,
  type ValidatedRow, type ValidationSummary,
} from '../../lib/importer/validate';

export interface ImportReport {
  imported: number;
  omitted: number;
  byReason: Record<string, number>;
  playerIds: number[]; // jugadores realmente importados (p.ej. para auto-registrar)
}

type Step = 'upload' | 'mapping' | 'validate' | 'importing' | 'report';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ok: { label: 'Listo', color: colors.success },
  unknown_id: { label: 'UID no registrado', color: colors.warning },
  duplicate: { label: 'Duplicado', color: colors.muted },
  invalid_numbers: { label: 'Números no válidos', color: '#f87171' },
  empty: { label: 'Sin UID', color: colors.muted },
};

const badgeStyle: React.CSSProperties = { display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: colors.muted, fontSize: 12, background: colors.cardAlt, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 13 };

/**
 * Asistente de importacion de resultados (CSV/XLSX/XLS).
 * - Deteccion automatica de fila de cabecera y sugerencia de columnas.
 * - Memoria de mapeos por firma de cabecera (localStorage).
 * - Validacion contra la tabla players (batch) antes de escribir nada.
 * - Upsert por chunks; kd_ratio con la formula canonica del proyecto.
 */
export default function ImportWizard({ matchId, allowMatchIdColumn = false, onDone, onCancel }: {
  matchId?: string;
  allowMatchIdColumn?: boolean;
  onDone?: (r: ImportReport) => void;
  onCancel?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [matrix, setMatrix] = useState<unknown[][] | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busyMsg, setBusyMsg] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fields = useMemo(() => targetFields(allowMatchIdColumn), [allowMatchIdColumn]);
  const columns = useMemo(() => (matrix ? buildColumns(matrix, headerRow) : []), [matrix, headerRow]);

  const requiredOk = fields.filter((f) => f.required).every((f) => mapping[f.key] != null);

  async function handleFile(file: File) {
    setError('');
    setBusyMsg('Analizando archivo…');
    try {
      const m = await parseFileToMatrix(file);
      if (!m.length) throw new Error('El archivo esta vacio');
      const detected = detectHeaderRow(m);
      const hdr = detected >= 0 ? detected : 0;
      setMatrix(m);
      setFileName(file.name);
      setHeaderRow(hdr);
      const keys = buildColumns(m, hdr).map((c) => c);
      const remembered = loadRememberedMapping(headerSignature(keys), allowMatchIdColumn);
      setMapping(remembered ?? suggestMapping(keys, allowMatchIdColumn));
      setSummary(null);
      setExcluded(new Set());
      setReport(null);
      setStep('mapping');
    } catch (e: any) {
      setError(e?.message || 'No se pudo leer el archivo');
    } finally {
      setBusyMsg('');
    }
  }

  async function goValidate() {
    if (!matrix) return;
    setError('');
    setBusyMsg('Validando jugadores…');
    try {
      const keys = buildColumns(matrix, headerRow);
      saveRememberedMapping(headerSignature(keys), mapping);
      const rows = buildRows(matrix, headerRow, mapping);
      const ids = Array.from(new Set(rows.map((r) => r.player_id).filter((x): x is number => x != null)));
      let existing = new Set<number>();
      if (ids.length) {
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { data, error: qErr } = await publicDb.from('players').select('id').in('id', chunk);
          if (qErr) throw new Error(qErr.message);
          (data || []).forEach((p: any) => existing.add(Number(p.id)));
        }
      }
      applyExistence(rows, existing);
      const s = summarize(rows);
      // Pre-excluir problemas graves (duplicados/invalidos/vacios): el usuario
      // puede re-incluirlos en la tabla. unknown_id siempre excluido (no escribimos ids falsos).
      const pre = new Set<number>();
      rows.forEach((r) => {
        if (r.status === 'unknown_id' || r.status === 'duplicate' || r.status === 'invalid_numbers' || r.status === 'empty') pre.add(r.rowIndex);
      });
      setExcluded(pre);
      setSummary(s);
      setStep('validate');
    } catch (e: any) {
      setError(e?.message || 'Error validando');
    } finally {
      setBusyMsg('');
    }
  }

  async function doImport() {
    if (!summary) return;
    setError('');
    setStep('importing');
    try {
      const rows = importableRows(summary.rows).filter((r) => !excluded.has(r.rowIndex));
      const byReason: Record<string, number> = {};
      summary.rows.forEach((r) => {
        if (r.status !== 'ok' || excluded.has(r.rowIndex)) {
          const key = STATUS_LABEL[r.status]?.label ?? r.status;
          byReason[key] = (byReason[key] || 0) + 1;
        }
      });
      let imported = 0;
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        setBusyMsg(`Importando ${Math.min(i + CHUNK, rows.length)}/${rows.length}…`);
        const chunk = rows.slice(i, i + CHUNK);
        for (const r of chunk) {
          const target = r.match_id || matchId;
          if (!target) continue;
          const payload: Record<string, unknown> = {
            match_id: target,
            player_id: r.player_id,
            kills: r.kills,
            deaths: r.deaths,
            kd_ratio: computeKd(r.kills!, r.deaths!),
          };
          if (r.nation) payload.nation = r.nation;
          const { error: upErr } = await publicDb
            .from('match_results')
            .upsert(payload, { onConflict: 'match_id,player_id' });
          if (upErr) throw new Error(upErr.message);
          imported++;
        }
      }
      const rep: ImportReport = { imported, omitted: summary.total - imported, byReason, playerIds: rows.map((r) => r.player_id!) };
      setReport(rep);
      setStep('report');
      onDone?.(rep);
    } catch (e: any) {
      setError(e?.message || 'Error importando');
      setStep('validate');
    } finally {
      setBusyMsg('');
    }
  }

  function reset() {
    setStep('upload');
    setMatrix(null);
    setSummary(null);
    setExcluded(new Set());
    setReport(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const dropZone = (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
      onClick={() => fileRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? colors.accent : colors.border}`,
        borderRadius: 10, padding: '28px 16px', textAlign: 'center',
        cursor: 'pointer', color: colors.muted, fontSize: 14,
        background: dragOver ? colors.cardAlt : 'transparent',
      }}
    >
      Arrastra aqui tu archivo o haz clic para seleccionarlo
      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>.csv, .xlsx o .xls — descargas directas de Google Sheets incluidas</div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );

  return (
    <div>
      {error && <div style={{ ...badgeStyle, background: 'rgba(248,113,113,0.12)', color: '#f87171', marginBottom: 12 }}>{error}</div>}

      {step === 'upload' && (
        <>
          {busyMsg ? <Loader label={busyMsg} /> : dropZone}
          {onCancel && <div style={{ marginTop: 12, textAlign: 'right' }}><Button variant="ghost" onClick={onCancel}>Cancelar</Button></div>}
        </>
      )}

      {step === 'mapping' && matrix && (
        <>
          <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
            <strong style={{ color: colors.text }}>{fileName}</strong> — {matrix.length} filas. Ajusta la fila de cabecera y el mapeo de columnas.
          </p>
          <label style={{ display: 'block', fontSize: 13, color: colors.muted, marginBottom: 6 }}>
            Fila de cabecera
            <Select
              value={headerRow}
              onChange={(e) => {
                const h = parseInt(e.target.value, 10);
                setHeaderRow(h);
                const keys = buildColumns(matrix, h);
                setMapping(loadRememberedMapping(headerSignature(keys), allowMatchIdColumn) ?? suggestMapping(keys, allowMatchIdColumn));
              }}
              style={{ width: '100%', marginTop: 4 }}
            >
              {matrix.slice(0, 15).map((_, i) => (
                <option key={i} value={i}>Fila {i + 1}{i === headerRow ? ' — seleccionada' : ''}</option>
              ))}
            </Select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, margin: '12px 0' }}>
            {fields.map((f) => (
              <label key={f.key} style={{ fontSize: 13, color: colors.muted }}>
                {f.label}{f.required && <span style={{ color: '#f87171' }}> *</span>}
                <Select
                  value={mapping[f.key] != null ? String(mapping[f.key]) : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMapping((m) => {
                      const next: ColumnMapping = { ...m, [f.key]: v === '' ? undefined : parseInt(v, 10) };
                      // una columna solo mapea a un campo
                      if (v !== '') {
                        for (const k of Object.keys(next) as (keyof ColumnMapping)[]) {
                          if (k !== f.key && next[k] === next[f.key]) next[k] = undefined;
                        }
                      }
                      return next;
                    });
                  }}
                  style={{ width: '100%', marginTop: 4, borderColor: f.required && mapping[f.key] == null ? '#f87171' : undefined }}
                >
                  <option value="">— Sin asignar —</option>
                  {columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
                </Select>
              </label>
            ))}
          </div>
          {/* vista previa de las 5 primeras filas de datos con el mapeo aplicado */}
          <div style={{ overflowX: 'auto', margin: '8px 0 12px' }}>
            <table style={{ ...styles.card, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {fields.filter((f) => mapping[f.key] != null).map((f) => <th key={f.key} style={thStyle}>{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.slice(headerRow + 1, headerRow + 6).map((r, ri) => (
                  <tr key={ri}>
                    {fields.filter((f) => mapping[f.key] != null).map((f) => (
                      <td key={f.key} style={tdStyle}>{String((r as unknown[])[mapping[f.key]!] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!requiredOk && <p style={{ color: '#f87171', fontSize: 13 }}>Asigna al menos ID, bajas y muertes para continuar. No se inventan valores: lo sin asignar no se importa.</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={reset}>Otro archivo</Button>
            <Button onClick={goValidate} disabled={!requiredOk}>Validar</Button>
          </div>
        </>
      )}

      {step === 'validate' && summary && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {(['ok', 'unknown_id', 'duplicate', 'invalid_numbers', 'empty'] as const).map((k) => (
              <span key={k} style={{ ...badgeStyle, background: `${STATUS_LABEL[k].color}22`, color: STATUS_LABEL[k].color }}>
                {summary[k]} {STATUS_LABEL[k].label.toLowerCase()}
              </span>
            ))}
          </div>
          <p style={{ color: colors.muted, fontSize: 13 }}>
            Filas con problemas quedan excluidas (desmarca para incluirlas; los UID no registrados jamas se escriben). La tabla players es la fuente de verdad de los UID.
          </p>
          <div style={{ overflowX: 'auto', maxHeight: '45vh', overflowY: 'auto', marginBottom: 12 }}>
            <table style={{ ...styles.card, width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}></th>
                  <th style={thStyle}>UID</th>
                  <th style={thStyle}>Bajas</th>
                  <th style={thStyle}>Muertes</th>
                  {mapping.nation != null && <th style={thStyle}>Pais</th>}
                  {allowMatchIdColumn && <th style={thStyle}>Partida</th>}
                  <th style={thStyle}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => {
                  const isOk = r.status === 'ok' && !excluded.has(r.rowIndex);
                  const canToggle = r.status !== 'unknown_id';
                  return (
                    <tr key={r.rowIndex} style={{ opacity: excluded.has(r.rowIndex) ? 0.5 : 1 }}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={!excluded.has(r.rowIndex)} disabled={!canToggle}
                          onChange={() => setExcluded((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.rowIndex)) next.delete(r.rowIndex); else next.add(r.rowIndex);
                            return next;
                          })} />
                      </td>
                      <td style={tdStyle}>{r.player_id ?? '—'}</td>
                      <td style={tdStyle}>{r.kills ?? '—'}</td>
                      <td style={tdStyle}>{r.deaths ?? '—'}</td>
                      {mapping.nation != null && <td style={tdStyle}>{r.nation ?? '—'}</td>}
                      {allowMatchIdColumn && <td style={tdStyle}>{r.match_id ?? matchId ?? '—'}</td>}
                      <td style={{ ...tdStyle, color: STATUS_LABEL[r.status].color }}>{STATUS_LABEL[r.status].label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setStep('mapping')}>Atras</Button>
            <Button onClick={doImport} disabled={!summary.rows.some((r) => r.status === 'ok' && !excluded.has(r.rowIndex))}>
              Importar {summary.rows.filter((r) => r.status === 'ok' && !excluded.has(r.rowIndex)).length} resultados
            </Button>
          </div>
        </>
      )}

      {step === 'importing' && <Loader label={busyMsg || 'Importando…'} />}

      {step === 'report' && report && (
        <>
          <p style={{ color: colors.text, fontSize: 15 }}>
            Importacion completada: <strong>{report.imported}</strong> resultados guardados, <strong>{report.omitted}</strong> omitidos.
          </p>
          {Object.keys(report.byReason).length > 0 && (
            <ul style={{ color: colors.muted, fontSize: 13, paddingLeft: 18 }}>
              {Object.entries(report.byReason).map(([k, n]) => <li key={k}>{n} × {k.toLowerCase()}</li>)}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={reset}>Importar otro archivo</Button>
            {onCancel && <Button onClick={onCancel}>Cerrar</Button>}
          </div>
        </>
      )}
    </div>
  );
}

export type { ValidatedRow };
