/**
 * alliance.js - Pagina publica de una alianza (alliance.html?id=...)
 *
 * "Alliance Space": banner/logo/color desde alliances.profile (jsonb),
 * links de comunidad, tablon de anuncios (public_alliance_announcements_view,
 * solo vigentes), reglamento propio (rule_sections.alliance_id), partidas
 * (public_matches_view) y miembros (public_players_view + roles de
 * alliance_memberships).
 *
 * Lectura 100% publica; ninguna escritura ocurre en esta pagina.
 */
(function() {
    'use strict';

    var COMMUNITY_META = {
        whatsapp: { icon: '\u{1F4AC}', label: 'WhatsApp', bg: '#25d366', fg: '#0f172a' },
        discord:  { icon: '\u{1F3AE}', label: 'Discord',  bg: '#5865f2', fg: '#ffffff' },
        telegram: { icon: '✈️',        label: 'Telegram', bg: '#229ed9', fg: '#ffffff' },
        web:      { icon: '\u{1F310}', label: 'Web',      bg: '#475569', fg: '#ffffff' }
    };

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function safeUrl(u) {
        var s = String(u || '');
        return /^https:\/\//i.test(s) ? s : null; // solo https (anti javascript:)
    }

    function getAllianceId() {
        try { return new URLSearchParams(location.search).get('id'); }
        catch(e) { return null; }
    }

    function timeAgo(iso) {
        var diff = Date.now() - new Date(iso).getTime();
        var days = Math.floor(diff / 86400000);
        if (days <= 0) return 'hoy';
        if (days === 1) return 'ayer';
        if (days < 30) return 'hace ' + days + ' dias';
        return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // ---------- HERO ----------
    function renderHero(a) {
        var p = a.profile || {};
        var accent = (typeof p.accent_color === 'string' && /^#[0-9a-f]{6}$/i.test(p.accent_color)) ? p.accent_color : '#ff8f00';
        var banner = safeUrl(p.banner_url);
        var logo = safeUrl(p.logo_url);
        var links = Array.isArray(p.community_links) ? p.community_links.slice(0, 4) : [];

        var bannerStyle = banner
            ? 'background-image:url(' + banner + ');background-size:cover;background-position:center;'
            : 'background:linear-gradient(120deg,#1a237e 0%,#283593 50%,' + accent + ' 140%);';

        var logoHtml = logo
            ? '<img src="' + logo + '" alt="" class="w-28 h-28 rounded-2xl border-4 object-cover shrink-0" style="border-color:#0a0e27;">'
            : '<div class="w-28 h-28 rounded-2xl border-4 shrink-0 flex items-center justify-center text-4xl font-black text-white" style="background:#11183a;border-color:#0a0e27;">' + escapeHtml((a.tag || a.name || '?').slice(0, 3)) + '</div>';

        var linksHtml = links.map(function(l) {
            var url = safeUrl(l && l.url);
            if (!url) return '';
            var meta = COMMUNITY_META[(l.type || '').toLowerCase()] || COMMUNITY_META.web;
            var label = l.label || meta.label;
            return '<a href="' + url + '" target="_blank" rel="noopener" class="px-4 py-2.5 rounded-lg text-sm font-bold" style="background:' + meta.bg + ';color:' + meta.fg + ';">' + meta.icon + ' ' + escapeHtml(label) + '</a>';
        }).join('');

        document.getElementById('alliance-hero').innerHTML =
            '<div class="relative">' +
              '<div class="h-44 md:h-56 w-full" style="' + bannerStyle + '"></div>' +
              '<div class="max-w-4xl mx-auto px-4">' +
                '<div class="relative -mt-14 flex flex-col md:flex-row md:items-end gap-4">' +
                  logoHtml +
                  '<div class="flex-1 pb-1">' +
                    '<h1 class="text-3xl font-bold drop-shadow">' + escapeHtml(a.name) + '</h1>' +
                    '<p class="text-ah-muted text-sm mt-1">[' + escapeHtml(a.tag || '-') + '] · <span id="hero-member-count"></span>' + (a.description ? ' · ' + escapeHtml(a.description) : '') + '</p>' +
                    (p.welcome_text ? '<p class="text-sm mt-1" style="color:' + accent + '">' + escapeHtml(p.welcome_text) + '</p>' : '') +
                  '</div>' +
                  (linksHtml ? '<div class="flex flex-wrap gap-2 pb-2">' + linksHtml + '</div>' : '') +
                '</div>' +
              '</div>' +
            '</div>';
        document.title = a.name + ' - Alliance Hub';
    }

    // ---------- TABLON ----------
    async function loadAnnouncements(allianceId) {
        try {
            var res = await window.supabase.from('public_alliance_announcements_view')
                .select('*')
                .or('alliance_id.eq.' + allianceId + ',alliance_id.is.null')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(21);
            if (res.error) throw res.error;
            var list = res.data || [];
            if (list.length === 0) return; // seccion queda oculta
            document.getElementById('announcements-section').classList.remove('hidden');
            document.getElementById('announcements-list').innerHTML = list.map(function(n) {
                var isPlatform = !n.alliance_id;
                var img = safeUrl(n.image_url);
                return '<article class="rounded-xl overflow-hidden bg-ah-card border ' + (n.is_pinned ? 'border-amber-500/50' : 'border-indigo-900') + '">' +
                    (img ? '<img src="' + img + '" alt="" class="w-full max-h-48 object-cover" loading="lazy">' : '') +
                    '<div class="p-4">' +
                    '<div class="flex items-center gap-2 mb-1 flex-wrap">' +
                    (n.is_pinned ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/15 text-amber-400">&#128204; FIJADO</span>' : '') +
                    (isPlatform ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-indigo-500/20 text-indigo-300">ALLIANCE HUB</span>' : '') +
                    '<span class="text-xs text-ah-muted">' + timeAgo(n.created_at) + '</span>' +
                    '</div>' +
                    '<h3 class="font-bold">' + escapeHtml(n.title) + '</h3>' +
                    (n.body ? '<p class="text-sm text-ah-muted mt-1">' + escapeHtml(n.body).replace(/\n/g, '<br>') + '</p>' : '') +
                    '</div></article>';
            }).join('');
        } catch(e) { console.error('[Alliance] anuncios:', e); }
    }

    // ---------- REGLAMENTO PROPIO ----------
    async function loadAllianceRules(allianceId) {
        try {
            var res = await window.supabase.from('rule_sections')
                .select('id, title, content, order_index, section_number')
                .eq('alliance_id', allianceId)
                .eq('is_active', true)
                .order('order_index');
            if (res.error) throw res.error;
            var rules = res.data || [];
            if (rules.length === 0) return;
            document.getElementById('alliance-rules-section').classList.remove('hidden');
            document.getElementById('alliance-rules-list').innerHTML = rules.map(function(r, i) {
                var num = r.section_number || (i + 1);
                return '<details class="rounded-lg bg-white/[0.03] border border-indigo-900">' +
                    '<summary class="p-3 cursor-pointer text-sm font-bold flex items-center gap-2"><span class="chev transition-transform inline-block">&#9656;</span> ' + escapeHtml(num) + '. ' + escapeHtml(r.title) + '</summary>' +
                    '<p class="px-3 pb-3 text-sm text-ah-muted">' + escapeHtml(r.content || '').replace(/\n/g, '<br>') + '</p>' +
                    '</details>';
            }).join('');
        } catch(e) { console.error('[Alliance] reglamento:', e); }
    }

    // ---------- PARTIDAS ----------
    async function loadMatches(allianceId) {
        try {
            var pmc = window.DB.tableCols('publicMatches');
            var res = await window.DB.from('publicMatches')
                .select(window.DB.select('publicMatches', 'basic'))
                .eq(pmc.allianceId, allianceId)
                .order(pmc.createdAt, { ascending: false })
                .limit(8);
            var c = document.getElementById('alliance-matches');
            var matches = res.data || [];
            if (matches.length === 0) { c.innerHTML = '<div class="text-center py-4 text-ah-muted text-sm">Sin partidas publicas aun</div>'; return; }
            c.innerHTML = matches.map(function(m) {
                return '<a href="game.html?id=' + m[pmc.id] + '" class="flex justify-between items-center rounded-lg p-3 bg-white/[0.03] border border-indigo-900 hover:border-ah-accent transition-colors">' +
                    '<div><div class="font-bold text-sm">' + escapeHtml(m[pmc.name]) + '</div><div class="text-xs text-ah-muted">' + window.formatDate(m[pmc.createdAt]) + '</div></div>' +
                    window.getStatusBadge(m[pmc.status]) + '</a>';
            }).join('');
        } catch(e) { console.error('[Alliance] partidas:', e); }
    }

    // ---------- MIEMBROS ----------
    async function loadMembers(allianceId) {
        try {
            var ac = window.DB.tableCols('allianceMemberships');
            var res = await window.DB.from('allianceMemberships')
                .select(ac.playerId + ', ' + ac.role)
                .eq(ac.allianceId, allianceId)
                .eq(ac.status, 'approved');
            var members = res.data || [];
            var countEls = [document.getElementById('member-count'), document.getElementById('hero-member-count')];
            countEls.forEach(function(el) { if (el) el.textContent = el.id === 'hero-member-count' ? (members.length + ' miembros') : ('(' + members.length + ')'); });
            var c = document.getElementById('alliance-members');
            if (members.length === 0) { c.innerHTML = '<div class="text-center py-4 col-span-full text-ah-muted text-sm">Sin miembros aun</div>'; return; }
            var ids = members.map(function(m) { return m[ac.playerId]; });
            var roleOf = {};
            members.forEach(function(m) { roleOf[m[ac.playerId]] = m[ac.role]; });
            var pc = window.DB.tableCols('players');
            var res2 = await window.DB.from('publicPlayers').select([pc.id, pc.currentUsername].join(', ')).in(pc.id, ids);
            var players = res2.data || [];
            var ROLE_BADGE = {
                leader:  '<div class="text-[10px] font-bold text-amber-400">LIDER</div>',
                officer: '<div class="text-[10px] font-bold text-blue-400">OFICIAL</div>'
            };
            players.sort(function(a, b) {
                var w = function(p) { return roleOf[p[pc.id]] === 'leader' ? 0 : roleOf[p[pc.id]] === 'officer' ? 1 : 2; };
                return w(a) - w(b);
            });
            c.innerHTML = players.map(function(p) {
                return '<a href="player.html?id=' + p[pc.id] + '" class="rounded-lg p-2 text-center bg-white/[0.03] border border-indigo-900 hover:border-ah-accent transition-colors">' +
                    '<div class="font-bold text-xs truncate">' + escapeHtml(p[pc.currentUsername] || '?') + '</div>' +
                    (ROLE_BADGE[roleOf[p[pc.id]]] || '') + '</a>';
            }).join('');
        } catch(e) { console.error('[Alliance] miembros:', e); }
    }

    async function init() {
        var id = getAllianceId();
        if (!id) {
            document.getElementById('alliance-hero').innerHTML = '<div class="text-center py-16 text-ah-muted">Falta el parametro ?id=</div>';
            return;
        }
        try {
            var res = await window.DB.from('alliances').select(window.DB.select('alliances', 'withProfile')).eq('id', id).maybeSingle();
            if (res.error) throw res.error;
            if (!res.data || res.data.status === 'archived') {
                document.getElementById('alliance-hero').innerHTML = '<div class="text-center py-16 text-ah-muted">Alianza no encontrada</div>';
                return;
            }
            renderHero(res.data);
            loadAnnouncements(id);
            loadAllianceRules(id);
            loadMatches(id);
            loadMembers(id);
        } catch(e) {
            console.error('[Alliance]', e);
            document.getElementById('alliance-hero').innerHTML = '<div class="text-center py-16 text-red-400">Error cargando la alianza</div>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof window.DB !== 'undefined') { init(); }
            else { window.addEventListener('ah:loaded', function() { init(); }); }
        });
    } else {
        if (typeof window.DB !== 'undefined') { init(); }
        else { window.addEventListener('ah:loaded', function() { init(); }); }
    }
})();
