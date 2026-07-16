// assets/js/notifications.js v1 - Badge de notificaciones y polling
// Depende de: messaging.js

var __ahNotifCount = 0;
var __ahNotifMessages = [];

function buildNotificationBell() {
    return '<div class="relative" id="ah-notif-wrapper">' +
        '<button onclick="toggleNotifDropdown()" class="relative px-2 py-1.5 rounded hover:bg-white/10 transition text-white/70">&#128276;' +
            '<span id="ah-notif-badge" class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center hidden">0</span>' +
        '</button>' +
        '<div id="ah-notif-dropdown" class="hidden absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">' +
            '<div class="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">' +
                '<span class="text-sm font-bold text-slate-700">&#128276; Mensajes Directos</span>' +
                '<span id="ah-notif-count-label" class="text-xs text-slate-400">0 sin leer</span></div>' +
            '<div id="ah-notif-list" class="max-h-64 overflow-y-auto"><div class="p-4 text-center text-xs text-slate-400">Cargando...</div></div>' +
            '<div class="p-2 border-t border-slate-100 bg-slate-50 text-center">' +
                '<a href="' + ahPath('admin/inbox.html') + '" class="text-xs text-blue-600 font-bold hover:text-blue-700">Ver todos los mensajes</a></div></div></div>';
}

function toggleNotifDropdown() {
    var dropdown = document.getElementById('ah-notif-dropdown');
    if (!dropdown) return;
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        renderNotifList();
        markVisibleNotifsAsRead();
    } else {
        dropdown.classList.add('hidden');
    }
}

function closeNotifDropdown() {
    var d = document.getElementById('ah-notif-dropdown');
    if (d) d.classList.add('hidden');
}

async function renderNotifList() {
    var list = document.getElementById('ah-notif-list');
    if (!list) return;
    if (__ahNotifMessages.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">No tienes mensajes directos</div>';
        return;
    }
    list.innerHTML = __ahNotifMessages.slice(0, 5).map(function(m) {
        var isUnread = !m.read_at;
        return '<div class="p-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer ' + (isUnread ? 'bg-blue-50/50' : '') + '" onclick="window.location.href=\'' + ahPath('admin/inbox.html?id=' + m.id) + '\'">' +
            '<div class="flex items-center justify-between mb-1"><span class="text-xs font-bold text-slate-700 truncate max-w-[180px]">' + (m.subject || 'Sin asunto') + '</span><span class="text-[10px] text-slate-400">' + formatDateTime(m.created_at) + '</span></div>' +
            '<p class="text-xs text-slate-500 truncate">' + m.message + '</p><p class="text-[10px] text-slate-400 mt-1">De: ' + (m.sender_name || 'Admin') + '</p></div>';
    }).join('');
}

async function markVisibleNotifsAsRead() {
    var unreadIds = __ahNotifMessages.filter(function(m) { return !m.read_at; }).map(function(m) { return m.id; });
    if (unreadIds.length === 0) return;
    var visibleIds = unreadIds.slice(0, 5);
    for (var i = 0; i < visibleIds.length; i++) {
        try { await markDirectMessageAsRead(visibleIds[i]); } catch(e) {}
    }
    setTimeout(refreshNotifBadge, 500);
}

async function refreshNotifBadge() {
    try {
        var count = await countUnreadDirectMessages();
        __ahNotifCount = count;
        var badge = document.getElementById('ah-notif-badge');
        var label = document.getElementById('ah-notif-count-label');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        if (label) label.textContent = count + ' sin leer';
        var messages = await fetchRecentDirectMessages(10);
        __ahNotifMessages = messages || [];
    } catch (e) {
        console.error('[Notif] Error:', e);
    }
}

function startNotifPolling() {
    if (window.__ahNotifInterval) clearInterval(window.__ahNotifInterval);
    setTimeout(function() {
        refreshNotifBadge().catch(function(e) { console.error('[Notif] Init error:', e); });
    }, 2000);
    window.__ahNotifInterval = setInterval(function() {
        refreshNotifBadge().catch(function(e) { console.error('[Notif] Polling error:', e); });
    }, 60000);
}

document.addEventListener('click', function(e) {
    var w = document.getElementById('ah-notif-wrapper');
    if (w && !w.contains(e.target)) closeNotifDropdown();
});

window.buildNotificationBell = buildNotificationBell;
window.toggleNotifDropdown = toggleNotifDropdown;
window.closeNotifDropdown = closeNotifDropdown;
window.renderNotifList = renderNotifList;
window.markVisibleNotifsAsRead = markVisibleNotifsAsRead;
window.refreshNotifBadge = refreshNotifBadge;
window.startNotifPolling = startNotifPolling;
