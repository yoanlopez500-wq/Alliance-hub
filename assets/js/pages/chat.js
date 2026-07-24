/**
 * chat.js - Sistema completo de chat consolidado (chat.html)
 *
 * Cambios respecto a la version anterior:
 *  - Canales cargados desde chat_channels via window.ChatChannels (no hardcodeados).
 *  - Jerarquia unificada con roles-data.js (incluye co_leader y officer).
 *  - Envio con sender_name / sender_role reales del admin autenticado.
 *  - Reporte con reported_message_id (FK al mensaje), NO message_preview.
 *  - DMs reales usando la tabla direct_messages (conversaciones admin<->admin):
 *    listar conversaciones, enviar y marcar como leido. Se eliminan los
 *    pseudo-DMs 'dm:*' almacenados en chat_messages.
 *  - Realtime via postgres_changes (habilitado en BD) + broadcast para typing.
 */
(function() {
    'use strict';

    var LS_DM = 'ah_chat_dms_v3';
    var MAX_LOCAL = 200;

    var me = null, curChan = null, rtSub = null, pgSub = null, dmSub = null;
    var channels = [], admins = [], dms = [], reportMsg = null, typingTimer;
    var msgCache = new Map();

    function roleLevel(r) { return window.ChatChannels ? window.ChatChannels.roleLevel(r) : 0; }
    function fmtRole(r) {
        var n = { superadmin: 'Super Admin', event_admin: 'Admin Eventos', alliance_leader: 'Lider', co_leader: 'Co-Lider', officer: 'Oficial', moderator: 'Moderador' };
        return n[r] || r;
    }
    function esc(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''; }
    function fmtDate(ts) { var d = new Date(ts), n = new Date(); if (d.toDateString() === n.toDateString()) return 'Hoy'; var y = new Date(); y.setDate(y.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Ayer'; return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }

    function isDM(ch) { return ch && ch.indexOf('dm-') === 0; }
    function dmOtherId(ch) { return ch.replace('dm-', ''); }
    function broadcastChan(ch) { return 'rt_' + ch.replace(/[^a-zA-Z0-9_-]/g, '_'); }
    function getCache(ch) { return msgCache.get(ch) || []; }
    function setCache(ch, msgs) { msgCache.set(ch, msgs.slice(-MAX_LOCAL)); }
    function addToCache(ch, msg) {
        var msgs = msgCache.get(ch) || [];
        if (msgs.some(function(m) { return m.id === msg.id; })) return false;
        msgs.push(msg);
        msgCache.set(ch, msgs.slice(-MAX_LOCAL));
        return true;
    }

    // ============================================================
    // INICIALIZACION
    // ============================================================
    async function init() {
        var sessionRes = await window.supabase.auth.getSession();
        if (!sessionRes.data || !sessionRes.data.session) { showDeny(); return; }
        var session = sessionRes.data.session;

        var { data: adm, error } = await window.supabase.from('admin_users').select('*').eq('id', session.user.id).eq('status', 'active').maybeSingle();
        // Acceso: cualquier rol administrativo conocido (nivel >= 1).
        if (error || !adm || roleLevel(adm.role) < 1) { showDeny(); return; }

        var allianceName = '';
        if (adm.alliance_id) {
            var { data: alli } = await window.supabase.from('alliances').select('name').eq('id', adm.alliance_id).single();
            allianceName = alli ? alli.name : '';
        }

        me = { id: session.user.id, name: adm.display_name || session.user.email.split('@')[0], role: adm.role, alliance: allianceName };

        var roleDisplay = document.getElementById('my-role-display');
        if (roleDisplay) roleDisplay.textContent = fmtRole(me.role) + (me.alliance ? ' - ' + me.alliance : '');

        var loadingScreen = document.getElementById('loading-screen');
        var chatInterface = document.getElementById('chat-interface');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        if (chatInterface) chatInterface.classList.remove('hidden');

        // Chat cargo OK: cancelar el rescue timer.
        if (window.__cancelChatRecovery__) window.__cancelChatRecovery__();

        // Canales visibles para mi rol desde chat_channels
        channels = await window.ChatChannels.loadForRole(me.role);

        await loadAdmins();
        await loadDMConversations();
        renderChans();
        renderDMList();
        subscribeDMs();

        var defaultChan = channels.length ? channels[0].id : null;
        if (defaultChan) switchChan(defaultChan);
    }

    function showDeny() {
        var loadingScreen = document.getElementById('loading-screen');
        var accessDenied = document.getElementById('access-denied');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        if (accessDenied) accessDenied.classList.remove('hidden');
        if (window.__cancelChatRecovery__) window.__cancelChatRecovery__();
    }

    // ============================================================
    // ADMINS
    // ============================================================
    async function loadAdmins() {
        try {
            var { data } = await window.supabase.from('admin_users').select('*').eq('status', 'active').neq('id', me.id);
            if (!data) { admins = []; return; }
            var alliIds = data.map(function(a) { return a.alliance_id; }).filter(function(id) { return !!id; });
            var uniqueIds = alliIds.filter(function(id, i, arr) { return arr.indexOf(id) === i; });
            var alliMap = {};
            if (uniqueIds.length > 0) {
                var { data: alliances } = await window.supabase.from('alliances').select('id,name,tag').in('id', uniqueIds);
                (alliances || []).forEach(function(a) { alliMap[a.id] = a; });
            }
            admins = data.map(function(a) {
                return { id: a.id, role: a.role, display_name: a.display_name, alliance_id: a.alliance_id, alliances: a.alliance_id && alliMap[a.alliance_id] ? alliMap[a.alliance_id] : null };
            });
        } catch(e) { admins = []; }
    }

    // ============================================================
    // DMs (tabla direct_messages, conversaciones admin<->admin)
    // ============================================================
    async function loadDMConversations() {
        try {
            // Mensajes donde participo (la RLS ya limita a sender/recipient/admin).
            var { data, error } = await window.supabase
                .from('direct_messages')
                .select('*')
                .or('sender_admin_id.eq.' + me.id + ',recipient_admin_id.eq.' + me.id)
                .order('created_at', { ascending: false })
                .limit(500);
            if (error) throw error;
            var map = {};
            (data || []).forEach(function(row) {
                var other = row.sender_admin_id === me.id ? row.recipient_admin_id : row.sender_admin_id;
                if (!map[other]) map[other] = { id: other, lastTs: row.created_at, unread: 0 };
                if (row.created_at > map[other].lastTs) map[other].lastTs = row.created_at;
                if (row.recipient_admin_id === me.id && !row.read_at) map[other].unread++;
            });
            dms = Object.keys(map).map(function(k) { return map[k]; })
                .sort(function(a, b) { return a.lastTs < b.lastTs ? 1 : -1; });
            saveDMsLocal();
        } catch(e) {
            console.error('[Chat] Error cargando conversaciones:', e);
            loadDMsLocal();
        }
    }

    // Respaldo local solo para recordar conversaciones abiertas manualmente.
    function loadDMsLocal() { try { var r = localStorage.getItem(LS_DM); if (r) dms = JSON.parse(r) || []; } catch(e) { dms = []; } }
    function saveDMsLocal() { try { localStorage.setItem(LS_DM, JSON.stringify(dms.map(function(d) { return { id: d.id }; }))); } catch(e) {} }

    async function markDMRead(otherId) {
        try {
            await window.supabase
                .from('direct_messages')
                .update({ read_at: new Date().toISOString() })
                .eq('sender_admin_id', otherId)
                .eq('recipient_admin_id', me.id)
                .is('read_at', null);
            var conv = dms.find(function(d) { return d.id === otherId; });
            if (conv) { conv.unread = 0; renderDMList(); }
        } catch(e) { console.error('[Chat] Error marcando leido:', e); }
    }

    // Realtime de DMs entrantes dirigidos a mi.
    function subscribeDMs() {
        if (dmSub) { try { dmSub.unsubscribe(); } catch(e) {} dmSub = null; }
        dmSub = window.supabase.channel('dm_inbox_' + me.id)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: 'recipient_admin_id=eq.' + me.id }, function(payload) {
                var row = payload.new;
                var other = row.sender_admin_id;
                var conv = dms.find(function(d) { return d.id === other; });
                if (!conv) { conv = { id: other, lastTs: row.created_at, unread: 0 }; dms.unshift(conv); }
                conv.lastTs = row.created_at;
                if (curChan === 'dm-' + other) {
                    var msg = dmRowToMsg(row);
                    if (addToCache(curChan, msg)) appendMsg(msg);
                    markDMRead(other);
                } else {
                    conv.unread++;
                }
                renderDMList();
            })
            .subscribe();
    }

    function dmRowToMsg(row) {
        return {
            id: 'dm_' + row.id,
            dmId: row.id,
            sid: row.sender_admin_id,
            name: row.sender_admin_id === me.id ? me.name : adminName(row.sender_admin_id),
            role: row.sender_admin_id === me.id ? me.role : adminRole(row.sender_admin_id),
            text: row.message || row.body || row.content || '',
            type: 'text',
            ts: row.created_at,
            persisted: true
        };
    }

    function adminName(id) { var a = admins.find(function(x) { return x.id === id; }); return a ? (a.display_name || 'Admin') : 'Admin'; }
    function adminRole(id) { var a = admins.find(function(x) { return x.id === id; }); return a ? a.role : null; }

    // ============================================================
    // SIDEBAR
    // ============================================================
    window.openSidebar = function() {
        var sidebar = document.getElementById('chat-sidebar');
        var overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.add('open');
        if (overlay) overlay.classList.remove('hidden');
    };
    window.closeSidebar = function() {
        var sidebar = document.getElementById('chat-sidebar');
        var overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.add('hidden');
    };

    function renderChans() {
        var el = document.getElementById('global-channels');
        if (!el) return;
        var h = '';
        channels.forEach(function(c) {
            var k = c.id;
            var name = c.name || k;
            var desc = c.type || '';
            h += '<button id="ch-' + k + '" onclick="switchChan(\'' + k + '\');closeSidebar();" class="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-700 transition flex items-center gap-2 ' + (curChan === k ? 'chan-active' : '') + '"><span class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm shrink-0">' + esc(name.charAt(0).toUpperCase()) + '</span><div class="min-w-0"><div class="font-medium truncate">' + esc(name) + '</div><div class="text-[10px] text-slate-400 truncate">' + esc(desc) + '</div></div></button>';
        });
        el.innerHTML = h || '<p class="text-xs text-slate-500 px-3">Sin canales</p>';
    }

    function renderDMList() {
        var el = document.getElementById('dm-list');
        if (!el) return;
        if (!dms.length) { el.innerHTML = '<p class="text-xs text-slate-500 px-3 py-2">Sin conversaciones</p>'; return; }
        el.innerHTML = dms.map(function(dm) {
            var a = admins.find(function(x) { return x.id === dm.id; });
            var n = a ? (a.display_name || 'Admin') : 'Desconocido';
            var t = a && a.alliances ? ' [' + a.alliances.tag + ']' : '';
            var cid = 'dm-' + dm.id;
            var badge = dm.unread > 0 ? '<span class="ml-auto text-[10px] bg-amber-500 text-slate-900 font-bold rounded-full px-1.5 py-0.5 shrink-0">' + dm.unread + '</span>' : '';
            return '<button id="ch-' + cid + '" onclick="switchChan(\'' + cid + '\');closeSidebar();" class="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-700 transition flex items-center gap-2 ' + (curChan === cid ? 'chan-active' : '') + '"><span class="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center text-xs shrink-0">&#128172;</span><div class="min-w-0"><div class="font-medium truncate">' + esc(n) + esc(t) + '</div><div class="text-[10px] text-slate-400">' + (a ? fmtRole(a.role) : '') + '</div></div>' + badge + '</button>';
        }).join('');
    }

    // ============================================================
    // DM SEARCH
    // ============================================================
    window.openDMSearch = function() {
        var modal = document.getElementById('dm-search-modal');
        var input = document.getElementById('dm-search-input');
        var results = document.getElementById('dm-search-results');
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        if (input) { input.value = ''; input.focus(); }
        if (results) results.innerHTML = '';
    };
    window.closeDMSearch = function() {
        var modal = document.getElementById('dm-search-modal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    };
    window.searchDMUsers = function() {
        var q = document.getElementById('dm-search-input').value.toLowerCase().trim();
        var el = document.getElementById('dm-search-results');
        if (!q || !el) { if (el) el.innerHTML = ''; return; }
        var f = admins.filter(function(a) { return (a.display_name || '').toLowerCase().includes(q) || (a.alliances && a.alliances.name || '').toLowerCase().includes(q); });
        el.innerHTML = f.length ? f.map(function(a) {
            return '<button onclick="startDM(\'' + a.id + '\')" class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 transition flex items-center gap-3"><span class="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">&#128100;</span><div><div class="font-medium text-sm">' + esc(a.display_name || 'Admin') + (a.alliances ? ' [' + esc(a.alliances.tag) + ']' : '') + '</div><div class="text-[11px] text-slate-500">' + fmtRole(a.role) + '</div></div></button>';
        }).join('') : '<p class="text-sm text-slate-400 text-center py-4">Sin resultados</p>';
    };
    window.startDM = function(aid) {
        if (!dms.some(function(d) { return d.id === aid; })) { dms.unshift({ id: aid, unread: 0, lastTs: null }); saveDMsLocal(); renderDMList(); }
        closeDMSearch();
        switchChan('dm-' + aid);
    };

    // ============================================================
    // SWITCH CHANNEL
    // ============================================================
    window.switchChan = async function(ch) {
        if (curChan === ch) return;
        if (rtSub) { try { await rtSub.unsubscribe(); } catch(e) {} rtSub = null; }
        if (pgSub) { try { await pgSub.unsubscribe(); } catch(e) {} pgSub = null; }
        curChan = ch;
        var title = document.getElementById('channel-title');
        var desc = document.getElementById('channel-status');
        if (isDM(ch)) {
            var oid = dmOtherId(ch);
            var a = admins.find(function(x) { return x.id === oid; });
            if (title) title.textContent = '\u{1F4AC} ' + (a ? a.display_name : 'Directo');
            if (desc) desc.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-green-500 dot-online"></span><span>' + (a ? fmtRole(a.role) + (a.alliances ? ' - ' + esc(a.alliances.name) : '') : 'Privado') + '</span>';
            markDMRead(oid);
        } else {
            var c = channels.find(function(x) { return x.id === ch; });
            if (title) title.textContent = c ? (c.name || c.id) : ch;
            if (desc) desc.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-green-500 dot-online"></span><span>' + (c && c.type ? esc(c.type) : '') + '</span>';
        }
        document.querySelectorAll('.chan-active').forEach(function(el) { el.classList.remove('chan-active'); });
        var btn = document.getElementById('ch-' + ch); if (btn) btn.classList.add('chan-active');
        await loadHistory(ch);
        if (!isDM(ch)) connectRT(ch);
    };

    // ============================================================
    // HISTORY & RENDER
    // ============================================================
    async function loadHistory(ch) {
        var el = document.getElementById('chat-scroll');
        if (el) el.innerHTML = '<div class="text-center py-8 text-slate-400"><div class="animate-spin text-2xl mb-2 inline-block">&#9203;</div><p class="text-xs">Cargando historial...</p></div>';
        try {
            if (isDM(ch)) {
                var oid = dmOtherId(ch);
                var { data: dmRows, error: dmErr } = await window.supabase
                    .from('direct_messages')
                    .select('*')
                    .or('and(sender_admin_id.eq.' + me.id + ',recipient_admin_id.eq.' + oid + '),and(sender_admin_id.eq.' + oid + ',recipient_admin_id.eq.' + me.id + ')')
                    .order('created_at', { ascending: true })
                    .limit(50);
                if (dmErr) throw dmErr;
                var dmMsgs = (dmRows || []).map(dmRowToMsg);
                setCache(ch, dmMsgs);
                renderMsgs(dmMsgs);
                return;
            }
            var { data, error } = await window.supabase.from('chat_messages').select('*').eq('channel', ch).order('created_at', { ascending: true }).limit(30);
            if (error) throw error;
            var msgs = (data || []).map(function(row) {
                return { id: 'db_' + row.id, dbId: row.id, sid: row.sender_admin_id, name: row.sender_name, role: row.sender_role, text: row.message, type: row.message_type || 'text', ts: row.created_at, persisted: true };
            });
            setCache(ch, msgs);
            renderMsgs(msgs);
        } catch(e) {
            console.error('Error loading history:', e);
            setCache(ch, []);
            if (el) el.innerHTML = '<div class="text-center py-12 text-slate-400"><div class="text-4xl mb-3">&#128172;</div><p class="text-sm">Sin mensajes previos. Escribe algo!</p></div>';
        }
    }

    function renderMsgs(msgs) {
        var el = document.getElementById('chat-scroll');
        if (!el) return;
        if (!msgs || !msgs.length) { el.innerHTML = '<div class="text-center py-12 text-slate-400"><div class="text-4xl mb-3">&#128172;</div><p class="text-sm">Sin mensajes. Escribe algo!</p></div>'; return; }
        var h = '';
        var lastD = null;
        msgs.forEach(function(m) {
            var cd = new Date(m.ts).toDateString();
            if (lastD !== cd) { h += '<div class="date-sep flex justify-center my-3"><span class="text-[10px] text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">' + fmtDate(m.ts) + '</span></div>'; lastD = cd; }
            h += msgHTML(m);
        });
        el.innerHTML = h;
        scrollToBottom(true);
    }

    function msgHTML(m) {
        if (m.type === 'sys') return '<div class="flex justify-center my-2"><span class="text-[11px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full">' + esc(m.text) + '</span></div>';
        var isMe = m.sid === me.id;
        var t = fmtTime(m.ts);
        // El reporte usa el id real del mensaje (reported_message_id).
        var rep = (!isMe && m.sid && m.dbId) ? '<button onclick="openReport(' + m.dbId + ',\'' + esc(m.name) + '\')" class="ml-1 text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition">&#128681;</button>' : '';
        var del = !m.persisted ? '<span class="text-[10px] opacity-40 ml-1">&#9203;</span>' : '';
        var fail = m.failed ? '<span class="retry-btn ml-1" onclick="retrySend(this)">Reintentar</span>' : '';
        var cls = isMe ? 'bubble-mine' : 'bubble-other';
        var al = isMe ? 'justify-end' : 'justify-start';
        var nc = isMe ? 'text-amber-900' : 'text-slate-500';
        var ocls = m.failed ? ' msg-failed' : (!m.persisted ? ' msg-delivered' : '');
        return '<div class="msg-in group flex ' + al + ' mb-1.5 px-1" data-msg-id="' + m.id + '" data-msg-text="' + esc(m.text) + '"><div class="max-w-[85%] md:max-w-[60%] ' + cls + ocls + ' rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm"><div class="flex items-center gap-1.5 mb-0.5 flex-wrap"><span class="text-[11px] font-bold ' + nc + '">' + esc(m.name) + '</span>' + (m.role ? '<span class="text-[10px] px-1 py-0.5 rounded bg-white/40">' + fmtRole(m.role) + '</span>' : '') + '<span class="text-[10px] opacity-50">' + t + '</span>' + del + rep + fail + '</div><div class="text-sm whitespace-pre-wrap break-words leading-relaxed">' + esc(m.text) + '</div></div></div>';
    }

    function appendMsg(msg) {
        var el = document.getElementById('chat-scroll');
        if (!el) return;
        var empty = el.querySelector('.text-center');
        if (empty) empty.remove();
        var msgs = getCache(curChan);
        var prev = msgs[msgs.length - 2];
        if (prev && new Date(prev.ts).toDateString() !== new Date(msg.ts).toDateString()) {
            var s = document.createElement('div');
            s.className = 'date-sep flex justify-center my-3';
            s.innerHTML = '<span class="text-[10px] text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full shadow-sm">' + fmtDate(msg.ts) + '</span>';
            el.appendChild(s);
        }
        var d = document.createElement('div');
        d.innerHTML = msgHTML(msg);
        if (d.firstElementChild) el.appendChild(d.firstElementChild);
        scrollToBottom();
    }

    function updateMsgStatus(msgId, status) {
        var el = document.querySelector('[data-msg-id="' + msgId + '"]');
        if (!el) return;
        var bubble = el.querySelector('[class*="max-w-"]');
        if (!bubble) return;
        if (status === 'persisted') {
            bubble.classList.remove('msg-delivered');
            var pending = bubble.querySelector('.opacity-40');
            if (pending) pending.remove();
        } else if (status === 'failed') {
            bubble.classList.add('msg-failed');
            bubble.classList.remove('msg-delivered');
            var pending2 = bubble.querySelector('.opacity-40');
            if (pending2) pending2.remove();
            var actions = bubble.querySelector('.flex.items-center.gap-1');
            if (actions && !actions.querySelector('.retry-btn')) {
                var rb = document.createElement('span');
                rb.className = 'retry-btn ml-1';
                rb.textContent = 'Reintentar';
                rb.onclick = function() { retrySend(this); };
                actions.appendChild(rb);
            }
        }
    }

    // ============================================================
    // SCROLL
    // ============================================================
    window.scrollToBottom = function(force) {
        var el = document.getElementById('chat-scroll');
        if (!el) return;
        var near = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (force || near) el.scrollTop = el.scrollHeight;
        if (!force) {
            var btn = document.getElementById('scroll-btn');
            if (btn) { if (near) btn.classList.add('hidden-btn'); else btn.classList.remove('hidden-btn'); }
        }
    };

    var chatScroll = document.getElementById('chat-scroll');
    if (chatScroll) {
        chatScroll.addEventListener('scroll', function() {
            var near = this.scrollHeight - this.scrollTop - this.clientHeight < 100;
            var btn = document.getElementById('scroll-btn');
            if (btn) { if (near) btn.classList.add('hidden-btn'); else btn.classList.remove('hidden-btn'); }
        });
    }

    // ============================================================
    // REALTIME (solo canales publicos; los DMs usan subscribeDMs)
    // ============================================================
    function connectRT(ch) {
        var bc = broadcastChan(ch);
        var dot = document.getElementById('status-dot');
        var txt = document.getElementById('status-text');
        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-yellow-400 dot-online';
        if (txt) txt.textContent = 'Conectando...';

        rtSub = window.supabase.channel(bc, { config: { broadcast: { self: false } } });
        rtSub
            .on('broadcast', { event: 'typing' }, function(p) {
                var ind = document.getElementById('typing-indicator');
                if (p.payload.sid !== me.id && ind) {
                    ind.textContent = p.payload.name + ' esta escribiendo...';
                    ind.classList.add('typing-dot');
                    clearTimeout(typingTimer);
                    typingTimer = setTimeout(function() { ind.textContent = ''; ind.classList.remove('typing-dot'); }, 3000);
                }
            })
            .subscribe(function(st) {
                var dot2 = document.getElementById('status-dot');
                var txt2 = document.getElementById('status-text');
                if (st === 'SUBSCRIBED') { if (dot2) dot2.className = 'w-1.5 h-1.5 rounded-full bg-green-500 dot-online'; if (txt2) txt2.textContent = 'En linea'; }
                else if (st === 'CLOSED' || st === 'CHANNEL_ERROR') { if (dot2) dot2.className = 'w-1.5 h-1.5 rounded-full bg-red-400 dot-online'; if (txt2) txt2.textContent = 'Desconectado'; }
                else { if (dot2) dot2.className = 'w-1.5 h-1.5 rounded-full bg-yellow-400 dot-online'; if (txt2) txt2.textContent = 'Conectando...'; }
            });

        pgSub = window.supabase.channel('pg_' + bc)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'channel=eq.' + ch }, function(payload) {
                var row = payload.new;
                var msg = { id: 'db_' + row.id, dbId: row.id, sid: row.sender_admin_id, name: row.sender_name, role: row.sender_role, text: row.message, type: row.message_type || 'text', ts: row.created_at, persisted: true };
                if (msg.sid === me.id) {
                    var cached = getCache(ch);
                    var pending = cached.find(function(m) { return m.sid === me.id && !m.persisted && m.text === msg.text; });
                    if (pending) { pending.id = msg.id; pending.dbId = msg.dbId; pending.persisted = true; updateMsgStatus(pending.id, 'persisted'); }
                    else if (addToCache(ch, msg)) appendMsg(msg);
                } else {
                    if (addToCache(ch, msg)) appendMsg(msg);
                }
            })
            .subscribe();
    }

    // ============================================================
    // SEND MESSAGE
    // ============================================================
    window.sendMessage = async function() {
        var inp = document.getElementById('chat-input');
        if (!inp) return;
        var txt = inp.value.trim();
        if (!txt || !curChan) return;
        inp.value = '';

        // DM: insert directo en direct_messages (RLS exige is_admin()).
        if (isDM(curChan)) {
            var oid = dmOtherId(curChan);
            var tempDmId = 'pending_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            var dmMsg = { id: tempDmId, sid: me.id, name: me.name, role: me.role, text: txt, type: 'text', ts: new Date().toISOString(), persisted: false };
            addToCache(curChan, dmMsg);
            appendMsg(dmMsg);
            try {
                var { data: dmInserted, error: dmError } = await window.supabase
                    .from('direct_messages')
                    .insert({ sender_admin_id: me.id, sender_name: me.name, recipient_admin_id: oid, message: txt })
                    .select().single();
                if (dmError) throw dmError;
                dmMsg.id = 'dm_' + dmInserted.id;
                dmMsg.dmId = dmInserted.id;
                dmMsg.persisted = true;
                updateMsgStatus(tempDmId, 'persisted');
            } catch(e) {
                console.error('Error enviando DM:', e);
                dmMsg.failed = true;
                updateMsgStatus(tempDmId, 'failed');
            }
            return;
        }

        // Canal: no escribir si el rol no tiene permiso (defensivo; la RLS tambien bloquea).
        var chan = channels.find(function(x) { return x.id === curChan; });
        if (chan && !window.ChatChannels.canPost(chan, me.role)) {
            window.showToast('No tienes permiso para escribir en este canal', 'warning');
            return;
        }

        var tempId = 'pending_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        var msg = { id: tempId, sid: me.id, name: me.name, role: me.role, text: txt, type: 'text', ts: new Date().toISOString(), persisted: false };
        addToCache(curChan, msg);
        appendMsg(msg);
        try {
            var { data: inserted, error } = await window.supabase.from('chat_messages').insert({ channel: curChan, sender_admin_id: me.id, sender_name: me.name, sender_role: me.role, message: txt, message_type: 'text' }).select().single();
            if (error) throw error;
            msg.id = 'db_' + inserted.id;
            msg.dbId = inserted.id;
            msg.persisted = true;
            updateMsgStatus(tempId, 'persisted');
        } catch(e) {
            console.error('Error persisting message:', e);
            msg.failed = true;
            updateMsgStatus(tempId, 'failed');
        }
    };

    var chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            if (rtSub && me && curChan && !isDM(curChan)) rtSub.send({ type: 'broadcast', event: 'typing', payload: { sid: me.id, name: me.name } });
        });
    }

    // ============================================================
    // RETRY / REPORT
    // ============================================================
    window.retrySend = function(el) {
        var msgEl = el.closest('[data-msg-id]');
        if (!msgEl) return;
        var text = msgEl.getAttribute('data-msg-text');
        if (!text) return;
        var cached = msgCache.get(curChan) || [];
        var idx = cached.findIndex(function(m) { return m.id === msgEl.getAttribute('data-msg-id'); });
        if (idx > -1) cached.splice(idx, 1);
        msgEl.remove();
        if (chatInput) chatInput.value = text;
        sendMessage();
    };

    window.openReport = function(dbId, sender) {
        reportMsg = { id: dbId, sender: sender };
        var msgText = document.getElementById('report-msg-text');
        var msgSender = document.getElementById('report-msg-sender');
        var modal = document.getElementById('report-modal');
        var reason = document.getElementById('report-reason');
        var cached = getCache(curChan);
        var m = cached.find(function(x) { return x.dbId === dbId; });
        if (msgText) msgText.textContent = m ? m.text : '';
        if (msgSender) msgSender.textContent = sender;
        if (reason) reason.value = 'spam';
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    };
    window.closeReportModal = function() {
        var modal = document.getElementById('report-modal');
        if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        reportMsg = null;
    };
    window.submitReport = async function() {
        if (!reportMsg) return;
        try {
            var reasonEl = document.getElementById('report-reason');
            // reported_message_id referencia el mensaje real (NO message_preview).
            var { error } = await window.supabase.from('chat_reports').insert({
                channel: curChan,
                reporter_id: me.id,
                reporter_name: me.name,
                reason: reasonEl ? reasonEl.value : 'spam',
                reported_message_id: reportMsg.id
            });
            if (error) throw error;
            window.showToast('Reporte enviado', 'success');
            closeReportModal();
        } catch(e) {
            console.error('Error al reportar:', e);
            window.showToast('Error al reportar', 'error');
        }
    };

    // Close modals on backdrop click
    var dmSearchModal = document.getElementById('dm-search-modal');
    if (dmSearchModal) {
        dmSearchModal.addEventListener('click', function(e) { if (e.target === e.currentTarget) closeDMSearch(); });
    }
    var reportModal = document.getElementById('report-modal');
    if (reportModal) {
        reportModal.addEventListener('click', function(e) { if (e.target === e.currentTarget) closeReportModal(); });
    }

    // Inicializar
    init();
})();
