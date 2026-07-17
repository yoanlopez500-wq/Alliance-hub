/**
 * report.js - Logica de reporte de jugador
 *
 * Migrado desde report.html como parte de la refactorizacion.
 */
(function() {
    'use strict';

    var selectedEvidenceFiles = [];
    var uploadedEvidenceUrls = [];
    var urlParams = new URLSearchParams(window.location.search);
    var matchId = urlParams.get('match_id');

    async function loadRules() {
        try {
            var { data, error } = await window.supabase.from('rule_sections').select('id, title').eq('is_active', true).order('order_index');
            if (error) throw error;
            var select = document.getElementById('r-rule');
            select.innerHTML = '<option value="">Seleccionar seccion...</option>';
            if (data) data.forEach(function(r) { select.innerHTML += '<option value="' + r.id + '">' + r.title + '</option>'; });
        } catch(e) { console.error('[Rules]', e); }
    }

    function requirePlayerOrRedirect() {
        var playerData = (typeof window.getPlayerData === 'function') ? window.getPlayerData() : null;
        if (!playerData || !playerData.playerId) {
            localStorage.setItem('ah_redirect_after_login', window.location.href);
            window.location.href = 'login-player.html';
            return null;
        }
        return playerData;
    }

    window.handleEvidenceSelect = function(files) {
        var statusEl = document.getElementById('evidence-status');
        var previewEl = document.getElementById('evidence-preview');
        if (!files || files.length === 0) return;
        if (selectedEvidenceFiles.length + files.length > window.STORAGE_CONFIG.maxFilesPerUpload) {
            statusEl.textContent = 'Maximo ' + window.STORAGE_CONFIG.maxFilesPerUpload + ' archivos';
            statusEl.classList.remove('hidden');
            return;
        }
        for (var i = 0; i < files.length; i++) {
            if (selectedEvidenceFiles.length >= window.STORAGE_CONFIG.maxFilesPerUpload) break;
            selectedEvidenceFiles.push(files[i]);
        }
        renderEvidencePreviews();
        statusEl.textContent = selectedEvidenceFiles.length + ' archivo(s) seleccionado(s)';
        statusEl.classList.remove('hidden');
    };

    function renderEvidencePreviews() {
        var previewEl = document.getElementById('evidence-preview');
        previewEl.innerHTML = selectedEvidenceFiles.map(function(file, idx) {
            var isVideo = file.type.startsWith('video/');
            var url = URL.createObjectURL(file);
            if (isVideo) {
                return '<div class="evidence-preview-item"><video src="' + url + '" class="w-full h-20 object-cover"></video><button type="button" class="remove-btn" onclick="removeEvidence(' + idx + ')">&#10005;</button></div>';
            }
            return '<div class="evidence-preview-item"><img src="' + url + '" class="w-full h-20 object-cover"><button type="button" class="remove-btn" onclick="removeEvidence(' + idx + ')">&#10005;</button></div>';
        }).join('');
    }

    window.removeEvidence = function(idx) {
        selectedEvidenceFiles.splice(idx, 1);
        renderEvidencePreviews();
        var statusEl = document.getElementById('evidence-status');
        if (selectedEvidenceFiles.length === 0) { statusEl.classList.add('hidden'); }
        else { statusEl.textContent = selectedEvidenceFiles.length + ' archivo(s) seleccionado(s)'; }
    };

    function bindDropzone() {
        var dropzone = document.getElementById('evidence-dropzone');
        if (!dropzone) return;
        dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragover'); });
        dropzone.addEventListener('drop', function(e) { e.preventDefault(); dropzone.classList.remove('dragover'); window.handleEvidenceSelect(e.dataTransfer.files); });
    }

    async function init() {
        var playerData = requirePlayerOrRedirect();
        if (!playerData) return;

        await loadRules();
        bindDropzone();

        document.getElementById('report-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            var btn = document.getElementById('submit-btn');
            btn.disabled = true; btn.textContent = 'Enviando...';
            document.getElementById('error-banner').classList.add('hidden');
            document.getElementById('success-msg').classList.add('hidden');

            try {
                var playerId = parseInt(document.getElementById('r-player-id').value);
                var ruleId = document.getElementById('r-rule').value;
                var desc = document.getElementById('r-desc').value.trim();
                if (!playerId || !ruleId || !desc) throw new Error('Completa todos los campos obligatorios');

                var reporterId = parseInt(playerData.playerId);
                var reporterName = playerData.displayName || 'Jugador ' + reporterId;
                var reportedName = null;
                try {
                    var { data: reportedPlayer } = await window.supabase.from('players').select('current_username').eq('id', playerId).maybeSingle();
                    reportedName = reportedPlayer ? reportedPlayer.current_username : null;
                } catch(lookupErr) { console.error('[Report] No se pudo obtener nombre del reportado:', lookupErr); }

                uploadedEvidenceUrls = [];
                if (selectedEvidenceFiles.length > 0) {
                    btn.textContent = 'Subiendo evidencia...';
                    var targetId = 'report_' + Date.now();
                    uploadedEvidenceUrls = await window.compressAndUpload(selectedEvidenceFiles, 'reports', targetId);
                }

                var insertPayload = {
                    reported_player_id: playerId,
                    reported_player_name: reportedName,
                    player_id: reporterId,
                    player_name: reporterName,
                    match_id: matchId,
                    rule_section_id: ruleId,
                    report_type: 'player',
                    description: desc,
                    status: 'pending'
                };
                if (uploadedEvidenceUrls.length > 0) {
                    insertPayload.evidence_urls = uploadedEvidenceUrls;
                }

                var { error } = await window.supabase.from('player_reports').insert(insertPayload);
                if (error) throw new Error(error.message);

                document.getElementById('success-msg').textContent = '\u2713 Reporte enviado correctamente. Un admin lo revisara pronto.';
                document.getElementById('success-msg').classList.remove('hidden');
                document.getElementById('report-form').reset();
                selectedEvidenceFiles = [];
                uploadedEvidenceUrls = [];
                document.getElementById('evidence-preview').innerHTML = '';
                document.getElementById('evidence-status').classList.add('hidden');
            } catch(err) {
                document.getElementById('error-banner').textContent = '\u2716 ' + err.message;
                document.getElementById('error-banner').classList.remove('hidden');
            }
            btn.disabled = false; btn.textContent = '\uD83D\uDEA8 Enviar Reporte';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.addEventListener('ah:dom-ready', init);
    window.addEventListener('ah:loaded', init);
})();
