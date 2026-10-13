/**
 * generate-og.mjs — postbuild: vistas previas (Open Graph) por alianza.
 *
 * Arquitectura: SPA estatica en GitHub Pages + dominio alliancehub.app.
 * Los rastreadores (WhatsApp/FB/Discord/Telegram) NO ejecutan JS, asi que
 * las rutas /alianzas/:id deben devolver HTML real con metadatos. GitHub
 * Pages sirve /alianzas/<id>.html para la ruta limpia /alianzas/<id>, asi
 * que generamos UN HTML estatico por alianza a partir de dist/index.html,
 * inyectando og:* con la imagen OG generada aqui mismo (1200x630 PNG).
 *
 * Imagenes: satori (layout) + resvg (raster) + sharp (webp->png del logo).
 * Todo ocurre en build time: cero consultas en runtime y cero secretos
 * (solo datos publicos de la tabla alliances con la anon key).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const BASE = 'https://alliancehub.app';

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

const fonts = [
  { name: 'DejaVu', data: readFileSync(join(root, 'scripts/assets/fonts/DejaVuSans.ttf')), weight: 400 },
  { name: 'DejaVu', data: readFileSync(join(root, 'scripts/assets/fonts/DejaVuSans-Bold.ttf')), weight: 700 },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => { s = clean(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

async function fetchAlliances() {
  if (!SUPABASE_URL || !ANON) return [];
  const url = `${SUPABASE_URL}/rest/v1/alliances?select=id,name,tag,description,profile&order=created_at&limit=500`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) { console.warn(`[og] alliances: HTTP ${res.status}, se omiten`); return []; }
  return res.json();
}

async function logoDataUri(a) {
  const url = a.profile?.logo_url;
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const png = await sharp(buf).resize(520, 520, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch { return null; }
}

const ACCENTS = ['#ff8f00', '#e90101', '#00b0ff', '#81c784', '#ce93d8', '#ffd54f'];
function accentFor(id) {
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function ogCard({ name, tag, description, logoUri, accent }) {
  const initial = clean(name).charAt(0).toUpperCase() || 'A';
  return React.createElement('div', {
    style: {
      width: 1200, height: 630, display: 'flex', flexDirection: 'column',
      backgroundColor: '#0a0e27',
      backgroundImage: 'linear-gradient(135deg, #0a0e27 0%, #141a3a 55%, #1d1030 100%)',
      color: '#f1f5f9', fontFamily: 'DejaVu', padding: 56,
    },
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
      React.createElement('div', { style: { fontSize: 30, fontWeight: 700, letterSpacing: 8, color: '#94a3b8' } }, 'ALLIANCEHUB'),
      React.createElement('div', { style: { marginLeft: 'auto', fontSize: 24, color: '#64748b' } }, 'SUPREMACY 1914'),
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', flex: 1, marginTop: 8 } },
      logoUri
        ? React.createElement('img', { src: logoUri, width: 250, height: 250, style: { borderRadius: 28, border: `5px solid ${accent}`, objectFit: 'cover', backgroundColor: '#0f1530' } })
        : React.createElement('div', { style: { width: 250, height: 250, borderRadius: 125, backgroundColor: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 130, fontWeight: 700, color: '#0a0e27' } }, initial),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', marginLeft: 48, flex: 1 } },
        tag ? React.createElement('div', { style: { alignSelf: 'flex-start', backgroundColor: accent, color: '#0a0e27', fontSize: 26, fontWeight: 700, padding: '6px 18px', borderRadius: 999, marginBottom: 18, letterSpacing: 2 } }, clip(tag, 14)) : null,
        React.createElement('div', { style: { fontSize: 62, fontWeight: 700, lineHeight: 1.08, color: '#ffffff', marginBottom: 20 } }, clip(name, 42)),
        React.createElement('div', { style: { fontSize: 29, lineHeight: 1.35, color: '#b6c2d9' } }, clip(description || 'Alianza de Supremacy 1914', 150)),
      ),
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', fontSize: 24, color: '#64748b' } },
      React.createElement('div', null, `${BASE}/alianzas`),
      React.createElement('div', { style: { marginLeft: 'auto', color: '#ff8f00', fontWeight: 700 } }, ' alliancehub.app'),
    ),
  );
}

async function renderPng(element) {
  const svg = await satori(element, { width: 1200, height: 630, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' }, background: '#0a0e27' });
  return resvg.render().asPng();
}

/** Reemplaza/inserta una meta en el HTML base de dist. */
function setMeta(html, key, value, kind = 'property') {
  const re = new RegExp(`<meta ${kind}="${key}" content="[^"]*"\\s*/?>`);
  const tag = `<meta ${kind}="${key}" content="${esc(value)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  const anchor = kind === 'property' ? /<meta property="og:type"[^>]*\/>/ : /<meta name="robots"[^>]*\/>/;
  return html.replace(anchor, (m) => `${m}\n    ${tag}`);
}

function allianceHtml(template, a, imageUrl) {
  const name = clip(a.name, 60);
  const tag = clip(a.tag || '', 20);
  const title = tag ? `${name} [${tag}] — AllianceHub` : `${name} — AllianceHub`;
  const description = clip(a.description, 180) || `Perfil de la alianza ${name} en AllianceHub: partidas, rankings y miembros de Supremacy 1914.`;
  const url = `${BASE}/alianzas/${a.id}`;
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`);
  html = html.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${esc(url)}" />`);
  html = setMeta(html, 'og:url', url);
  html = setMeta(html, 'og:title', title);
  html = setMeta(html, 'og:description', description);
  html = setMeta(html, 'og:image', imageUrl);
  html = setMeta(html, 'og:image:width', '1200');
  html = setMeta(html, 'og:image:height', '630');
  html = setMeta(html, 'og:image:alt', title);
  html = setMeta(html, 'twitter:title', title, 'name');
  html = setMeta(html, 'twitter:description', description, 'name');
  html = setMeta(html, 'twitter:image', imageUrl, 'name');
  return html;
}

async function main() {
  if (!existsSync(join(dist, 'index.html'))) {
    console.warn('[og] dist/index.html no existe; se omite');
    return;
  }
  const template = readFileSync(join(dist, 'index.html'), 'utf8');
  const alliances = await fetchAlliances();
  mkdirSync(join(dist, 'og', 'alliances'), { recursive: true });
  mkdirSync(join(dist, 'alianzas'), { recursive: true });

  for (const a of alliances) {
    const accent = a.profile?.accent_color || accentFor(a.id);
    const logoUri = await logoDataUri(a);
    const png = await renderPng(ogCard({ name: a.name, tag: a.tag, description: a.description, logoUri, accent }));
    writeFileSync(join(dist, 'og', 'alliances', `${a.id}.png`), png);
    const imageUrl = `${BASE}/og/alliances/${a.id}.png`;
    writeFileSync(join(dist, 'alianzas', `${a.id}.html`), allianceHtml(template, a, imageUrl));
  }
  console.log(`[og] ${alliances.length} alianzas con vista previa OG`);
}

main().catch((e) => { console.error('[og] ERROR', e); process.exit(1); });
