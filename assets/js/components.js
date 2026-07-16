// assets/js/components.js v1 - Sistema de inyeccion de componentes HTML
// Inyecta HTML reutilizable con clases de Tailwind CSS

var AhComponents = (function() {
    var registry = {};

    // Registrar un componente
    function register(name, factoryFn) {
        registry[name] = factoryFn;
    }

    // Renderizar un componente a string HTML
    function render(name, props) {
        props = props || {};
        var factory = registry[name];
        if (!factory) {
            console.warn('[Components] Componente no registrado:', name);
            return '<!-- Componente "' + name + '" no encontrado -->';
        }
        try {
            return factory(props);
        } catch(e) {
            console.error('[Components] Error renderizando', name, e);
            return '<!-- Error en componente "' + name + '" -->';
        }
    }

    // Renderizar e inyectar en un elemento del DOM
    function inject(name, props, containerIdOrElement) {
        var container = typeof containerIdOrElement === 'string'
            ? document.getElementById(containerIdOrElement)
            : containerIdOrElement;
        if (!container) {
            console.warn('[Components] Contenedor no encontrado:', containerIdOrElement);
            return;
        }
        container.innerHTML = render(name, props);
    }

    // Verificar si un componente existe
    function exists(name) {
        return !!registry[name];
    }

    // Listar componentes registrados
    function list() {
        return Object.keys(registry);
    }

    return {
        register: register,
        render: render,
        inject: inject,
        exists: exists,
        list: list
    };
})();

// ===================== COMPONENTES BASE =====================

// Modal reutilizable
AhComponents.register('modal', function(props) {
    var id = props.id || 'modal-' + Math.random().toString(36).substr(2, 9);
    var title = props.title || '';
    var gradient = props.gradient || 'linear-gradient(135deg,#ff6f00,#ff8f00)';
    var content = props.content || '';
    var actions = props.actions || '';
    var sizeClass = props.size || 'max-w-lg';
    return '<div id="' + id + '" class="modal">' +
        '<div class="rounded-2xl w-full ' + sizeClass + ' max-h-[90vh] overflow-y-auto" style="background:#11183a;border:1px solid #1a237e;">' +
            '<div class="p-5 border-b flex items-center justify-between rounded-t-2xl" style="background:' + gradient + ';border-color:#1a237e;">' +
                '<h2 class="text-lg font-bold text-white">' + title + '</h2>' +
                '<button onclick="document.getElementById(\'' + id + '\').classList.remove(\'active\')" class="text-white hover:opacity-70 text-xl">&#10005;</button>' +
            '</div>' +
            '<div class="p-5">' + content + '</div>' +
            (actions ? '<div class="p-5 border-t flex gap-3" style="border-color:#1a237e;">' + actions + '</div>' : '') +
        '</div>' +
    '</div>';
});

// Estado de carga
AhComponents.register('loading-state', function(props) {
    var message = props.message || 'Cargando...';
    return '<div class="text-center py-8" style="color:#9fa8da;">' +
        '<div class="inline-block w-8 h-8 border-2 rounded-full animate-spin mb-3" style="border-color:#1a237e;border-top-color:#ff8f00;"></div>' +
        '<p class="text-sm">' + message + '</p>' +
    '</div>';
});

// Estado vacio
AhComponents.register('empty-state', function(props) {
    var icon = props.icon || '&#128230;';
    var message = props.message || 'Sin resultados';
    var subtext = props.subtext || '';
    return '<div class="text-center py-8" style="color:#9fa8da;">' +
        '<div class="text-3xl mb-2">' + icon + '</div>' +
        '<p class="text-sm font-medium">' + message + '</p>' +
        (subtext ? '<p class="text-xs mt-1">' + subtext + '</p>' : '') +
    '</div>';
});

// Error state
AhComponents.register('error-state', function(props) {
    var message = props.message || 'Error al cargar';
    var retry = props.retry !== false;
    var onRetry = props.onRetry || '';
    return '<div class="text-center py-8 text-red-400">' +
        '<div class="text-3xl mb-2">&#9888;&#65039;</div>' +
        '<p class="text-sm font-medium">' + message + '</p>' +
        (retry && onRetry ? '<button onclick="' + onRetry + '" class="mt-3 px-4 py-2 rounded-lg text-xs font-bold transition" style="background:#1a237e;color:#e8eaf6;">Reintentar</button>' : '') +
    '</div>';
});

// Tabla de datos
AhComponents.register('data-table', function(props) {
    var headers = props.headers || [];
    var rows = props.rows || [];
    var emptyMessage = props.emptyMessage || 'Sin datos';

    if (rows.length === 0) {
        return AhComponents.render('empty-state', { message: emptyMessage });
    }

    var headerHtml = headers.map(function(h) {
        return '<th class="p-3 text-left text-xs font-bold uppercase tracking-wider" style="color:#9fa8da;background:rgba(255,255,255,0.03);">' + h + '</th>';
    }).join('');

    var rowsHtml = rows.map(function(cells) {
        return '<tr style="border-bottom:1px solid #1a237e;">' + cells.map(function(c) {
            return '<td class="p-3">' + c + '</td>';
        }).join('') + '</tr>';
    }).join('');

    return '<div class="rounded-xl overflow-x-auto" style="background:#11183a;border:1px solid #1a237e;">' +
        '<table class="w-full text-sm">' +
            '<thead><tr>' + headerHtml + '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
    '</div>';
});

// Card de partida
AhComponents.register('match-card', function(props) {
    var match = props.match || {};
    var alliance = props.alliance || null;
    var href = props.href || '#';
    var allianceInfo = alliance ? ' [' + alliance.tag + ']' : '';
    var statusBadge = typeof getStatusBadge === 'function' ? getStatusBadge(match.status) : match.status;
    var typeBadge = typeof getTypeBadge === 'function' ? getTypeBadge(match.match_type || match.type) : (match.match_type || match.type);
    var regCount = props.regCount || 0;

    return '<a href="' + href + '" class="block rounded-xl p-5 transition" style="background:#11183a;border:1px solid #1a237e;" onmouseover="this.style.borderColor=\'#ff6f00\'" onmouseout="this.style.borderColor=\'#1a237e\'">' +
        '<div class="flex items-center justify-between mb-2">' +
            '<h3 class="font-bold text-lg" style="color:#e8eaf6;">&#127918; ' + (match.name || 'Partida') + allianceInfo + '</h3>' +
            '<span class="text-xs" style="color:#9fa8da;">' + regCount + ' &#128100;</span>' +
        '</div>' +
        '<div class="flex gap-2 flex-wrap mb-2">' + statusBadge + ' ' + typeBadge + '</div>' +
        '<p class="text-xs" style="color:#9fa8da;">Creada: ' + (typeof formatDate === 'function' ? formatDate(match.created_at) : match.created_at) + '</p>' +
    '</a>';
});

// Player row (fila de jugador reutilizable)
AhComponents.register('player-row', function(props) {
    var player = props.player || {};
    var prefix = props.prefix || '';
    var suffix = props.suffix || '';
    var avatarColor = props.avatarColor || '#2196f3';
    var initial = player.current_username ? player.current_username.charAt(0).toUpperCase() : '?';

    return '<div class="flex items-center gap-3">' +
        '<div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style="background:' + avatarColor + '15;color:' + avatarColor + ';">' + initial + '</div>' +
        '<div class="min-w-0 flex-1">' +
            '<div class="flex items-center gap-1 flex-wrap">' + prefix + '<span class="font-bold text-sm" style="color:#e8eaf6;">' + (player.current_username || 'Jugador ' + player.id) + '</span>' + suffix + '</div>' +
            (props.subtext ? '<div class="text-xs" style="color:#9fa8da;">' + props.subtext + '</div>' : '') +
        '</div>' +
    '</div>';
});

// Badge de acciones para admin (strike, suspender, quitar)
AhComponents.register('admin-player-actions', function(props) {
    var playerId = props.playerId || 0;
    var playerName = (props.playerName || '').replace(/'/g, "\\'");
    var isSuspended = props.isSuspended || false;
    var regId = props.regId || 0;
    var matchId = props.matchId || '';

    var html = '';
    html += '<button onclick="openApplyStrike(' + playerId + ', \'' + playerName + '\')" class="px-2 py-1 rounded text-xs font-bold hover:opacity-80 transition" style="background:rgba(255,143,0,0.1);color:#ff8f00;border:1px solid rgba(255,143,0,0.2);" title="Strike">&#9889;</button>';
    if (!isSuspended) {
        html += '<button onclick="openSuspendModal(' + playerId + ', \'' + playerName + '\')" class="px-2 py-1 rounded text-xs font-bold hover:opacity-80 transition" style="background:rgba(255,143,0,0.1);color:#ff8f00;border:1px solid rgba(255,143,0,0.2);" title="Suspender">&#128721;</button>';
    } else {
        html += '<button onclick="unsuspendPlayer(' + playerId + ')" class="px-2 py-1 rounded text-xs font-bold hover:opacity-80 transition" style="background:rgba(76,175,80,0.1);color:#4caf50;border:1px solid rgba(76,175,80,0.2);" title="Reactivar">&#10003;</button>';
    }
    html += '<button onclick="removeRegistration(' + regId + ', \'' + playerName + '\')" class="px-2 py-1 rounded text-xs font-bold hover:opacity-80 transition" style="background:rgba(198,40,40,0.1);color:#ef5350;border:1px solid rgba(198,40,40,0.2);" title="Quitar">&#128465;</button>';

    return html;
});

// ===================== UTILIDADES DOM =====================

// Mostrar/ocultar modal por ID
function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

window.AhComponents = AhComponents;
window.openModal = openModal;
window.closeModal = closeModal;
