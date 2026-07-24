// assets/js/pages/admin-rules-editor.js
// Editor de Reglamento - CRUD de secciones y precedentes con historial de versiones
// Depende de: base.js, auth-core.js, db-schema.js, admin-base.js

'use strict';

// ===================== STATE =====================
var sectionsCache = [];
var matchesCache = [];
var adminNamesCache = {};
var historyCache = [];
var currentAdminRole = null;
var currentAdminId = null;
var isSuperAdmin = false;
var allPrecedents = [];

// ===================== HELPERS =====================

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getSectionLevel(num) {
    if (!num) return 1;
    return String(num).split('.').length;
}

function sortSectionsHierarchical(sections) {
    return sections.slice().sort(function(a, b) {
        var partsA = String(a.section_number || a.order_index || '0').split('.').map(Number);
        var partsB = String(b.section_number || b.order_index || '0').split('.').map(Number);
        var maxLen = Math.max(partsA.length, partsB.length);
        for (var i = 0; i < maxLen; i++) {
            var valA = partsA[i] || 0;
            var valB = partsB[i] || 0;
            if (valA !== valB) return valA - valB;
        }
        return 0;
    });
}

function buildHierarchicalOptions(sections, selectedId) {
    var sorted = sortSectionsHierarchical(sections);
    var html = '';
    for (var i = 0; i < sorted.length; i++) {
        var s = sorted[i];
        var level = getSectionLevel(s.section_number);
        var indent = '';
        for (var j = 0; j < Math.max(0, level - 1); j++) {
            indent += '\u00A0\u00A0';
        }
        var num = s.section_number || (s.order_index + 1);
        var sel = (s.id === selectedId) ? ' selected' : '';
        html += '<option value="' + s.id + '"' + sel + '>' + indent + num + '. ' + escapeHtml(s.title) + '</option>';
    }
    return html;
}

function findSectionById(id) {
    for (var i = 0; i < sectionsCache.length; i++) {
        if (sectionsCache[i].id === id) return sectionsCache[i];
    }
    return null;
}

function findSectionByNumber(num) {
    for (var i = 0; i < sectionsCache.length; i++) {
        if (sectionsCache[i].section_number === num) return sectionsCache[i];
    }
    return null;
}

function validateSectionNumber(value) {
    var regex = /^\d+(\.\d+)*$/;
    return regex.test(value.trim());
}

function getCurrentAdminId() {
    if (currentAdminId) return currentAdminId;
    return window.supabase.auth.getSession().then(function(res) {
        if (res && res.data && res.data.session) {
            currentAdminId = res.data.session.user.id;
            return currentAdminId;
        }
        return null;
    }).catch(function() { return null; });
}

function setupDragAndDrop() {
    // Los drag handles se renderizan para mantener la consistencia visual.
    // El reordenamiento definitivo se realiza editando el numero de seccion.
    var items = document.querySelectorAll('#sections-list .rule-item');
    for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
            this.style.opacity = '0.5';
        });
        items[i].addEventListener('dragend', function() {
            this.style.opacity = '1';
        });
        items[i].addEventListener('dragover', function(e) {
            e.preventDefault();
        });
        items[i].addEventListener('drop', function(e) {
            e.preventDefault();
            window.showToast('Para reordenar secciones, ajusta su numero de seccion.', 'info');
        });
    }
}

// ===================== INIT / TABS =====================

async function init() {
    try {
        await window.requireAdmin();

        var sessionData = await window.supabase.auth.getSession();
        if (!sessionData || !sessionData.data || !sessionData.data.session) {
            window.location.href = window.ahPath('admin/login.html');
            return;
        }
        currentAdminId = sessionData.data.session.user.id;

        var admin = await window.getAdminRole();
        if (!admin) { window.location.href = window.ahPath('admin/login.html'); return; }
        currentAdminRole = admin.role;
        isSuperAdmin = (admin.role === 'superadmin');

        var badgeEl = document.getElementById('role-badge');
        if (badgeEl) {
            var roleLabel = {
                superadmin: 'SUPERADMIN',
                event_admin: 'ADMIN EVENTOS',
                moderator: 'MODERADOR',
                alliance_leader: 'LIDER',
                co_leader: 'CO-LIDER',
                officer: 'OFICIAL'
            }[admin.role] || admin.role;
            var roleColor = {
                superadmin: '#ef5350',
                event_admin: '#42a5f5',
                moderator: '#ab47bc',
                alliance_leader: '#66bb6a',
                co_leader: '#26a69a',
                officer: '#26c6da'
            }[admin.role] || '#9fa8da';
            badgeEl.textContent = roleLabel;
            badgeEl.style.background = roleColor + '20';
            badgeEl.style.color = roleColor;
            badgeEl.style.border = '1px solid ' + roleColor + '40';
        }

        if (!isSuperAdmin) {
            var hint = document.getElementById('prec-permission-hint');
            if (hint) hint.classList.remove('hidden');
        }

        await Promise.all([loadSections(), loadMatchesForDropdown()]);
        loadPrecedents();
    } catch (e) {
        console.error('[RulesEditor] Init error:', e);
        window.showToast('Error inicializando editor', 'error');
    }
}

function switchTab(tab) {
    var sectionsTab = document.getElementById('tab-sections');
    var precedentsTab = document.getElementById('tab-precedents');
    var sectionsBtn = document.getElementById('tab-sections-btn');
    var precedentsBtn = document.getElementById('tab-precedents-btn');
    if (tab === 'sections') {
        sectionsTab.classList.remove('hidden');
        precedentsTab.classList.add('hidden');
        sectionsBtn.className = 'tab-active pb-3 text-sm font-bold transition';
        precedentsBtn.className = 'tab-inactive pb-3 text-sm font-bold transition';
    } else {
        sectionsTab.classList.add('hidden');
        precedentsTab.classList.remove('hidden');
        sectionsBtn.className = 'tab-inactive pb-3 text-sm font-bold transition';
        precedentsBtn.className = 'tab-active pb-3 text-sm font-bold transition';
    }
}

// ===================== SECTIONS CRUD =====================

async function loadSections() {
    try {
        var result = await DB.selectAll('ruleSections', 'all', 'order_index');
        if (result.error) throw result.error;
        sectionsCache = result.data || [];
        var list = document.getElementById('sections-list');
        if (!sectionsCache || sectionsCache.length === 0) {
            list.innerHTML = '<div class="text-center py-8 text-sm" style="color:#9fa8da;">No hay secciones. Crea la primera.</div>';
            return;
        }

        var sorted = sortSectionsHierarchical(sectionsCache);
        var sectionOpts = buildHierarchicalOptions(sectionsCache);
        var precSelect = document.getElementById('prec-section');
        if (precSelect) precSelect.innerHTML = '<option value="">Seleccionar...</option>' + sectionOpts;

        var html = '';
        for (var i = 0; i < sorted.length; i++) {
            var s = sorted[i];
            var level = getSectionLevel(s.section_number);
            var indentPx = (level - 1) * 20;
            var num = s.section_number || (s.order_index + 1);
            var visBadge = '';
            if (s.visibility === 'officials_only') {
                visBadge = '<span class="text-[10px] px-2 py-0.5 rounded font-bold ml-2" style="background:#ff6f00;color:white;">OFICIALES</span>';
            } else if (s.visibility === 'training') {
                visBadge = '<span class="text-[10px] px-2 py-0.5 rounded font-bold ml-2" style="background:#2196f3;color:white;">CAPACITACION</span>';
            } else {
                visBadge = '<span class="text-[10px] px-2 py-0.5 rounded font-bold ml-2" style="background:#4caf50;color:white;">PUBLICA</span>';
            }
            var activeBadge = s.is_active === false
                ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold ml-2" style="background:rgba(198,40,40,0.3);color:#ef5350;">INACTIVA</span>'
                : '';
            var levelColor = level === 1 ? '#3b82f6' : level === 2 ? '#10b981' : level === 3 ? '#f59e0b' : '#9fa8da';
            html += '<div class="rule-item rounded-xl p-4 flex items-start gap-3" style="background:#11183a;border:1px solid #1a237e;border-left:3px solid ' + levelColor + ';margin-left:' + indentPx + 'px;" draggable="true" data-id="' + s.id + '" data-order="' + s.order_index + '">' +
                '<div class="mt-1" style="color:#9fa8da;cursor:grab;">&#8942;&#8942;</div>' +
                '<div class="flex-1">' +
                    '<div class="flex items-center flex-wrap gap-1">' +
                        '<h3 class="font-bold">' + num + '. ' + escapeHtml(s.title) + '</h3>' + visBadge + activeBadge +
                    '</div>' +
                    '<p class="text-sm mt-1" style="color:#9fa8da;">' + escapeHtml((s.content || '').substring(0, 140)) + (s.content && s.content.length > 140 ? '...' : '') + '</p>' +
                '</div>' +
                '<div class="flex gap-1 flex-shrink-0">' +
                    '<button onclick="editSection(\'' + s.id + '\')" class="px-2 py-1 rounded text-xs font-bold transition hover:opacity-80" style="background:#1a237e;color:#fff;">Editar</button>' +
                    '<button onclick="toggleSection(\'' + s.id + '\', ' + (s.is_active !== false) + ')" class="px-2 py-1 rounded text-xs font-bold transition hover:opacity-80" style="background:' + (s.is_active !== false ? 'rgba(198,40,40,0.3)' : 'rgba(76,175,80,0.3)') + ';color:' + (s.is_active !== false ? '#ef5350' : '#4caf50') + ';">' + (s.is_active !== false ? 'Desactivar' : 'Activar') + '</button>' +
                '</div>' +
            '</div>';
        }
        list.innerHTML = html;
        setupDragAndDrop();
    } catch (e) {
        console.error('[RulesEditor] loadSections:', e);
        window.showToast('Error cargando secciones', 'error');
    }
}

function openSectionModal() {
    document.getElementById('section-modal').classList.remove('hidden');
    document.getElementById('section-modal-title').textContent = 'Nueva Seccion';
    document.getElementById('section-id').value = '';
    document.getElementById('section-title').value = '';
    document.getElementById('section-content').value = '';
    document.getElementById('section-visibility').value = 'public';

    var nextNum = '1';
    if (sectionsCache.length > 0) {
        var topLevel = sectionsCache.filter(function(s) { return String(s.section_number || '').indexOf('.') === -1; });
        var maxTop = 0;
        for (var i = 0; i < topLevel.length; i++) {
            var n = parseInt(topLevel[i].section_number || topLevel[i].order_index || 0);
            if (!isNaN(n) && n > maxTop) maxTop = n;
        }
        nextNum = String(maxTop + 1);
    }
    document.getElementById('section-number').value = nextNum;

    var parentSelect = document.getElementById('section-parent');
    if (parentSelect) {
        parentSelect.innerHTML = '<option value="">-- Sin padre (seccion principal) --</option>' + buildHierarchicalOptions(sectionsCache);
    }

    var historyBtn = document.getElementById('section-history-btn');
    if (historyBtn) historyBtn.classList.add('hidden');
}

function closeSectionModal() {
    document.getElementById('section-modal').classList.add('hidden');
}

async function editSection(id) {
    try {
        var result = await DB.selectById('ruleSections', id, 'all');
        if (result.error) throw result.error;
        var data = result.data;
        if (!data) { window.showToast('Seccion no encontrada', 'error'); return; }

        document.getElementById('section-modal').classList.remove('hidden');
        document.getElementById('section-modal-title').textContent = 'Editar Seccion';
        document.getElementById('section-id').value = data.id;
        document.getElementById('section-title').value = data.title || '';
        document.getElementById('section-content').value = data.content || '';
        document.getElementById('section-visibility').value = data.visibility || 'public';
        document.getElementById('section-number').value = data.section_number || (data.order_index + 1);

        var parentSelect = document.getElementById('section-parent');
        if (parentSelect) {
            parentSelect.innerHTML = '<option value="">-- Sin padre (seccion principal) --</option>' + buildHierarchicalOptions(sectionsCache, data.parent_id);
        }

        var historyBtn = document.getElementById('section-history-btn');
        if (historyBtn) historyBtn.classList.remove('hidden');
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}

async function saveSection() {
    var id = document.getElementById('section-id').value;
    var title = document.getElementById('section-title').value.trim();
    var content = document.getElementById('section-content').value.trim();
    var visibility = document.getElementById('section-visibility').value;
    var sectionNumber = document.getElementById('section-number').value.trim();
    var parentId = document.getElementById('section-parent').value || null;

    if (!title || !content) { window.showToast('Titulo y contenido son obligatorios', 'error'); return; }
    if (!sectionNumber) { window.showToast('Numero de seccion es obligatorio', 'error'); return; }
    if (!validateSectionNumber(sectionNumber)) { window.showToast('Formato invalido. Use: 1, 1.1, 2.3.4', 'error'); return; }

    try {
        var table = DB.tableName('ruleSections');

        if (!parentId && sectionNumber.indexOf('.') !== -1) {
            var parentParts = sectionNumber.split('.');
            parentParts.pop();
            var parentNumber = parentParts.join('.');
            var parent = findSectionByNumber(parentNumber);
            if (parent) {
                parentId = parent.id;
            } else {
                window.showToast('Seccion padre "' + parentNumber + '" no encontrada. Creala primero o selecciona un padre manualmente.', 'warning');
                return;
            }
        }

        var order = parseInt(sectionNumber.split('.')[0]) || 0;

        if (id) {
            var oldSection = findSectionById(id);
            if (oldSection) {
                await saveHistoryBeforeUpdate(id, oldSection.title, oldSection.content);
            }
            var updateResult = await window.supabase.from(table).update({
                title: title,
                content: content,
                visibility: visibility,
                section_number: sectionNumber,
                parent_id: parentId,
                order_index: order
            }).eq('id', id);
            if (updateResult.error) throw updateResult.error;
        } else {
            var insertResult = await window.supabase.from(table).insert({
                title: title,
                content: content,
                visibility: visibility,
                section_number: sectionNumber,
                parent_id: parentId,
                order_index: order,
                is_active: true
            });
            if (insertResult.error) throw insertResult.error;
        }

        window.showToast('Guardado correctamente', 'success');
        closeSectionModal();
        await loadSections();
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}

async function toggleSection(id, isActive) {
    try {
        var table = DB.tableName('ruleSections');
        var result = await window.supabase.from(table).update({ is_active: !isActive }).eq('id', id);
        if (result.error) throw result.error;
        window.showToast(isActive ? 'Seccion desactivada' : 'Seccion activada', 'success');
        await loadSections();
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}

// ===================== SECTION HISTORY =====================

async function loadSectionHistory(sectionId) {
    if (!sectionId) return;
    try {
        var result = await window.supabase.from('rule_section_history')
            .select('*')
            .eq('section_id', sectionId)
            .order('changed_at', { ascending: false });
        if (result.error) throw result.error;
        historyCache = result.data || [];
    } catch (e) {
        console.error('[RulesEditor] loadSectionHistory:', e);
        historyCache = [];
    }
}

async function showSectionHistory(sectionId) {
    if (!sectionId) { window.showToast('Guarda la seccion primero para ver su historial', 'info'); return; }
    await loadSectionHistory(sectionId);

    var section = findSectionById(sectionId);
    var title = section ? section.title : 'Versiones';
    document.getElementById('history-modal-title').textContent = 'Historial: ' + title;
    document.getElementById('history-modal').classList.remove('hidden');

    var list = document.getElementById('history-list');
    var diffPanel = document.getElementById('history-diff');
    diffPanel.classList.add('hidden');
    diffPanel.innerHTML = '';

    if (!historyCache || historyCache.length === 0) {
        list.innerHTML = '<div class="text-sm" style="color:#64748b;">No hay versiones anteriores.</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < historyCache.length; i++) {
        var h = historyCache[i];
        var dateStr = '';
        try { dateStr = window.formatDateTime(h.changed_at); } catch (e) { dateStr = h.changed_at || '-'; }
        var adminName = h.changed_by && adminNamesCache[h.changed_by] ? adminNamesCache[h.changed_by] : 'Admin';
        html += '<div class="rounded-lg p-3 border flex items-center justify-between" style="background:#f8fafc;border-color:#e2e8f0;">' +
            '<div class="text-sm" style="color:#0f172a;">' +
                '<strong>' + escapeHtml(h.title) + '</strong>' +
                '<p class="text-xs" style="color:#64748b;">' + dateStr + ' &middot; ' + escapeHtml(adminName) + '</p>' +
            '</div>' +
            '<div class="flex gap-2">' +
                '<button onclick="renderHistoryDiff(' + i + ')" class="px-2 py-1 rounded text-xs font-bold" style="background:#1a237e;color:#fff;">Ver diff</button>' +
                '<button onclick="restoreVersion(' + i + ')" class="px-2 py-1 rounded text-xs font-bold" style="background:#4caf50;color:#fff;">Restaurar</button>' +
            '</div>' +
        '</div>';
    }
    list.innerHTML = html;

    var adminIds = historyCache.map(function(h) { return h.changed_by; }).filter(Boolean);
    await loadAdminNames(adminIds);
    // refresh admin names after loading
    for (var j = 0; j < historyCache.length; j++) {
        var h2 = historyCache[j];
        if (h2.changed_by && adminNamesCache[h2.changed_by]) {
            var adminNameEl = list.children[j].querySelector('p');
            if (adminNameEl) {
                var currentText = adminNameEl.textContent;
                var datePart = currentText.split(' \u00B7 ')[0];
                adminNameEl.textContent = datePart + ' \u00B7 ' + adminNamesCache[h2.changed_by];
            }
        }
    }
}

function closeHistoryModal() {
    document.getElementById('history-modal').classList.add('hidden');
}

function renderHistoryDiff(index) {
    var h = historyCache[index];
    if (!h) return;
    var section = findSectionById(h.section_id);
    var currentText = section ? (section.title + '\n' + section.content) : '';
    var oldText = (h.title || '') + '\n' + (h.content || '');

    var diffHtml = diffVersions(oldText, currentText);
    var diffPanel = document.getElementById('history-diff');
    diffPanel.innerHTML = '<p class="font-bold mb-2" style="color:#0f172a;">Diff vs version actual</p>' + diffHtml;
    diffPanel.classList.remove('hidden');
}

function diffVersions(oldText, newText) {
    var oldStr = String(oldText || '');
    var newStr = String(newText || '');

    if (oldStr === newStr) {
        return '<p class="text-sm" style="color:#64748b;">Sin cambios.</p>';
    }

    // Tokenizar por palabras/espacios para resaltar cambios parciales de linea.
    function tokenize(text) {
        return text.split(/(\s+)/).filter(function(t) { return t.length > 0; });
    }

    var oldTokens = tokenize(oldStr);
    var newTokens = tokenize(newStr);
    var removed = [];
    var added = [];

    for (var i = 0; i < oldTokens.length; i++) {
        if (newTokens.indexOf(oldTokens[i]) === -1) removed.push(oldTokens[i]);
    }
    for (var j = 0; j < newTokens.length; j++) {
        if (oldTokens.indexOf(newTokens[j]) === -1) added.push(newTokens[j]);
    }

    var html = '';

    // Diff por lineas (sin repetir las que solo cambiaron parcialmente)
    var oldLines = oldStr.split('\n');
    var newLines = newStr.split('\n');
    var removedLines = [];
    var addedLines = [];
    for (var a = 0; a < oldLines.length; a++) {
        if (newLines.indexOf(oldLines[a]) === -1) removedLines.push(oldLines[a]);
    }
    for (var b = 0; b < newLines.length; b++) {
        if (oldLines.indexOf(newLines[b]) === -1) addedLines.push(newLines[b]);
    }

    if (removedLines.length > 0) {
        html += '<p class="text-xs font-bold mb-1" style="color:#ef5350;">Eliminado:</p>';
        for (var r = 0; r < removedLines.length; r++) {
            var line = removedLines[r];
            var highlighted = escapeHtml(line).split(/\b/).map(function(word) {
                if (!word.trim()) return word;
                return removed.indexOf(word) !== -1 && added.indexOf(word) === -1
                    ? '<span style="background:rgba(198,40,40,0.25);text-decoration:line-through;">' + escapeHtml(word) + '</span>'
                    : escapeHtml(word);
            }).join('');
            html += '<div class="text-sm px-2 py-0.5 mb-0.5 rounded" style="background:rgba(198,40,40,0.1);color:#c62828;">- ' + highlighted + '</div>';
        }
    }
    if (addedLines.length > 0) {
        html += '<p class="text-xs font-bold mb-1 mt-2" style="color:#4caf50;">Anadido:</p>';
        for (var c = 0; c < addedLines.length; c++) {
            var line2 = addedLines[c];
            var highlighted2 = escapeHtml(line2).split(/\b/).map(function(word) {
                if (!word.trim()) return word;
                return added.indexOf(word) !== -1 && removed.indexOf(word) === -1
                    ? '<span style="background:rgba(76,175,80,0.25);">' + escapeHtml(word) + '</span>'
                    : escapeHtml(word);
            }).join('');
            html += '<div class="text-sm px-2 py-0.5 mb-0.5 rounded" style="background:rgba(76,175,80,0.1);color:#2e7d32;">+ ' + highlighted2 + '</div>';
        }
    }

    if (!html) {
        return '<p class="text-sm" style="color:#64748b;">Sin cambios visibles.</p>';
    }
    return html;
}

function restoreVersion(index) {
    var h = historyCache[index];
    if (!h) return;
    document.getElementById('section-title').value = h.title || '';
    document.getElementById('section-content').value = h.content || '';
    closeHistoryModal();
    window.showToast('Version restaurada en el formulario. Guarda para aplicar.', 'info');
}

async function saveHistoryBeforeUpdate(id, oldTitle, oldContent) {
    try {
        var adminId = await getCurrentAdminId();
        if (!adminId) {
            console.warn('[RulesEditor] No se pudo obtener adminId para historial');
            return;
        }
        var result = await window.supabase.from('rule_section_history').insert({
            section_id: id,
            title: oldTitle,
            content: oldContent,
            changed_by: adminId
        });
        if (result.error) throw result.error;
    } catch (e) {
        console.error('[RulesEditor] saveHistoryBeforeUpdate:', e);
    }
}

// ===================== MATCHES / PLAYERS / ADMINS =====================

async function loadMatchesForDropdown() {
    try {
        var result = await DB.selectAll('matches', 'basic', 'created_at', false);
        if (result.error) throw result.error;
        matchesCache = result.data || [];
        var opts = '<option value="">Ninguna</option>';
        for (var i = 0; i < matchesCache.length; i++) {
            var m = matchesCache[i];
            opts += '<option value="' + m.id + '">' + escapeHtml(m.name || 'Partida sin nombre') + ' [' + (m.match_type || '-') + ']</option>';
        }
        var matchSelect = document.getElementById('prec-match');
        if (matchSelect) matchSelect.innerHTML = opts;
    } catch (e) {
        console.error('[RulesEditor] loadMatches:', e);
    }
}

async function resolvePlayerName() {
    var playerId = document.getElementById('prec-player-id').value.trim();
    var display = document.getElementById('player-name-display');
    var input = document.getElementById('prec-player-id');
    if (!playerId) { display.textContent = ''; input.classList.remove('player-resolved'); return; }
    try {
        var result = await window.supabase.from('players').select('current_username').eq('id', playerId).single();
        if (result.error || !result.data) {
            display.textContent = 'Jugador no encontrado';
            display.style.color = '#ef5350';
            input.classList.remove('player-resolved');
            return;
        }
        display.textContent = '\u2705 ' + result.data.current_username;
        display.style.color = '#4caf50';
        input.classList.add('player-resolved');
    } catch (e) {
        display.textContent = 'Error buscando jugador';
        display.style.color = '#ef5350';
        input.classList.remove('player-resolved');
    }
}

async function loadAdminNames(adminIds) {
    if (!adminIds || adminIds.length === 0) return;
    var toFetch = [];
    for (var i = 0; i < adminIds.length; i++) {
        if (adminIds[i] && !adminNamesCache[adminIds[i]]) toFetch.push(adminIds[i]);
    }
    if (toFetch.length === 0) return;
    try {
        var result = await window.supabase.from('admin_users').select('id, display_name, role').in('id', toFetch);
        if (result.error) throw result.error;
        var data = result.data || [];
        for (var j = 0; j < data.length; j++) {
            adminNamesCache[data[j].id] = data[j].display_name || data[j].role || 'Admin';
        }
    } catch (e) {
        console.error('[RulesEditor] loadAdminNames:', e);
    }
}

// ===================== PRECEDENTS CRUD =====================

async function loadPrecedents() {
    try {
        var selectSet = isSuperAdmin ? 'withFullRelations' : 'withRelations';
        var result = await DB.selectAll('rulePrecedents', selectSet, 'created_at', false);
        if (result.error) {
            console.warn('[RulesEditor] Full query failed, trying fallback:', result.error.message);
            result = await DB.selectAll('rulePrecedents', 'basic', 'created_at', false);
        }
        if (result.error) throw result.error;
        allPrecedents = result.data || [];

        var adminIds = [];
        for (var i = 0; i < allPrecedents.length; i++) {
            if (allPrecedents[i].created_by) adminIds.push(allPrecedents[i].created_by);
        }
        await loadAdminNames(adminIds);

        renderPrecedents(allPrecedents);
    } catch (e) {
        console.error('[RulesEditor] loadPrecedents:', e);
        window.showToast('Error cargando precedentes', 'error');
    }
}

function renderPrecedents(list) {
    var container = document.getElementById('precedents-list');
    if (!container) return;

    var sectionMap = {};
    for (var i = 0; i < sectionsCache.length; i++) {
        sectionMap[sectionsCache[i].id] = sectionsCache[i];
    }

    if (!list || list.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-sm" style="color:#9fa8da;">No hay precedentes registrados.</div>';
        return;
    }

    var html = '<div class="space-y-3">';
    for (var j = 0; j < list.length; j++) {
        var p = list[j];
        var sectionName = p.rule_section_id && sectionMap[p.rule_section_id] ? sectionMap[p.rule_section_id].title : null;
        var severityClass = p.severity === 'high' ? 'severity-high' : p.severity === 'medium' ? 'severity-medium' : 'severity-low';
        var severityLabel = p.severity === 'high' ? 'ALTO' : p.severity === 'medium' ? 'MEDIO' : 'LEVE';
        var severityStyle = p.severity === 'high' ? 'background:rgba(198,40,40,0.2);color:#ef5350;' : p.severity === 'medium' ? 'background:rgba(255,143,0,0.2);color:#ff8f00;' : 'background:rgba(76,175,80,0.2);color:#4caf50;';

        var playerName = '';
        if (p.player_id) {
            if (p.players && p.players.current_username) playerName = p.players.current_username;
            else playerName = 'ID:' + p.player_id;
        }
        var matchName = '';
        if (p.match_id) {
            if (p.matches && p.matches.name) matchName = p.matches.name;
            else matchName = 'ID: ' + p.match_id;
        }
        var creatorName = p.created_by ? (adminNamesCache[p.created_by] || 'Admin') : 'Sistema';

        var dateStr = '';
        try { dateStr = window.formatDate(p.created_at); } catch (e) { dateStr = '-'; }

        var actionButtons = '';
        if (isSuperAdmin) {
            actionButtons = '<div class="flex gap-1 flex-shrink-0 ml-2">' +
                '<button onclick="editPrecedent(\'' + p.id + '\')" class="px-2 py-1 rounded text-xs font-bold transition hover:opacity-80" style="background:#1a237e;color:#fff;">Editar</button>' +
                '<button onclick="promptDeletePrecedent(\'' + p.id + '\')" class="px-2 py-1 rounded text-xs font-bold transition hover:opacity-80" style="background:rgba(198,40,40,0.3);color:#ef5350;">Eliminar</button>' +
            '</div>';
        }

        html += '<div class="precedent-card rounded-xl p-4" style="background:#11183a;border:1px solid #1a237e;">' +
            '<div class="flex items-start justify-between">' +
                '<div class="flex-1 min-w-0">' +
                    '<div class="flex items-center flex-wrap gap-2 mb-1">' +
                        '<h4 class="font-bold text-sm" style="color:#ff8f00;">&#9878;&#65039; ' + escapeHtml(p.title) + '</h4>' +
                        '<span class="text-[10px] px-2 py-0.5 rounded font-bold" style="' + severityStyle + '">' + severityLabel + '</span>' +
                        (sectionName ? '<span class="text-[10px] px-2 py-0.5 rounded font-bold" style="background:#1a237e;color:#9fa8da;">' + escapeHtml(sectionName) + '</span>' : '') +
                    '</div>' +
                    '<p class="text-sm mb-2" style="color:#e8eaf6;">' + escapeHtml(p.description) + '</p>' +
                    '<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs" style="color:#9fa8da;">' +
                        (playerName ? '<span>&#128100; ' + escapeHtml(playerName) + '</span>' : '') +
                        (matchName ? '<span>&#127918; ' + escapeHtml(matchName) + '</span>' : '') +
                        (p.strike_type ? '<span style="color:#ff8f00;">&#9889; ' + escapeHtml(p.strike_type) + '</span>' : '') +
                    '</div>' +
                    (p.resolution ? '<p class="text-xs mt-2" style="color:#4caf50;"><strong>Resolucion:</strong> ' + escapeHtml(p.resolution) + '</p>' : '') +
                    '<p class="text-xs mt-2" style="color:#64748b;">Por ' + escapeHtml(creatorName) + ' &middot; ' + dateStr + '</p>' +
                '</div>' +
                actionButtons +
            '</div>' +
        '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function filterPrecedents(query) {
    var q = query.toLowerCase().trim();
    if (!q) { renderPrecedents(allPrecedents); return; }
    var filtered = [];
    for (var i = 0; i < allPrecedents.length; i++) {
        var p = allPrecedents[i];
        var t = (p.title || '').toLowerCase();
        var d = (p.description || '').toLowerCase();
        var st = (p.strike_type || '').toLowerCase();
        var r = (p.resolution || '').toLowerCase();
        if (t.indexOf(q) !== -1 || d.indexOf(q) !== -1 || st.indexOf(q) !== -1 || r.indexOf(q) !== -1) {
            filtered.push(p);
        }
    }
    renderPrecedents(filtered);
}

function openPrecedentModal() {
    document.getElementById('precedent-modal').classList.remove('hidden');
    document.getElementById('precedent-modal-title').textContent = 'Nuevo Precedente';
    document.getElementById('precedent-id').value = '';
    document.getElementById('precedent-created-by').value = currentAdminId || '';
    document.getElementById('prec-title').value = '';
    document.getElementById('prec-desc').value = '';
    document.getElementById('prec-section').value = '';
    document.getElementById('prec-severity').value = 'medium';
    document.getElementById('prec-player-id').value = '';
    document.getElementById('player-name-display').textContent = '';
    document.getElementById('prec-player-id').classList.remove('player-resolved');
    document.getElementById('prec-match').value = '';
    document.getElementById('prec-strike-type').value = '';
    document.getElementById('prec-resolution').value = '';
}

function closePrecedentModal() {
    document.getElementById('precedent-modal').classList.add('hidden');
}

async function editPrecedent(id) {
    if (!isSuperAdmin) { window.showToast('Solo el superadmin puede editar precedentes', 'error'); return; }
    try {
        var result = await DB.selectById('rulePrecedents', id, 'withRelations');
        if (result.error) throw result.error;
        var data = result.data;
        if (!data) { window.showToast('Precedente no encontrado', 'error'); return; }

        document.getElementById('precedent-modal').classList.remove('hidden');
        document.getElementById('precedent-modal-title').textContent = 'Editar Precedente';
        document.getElementById('precedent-id').value = data.id;
        document.getElementById('precedent-created-by').value = data.created_by || currentAdminId || '';
        document.getElementById('prec-title').value = data.title || '';
        document.getElementById('prec-desc').value = data.description || '';
        document.getElementById('prec-section').value = data.rule_section_id || '';
        document.getElementById('prec-severity').value = data.severity || 'medium';
        document.getElementById('prec-player-id').value = data.player_id || '';
        document.getElementById('prec-match').value = data.match_id || '';
        document.getElementById('prec-strike-type').value = data.strike_type || '';
        document.getElementById('prec-resolution').value = data.resolution || '';

        await resolvePlayerName();
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}

async function savePrecedent() {
    var id = document.getElementById('precedent-id').value;
    var title = document.getElementById('prec-title').value.trim();
    var description = document.getElementById('prec-desc').value.trim();
    var ruleSectionId = document.getElementById('prec-section').value;
    var severity = document.getElementById('prec-severity').value;
    var playerId = document.getElementById('prec-player-id').value.trim();
    var matchId = document.getElementById('prec-match').value;
    var strikeType = document.getElementById('prec-strike-type').value.trim();
    var resolution = document.getElementById('prec-resolution').value.trim();
    var createdBy = document.getElementById('precedent-created-by').value || currentAdminId;

    if (!title || !description || !ruleSectionId || !severity) {
        window.showToast('Titulo, descripcion, seccion y severidad son obligatorios', 'error');
        return;
    }

    if (id && !isSuperAdmin) {
        window.showToast('Solo el superadmin puede editar precedentes', 'error');
        return;
    }

    try {
        var table = DB.tableName('rulePrecedents');
        var payload = {
            title: title,
            description: description,
            rule_section_id: ruleSectionId,
            severity: severity,
            player_id: playerId || null,
            match_id: matchId || null,
            strike_type: strikeType || null,
            resolution: resolution || null
        };

        if (id) {
            var updateResult = await window.supabase.from(table).update(payload).eq('id', id);
            if (updateResult.error) throw updateResult.error;
        } else {
            payload.created_by = createdBy || null;
            var insertResult = await window.supabase.from(table).insert(payload);
            if (insertResult.error) throw insertResult.error;
        }

        window.showToast('Precedente guardado', 'success');
        closePrecedentModal();
        await loadPrecedents();
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}

function promptDeletePrecedent(id) {
    if (!isSuperAdmin) { window.showToast('Solo el superadmin puede eliminar precedentes', 'error'); return; }
    document.getElementById('delete-precedent-id').value = id;
    document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.add('hidden');
}

async function confirmDeletePrecedent() {
    var id = document.getElementById('delete-precedent-id').value;
    if (!id) return;
    try {
        var table = DB.tableName('rulePrecedents');
        var result = await window.supabase.from(table).delete().eq('id', id);
        if (result.error) throw result.error;
        window.showToast('Precedente eliminado', 'success');
        closeDeleteModal();
        await loadPrecedents();
    } catch (e) {
        window.showToast('Error: ' + e.message, 'error');
    }
}

// ===================== STARTUP =====================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
