import { useEffect, useMemo, useState } from 'react';
import { publicDb } from '../../lib/api';
import { useAdmin, loadAlliances, type Alliance } from '../../lib/admin';
import AdminGate from '../../components/AdminGate';
import Button from '../../components/Button';
import DataTable from '../../components/DataTable';
import Badge from '../../components/Badge';
import PrestigeBadge from '../../components/PrestigeBadge';
import { Input, Select, TextArea } from '../../components/Field';
import { colors, styles } from '../../theme';
import {
  ALLIANCE_PRESTIGE_METRICS,
  buildFormula,
  formulaConditions,
  formulaToText,
  PLAYER_PRESTIGE_METRICS,
  PRESTIGE_OPS,
  PRESTIGE_RARITY,
  type PrestigeCondition,
  type PrestigeDefinition,
  type PrestigeRarity,
  type PrestigeScope,
} from '../../lib/prestige';

type FormulaRow = PrestigeCondition;

function defaultMetric(scope: PrestigeScope): string {
  return scope === 'platform' ? 'games' : 'official_wins';
}

function PrestigeAdmin() {
  const { admin, loading } = useAdmin();
  const isSuper = admin?.role === 'superadmin';
  const managedAllianceId = admin?.alliance_id ?? null;
  const canAlliance = !!managedAllianceId && ['alliance_leader', 'event_admin', 'superadmin'].includes(admin?.role ?? '');

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [definitions, setDefinitions] = useState<PrestigeDefinition[] | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [scope, setScope] = useState<PrestigeScope>('platform');
  const [allianceId, setAllianceId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🏅');
  const [rarity, setRarity] = useState<PrestigeRarity>('common');
  const [combine, setCombine] = useState<'all' | 'any'>('all');
  const [rows, setRows] = useState<FormulaRow[]>([{ metric: defaultMetric('platform'), op: '>=', value: 10 }]);

  const metrics = scope === 'platform' ? PLAYER_PRESTIGE_METRICS : ALLIANCE_PRESTIGE_METRICS;
  const canCreatePlatform = !!isSuper;
  const canCreateAlliance = !!isSuper || canAlliance;

  async function load() {
    setError('');
    try {
      const { data, error: e } = await publicDb
        .from('prestige_definitions')
        .select('*')
        .order('scope', { ascending: true })
        .order('created_at', { ascending: false });
      if (e) throw e;
      setDefinitions((data ?? []) as PrestigeDefinition[]);
    } catch (e: any) {
      setError(e.message ?? 'Error cargando prestigios');
      setDefinitions([]);
    }
  }

  useEffect(() => {
    if (!admin) return;
    setScope(isSuper ? 'platform' : 'alliance');
    if (managedAllianceId) setAllianceId(managedAllianceId);
    load();
    loadAlliances().then(setAlliances).catch(() => setAlliances([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.id, admin?.role, managedAllianceId]);

  useEffect(() => {
    setRows((rs) => rs.map((r) => ({ ...r, metric: defaultMetric(scope) })));
  }, [scope]);

  const preview = useMemo(() => formulaToText(buildFormula(combine, rows)), [combine, rows]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setDescription('');
    setIcon(scope === 'platform' ? '⚜' : '🛡');
    setRarity('common');
    setCombine('all');
    setRows([{ metric: defaultMetric(scope), op: '>=', value: scope === 'platform' ? 10 : 1 }]);
  }

  function startEdit(d: PrestigeDefinition) {
    const conds = formulaConditions(d.formula);
    setEditingId(d.id);
    setScope(d.scope);
    setAllianceId(d.alliance_id ?? managedAllianceId ?? '');
    setName(d.name);
    setDescription(d.description ?? '');
    setIcon(d.icon || (d.scope === 'platform' ? '⚜' : '🛡'));
    setRarity(d.rarity);
    setCombine(Array.isArray(d.formula?.any) ? 'any' : 'all');
    setRows(conds.length ? conds : [{ metric: defaultMetric(d.scope), op: '>=', value: 0 }]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function audit(action: string, rowId: string, oldData?: unknown, newData?: unknown) {
    try {
      const { data: sess } = await publicDb.auth.getSession();
      const { error: e } = await publicDb.from('admin_audit_log').insert({
        actor_id: sess.session?.user.id ?? null,
        actor_name: admin?.display_name ?? null,
        action,
        table_name: 'prestige_definitions',
        row_id: rowId,
        old_data: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
        new_data: newData ? JSON.parse(JSON.stringify(newData)) : null,
      });
      if (e) console.warn('[prestige] audit:', e.message);
    } catch (e) {
      console.warn('[prestige] audit:', e);
    }
  }

  function validate(): string | null {
    if (scope === 'platform' && !canCreatePlatform) return 'Solo superadmin gestiona prestigios de plataforma.';
    if (scope === 'alliance' && !canCreateAlliance) return 'Necesitas ser lider/event_admin de una alianza.';
    if (scope === 'alliance' && !allianceId) return 'Selecciona la alianza del prestigio.';
    if (!name.trim() || name.trim().length < 2) return 'Pon un nombre valido.';
    if (rows.length === 0) return 'Agrega al menos una condicion.';
    for (const r of rows) {
      if (!r.metric || !Number.isFinite(Number(r.value))) return 'Revisa las condiciones de la formula.';
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const msg = validate();
    if (msg) { setError(msg); return; }
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const payload = {
        scope,
        alliance_id: scope === 'alliance' ? allianceId : null,
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || (scope === 'platform' ? '⚜' : '🛡'),
        rarity,
        color: PRESTIGE_RARITY[rarity].color,
        formula: buildFormula(combine, rows),
      };

      if (editingId) {
        const old = definitions?.find((d) => d.id === editingId);
        const { data, error: e2 } = await publicDb
          .from('prestige_definitions')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single();
        if (e2) throw e2;
        await audit('prestige.update', editingId, old, data);
        setFeedback(`Prestigio "${payload.name}" actualizado.`);
      } else {
        const { data: sess } = await publicDb.auth.getSession();
        const { data, error: e2 } = await publicDb
          .from('prestige_definitions')
          .insert({ ...payload, created_by: sess.session?.user.id ?? null })
          .select()
          .single();
        if (e2) throw e2;
        await audit('prestige.create', data.id, undefined, data);
        setFeedback(`Prestigio "${payload.name}" creado.`);
      }
      resetForm();
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Error guardando prestigio');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(d: PrestigeDefinition) {
    setBusy(true);
    setError('');
    try {
      const { data, error: e } = await publicDb
        .from('prestige_definitions')
        .update({ is_active: !d.is_active })
        .eq('id', d.id)
        .select()
        .single();
      if (e) throw e;
      await audit(d.is_active ? 'prestige.deactivate' : 'prestige.activate', d.id, d, data);
      setFeedback(d.is_active ? 'Prestigio desactivado.' : 'Prestigio activado.');
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Error cambiando estado');
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: PrestigeDefinition) {
    if (!window.confirm(`¿Eliminar definitivamente "${d.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      const { error: e } = await publicDb.from('prestige_definitions').delete().eq('id', d.id);
      if (e) throw e;
      await audit('prestige.delete', d.id, d, undefined);
      setFeedback('Prestigio eliminado.');
      if (editingId === d.id) resetForm();
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Error eliminando prestigio');
    } finally {
      setBusy(false);
    }
  }

  function canManageRow(d: PrestigeDefinition) {
    if (isSuper) return true;
    return d.scope === 'alliance' && !!managedAllianceId && d.alliance_id === managedAllianceId && canAlliance;
  }

  if (loading) return <p style={{ color: colors.muted }}>Verificando acceso…</p>;
  if (!canCreatePlatform && !canCreateAlliance) {
    return <p style={{ color: colors.muted }}>No tienes permisos para gestionar prestigios.</p>;
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ color: colors.text, margin: '0 0 4px' }}>🏅 Prestigios</h1>
      <p style={{ color: colors.muted, marginTop: 0 }}>
        Fase 1: insignias permanentes por formula. ⚜ plataforma (superadmin) y 🛡 alianza (lider/event_admin de su alianza). La insignia principal es la de mayor rareza.
      </p>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {feedback && <p style={{ color: colors.info }}>{feedback}</p>}

      <form onSubmit={submit} style={{ ...styles.card, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {isSuper ? (
            <Select value={scope} onChange={(e) => setScope(e.target.value as PrestigeScope)} style={{ width: 170, marginBottom: 0 }}>
              <option value="platform">⚜ Plataforma</option>
              <option value="alliance">🛡 Alianza</option>
            </Select>
          ) : (
            <Badge label={`🛡 ${alliances.find((a) => a.id === managedAllianceId)?.name ?? 'Tu alianza'}`} tone="active" />
          )}

          {scope === 'alliance' && isSuper && (
            <Select value={allianceId} onChange={(e) => setAllianceId(e.target.value)} style={{ minWidth: 220, marginBottom: 0 }}>
              <option value="">Selecciona alianza…</option>
              {alliances.map((a) => <option key={a.id} value={a.id}>{a.name} [{a.tag}]</option>)}
            </Select>
          )}

          <Input placeholder="Icono (emoji)" value={icon} onChange={(e) => setIcon(e.target.value)} style={{ width: 96, marginBottom: 0 }} />
          <Input placeholder="Nombre del prestigio" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 220px', marginBottom: 0 }} />
          <Select value={rarity} onChange={(e) => setRarity(e.target.value as PrestigeRarity)} style={{ width: 160, marginBottom: 0 }}>
            {Object.entries(PRESTIGE_RARITY).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
          </Select>
        </div>

        <TextArea placeholder="Descripcion publica: que representa y como se consigue" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ marginBottom: 12 }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <strong style={{ color: colors.text, fontSize: 13 }}>Condiciones:</strong>
          <Select value={combine} onChange={(e) => setCombine(e.target.value as 'all' | 'any')} style={{ width: 230, marginBottom: 0 }}>
            <option value="all">Debe cumplir TODAS</option>
            <option value="any">Basta con UNA</option>
          </Select>
          <Button type="button" onClick={() => setRows([...rows, { metric: defaultMetric(scope), op: '>=', value: 0 }])}>+ Condicion</Button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {rows.map((r, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Select value={r.metric} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, metric: e.target.value } : x))} style={{ flex: '1 1 220px', marginBottom: 0 }}>
                {metrics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
              <Select value={r.op} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, op: e.target.value as PrestigeCondition['op'] } : x))} style={{ width: 90, marginBottom: 0 }}>
                {PRESTIGE_OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
              <Input type="number" step="any" value={String(r.value)} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, value: Number(e.target.value) } : x))} style={{ width: 120, marginBottom: 0 }} />
              <Button type="button" variant="danger" onClick={() => setRows(rows.filter((_, i) => i !== idx))} disabled={rows.length === 1}>Quitar</Button>
            </div>
          ))}
        </div>

        <div style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
          Vista previa: <strong style={{ color: colors.text }}>{preview}</strong>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="submit" disabled={busy}>{editingId ? 'Guardar cambios' : 'Crear prestigio'}</Button>
          {editingId && <Button type="button" onClick={resetForm}>Cancelar edicion</Button>}
        </div>
      </form>

      <DataTable<PrestigeDefinition>
        rows={definitions}
        loading={definitions === null}
        empty="Todavia no hay prestigios configurados"
        columns={[
          {
            key: 'name', header: 'Prestigio',
            render: (d) => (
              <div>
                <PrestigeBadge prestige={d} />
                {d.description && <div style={{ marginTop: 4, fontSize: 12, color: colors.muted }}>{d.description}</div>}
              </div>
            ),
          },
          { key: 'scope', header: 'Alcance', render: (d) => <Badge label={d.scope === 'platform' ? '⚜ Plataforma' : '🛡 Alianza'} tone={d.scope === 'platform' ? 'global' : 'active'} /> },
          { key: 'rarity', header: 'Rareza', render: (d) => <span style={{ color: PRESTIGE_RARITY[d.rarity]?.color, fontWeight: 700 }}>{PRESTIGE_RARITY[d.rarity]?.label}</span> },
          { key: 'is_active', header: 'Estado', render: (d) => <Badge label={d.is_active ? 'Activo' : 'Inactivo'} tone={d.is_active ? 'active' : 'danger'} /> },
          { key: 'formula', header: 'Formula', render: (d) => <span style={{ color: colors.muted, fontSize: 12 }}>{formulaToText(d.formula)}</span> },
          {
            key: 'actions', header: '',
            render: (d) => canManageRow(d) ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button type="button" onClick={() => startEdit(d)} disabled={busy}>Editar</Button>
                <Button type="button" onClick={() => toggleActive(d)} disabled={busy}>{d.is_active ? 'Desactivar' : 'Activar'}</Button>
                <Button type="button" variant="danger" onClick={() => remove(d)} disabled={busy}>Eliminar</Button>
              </div>
            ) : <span style={{ color: colors.muted, fontSize: 12 }}>Solo lectura</span>,
          },
        ]}
      />
    </div>
  );
}

export default function AdminPrestigesPage() {
  return (
    <AdminGate>
      <PrestigeAdmin />
    </AdminGate>
  );
}
