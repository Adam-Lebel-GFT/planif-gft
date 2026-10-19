/* =============================================================
   Agile Toolkit — Mode clair / mode sombre
   Une molette dans la barre noire de chaque outil passe la page en
   mode sombre. Le choix est gardé dans le navigateur (localStorage,
   clé « tk-theme ») : il suit d'un outil à l'autre et d'un onglet à
   l'autre, sans compte ni base.

   Inclusion : dans <head>, AVANT les feuilles de style, sans defer,
   pour que la page s'affiche directement dans le bon mode :
     <script src="../assets/theme-mode.js"></script>

   Ce que fait le script :
     - pose data-theme="light" | "dark" sur <html> dès son chargement ;
     - ajoute la molette (.tk-theme-switch) au bout de .tk-topbar__actions
       (ou à l'emplacement [data-tk-theme-switch] s'il existe) ;
     - anime le passage d'un mode à l'autre : un cercle qui part de la
       molette (View Transitions), un fondu à défaut, rien si l'OS
       demande moins d'animations ;
     - émet l'évènement « tk-themechange » sur window ({ detail: { mode } })
       pour les outils qui dessinent eux-mêmes (canvas, WebGL, graphes).

   API : TkTheme.get() -> 'light' | 'dark', TkTheme.isDark(),
         TkTheme.set(mode[, depuisElement]), TkTheme.toggle([depuisElement]).
   Les couleurs du mode sombre vivent dans assets/theme.css (variables
   --tk-*) ; chaque outil y raccorde ses propres variables.
   ============================================================= */
(function (root) {
  'use strict';

  var KEY = 'tk-theme';
  var html = document.documentElement;
  var mode = lire();

  function lire() {
    try { return root.localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  }
  function ecrire(m) {
    try { root.localStorage.setItem(KEY, m); } catch (e) { /* navigation privée : le choix vaut pour la page */ }
  }

  function majMolettes() {
    var sombre = mode === 'dark';
    Array.prototype.forEach.call(document.querySelectorAll('.tk-theme-switch'), function (b) {
      b.setAttribute('aria-checked', sombre ? 'true' : 'false');
      b.title = sombre ? 'Passer en mode clair' : 'Passer en mode sombre';
    });
  }

  function appliquer(m) {
    mode = m === 'dark' ? 'dark' : 'light';
    html.setAttribute('data-theme', mode);
    majMolettes();
    try { root.dispatchEvent(new CustomEvent('tk-themechange', { detail: { mode: mode } })); } catch (e) { /* très vieux navigateur */ }
  }

  function moinsDAnimations() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function set(m, depuis) {
    m = m === 'dark' ? 'dark' : 'light';
    if (m === mode) return;
    ecrire(m);
    if (moinsDAnimations()) { appliquer(m); return; }

    if (document.startViewTransition && depuis && depuis.getBoundingClientRect) {
      // La molette bascule tout de suite ; la page suit dans un cercle qui part d'elle.
      mode = m; majMolettes();
      var r = depuis.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      var R = Math.hypot(Math.max(x, root.innerWidth - x), Math.max(y, root.innerHeight - y));
      html.classList.add('tk-theme-anim');
      var t = document.startViewTransition(function () { appliquer(m); });
      t.ready.then(function () {
        html.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});
      t.finished.then(fin, fin);
      return;
    }

    // Repli : fondu des couleurs.
    html.classList.add('tk-theme-fade');
    appliquer(m);
    setTimeout(function () { html.classList.remove('tk-theme-fade'); }, 450);
  }
  function fin() { html.classList.remove('tk-theme-anim'); }

  function toggle(depuis) { set(mode === 'dark' ? 'light' : 'dark', depuis); }

  // ── La molette ────────────────────────────────────────────────
  var MOLETTE =
    '<span class="tk-theme-switch__stars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
    '<span class="tk-theme-switch__cloud" aria-hidden="true"></span>' +
    '<span class="tk-theme-switch__knob" aria-hidden="true"><i></i><i></i></span>';

  function creerMolette() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tk-theme-switch';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', 'Mode sombre');
    b.innerHTML = MOLETTE;
    b.addEventListener('click', function () { toggle(b); });
    return b;
  }

  function monter() {
    if (document.querySelector('.tk-theme-switch')) { majMolettes(); return; }
    var places = document.querySelectorAll('[data-tk-theme-switch]');
    if (!places.length) {
      var barres = document.querySelectorAll('.tk-topbar');
      places = [];
      Array.prototype.forEach.call(barres, function (barre) {
        var a = barre.querySelector('.tk-topbar__actions');
        if (!a) { a = document.createElement('div'); a.className = 'tk-topbar__actions'; barre.appendChild(a); }
        places.push(a);
      });
    }
    Array.prototype.forEach.call(places, function (p) { p.appendChild(creerMolette()); });
    majMolettes();
  }

  // Un autre onglet a changé de mode : on suit, sans animation.
  root.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === null) { var m = lire(); if (m !== mode) appliquer(m); }
  });

  appliquer(mode);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter);
  else monter();

  root.TkTheme = {
    get: function () { return mode; },
    isDark: function () { return mode === 'dark'; },
    set: set,
    toggle: toggle,
    monter: monter
  };
})(window);
