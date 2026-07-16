// pwa-utils.js - PWA helpers + Install Prompt + Mode Preference

// ===================== PUSH NOTIFICATIONS =====================
function requestPushPermission() { return Notification.requestPermission(); }
async function checkSubscription() { try { var reg = await navigator.serviceWorker.ready; var sub = await reg.pushManager.getSubscription(); return !!sub; } catch(e) { return false; } }
async function unsubscribeFromPush() { try { var reg = await navigator.serviceWorker.ready; var sub = await reg.pushManager.getSubscription(); if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.toJSON().endpoint); await sub.unsubscribe(); } localStorage.removeItem('ah_v2_push_subscribed'); return true; } catch(e) { return false; } }
function nuclearCacheClear() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(function(regs) { regs.forEach(function(r) { r.unregister(); }); });
    caches.keys().then(function(names) { names.forEach(function(n) { caches.delete(n); }); });
    localStorage.clear();
}

// ===================== PWA INSTALL PROMPT =====================
(function() {
    'use strict';

    var deferredPrompt = null;
    var installBtnShown = false;

    /**
     * Capture the beforeinstallprompt event so we can trigger it later.
     */
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        console.log('[PWA] beforeinstallprompt captured');

        // Auto-show the install button on pages that support it
        if (typeof showInstallButton === 'function') {
            showInstallButton();
        }

        // Dispatch custom event so pages can listen
        window.dispatchEvent(new CustomEvent('pwa:installable'));
    });

    /**
     * Hide button when app is installed.
     */
    window.addEventListener('appinstalled', function() {
        console.log('[PWA] App was installed');
        deferredPrompt = null;
        if (typeof hideInstallButton === 'function') {
            hideInstallButton();
        }
        window.dispatchEvent(new CustomEvent('pwa:installed'));
    });

    /**
     * Check if the app is already installed (standalone display mode).
     */
    function isPWAInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true ||
               localStorage.getItem('ah_pwa_installed') === 'true';
    }

    /**
     * Trigger the browser install prompt.
     */
    window.installPWA = async function() {
        if (!deferredPrompt) {
            if (typeof showToast === 'function') {
                showToast('La instalacion no esta disponible en este momento. Agrega el sitio a tu pantalla de inicio manualmente.', 'warning');
            }
            return false;
        }
        deferredPrompt.prompt();
        var result = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (result.outcome === 'accepted') {
            localStorage.setItem('ah_pwa_installed', 'true');
            if (typeof showToast === 'function') showToast('App instalada correctamente!', 'success');
            hideInstallButton();
            return true;
        } else {
            if (typeof showToast === 'function') showToast('Instalacion cancelada', 'info');
            return false;
        }
    };

    /**
     * Show the install button in the DOM.
     * Looks for [data-pwa-install-btn] or creates one if not found.
     */
    window.showInstallButton = function() {
        if (installBtnShown || isPWAInstalled()) return;

        var existing = document.querySelector('[data-pwa-install-btn]');
        if (existing) {
            existing.classList.remove('hidden');
            existing.style.display = '';
            installBtnShown = true;
            return;
        }

        // Create floating install button
        var btn = document.createElement('button');
        btn.id = 'pwa-install-floating-btn';
        btn.innerHTML = '<span>&#128229;</span> <span>Instalar App</span>';
        btn.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 24px;border-radius:50px;font-weight:700;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.4);cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.3s;background:linear-gradient(135deg,#ff6f00,#ff8f00);color:#fff;border:none;animation:slideUp 0.4s ease-out;';
        btn.onclick = function() { installPWA(); };

        // Add animation keyframes
        if (!document.getElementById('pwa-anim-style')) {
            var style = document.createElement('style');
            style.id = 'pwa-anim-style';
            style.textContent = '@keyframes slideUp { from { transform:translateX(-50%) translateY(100px); opacity:0; } to { transform:translateX(-50%) translateY(0); opacity:1; } }';
            document.head.appendChild(style);
        }

        document.body.appendChild(btn);
        installBtnShown = true;
    };

    /**
     * Hide the install button.
     */
    window.hideInstallButton = function() {
        var existing = document.querySelector('[data-pwa-install-btn]');
        if (existing) existing.classList.add('hidden');
        var floating = document.getElementById('pwa-install-floating-btn');
        if (floating) {
            floating.style.opacity = '0';
            floating.style.transform = 'translateX(-50%) translateY(100px)';
            floating.style.transition = 'all 0.3s';
            setTimeout(function() { if (floating.parentNode) floating.parentNode.removeChild(floating); }, 300);
        }
        installBtnShown = false;
    };

    window.isPWAInstalled = isPWAInstalled;
    window.__pwaDeferredPrompt = function() { return deferredPrompt; };

    // Auto-show on DOM ready if already captured
    document.addEventListener('DOMContentLoaded', function() {
        if (deferredPrompt && !isPWAInstalled()) {
            showInstallButton();
        }
    });

})();

// ===================== MODE PREFERENCE (Dual Mode) =====================
(function() {
    'use strict';

    var MODE_KEY = 'ah_mode_preference';

    /**
     * Set mode preference: 'player' or 'admin'
     */
    window.setModePreference = function(mode) {
        sessionStorage.setItem(MODE_KEY, mode);
    };

    /**
     * Get current mode preference. Returns 'player', 'admin', or null.
     */
    window.getModePreference = function() {
        return sessionStorage.getItem(MODE_KEY);
    };

    /**
     * Clear mode preference.
     */
    window.clearModePreference = function() {
        sessionStorage.removeItem(MODE_KEY);
    };

    /**
     * Check if we should show player nav (either single player or dual with player preference).
     */
    window.shouldShowPlayerNav = function(hasAdminSession, hasPlayerSession) {
        var pref = getModePreference();
        if (pref === 'player') return true;
        if (pref === 'admin') return false;
        // No preference: show based on current page context
        return !hasAdminSession && hasPlayerSession;
    };
})();
