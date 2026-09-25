import { useEffect, useMemo, useState } from 'react';
import { publicDb } from '../../lib/api';
import { colors } from '../../theme';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import { Input, Select, TextArea } from '../../components/Field';
import Badge from '../../components/Badge';
import Loader from '../../components/Loader';

interface Formula {
  id: string;
  name: string;
  description: string | null;
  severity: number;
  legend: string | null;
}

interface RuleSection { id: string; title: string }

function parseFormulaLegend(legend: string | null) {
  const base = { penalty_pct: 0, nullifies_kills: false, is_ban: false, ban_duration_hours: null as number | null, rule_section_id: null as string | null };
  if (!legend) return base;
  try {
    const p = JSON.parse(legend);
    return {
      penalty_pct: parseFloat(p.penalty_pct) || 0,
      nullifies_kills: !!p.nullifies_kills,
      is_ban: !!p.is_ban,
      ban_duration_hours: p.ban_duration_hours || null,
      rule_section_id: p.rule_section_id || null,
    };
  } catch {
    const m = legend.match(/(\d+)%/);
    return { ...base, penalty_pct: m ? parseInt(m[1]) : 0, nullifies_kills: /nullif/i.test(legend), is_ban: /ban/i.test(legend) };
  }
}

function buildFormulaLegend(penalty: number, nullifies: boolean, isBan: boolean, banDuration: string, ruleId: string) {
  return JSON.stringify({
    penalty_pct: parseFloat(String(penalty)) || 0,
    nullifies_kills: !!nullifies,
    is_ban: !!isBan,
    ban_duration_hours: isBan ? (banDuration ? parseInt(banDuration) : null) : null,
    rule_section_id: ruleId || null,
  });
}

const SEV: Record<number, { label: string; color: string }> = {
  1: { label: 'LEVE', color: colors.success },
  2: { label: 'MEDIO', color: colors.accent },
  3: { label: 'GRAVE', color: colors.danger },
};

const cardStyle: React.CSSProperties = { background: colors.cardAlt, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: colors.muted, marginBottom: 4 };

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...cardStyle, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: colors.muted }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/** AdminSanctionsEnginePage — puerto de admin-sanctions-engine.js. */
function SanctionsEngine() {
  const [formulas, setFormulas] = useState<Formula[] | null>(null);
  const [rules, setRules] = useState<RuleSection[]>([]);
  const [applied, setApplied] = useState(0);
  const [totalPct, setTotalPct] = useState(0);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fSeverity, setFSeverity] = useState('1');
  const [fPenalty, setFPenalty] = useState('');
  const [fRule, setFRule] = useState('');
  const [fNullifies, setFNullifies] = useState(false);
  const [fIsBan, setFIsBan] = useState(false);
  const [fBanDuration, setFBanDuration] = useState('');
  const [saving, setSaving] = useState(false);
  const [simKills, setSimKills] = useState('');
  const [simStrikes, setSimStrikes] = useState('');
  const [simNullified, setSimNullified] = useState('');

  async function load() {
    setError('');
    try {
      const { data: fData, error: fErr } = await publicDb.from('strike_types').select('*').order('severity');
      if (fErr) throw fErr;
      setFormulas((fData as Formula[]) || []);
      const { data: rData } = await publicDb.from('rule_sections').select('id, title').eq('is_active', true).order('order_index');
      setRules((rData as RuleSection[]) || []);
      const { data: sData } = await publicDb.from('player_sanctions').select('penalty_pct');
      const sList = (sData as { penalty_pct: number }[]) || [];
      setApplied(sList.length);
      setTotalPct(sList.reduce((t, s) => t + (parseFloat(String(s.penalty_pct)) || 0), 0));
    } catch (e: any) {
      setError(e.message || 'Error cargando datos');
    }
  }

  useEffect(() => { load(); }, []);

  const ruleMap = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.title])), [rules]);

  function openModal(f: Formula | null) {
    setEditId(f?.id || '');
    setFName(f?.name || '');
    setFDesc(f?.description || '');
    setFSeverity(String(f?.severity || 1));
    const parsed = parseFormulaLegend(f?.legend || null);
    setFPenalty(String(parsed.penalty_pct || ''));
    setFRule(parsed.rule_section_id || '');
    setFNullifies(parsed.nullifies_kills);
    setFIsBan(parsed.is_ban);
    setFBanDuration(parsed.ban_duration_hours ? String(parsed.ban_duration_hours) : '');
    setModalOpen(true);
  }

  async function saveFormula() {
    const name = fName.trim();
    const severity = parseInt(fSeverity) || 1;
    if (!name) { setError('Nombre obligatorio'); return; }
    if (severity < 1 || severity > 3) { setError('Severidad debe ser 1, 2 o 3'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        description: fDesc.trim(),
        severity,
        legend: buildFormulaLegend(parseFloat(fPenalty) || 0, fNullifies, fIsBan, fBanDuration, fRule),
        nullifies_kills: fNullifies,
        is_ban: fIsBan,
        ban_duration_hours: fIsBan ? (fBanDuration ? parseInt(fBanDuration) : null) : null,
        rule_section_id: fRule || null,
      };
      if (editId) {
        const { error } = await publicDb.from('strike_types').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await publicDb.from('strike_types').insert({ ...payload, code: 'custom_' + Date.now(), is_active: true });
        if (error) throw error;
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  const kills = parseInt(simKills) || 0;
  const strikes = parseInt(simStrikes) || 0;
  const nullified = parseInt(simNullified) || 0;
  const penalty = strikes === 1 ? 10 : strikes === 2 ? 30 : strikes >= 3 ? 50 : 0;
  const effKills = Math.round(Math.max(0, kills - nullified) * (1 - penalty / 100));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 4px' }}>Motor de Sanciones</h1>
      <p style={{ color: colors.muted, margin: '0 0 24px' }}>Fórmulas de penalización, estadísticas y simulador</p>

      {error && <div style={{ color: colors.danger, marginBottom: 12 }}>{error}</div>}

      {formulas === null ? (
        <Loader />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard label="Fórmulas activas" value={String(formulas.length)} />
            <StatCard label="Sanciones aplicadas" value={String(applied)} />
            <StatCard label="Penalización total" value={totalPct + '%'} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Button onClick={() => openModal(null)}>+ Nueva Fórmula</Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {formulas.map((f) => {
              const parsed = parseFormulaLegend(f.legend);
              const sev = SEV[f.severity] || SEV[1];
              return (
                <div key={f.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>{f.name}</strong>
                    <span style={{ background: sev.color + '20', color: sev.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{sev.label}</span>
                  </div>
                  <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 8px' }}>{f.description || 'Sin descripción'}</p>
                  <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 4px' }}><strong style={{ color: colors.accent }}>Penalización:</strong> {parsed.penalty_pct}% kills</p>
                  {parsed.rule_section_id && ruleMap[parsed.rule_section_id] && (
                    <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 4px' }}>Regla: {ruleMap[parsed.rule_section_id]}</p>
                  )}
                  {parsed.is_ban && <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}><strong>Ban:</strong> {parsed.ban_duration_hours ? parsed.ban_duration_hours + 'h' : 'Permanente'}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {parsed.is_ban && <Badge label="BAN" tone="danger" />}
                    {parsed.nullifies_kills && <Badge label="NULLIFIER" tone="purple" />}
                    <Button variant="ghost" onClick={() => openModal(f)} style={{ fontSize: 12 }}>Editar</Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ ...cardStyle, marginTop: 32, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>Simulador de penalización</h3>
            <p style={{ fontSize: 13, color: colors.muted }}>1 strike = -10% · 2 strikes = -30% · 3+ strikes = -50%</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div><label style={labelStyle}>Kills originales</label><Input type="number" value={simKills} onChange={(e) => setSimKills(e.target.value)} placeholder="100" /></div>
              <div><label style={labelStyle}>Nº de strikes</label><Input type="number" value={simStrikes} onChange={(e) => setSimStrikes(e.target.value)} placeholder="2" /></div>
              <div><label style={labelStyle}>Kills anuladas</label><Input type="number" value={simNullified} onChange={(e) => setSimNullified(e.target.value)} placeholder="10" /></div>
            </div>
            {kills > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, textAlign: 'center' }}>
                <div><div style={{ fontSize: 11, color: colors.muted }}>Kills originales</div><div style={{ fontSize: 22, fontWeight: 700 }}>{kills}</div></div>
                <div><div style={{ fontSize: 11, color: colors.muted }}>Kills anuladas</div><div style={{ fontSize: 22, fontWeight: 700, color: colors.danger }}>-{nullified}</div></div>
                <div><div style={{ fontSize: 11, color: colors.muted }}>Penalización</div><div style={{ fontSize: 22, fontWeight: 700, color: colors.accent }}>-{penalty}%</div></div>
                <div><div style={{ fontSize: 11, color: colors.muted }}>Kills efectivas</div><div style={{ fontSize: 22, fontWeight: 700, color: colors.success }}>{effKills}</div></div>
              </div>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{editId ? 'Editar Fórmula' : 'Nueva Fórmula'}</h3>
            <label style={labelStyle}>Nombre *</label>
            <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ej: Farmeo prohibido" style={{ width: '100%', marginBottom: 12 }} />
            <label style={labelStyle}>Descripción</label>
            <TextArea value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Describe la infracción" rows={3} style={{ width: '100%', marginBottom: 12 }} />
            <label style={labelStyle}>Severidad (1=Leve, 2=Medio, 3=Grave)</label>
            <Select value={fSeverity} onChange={(e) => setFSeverity(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
              <option value="1">1 — Leve</option>
              <option value="2">2 — Medio</option>
              <option value="3">3 — Grave</option>
            </Select>
            <label style={labelStyle}>Penalización % kills</label>
            <Input type="number" value={fPenalty} onChange={(e) => setFPenalty(e.target.value)} placeholder="10" style={{ width: '100%', marginBottom: 12 }} />
            <label style={labelStyle}>Regla relacionada</label>
            <Select value={fRule} onChange={(e) => setFRule(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
              <option value="">Sin relación</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </Select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 14 }}>
              <input type="checkbox" checked={fNullifies} onChange={(e) => setFNullifies(e.target.checked)} /> Anula kills (nullifier)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 14 }}>
              <input type="checkbox" checked={fIsBan} onChange={(e) => setFIsBan(e.target.checked)} /> Es baneo
            </label>
            {fIsBan && (
              <>
                <label style={labelStyle}>Duración del ban (horas, vacío = permanente)</label>
                <Input type="number" value={fBanDuration} onChange={(e) => setFBanDuration(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button onClick={saveFormula} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSanctionsEnginePage() {
  return (
    <AdminGate staffOnly>
      <SanctionsEngine />
    </AdminGate>
  );
}
