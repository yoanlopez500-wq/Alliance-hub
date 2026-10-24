import { useMemo, useRef, useState } from 'react';
import { colors, styles } from '../../theme';
import { badgeStyle } from '../../lib/format';
import Reveal from '../../components/Reveal';
import {
  RULES_VERSION, RULES_NOTES, UPKEEP_PER_PROVINCE, confidenceScore,
  dangerIndex, emptyProvince, evaluateTargets, indexLevel, nationVpPerDay,
  netProduction, ownWeakPoints, productionPerDay, replacementPerDay,
  revoltRiskPerDay, spawnHp, sustainabilityIndex, vulnerabilityIndex,
  type NationInput, type ProvinceInput, type Scenario,
} from './rules';
import { parseDelimitedText, parseFile, toNationInput, type ParseResult } from './parse';

/**
 * Centro de Inteligencia: calculadora estrategica 100% cliente de
 * Supremacy 1914. Formulario progresivo (N0 archivo opcional, N1 rapido,
 * N2 economico, N3 desgaste) + motor de decision ramificado.
 */

type LevelKey = 'n0' | 'n1' | 'n2' | 'n3';

const LEVELS: { key: LevelKey; title: string; desc: string }[] = [
  { key: 'n0', title: '📁 Nivel 0 — Datos del juego', desc: 'Excel/CSV/TXT opcional: sube el archivo o pega el contenido y se rellena solo.' },
  { key: 'n1', title: '⚡ Nivel 1 — Lo esencial', desc: 'Provincias y moral. Con esto ya salen produccion y vulnerabilidad.' },
  { key: 'n2', title: '🏭 Nivel 2 — Economia', desc: 'Dobles, recursos, ferrocarril, puerto, fabrica y cuarteles.' },
  { key: 'n3', title: '💥 Nivel 3 — Desgaste', desc: 'Bajas y muertes por dia de cada nacion. Activa peligro y sostenibilidad.' },
];

function emptyNation(name = ''): NationInput {
  return { name, provinces: [emptyProvince('Capital')], killsPerDay: undefined, deathsPerDay: undefined };
}

export default function IntelPage() {
  const [open, setOpen] = useState<Record<LevelKey, boolean>>({ n0: true, n1: true, n2: false, n3: false });
  const [me, setMe] = useState<NationInput>(() => emptyNation('Mi nacion'));
  const [targets, setTargets] = useState<NationInput[]>([]);
  const [scenario, setScenario] = useState<Scenario>('medio');
  const [parseMsg, setParseMsg] = useState('');

  const confidence = useMemo(
    () => confidenceScore({ nations: [me, ...targets], killsKnown: targets.some((t) => t.killsPerDay !== undefined) }),
    [me, targets],
  );

  const analysis = useMemo(() => {
    const myVuln = vulnerabilityIndex(me);
    const mySust = sustainabilityIndex(me);
    const myNet = netProduction(me);
    const myRepl = replacementPerDay(me);
    const vp = nationVpPerDay(me);
    const dangerPerTarget = targets.map((t) => ({ name: t.name, value: dangerIndex(t) }));
    const ranked = evaluateTargets(targets, scenario, dangerIndex(me));
    const weak = ownWeakPoints(me);
    const level = (v: number) => indexLevel(v, 3, 6, 8);
    return { myVuln, mySust, myNet, myRepl, vp, dangerPerTarget, ranked, weak, level };
  }, [me, targets, scenario]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setParseMsg('Leyendo…');
    const res = await parseFile(file);
    applyParse(res.ok ? `Archivo leido: ${res.nations.length} nacion(es) detectada(s).` : (res.error ?? ''), res);
  }

  function onPaste(text: string) {
    if (!text.trim()) return;
    const res = parseDelimitedText(text);
    applyParse(res.ok ? `Texto analizado: ${res.nations.length} nacion(es) detectada(s).` : (res.error ?? ''), res);
  }

  function applyParse(msg: string, res: ParseResult) {
    if (res.ok && res.nations.length) {
      setTargets(res.nations.map(toNationInput));
      setOpen((o) => ({ ...o, n1: true, n2: true, n3: true }));
    }
    setParseMsg(msg);
  }

  return (
    <div className="ah-intel">
      <Reveal>
        <h1 style={{ color: colors.text, margin: '0 0 4px' }}>
          🧠 Centro de Inteligencia{' '}
          <span style={{ ...badgeStyle('rgba(255,213,79,0.15)', '#ffd54f'), fontSize: 12, verticalAlign: 'middle' }}>🧪 Experimental</span>
        </h1>
        <p style={{ color: colors.muted, margin: '0 0 16px' }}>
          Calculadora estrategica de Supremacy 1914. 100% en tu navegador: tus datos no salen de aqui.
          Reglas v{RULES_VERSION}. Funcion en fase experimental: las formulas y los indices se estan
          afinando y pueden cambiar entre versiones.
        </p>
        <ConfidenceBar value={confidence} />
      </Reveal>

      {/* NIVEL 0 */}
      <Level open={open.n0} title={LEVELS[0].title} desc={LEVELS[0].desc} onToggle={() => setOpen((o) => ({ ...o, n0: !o.n0 }))}>
        <Nivel0 onFile={onFile} onPaste={onPaste} msg={parseMsg} />
      </Level>

      {/* NIVEL 1+2: mi nacion */}
      <Level open={open.n1} title={LEVELS[1].title} desc={LEVELS[1].desc} onToggle={() => setOpen((o) => ({ ...o, n1: !o.n1 }))}>
        <NationEditor nation={me} onChange={setMe} />
        <Level open={open.n2} title={LEVELS[2].title} desc={LEVELS[2].desc} onToggle={() => setOpen((o) => ({ ...o, n2: !o.n2 }))} nested>
          <p style={{ color: colors.muted, fontSize: 13, margin: '4px 0 10px' }}>
            Los datos economicos se editan en cada fila de provincia de arriba (doble, recurso, infraestructura, cuartel).
          </p>
        </Level>
        <Level open={open.n3} title={LEVELS[3].title} desc={LEVELS[3].desc} onToggle={() => setOpen((o) => ({ ...o, n3: !o.n3 }))} nested>
          <WearFields nation={me} onChange={setMe} />
        </Level>
      </Level>

      {/* OBJETIVOS */}
      <Reveal>
        <div style={{ ...styles.card, marginTop: 20 }}>
          <div style={styles.rowBetween}>
            <h3 style={{ color: colors.text, margin: 0 }}>🎯 Naciones objetivo</h3>
            <button style={styles.btnGhost} onClick={() => setTargets((t) => [...t, emptyNation(`Objetivo ${t.length + 1}`)])}>+ Añadir</button>
          </div>
          {targets.length === 0 && (
            <p style={{ color: colors.muted, fontSize: 13 }}>Añade un objetivo manualmente o importa un archivo en el Nivel 0.</p>
          )}
          {targets.map((t, i) => (
            <div key={i} style={{ marginTop: 14, padding: 12, borderRadius: 10, background: colors.bg, border: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  style={{ ...styles.input, flex: 1, minWidth: 140, marginBottom: 0 }}
                  value={t.name}
                  placeholder="Nombre de la nacion"
                  onChange={(e) => setTargets((ts) => ts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <button
                  style={{ ...styles.btnGhost, padding: '8px 12px', color: colors.danger }}
                  onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))}
                >Quitar</button>
              </div>
              {open.n3 && <WearFields nation={t} onChange={(n) => setTargets((ts) => ts.map((x, j) => (j === i ? n : x)))} />}
              <NationEditor nation={t} onChange={(n) => setTargets((ts) => ts.map((x, j) => (j === i ? n : x)))} />
            </div>
          ))}
        </div>
      </Reveal>

      {/* RESULTADOS */}
      <Reveal>
        <div style={{ ...styles.card, marginTop: 20 }} className="ah-glow">
          <h3 style={{ color: colors.text, marginTop: 0 }}>📊 Analisis</h3>
          <div className="ah-intel-grid">
            <Metric label="Produccion neta" value={`${analysis.myNet.toLocaleString()}/dia`} hint={`upkeep ${UPKEEP_PER_PROVINCE}/prov`} />
            <Metric label="Puntos VP/dia" value={analysis.vp.toFixed(1)} />
            <Metric label="Reemplazo" value={`${analysis.myRepl.toFixed(1)} und/dia`} />
            <Metric
              label="Vulnerabilidad propia"
              value={`${analysis.myVuln.toFixed(1)}`}
              hint={analysis.level(analysis.myVuln)}
              color={['#81c784', '#ffd54f', '#ff8f00', '#ef5350'][['bajo', 'moderado', 'alto', 'critico'].indexOf(analysis.level(analysis.myVuln))]}
            />
            <Metric
              label="Sostenibilidad"
              value={`${analysis.mySust.toFixed(1)}/10`}
              color={analysis.mySust >= 6 ? colors.success : analysis.mySust >= 3.5 ? colors.warning : colors.danger}
            />
          </div>
          {analysis.weak.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ color: colors.text, margin: '0 0 8px', fontSize: 14 }}>⚠️ Provincias propias debiles</h4>
              {analysis.weak.map((w) => (
                <p key={w.province} style={{ margin: '0 0 6px', fontSize: 13, color: colors.muted }}>
                  <strong style={{ color: { critico: colors.danger, alto: '#ff8f00', moderado: '#ffd54f' }[w.risk as 'critico' | 'alto' | 'moderado'] }}>{w.risk.toUpperCase()}</strong>{' '}
                  {w.province}: {w.tip}
                </p>
              ))}
            </div>
          )}
        </div>
      </Reveal>

      {/* MOTOR DE DECISION */}
      <Reveal>
        <div style={{ ...styles.card, marginTop: 20 }}>
          <div style={{ ...styles.rowBetween, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ color: colors.text, margin: 0 }}>🗺️ Motor de decision: que provincia atacar</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: colors.muted, fontSize: 12 }}>Guarniciones desconocidas:</span>
              {(['optimista', 'medio', 'pesimista'] as Scenario[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScenario(s)}
                  style={{
                    ...styles.btnGhost, padding: '6px 10px', fontSize: 12, textTransform: 'capitalize',
                    background: scenario === s ? colors.accent : colors.border, color: '#fff',
                  }}
                >{s}</button>
              ))}
            </div>
          </div>
          {targets.length === 0 ? (
            <p style={{ color: colors.muted }}>Añade objetivos para obtener recomendaciones.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
                {analysis.dangerPerTarget.map((d) => (
                  <span key={d.name} style={{ fontSize: 12, color: colors.muted }}>
                    {d.name} — peligro <strong style={{ color: d.value >= 6 ? colors.danger : d.value >= 3 ? '#ff8f00' : colors.success }}>{d.value.toFixed(1)}</strong>
                  </span>
                ))}
              </div>
              <div className="ah-intel-grid">
                {analysis.ranked.slice(0, 6).map((r, i) => (
                  <div key={`${r.nation}-${r.province}`} style={{ border: `1px solid ${i === 0 ? colors.accent : colors.border}`, borderRadius: 10, padding: 12, background: colors.bg }}>
                    <div style={styles.rowBetween}>
                      <strong style={{ color: colors.text, fontSize: 14 }}>#{i + 1} {r.province}</strong>
                      <span style={{ color: colors.accent, fontWeight: 800 }}>{r.score}</span>
                    </div>
                    <p style={{ margin: '4px 0', fontSize: 12, color: colors.muted }}>{r.nation}</p>
                    <p style={{ margin: '6px 0 2px', fontSize: 12, color: colors.success }}>✓ {r.reasons.join(' · ')}</p>
                    {r.warnings.map((w) => (
                      <p key={w} style={{ margin: '2px 0', fontSize: 12, color: colors.warning }}>⚠ {w}</p>
                    ))}
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: colors.muted }}>
                      valor {r.valor} / costo {r.costo} / riesgo {r.riesgo} · escenario {r.escenario}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Reveal>

      {/* NOTAS DE REGLAS */}
      <Reveal>
        <div style={{ ...styles.card, marginTop: 20 }}>
          <h3 style={{ color: colors.text, marginTop: 0, fontSize: 14 }}>📜 Reglas usadas (v{RULES_VERSION})</h3>
          {RULES_NOTES.map((n) => (
            <p key={n.id} style={{ margin: '0 0 6px', fontSize: 12, color: colors.muted }}>
              {n.pendiente ? '🔬' : '•'} {n.text}
            </p>
          ))}
        </div>
      </Reveal>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...styles.rowBetween, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: colors.muted }}>Confianza del analisis</span>
        <span style={{ fontSize: 12, color: value >= 70 ? colors.success : value >= 40 ? colors.warning : colors.danger, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: colors.cardAlt, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: value >= 70 ? colors.success : value >= 40 ? colors.warning : colors.danger, transition: 'width .4s' }} />
      </div>
      <p style={{ fontSize: 11, color: colors.muted, margin: '4px 0 0' }}>Sube datos (N0-N3) para mejorar la precision.</p>
    </div>
  );
}

function Level({ open, title, desc, onToggle, nested, children }: {
  open: boolean; title: string; desc: string; onToggle: () => void; nested?: boolean; children: React.ReactNode;
}) {
  return (
    <Reveal>
      <div style={{ ...styles.card, marginTop: nested ? 12 : 20, background: nested ? colors.bg : colors.cardAlt }}>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}>
          <div style={styles.rowBetween}>
            <h3 style={{ color: colors.text, margin: 0, fontSize: 16 }}>{title}</h3>
            <span style={{ color: colors.accent }}>{open ? '▾' : '▸'}</span>
          </div>
          <p style={{ color: colors.muted, fontSize: 13, margin: '4px 0 0' }}>{desc}</p>
        </button>
        {open && <div style={{ marginTop: 12 }}>{children}</div>}
      </div>
    </Reveal>
  );
}

function Nivel0({ onFile, onPaste, msg }: {
  onFile: (f: File | undefined) => void; onPaste: (t: string) => void; msg: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [paste, setPaste] = useState('');
  const [drag, setDrag] = useState(false);
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? colors.accent : colors.border}`, borderRadius: 12,
          padding: '22px 14px', textAlign: 'center', cursor: 'pointer', color: colors.muted, fontSize: 14,
        }}
      >
        Arrastra aqui el Excel/CSV/TXT del juego (o haz clic para elegirlo). Opcional.
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <textarea
        style={{ ...styles.input, minHeight: 80, marginTop: 10, fontFamily: 'monospace', fontSize: 12 }}
        placeholder="…o pega aqui filas copiadas (CSV/TSV con cabecera: username, kills, deaths, morale, province…)"
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
      />
      {paste.trim() && (
        <button style={styles.btnPrimary} onClick={() => { onPaste(paste); setPaste(''); }}>Analizar texto pegado</button>
      )}
      {msg && <p style={{ color: colors.info, fontSize: 13, margin: '10px 0 0' }}>{msg}</p>}
    </div>
  );
}

function WearFields({ nation, onChange }: { nation: NationInput; onChange: (n: NationInput) => void }) {
  const fld = (label: string, key: 'killsPerDay' | 'deathsPerDay') => (
    <label style={{ fontSize: 12, color: colors.muted, display: 'block', flex: 1, minWidth: 110 }}>
      {label}
      <input
        type="number" min={0} step="0.5"
        style={{ ...styles.input, marginTop: 4, marginBottom: 0 }}
        value={nation[key] ?? ''}
        placeholder="desconocido"
        onChange={(e) => onChange({ ...nation, [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
      {fld('Bajas/dia', 'killsPerDay')}
      {fld('Muertes/dia', 'deathsPerDay')}
    </div>
  );
}

function NationEditor({ nation, onChange }: {
  nation: NationInput; onChange: (n: NationInput) => void;
}) {
  const setProv = (i: number, patch: Partial<ProvinceInput>) =>
    onChange({ ...nation, provinces: nation.provinces.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 760;
  return (
    <div>
      <div style={{ ...styles.rowBetween, marginBottom: 8 }}>
        <input
          style={{ ...styles.input, maxWidth: 260, marginBottom: 0 }}
          value={nation.name}
          placeholder="Nombre de tu nacion"
          onChange={(e) => onChange({ ...nation, name: e.target.value })}
        />
        <button style={{ ...styles.btnGhost, padding: '8px 12px' }} onClick={() => onChange({ ...nation, provinces: [...nation.provinces, emptyProvince(`Provincia ${nation.provinces.length + 1}`)] })}>
          + Provincia
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: isMobile ? 560 : 0 }}>
          <thead>
            <tr style={{ color: colors.muted, textAlign: 'left' }}>
              <th style={th}>Provincia</th><th style={th}>Moral</th><th style={th}>Doble</th>
              <th style={th}>Recurso</th><th style={th}>Ferr.</th><th style={th}>Puer.</th>
              <th style={th}>Fab</th><th style={th}>Cuart.</th><th style={th}>Guarn.</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {nation.provinces.map((p, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${colors.border}` }}>
                <td style={td}><input style={cellInput} value={p.name} onChange={(e) => setProv(i, { name: e.target.value })} /></td>
                <td style={td}><input style={{ ...cellInput, width: 52 }} type="number" min={0} max={100} value={p.morale} onChange={(e) => setProv(i, { morale: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></td>
                <td style={td}><input type="checkbox" checked={p.isDouble} onChange={(e) => setProv(i, { isDouble: e.target.checked })} /></td>
                <td style={td}>
                  <select style={{ ...cellInput, width: 88 }} value={p.resource} onChange={(e) => setProv(i, { resource: e.target.value as ProvinceInput['resource'] })}>
                    {['ninguno', 'grano', 'madera', 'hierro', 'carbon', 'aceite', 'gas', 'peces', 'articulos de lujo'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={td}><input type="checkbox" checked={p.railway} onChange={(e) => setProv(i, { railway: e.target.checked })} /></td>
                <td style={td}><input type="checkbox" checked={p.harbor} onChange={(e) => setProv(i, { harbor: e.target.checked })} /></td>
                <td style={td}><input style={{ ...cellInput, width: 40 }} type="number" min={0} max={5} value={p.factoryLevel} onChange={(e) => setProv(i, { factoryLevel: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })} /></td>
                <td style={td}>
                  <select style={{ ...cellInput, width: 46 }} value={p.barracksLevel} onChange={(e) => setProv(i, { barracksLevel: Number(e.target.value) })}>
                    {[0, 1, 2].map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </td>
                <td style={td}><input style={{ ...cellInput, width: 48 }} type="number" min={0} placeholder="?" value={p.garrison ?? ''} onChange={(e) => setProv(i, { garrison: e.target.value === '' ? undefined : Number(e.target.value) })} /></td>
                <td style={td}>
                  <button style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer' }} onClick={() => onChange({ ...nation, provinces: nation.provinces.filter((_, j) => j !== i) })}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nation.provinces.length > 0 && (
        <p style={{ fontSize: 11, color: colors.muted, margin: '8px 0 0' }}>
          Produccion total: {nation.provinces.reduce((s, p) => s + productionPerDay(p), 0).toLocaleString()}/dia
          {nation.provinces.some((p) => p.barracksLevel >= 2) &&
            ` · con cuartel nvl2 tus defensores spawnearan con ${spawnHp(nation.provinces.find((p) => p.barracksLevel >= 2)!)} PV`}
          {nation.provinces.some((p) => p.morale < 33) &&
            ` · revuelta maxima: ${(Math.max(...nation.provinces.filter((p) => p.morale < 33).map((p) => revoltRiskPerDay(p.morale))) * 100).toFixed(0)}%/dia`}
        </p>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '4px 4px' };
const cellInput: React.CSSProperties = {
  width: '100%', padding: '5px 6px', borderRadius: 6, fontSize: 12,
  border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, boxSizing: 'border-box',
};

function Metric({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
      <p style={{ margin: 0, fontSize: 11, color: colors.muted }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: color ?? colors.text }}>{value}</p>
      {hint && <p style={{ margin: '2px 0 0', fontSize: 11, color: colors.muted }}>{hint}</p>}
    </div>
  );
}
