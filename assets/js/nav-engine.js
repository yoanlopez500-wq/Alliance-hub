// assets/js/nav-engine.js v2 - Motor de navegacion por rol con mode preference
// Depende de: base.js, roles-data.js, auth-core.js, notifications.js, pwa-utils.js

window.__ahNavRetryCount = 0;

// ===================== DETECCION DE SESION =====================

function hasPlayerSession() {
    return !!localStorage.getItem('ah_v2_player_id') && !!localStorage.getItem('ah_v2_player_token');
}

function getPlayerDataNav() {
    try {
        var pid = localStorage.getItem('ah_v2_player_id');
        var name = localStorage.getItem('ah_v2_player_name');
        var token = localStorage.getItem('ah_v2_player_token');
        if (!pid || !token) return null;
        return { playerId: pid, displayName: name, token: token };
    } catch(e) { return null; }
}

// ===================== INICIALIZACION PRINCIPAL =====================

async function initAdminNav() {
    var nav = document.getElementById('admin-nav');
    if (!nav) return;

    try {
        var sessionData = await supabase.auth.getSession();
        var adminSession = sessionData.data.session;

        var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : getPlayerDataNav();
        var isPlayer = !!(playerData && playerData.playerId && playerData.token);

        var isAdminPage = document.body.getAttribute('data-role') === 'admin';
        var isLeaderPage = document.body.getAttribute('data-role') === 'alliance_leader';
        var isPublicPage = document.body.getAttribute('data-role') === 'public';

        // Check mode preference
        var modePref = typeof getModePreference === 'function' ? getModePreference() : null;

        // DUAL MODE: both admin and player sessions active
        if (adminSession && isPlayer) {
            var admin = await getAdminRole();

            // If user explicitly chose player mode, render player nav (even on admin pages)
            if (modePref === 'player') {
                renderPlayerNav(nav, playerData, adminSession);
                return;
            }

            // If user explicitly chose admin mode, render admin nav
            if (modePref === 'admin') {
                if (isAdminPage || isLeaderPage) {
                    renderAdminNav(nav, adminSession, admin || { role: 'moderator' });
                } else {
                    renderAdminOnPublicNav(nav, adminSession);
                }
                return;
            }

            // No preference: use page context to decide
            renderFluidNav(nav, adminSession, admin || { role: 'moderator' }, playerData, isAdminPage || isLeaderPage);
            return;
        }

        // Retry si supabase tarda
        if (isPlayer && !adminSession && window.__ahNavRetryCount < 3) {
            window.__ahNavRetryCount++;
            console.log('[NavEngine] Retry nav detection #' + window.__ahNavRetryCount);
            setTimeout(function() { initAdminNav(); }, 500);
            renderPlayerNav(nav, playerData, null);
            return;
        }

        // Solo ADMIN
        if (adminSession && (isAdminPage || isLeaderPage)) {
            var admin = await getAdminRole();
            renderAdminNav(nav, adminSession, admin || { role: 'moderator' });
            return;
        }

        // Solo ADMIN en pagina publica
        if (adminSession) {
            renderAdminOnPublicNav(nav, adminSession);
            return;
        }

        // Solo JUGADOR
        if (isPlayer) {
            renderPlayerNav(nav, playerData, null);
            return;
        }

        // Publico
        renderPublicNav(nav);

    } catch (err) {
        console.error('[NavEngine] initAdminNav error:', err);
        var playerData = (typeof getPlayerData === 'function') ? getPlayerData() : getPlayerDataNav();
        var isPlayer = !!(playerData && playerData.playerId && playerData.token);
        if (isPlayer) {
            renderPlayerNav(nav, playerData, null);
        } else {
            renderPublicNav(nav);
        }
    }
}

// ===================== RENDERERS =====================

function renderFluidNav(nav, session, admin, playerData, onAdminPage) {
    var role = (admin && admin.role) || 'moderator';
    var panel = ROLE_PANELS[role] || ROLE_PANELS.moderator;

    var logoLink = onAdminPage
        ? ahPath(role === 'alliance_leader' ? 'leader-dashboard.html' : 'admin/index.html')
        : ahPath('dashboard.html');

    var mkLink = function(l) {
        var devBadge = l.devBadge ? '<span class="text-[9px] px-1 py-0.5 rounded font-bold ml-1 bg-orange-500 text-white">DEV</span>' : '';
        return '<a href="' + ahPath(l.href) + '" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap hover:bg-white/10 hover:text-white text-white/70">' + l.label + devBadge + '</a>';
    };

    var mainLinks = panel.navLinks.filter(function(l) { return l.section === 'main'; });
    var toolsLinks = panel.navLinks.filter(function(l) { return l.section === 'tools'; });
    var commsLinks = panel.navLinks.filter(function(l) { return l.section === 'comms'; });

    var navBarHTML = mainLinks.map(mkLink).join('');
    if (toolsLinks.length) {
        navBarHTML += '<div class="w-px mx-1 bg-white/10 shrink-0"></div>' + toolsLinks.map(mkLink).join('');
    }
    if (commsLinks.length) {
        navBarHTML += '<div class="w-px mx-1 bg-white/10 shrink-0"></div>' + commsLinks.map(mkLink).join('');
    }

    var notifHTML = '';
    try { notifHTML = buildNotificationBell(); } catch(e) { notifHTML = ''; }

    nav.innerHTML =
        '<nav class="sticky top-0 z-50 bg-slate-900 border-b border-indigo-900/50">' +
            '<div class="max-w-7xl mx-auto px-3 sm:px-4 py-3">' +
                '<div class="flex items-center justify-between gap-2 flex-wrap">' +
                    '<div class="flex items-center gap-2 min-w-0">' +
                        '<a href="' + logoLink + '" class="text-lg font-bold flex items-center gap-2 text-orange-400 shrink-0">' +
                            '<span>&#9876;&#65039;</span><span class="hidden sm:inline">Alliance Hub</span>' +
                        '</a>' +
                        '<span class="text-[10px] px-2 py-1 rounded font-bold ' + panel.badgeClass + ' text-white shrink-0">' + panel.label + '</span>' +
                    '</div>' +
                    '<div class="flex items-center gap-1.5 shrink-0">' + notifHTML +
                        '<button onclick="switchToPlayerMode()" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-green-700 hover:bg-green-600 text-white">&#127918; Jugador</button>' +
                        '<button onclick="switchToAdminMode()" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-orange-600 hover:bg-orange-500 text-white">&#128202; Admin</button>' +
                        '<div class="relative group">' +
                            '<button class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-500/80 hover:bg-red-500 text-white transition">&#9660;</button>' +
                            '<div class="hidden group-hover:block absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl z-50 bg-slate-900 border border-indigo-900/50 overflow-hidden">' +
                                '<button onclick="logout()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-slate-300">Cerrar sesion admin</button>' +
                                '<button onclick="playerLogout()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-slate-300">Cerrar sesion jugador</button>' +
                                '<button onclick="logoutAll()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-red-400">Salir de todo</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="flex gap-1 mt-2 overflow-x-auto pb-1 scrollbar-hide">' + navBarHTML + '</div>' +
            '</div>' +
        '</nav>';

    try { startNotifPolling(); } catch(e) {}
}

function renderAdminNav(nav, session, admin) {
    var role = (admin && admin.role) || 'moderator';
    var panel = ROLE_PANELS[role] || ROLE_PANELS.moderator;

    var hasPlayer = hasPlayerSession();
    var playerBtn = hasPlayer
        ? '<button onclick="switchToPlayerMode()" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-green-700 hover:bg-green-600 text-white">&#127918; Modo Jugador</button>'
        : '<a href="' + ahPath('login-player.html') + '" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-green-700 hover:bg-green-600 text-white">&#127918; Entrar como Jugador</a>';

    var mkLink = function(l) {
        var devBadge = l.devBadge ? '<span class="text-[9px] px-1 py-0.5 rounded font-bold ml-1 bg-orange-500 text-white">DEV</span>' : '';
        return '<a href="' + ahPath(l.href) + '" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap hover:bg-white/10 hover:text-white text-white/70">' + l.label + devBadge + '</a>';
    };

    var mainLinks = panel.navLinks.filter(function(l) { return l.section === 'main'; });
    var toolsLinks = panel.navLinks.filter(function(l) { return l.section === 'tools'; });
    var commsLinks = panel.navLinks.filter(function(l) { return l.section === 'comms'; });

    var logoutHTML = '<div class="relative group">' +
        '<button class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-500/80 hover:bg-red-500 text-white transition">Salir &#9660;</button>' +
        '<div class="hidden group-hover:block absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl z-50 bg-slate-900 border border-indigo-900/50 overflow-hidden">' +
            '<button onclick="logoutAll()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-red-400">Salir de todo</button>' +
        '</div></div>';

    var notifHTML = '';
    try { notifHTML = buildNotificationBell(); } catch(e) { notifHTML = ''; }

    var navBarHTML = mainLinks.map(mkLink).join('');
    if (toolsLinks.length) {
        navBarHTML += '<div class="w-px mx-1 bg-white/10 shrink-0"></div>' + toolsLinks.map(mkLink).join('');
    }
    if (commsLinks.length) {
        navBarHTML += '<div class="w-px mx-1 bg-white/10 shrink-0"></div>' + commsLinks.map(mkLink).join('');
    }

    var homeLink = (role === 'alliance_leader') ? 'leader-dashboard.html' : 'admin/index.html';

    nav.innerHTML =
        '<nav class="sticky top-0 z-50 bg-slate-900 border-b border-indigo-900/50">' +
            '<div class="max-w-7xl mx-auto px-3 sm:px-4 py-3">' +
                '<div class="flex items-center justify-between gap-2 flex-wrap">' +
                    '<div class="flex items-center gap-2 min-w-0">' +
                        '<a href="' + ahPath(homeLink) + '" class="text-lg font-bold flex items-center gap-2 text-orange-400 shrink-0">' +
                            '<span>&#9876;&#65039;</span><span class="hidden sm:inline">Alliance Hub</span>' +
                        '</a>' +
                        '<span class="text-[10px] px-2 py-1 rounded font-bold ' + panel.badgeClass + ' text-white shrink-0">' + panel.label + '</span>' +
                    '</div>' +
                    '<div class="flex items-center gap-1.5 shrink-0">' + notifHTML + playerBtn + logoutHTML + '</div>' +
                '</div>' +
                '<div class="flex gap-1 mt-2 overflow-x-auto pb-1 scrollbar-hide">' + navBarHTML + '</div>' +
            '</div>' +
        '</nav>';

    try { startNotifPolling(); } catch(e) {}
}

function renderPlayerNav(nav, playerData, adminSession) {
    var name = (playerData && playerData.displayName) ? playerData.displayName : 'Jugador';

    var adminBtn = adminSession
        ? '<button onclick="switchToAdminMode()" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-orange-600 hover:bg-orange-500 text-white">&#128202; Admin</button>'
        : '<a href="' + ahPath('login.html') + '" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-orange-600 hover:bg-orange-500 text-white">&#128202; Login Admin</a>';

    nav.innerHTML =
        '<nav class="sticky top-0 z-50 bg-slate-900 border-b border-indigo-900/50">' +
            '<div class="max-w-7xl mx-auto px-3 sm:px-4 py-3">' +
                '<div class="flex items-center justify-between gap-2 flex-wrap">' +
                    '<div class="flex items-center gap-2 min-w-0">' +
                        '<a href="' + ahPath('dashboard.html') + '" class="text-lg font-bold flex items-center gap-2 text-orange-400 shrink-0">' +
                            '<span>&#9876;&#65039;</span><span class="hidden sm:inline">Alliance Hub</span>' +
                        '</a>' +
                        '<span class="text-[10px] px-2 py-1 rounded font-bold bg-green-700 text-white shrink-0">JUGADOR</span>' +
                    '</div>' +
                    '<div class="flex items-center gap-1.5 shrink-0">' + adminBtn +
                        '<span class="text-xs hidden md:inline max-w-[80px] truncate text-slate-400">' + name + '</span>' +
                        '<div class="relative group">' +
                            '<button class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-500/80 hover:bg-red-500 text-white transition">&#9660;</button>' +
                            '<div class="hidden group-hover:block absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl z-50 bg-slate-900 border border-indigo-900/50 overflow-hidden">' +
                                '<button onclick="playerLogout()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-slate-300">Cerrar sesion jugador</button>' +
                                '<button onclick="logoutAll()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-red-400">Salir de todo</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="flex gap-1 mt-2 overflow-x-auto pb-1 scrollbar-hide">' +
                    '<a href="' + ahPath('dashboard.html') + '" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap hover:bg-white/10 hover:text-white text-white/70">&#127918; Partidas</a>' +
                    '<a href="' + ahPath('rankings.html') + '" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap hover:bg-white/10 hover:text-white text-white/70">&#127942; Rankings</a>' +
                    '<a href="' + ahPath('rules.html') + '" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap hover:bg-white/10 hover:text-white text-white/70">&#128220; Reglas</a>' +
                    '<a href="' + ahPath('alliance-panel.html') + '" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap hover:bg-white/10 hover:text-white text-white/70">&#127988; Alianza</a>' +
                '</div>' +
            '</div>' +
        '</nav>';
}

function renderAdminOnPublicNav(nav, adminSession) {
    var hasPlayer = hasPlayerSession();
    var playerBtn = hasPlayer
        ? '<button onclick="switchToPlayerMode()" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-green-700 hover:bg-green-600 text-white">&#127918; Modo Jugador</button>'
        : '<a href="' + ahPath('login-player.html') + '" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-green-700 hover:bg-green-600 text-white">&#127918; Entrar como Jugador</a>';

    nav.innerHTML =
        '<nav class="sticky top-0 z-50 bg-slate-900 border-b border-indigo-900/50">' +
            '<div class="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2 flex-wrap">' +
                '<a href="' + ahPath('index.html') + '" class="text-lg font-bold flex items-center gap-2 text-orange-400 shrink-0">' +
                    '<span>&#9876;&#65039;</span><span class="hidden sm:inline">Alliance Hub</span>' +
                '</a>' +
                '<div class="flex items-center gap-1.5 shrink-0">' + playerBtn +
                    '<button onclick="switchToAdminMode()" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-orange-600 hover:bg-orange-500 text-white">&#128202; Ir a Admin</button>' +
                    '<div class="relative group">' +
                        '<button class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-500/80 hover:bg-red-500 text-white transition">Salir &#9660;</button>' +
                        '<div class="hidden group-hover:block absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl z-50 bg-slate-900 border border-indigo-900/50 overflow-hidden">' +
                            '<button onclick="logout()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-slate-300">Cerrar sesion</button>' +
                            '<button onclick="logoutAll()" class="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-red-400">Salir de todo</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</nav>';
}

function renderPublicNav(nav) {
    nav.innerHTML =
        '<nav class="sticky top-0 z-50 bg-slate-900 border-b border-indigo-900/50">' +
            '<div class="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2 flex-wrap">' +
                '<a href="' + ahPath('index.html') + '" class="text-lg font-bold flex items-center gap-2 text-orange-400 shrink-0">' +
                    '<span>&#9876;&#65039;</span><span class="hidden sm:inline">Alliance Hub</span>' +
                '</a>' +
                '<div class="flex items-center gap-1.5 shrink-0">' +
                    '<a href="' + ahPath('rules.html') + '" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-white/[0.08] hover:bg-white/10 text-slate-300">&#128220; Reglas</a>' +
                    '<a href="' + ahPath('login.html') + '" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-orange-600 hover:bg-orange-500 text-white">&#128202; Admin</a>' +
                    '<a href="' + ahPath('login-player.html') + '" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-green-700 hover:bg-green-600 text-white">&#127918; Entrar</a>' +
                '</div>' +
            '</div>' +
        '</nav>';
}

// ===================== AUTO-INIT =====================

document.addEventListener('DOMContentLoaded', function() {
    window.__ahNavRetryCount = 0;
    initAdminNav().catch(function(e) {
        console.error('[NavEngine] DOMContentLoaded init error:', e);
        var nav = document.getElementById('admin-nav');
        if (nav) renderPublicNav(nav);
    });
});

window.initAdminNav = initAdminNav;
window.renderPlayerNav = renderPlayerNav;
window.renderPublicNav = renderPublicNav;
window.hasPlayerSession = hasPlayerSession;
