/* =============================================================
   Agile Toolkit — Écran de chargement partagé
   Voile gris + roue + étape en cours + barre de progression, pour
   les opérations un peu longues (lecture d'un classeur, calcul…).

     TKLoader.show('Titre', 'Étape…')   affiche (appels imbriqués comptés)
     TKLoader.set(40, 'Étape…')         progression 0-100 et libellé facultatif
     TKLoader.step('Étape…')            libellé seul
     await TKLoader.paint()            laisse le navigateur peindre avant un traitement bloquant
     TKLoader.hide()                    masque (quand le dernier show est refermé)
     TKLoader.active()                  true tant que l'écran est affiché
   ============================================================= */
(function (root) {
  'use strict';
  var CSS =
    '.tk-loader{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;background:rgba(70,74,82,.62);backdrop-filter:blur(2px)}' +
    '.tk-loader.on{display:flex}' +
    '.tk-loader-card{width:min(380px,86vw);background:#fff;border-radius:12px;padding:26px 26px 22px;text-align:center;box-shadow:0 18px 50px rgba(12,26,46,.28);font-family:"Manrope",sans-serif}' +
    '.tk-loader-spin{width:38px;height:38px;margin:0 auto 14px;border:4px solid #E8EAED;border-top-color:#0C1A2E;border-radius:50%;animation:tk-loader-spin .8s linear infinite}' +
    '@keyframes tk-loader-spin{to{transform:rotate(360deg)}}' +
    '.tk-loader-t{font-size:13px;font-weight:700;color:#0C1A2E}' +
    '.tk-loader-s{font-family:"DM Mono",monospace;font-size:10px;color:#6B7A90;margin:5px 0 14px;min-height:14px}' +
    '.tk-loader-bar{height:8px;border-radius:4px;background:#E8EAED;overflow:hidden}' +
    '.tk-loader-fill{height:100%;width:0;border-radius:4px;background:#0C1A2E;transition:width .25s ease}' +
    '.tk-loader-pct{font-family:"DM Mono",monospace;font-size:10px;color:#6B7A90;margin-top:7px}';
  var depth = 0, el = null;
  function build() {
    if (el) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement('div');
    el.className = 'tk-loader'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="tk-loader-card"><div class="tk-loader-spin"></div><div class="tk-loader-t"></div>' +
      '<div class="tk-loader-s"></div><div class="tk-loader-bar"><div class="tk-loader-fill"></div></div><div class="tk-loader-pct">0 %</div></div>';
    document.body.appendChild(el);
  }
  function q(c) { return el.querySelector(c); }
  function step(txt) { if (el && txt != null) q('.tk-loader-s').textContent = String(txt).replace(/<[^>]*>/g, ''); }
  function set(pct, txt) {
    if (!el) return;
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    q('.tk-loader-fill').style.width = pct + '%'; q('.tk-loader-pct').textContent = pct + ' %';
    step(txt);
  }
  function show(title, txt) {
    build(); depth++;
    q('.tk-loader-t').textContent = title || 'Chargement…';
    if (depth === 1) set(0, txt); else step(txt);
    el.classList.add('on');
  }
  function hide() { if (!el) return; depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('on'); }
  function paint() { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }); }
  root.TKLoader = { show: show, set: set, step: step, hide: hide, paint: paint, active: function () { return depth > 0; } };
})(window);
