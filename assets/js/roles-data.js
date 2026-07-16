// assets/js/roles-data.js v2 - Definicion pura de roles y paneles de navegacion
// Sin logica, sin funciones. Solo datos JSON.
// v2: Removed duplicate event_admin, removed global Import tab, added review-committee to moderator

var ROLE_HIERARCHY = {
    superadmin: 5,
    event_admin: 4,
    alliance_leader: 3,
    moderator: 2,
    co_leader: 2,
    officer: 1
};

var ROLE_PANELS = {
    superadmin: {
        label: 'Super Admin', badgeClass: 'bg-red-500', icon: '&#128081;',
        navLinks: [
            { href: 'admin/index.html', label: '&#128202; Dashboard', section: 'main' },
            { href: 'admin/matches.html', label: '&#127918; Partidas', section: 'main' },
            { href: 'admin/players.html', label: '&#128100; Jugadores', section: 'main' },
            { href: 'admin/alliances.html', label: '&#127988; Alianzas', section: 'main' },
            { href: 'admin/invites.html', label: '&#128273; Invitar', section: 'tools' },
            { href: 'admin/leagues.html', label: '&#127942; Ligas', section: 'tools', devBadge: true },
            { href: 'admin/admins.html', label: '&#128101; Admins', section: 'tools' },
            { href: 'admin/strikes.html', label: '&#9889; Strikes', section: 'tools' },
            { href: 'admin/reports.html', label: '&#128680; Reportes', section: 'tools' },
            { href: 'admin/rules-editor.html', label: '&#128220; Reglas', section: 'tools' },
            { href: 'admin/sanctions-engine.html', label: '&#9881;&#65039; Sanciones', section: 'tools' },
            { href: 'admin/leader-requests.html', label: '&#128203; Solicitudes Lider', section: 'tools' },
            { href: 'chat.html', label: '&#128172; Chat', section: 'comms' },
        ],
        quickActions: [
            { label: '&#10133; Nueva Partida', action: 'openMatchModal()' },
        ]
    },
    event_admin: {
        label: 'Admin Eventos', badgeClass: 'bg-blue-500', icon: '&#127919;',
        navLinks: [
            { href: 'admin/index.html', label: '&#128202; Dashboard', section: 'main' },
            { href: 'admin/matches.html', label: '&#127918; Partidas', section: 'main' },
            { href: 'admin/players.html', label: '&#128100; Jugadores', section: 'main' },
            { href: 'admin/alliances.html', label: '&#127988; Alianzas', section: 'main' },
            { href: 'admin/invites.html', label: '&#128273; Invitar', section: 'tools' },
            { href: 'admin/leagues.html', label: '&#127942; Ligas', section: 'tools', devBadge: true },
            { href: 'admin/admins.html', label: '&#128101; Admins', section: 'tools' },
            { href: 'admin/strikes.html', label: '&#9889; Strikes', section: 'tools' },
            { href: 'admin/reports.html', label: '&#128680; Reportes', section: 'tools' },
            { href: 'admin/rules-editor.html', label: '&#128220; Reglas', section: 'tools' },
            { href: 'admin/leader-requests.html', label: '&#128203; Solicitudes Lider', section: 'tools' },
            { href: 'chat.html', label: '&#128172; Chat', section: 'comms' },
        ],
        quickActions: [{ label: '&#10133; Nueva Partida', action: 'openMatchModal()' }]
    },
    alliance_leader: {
        label: 'Lider de Alianza', badgeClass: 'bg-green-500', icon: '&#127988;',
        navLinks: [
            { href: 'leader-dashboard.html', label: '&#127968; Mi Alianza', section: 'main' },
            { href: 'leader-dashboard.html?tab=matches', label: '&#127918; Partidas', section: 'main' },
            { href: 'admin/players.html', label: '&#128100; Jugadores', section: 'main' },
            { href: 'admin/duel-manager.html', label: '&#9876;&#65039; Duelos', section: 'main' },
            { href: 'admin/officers.html', label: '&#11088; Mi Equipo', section: 'main' },
            { href: 'admin/strikes.html', label: '&#9889; Strikes', section: 'tools' },
            { href: 'admin/reports.html', label: '&#128680; Reportes', section: 'tools' },
            { href: 'chat.html', label: '&#128172; Chat', section: 'comms' },
        ],
        quickActions: [
            { label: '&#10133; Crear Partida', action: 'openCreateMatchModal()' },
            { label: '&#9876;&#65039; Preparar Duelo', href: 'admin/duel-manager.html' },
        ]
    },
    co_leader: {
        label: 'Co-Lider', badgeClass: 'bg-teal-500', icon: '&#11088;',
        navLinks: [
            { href: 'leader-dashboard.html', label: '&#127968; Mi Alianza', section: 'main' },
            { href: 'leader-dashboard.html?tab=matches', label: '&#127918; Partidas', section: 'main' },
            { href: 'admin/players.html', label: '&#128100; Jugadores', section: 'main' },
            { href: 'admin/duel-manager.html', label: '&#9876;&#65039; Duelos', section: 'main' },
            { href: 'admin/officers.html', label: '&#11088; Mi Equipo', section: 'main' },
            { href: 'admin/strikes.html', label: '&#9889; Strikes', section: 'tools' },
            { href: 'admin/reports.html', label: '&#128680; Reportes', section: 'tools' },
            { href: 'chat.html', label: '&#128172; Chat', section: 'comms' },
        ],
        quickActions: [
            { label: '&#10133; Crear Partida', action: 'openCreateMatchModal()' },
            { label: '&#9876;&#65039; Preparar Duelo', href: 'admin/duel-manager.html' },
        ]
    },
    officer: {
        label: 'Oficial', badgeClass: 'bg-cyan-500', icon: '&#127775;',
        navLinks: [
            { href: 'leader-dashboard.html', label: '&#127968; Mi Alianza', section: 'main' },
            { href: 'admin/players.html', label: '&#128100; Jugadores', section: 'main' },
            { href: 'admin/strikes.html', label: '&#9889; Strikes', section: 'tools' },
            { href: 'chat.html', label: '&#128172; Chat', section: 'comms' },
        ],
        quickActions: [{ label: '&#128100; Ver Jugadores', href: 'admin/players.html' }]
    },
    moderator: {
        label: 'Moderador', badgeClass: 'bg-purple-500', icon: '&#128737;&#65039;',
        navLinks: [
            { href: 'admin/index.html', label: '&#128202; Dashboard', section: 'main' },
            { href: 'admin/matches.html', label: '&#127918; Partidas', section: 'main' },
            { href: 'admin/players.html', label: '&#128100; Jugadores', section: 'main' },
            { href: 'admin/strikes.html', label: '&#9889; Strikes', section: 'tools' },
            { href: 'admin/reports.html', label: '&#128680; Reportes', section: 'tools' },
            { href: 'admin/review-committee.html', label: '&#128736;&#65039; Comite', section: 'tools' },
        ],
        quickActions: [{ label: '&#128220; Ver Reportes', href: 'admin/reports.html' }]
    },
};

window.ROLE_HIERARCHY = ROLE_HIERARCHY;
window.ROLE_PANELS = ROLE_PANELS;
