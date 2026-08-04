/**
 * invite-code.js - Generador/validador COMPARTIDO de codigos de invitacion.
 *
 * Modular: un solo punto de verdad para el formato de codigos AH, usado por
 * admin-invites.js, admin-leader-requests.js y register-leader.js.
 * Carga en SCRIPTS.core (loader.js) => disponible para TODOS los roles,
 * incluida la pagina publica register/leader.html.
 *
 * Formato actual: 'AH' + 10 chars de alfabeto sin ambiguos (sin I/O/0/1),
 * aleatoriedad criptografica (crypto.getRandomValues) con fallback.
 * isValid() acepta ademas los codigos legacy 'AH' + 6 (generados antes del
 * hardening del 26-jul-2026) para no romper codigos aun vigentes.
 *
 * Expone: window.AHInviteCode = { PREFIX, CODE_LENGTH, LEGACY_CODE_LENGTH,
 *   CODE_REGEX, generate(), isValid(code) }
 */
(function () {
    'use strict';

    var PREFIX = 'AH';
    var CODE_LENGTH = 10;        // chars tras el prefijo (formato actual)
    var LEGACY_CODE_LENGTH = 6;  // chars tras el prefijo (formato pre-hardening)
    var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, sin I/O/0/1 ambiguos
    // Acepta el formato nuevo (AH+10) y el legacy (AH+6)
    var CODE_REGEX = /^AH(?:[A-Z0-9]{10}|[A-Z0-9]{6})$/i;

    function generate() {
        var code = PREFIX;
        var arr = new Uint8Array(CODE_LENGTH);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(arr);
        } else {
            for (var i = 0; i < CODE_LENGTH; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        for (var j = 0; j < CODE_LENGTH; j++) code += ALPHABET[arr[j] % ALPHABET.length];
        return code;
    }

    function isValid(code) {
        return typeof code === 'string' && CODE_REGEX.test(code.trim());
    }

    window.AHInviteCode = {
        PREFIX: PREFIX,
        CODE_LENGTH: CODE_LENGTH,
        LEGACY_CODE_LENGTH: LEGACY_CODE_LENGTH,
        CODE_REGEX: CODE_REGEX,
        generate: generate,
        isValid: isValid
    };
})();
