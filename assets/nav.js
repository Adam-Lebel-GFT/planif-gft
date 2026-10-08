/* =============================================================
   Agile Toolkit — Barre d'onglets « Outils »
   Affiche sous le bandeau du haut un onglet par outil accessible,
   pour passer de l'un à l'autre en un clic sans repasser par le
   lanceur. N'affiche que les outils auxquels le compte connecté a
   droit (même source que le lanceur).

   Inclusion, après les scripts d'accès :
     <script src="../acces/config.js"></script>
     <script src="../acces/supabase.js"></script>
     <script src="../acces/auth.js"></script>
     <script src="../assets/nav.js"></script>

   La barre s'insère juste après chaque bandeau de la page (.tk-topbar,
   ou .wb-topbar pour le Whiteboard). Sans session ou sans accès à la
   base, la page reste telle quelle.

   Bandeau et onglets restent fixes en haut de page. nav.js publie leur
   hauteur cumulée dans --tk-stick : un élément collant d'un outil se cale
   dessous avec  top: var(--tk-stick, 56px).
   ============================================================= */
(function (root) {
  'use strict';

  var SCRIPT = document.currentScript && document.currentScript.src;
  var RACINE = SCRIPT ? new URL('../', SCRIPT).href : null;

  var CSS =
    '.tk-navtabs{position:sticky;top:56px;z-index:39;flex-shrink:0;display:flex;gap:2px;overflow-x:auto;background:#1A2E4A;padding-inline:clamp(10px,3vw,40px);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent;font-family:"Manrope",sans-serif}' +
    '.tk-navtabs a{flex-shrink:0;padding:11px 14px 8px;border-bottom:3px solid transparent;color:rgba(255,255,255,.62);font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;text-decoration:none;transition:color .15s,background .15s}' +
    '.tk-navtabs a:hover{color:#fff;background:rgba(255,255,255,.07);text-decoration:none}' +
    '.tk-navtabs a:focus-visible{outline:2px solid #6AA5E8;outline-offset:-2px}' +
    '.tk-navtabs a[aria-current="page"]{color:#fff;border-bottom-color:#6AA5E8}' +
    '.tk-navtabs a.tk-navtabs__admin{margin-left:auto;font-family:"DM Mono",monospace;font-weight:500;font-size:11px}';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // « Administration (accès dynamique) » -> « Administration » : l'onglet reste court.
  function libelleCourt(label) {
    return String(label).replace(/\s*\(.*\)\s*$/, '');
  }
  function slugCourant() {
    var segs = root.location.pathname.split('/').filter(Boolean);
    if (segs.length && /\.html?$/.test(segs[segs.length - 1])) segs.pop();
    var dernier = segs[segs.length - 1] || '';
    return dernier === 'acces' ? 'admin' : dernier;
  }
  function urlOutil(slug) {
    return RACINE + (slug === 'admin' ? 'acces/admin.html' : slug + '/');
  }

  // Hauteur cumulée des bandeaux et barres d'onglets visibles.
  function publierHauteur() {
    var h = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.tk-topbar, .tk-navtabs'), function (el) {
      h += el.offsetHeight;
    });
    document.documentElement.style.setProperty('--tk-stick', h + 'px');
    // Les onglets se calent sous leur propre bandeau.
    Array.prototype.forEach.call(document.querySelectorAll('.tk-navtabs'), function (n) {
      var b = n.previousElementSibling;
      if (b && b.offsetHeight) n.style.top = b.offsetHeight + 'px';
    });
  }

  function monterDans(barre, outils, courant) {
    if (!barre.querySelector('.tk-topbar__tool, .tool-name')) return null;
    if (barre.nextElementSibling && barre.nextElementSibling.classList.contains('tk-navtabs')) return null;

    var nav = document.createElement('nav');
    nav.className = 'tk-navtabs';
    nav.setAttribute('aria-label', 'Outils');
    nav.innerHTML = outils.map(function (o) {
      var admin = o.slug === 'admin';
      return '<a href="' + esc(urlOutil(o.slug)) + '"' +
        (admin ? ' class="tk-navtabs__admin"' : '') +
        (o.slug === courant ? ' aria-current="page"' : '') + '>' +
        esc(libelleCourt(o.label)) + '</a>';
    }).join('');
    barre.parentNode.insertBefore(nav, barre.nextSibling);

    var ici = nav.querySelector('[aria-current]');
    if (ici && ici.scrollIntoView) {
      nav.scrollLeft = Math.max(0, ici.offsetLeft - 24);
    }
    return nav;
  }

  function monter(outils) {
    var barres = document.querySelectorAll('.tk-topbar, .wb-topbar');
    if (!barres.length) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    var courant = slugCourant();
    // Les onglets normaux dans l'ordre du catalogue, l'administration à droite.
    var tries = outils.filter(function (o) { return o.slug !== 'admin'; })
      .concat(outils.filter(function (o) { return o.slug === 'admin'; }));

    var ro = root.ResizeObserver ? new ResizeObserver(publierHauteur) : null;
    Array.prototype.forEach.call(barres, function (barre) {
      var nav = monterDans(barre, tries, courant);
      if (ro && nav) { ro.observe(barre); ro.observe(nav); }
    });
    publierHauteur();
    root.addEventListener('resize', publierHauteur);
  }

  async function init() {
    var A = root.PlanifAuth;
    if (!A || !RACINE) return;
    try {
      var session = await A.getSession();
      if (!session) return;
      var droits = await A.mesOutils();
      var outils = A.OUTILS.filter(function (o) { return droits.indexOf(o.slug) !== -1; });
      if (outils.length) monter(outils);
    } catch (e) { console.warn('Barre des outils indisponible :', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
