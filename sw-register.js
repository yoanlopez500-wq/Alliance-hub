// sw-register.js - Smart service worker registration with auto-update
// This script detects stale caches and forces refresh when needed

(function() {
    'use strict';
    
    if (!('serviceWorker' in navigator)) return;
    
    // Version marker - change this to force all clients to update
    var CURRENT_VERSION = 'ah-v16.1-' + new Date().toISOString().slice(0,10).replace(/-/g,'');
    var STORED_VERSION = localStorage.getItem('ah_sw_version');
    
    // If version changed, clear everything and force reload
    if (STORED_VERSION && STORED_VERSION !== CURRENT_VERSION) {
        console.log('[SW-Reg] Version changed:', STORED_VERSION, '->', CURRENT_VERSION);
        
        // Unregister old SW
        navigator.serviceWorker.getRegistrations().then(function(regs) {
            return Promise.all(regs.map(function(r) { return r.unregister(); }));
        }).then(function() {
            // Delete all caches
            return caches.keys().then(function(names) {
                return Promise.all(names.map(function(n) { 
                    console.log('[SW-Reg] Deleting cache:', n);
                    return caches.delete(n); 
                }));
            });
        }).then(function() {
            // Store new version
            localStorage.setItem('ah_sw_version', CURRENT_VERSION);
            // Hard reload to get fresh files
            console.log('[SW-Reg] Hard reloading for fresh content...');
            window.location.reload(true);
        }).catch(function(e) {
            console.error('[SW-Reg] Cleanup error:', e);
            window.location.reload(true);
        });
        
        return;
    }
    
    // Store current version
    localStorage.setItem('ah_sw_version', CURRENT_VERSION);
    
    // Register the new SW
    navigator.serviceWorker.register('./service-worker.js?v=16.1')
        .then(function(reg) {
            console.log('[SW-Reg] Registered:', reg.scope);
            
            reg.addEventListener('updatefound', function() {
                var newWorker = reg.installing;
                newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[SW-Reg] New version available');
                        newWorker.postMessage('SKIP_WAITING');
                        showUpdateBar();
                    }
                });
            });
            
            navigator.serviceWorker.addEventListener('message', function(event) {
                if (event.data === 'RELOAD_PAGE') {
                    window.location.reload();
                }
            });
            
            // Check for updates every 5 minutes
            setInterval(function() {
                reg.update();
            }, 5 * 60 * 1000);
            
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) reg.update();
            });
        })
        .catch(function(err) {
            console.log('[SW-Reg] Registration failed:', err);
        });
    
    navigator.serviceWorker.addEventListener('controllerchange', function() {
        console.log('[SW-Reg] New controller activated');
    });
    
    function showUpdateBar() {
        var bar = document.createElement('div');
        bar.id = 'sw-update-bar';
        bar.innerHTML = '<span>Nueva version disponible</span> <button id="sw-update-btn">Actualizar ahora</button>';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ff6f00;color:#fff;padding:8px 16px;text-align:center;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:12px;';
        document.body.appendChild(bar);
        
        document.getElementById('sw-update-btn').addEventListener('click', function() {
            window.location.reload(true);
        });
        
        setTimeout(function() {
            window.location.reload(true);
        }, 10000);
    }
})();
