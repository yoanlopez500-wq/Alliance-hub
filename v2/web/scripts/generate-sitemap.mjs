/**
 * generate-sitemap.mjs — genera public/sitemap.xml en cada build.
 *
 * Rutas estaticas publicas + dinamicas reales (/partidas/:id y /alianzas/:id)
 * consultadas a Supabase en build time (una sola llamada, anon key publica).
 * Se ejecuta como prebuild: funciona igual en local (.env.local) que en
 * GitHub Actions (variables de entorno del workflow).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const out = {};
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*(VITE_\w+)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* en CI vienen por process.env */ }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const BASE = 'https://alliancehub.app';

const STATIC = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/partidas', priority: '0.9', changefreq: 'daily' },
  { path: '/rankings', priority: '0.9', changefreq: 'daily' },
  { path: '/alianzas', priority: '0.9', changefreq: 'weekly' },
  { path: '/jugadores', priority: '0.8', changefreq: 'weekly' },
  { path: '/reglas', priority: '0.7', changefreq: 'monthly' },
  { path: '/info', priority: '0.6', changefreq: 'monthly' },
  { path: '/funciones', priority: '0.6', changefreq: 'monthly' },
  { path: '/novedades', priority: '0.5', changefreq: 'weekly' },
  { path: '/aviso-legal', priority: '0.2', changefreq: 'yearly' },
];

function esc(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

async function fetchRows(table, select) {
  if (!SUPABASE_URL || !ANON) return [];
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=500`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) {
    console.warn(`[sitemap] ${table}: HTTP ${res.status}, se omite`);
    return [];
  }
  return res.json();
}

function toEntry(loc, lastmod, priority, changefreq) {
  return `  <url>\n    <loc>${esc(loc)}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

const today = new Date().toISOString().slice(0, 10);

const [matches, alliances] = await Promise.all([
  fetchRows('matches', 'id,created_at'),
  fetchRows('alliances', 'id,created_at'),
]);

const entries = [
  ...STATIC.map((s) => toEntry(BASE + s.path, today, s.priority, s.changefreq)),
  ...matches.map((m) => toEntry(`${BASE}/partidas/${m.id}`, (m.created_at || '').slice(0, 10), '0.7', 'weekly')),
  ...alliances.map((a) => toEntry(`${BASE}/alianzas/${a.id}`, (a.created_at || '').slice(0, 10), '0.7', 'weekly')),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

writeFileSync(join(root, 'public', 'sitemap.xml'), xml);
console.log(`[sitemap] ${entries.length} URLs (${matches.length} partidas, ${alliances.length} alianzas)`);
