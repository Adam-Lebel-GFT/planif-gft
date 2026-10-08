/* =============================================================
   Agile Toolkit — Menu « Outils » de la barre du haut
   Permet de passer d'un outil à un autre en deux clics, sans
   repasser par le lanceur. N'affiche que les outils auxquels le
   compte connecté a droit (même source que le lanceur).

   Inclusion, après les scripts d'accès :
     <script src="../acces/config.js"></script>
     <script src="../acces/supabase.js"></script>
     <script src="../acces/auth.js"></script>
     <script src="../assets/nav.js"></script>

   Le menu s'insère dans chaque barre de la page (.tk-topbar, ou .wb-topbar
   pour le Whiteboard), juste avant le nom de l'outil. Sans session ou
   sans accès à la base, la barre reste telle quelle.
   ============================================================= */
(function (root) {
  'use strict';

  var SCRIPT = document.currentScript && document.currentScript.src;
  var RACINE = SCRIPT ? new URL('../', SCRIPT).href : null;

  // Courte description affichée sous chaque nom d'outil.
  var DESCRIPTIONS = {
    'sprint-planning':   'Disponibilité et affectation',
    'poker-planning':    'Estimation collaborative',
    'analyse-capacite':  'Capacité par jour, semaine, sprint',
    'whiteboard':        'Tableau blanc d’équipe',
    'releases-planning': 'Calendrier des releases',
    'bug-dashboard':     'Suivi de stabilisation',
    'bug-dashboard-v2':  'Radar de stabilisation',
    'admin':             'Rôles, utilisateurs, journal'
  };

  var CSS =
    '.tk-nav{position:relative;display:inline-flex;align-items:center;gap:12px}' +
    '.tk-nav__btn{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font:600 12px "Manrope",sans-serif;cursor:pointer;transition:background .15s}' +
    '.tk-nav__btn:hover,.tk-nav__btn[aria-expanded="true"]{background:rgba(255,255,255,.16)}' +
    '.tk-nav__btn:focus-visible,.tk-nav__item:focus-visible{outline:2px solid #6AA5E8;outline-offset:2px}' +
    '.tk-nav__btn svg{width:14px;height:14px;flex-shrink:0}' +
    '.tk-nav__sep{width:1px;height:24px;background:rgba(255,255,255,.15);flex-shrink:0}' +
    '.tk-nav__menu{position:absolute;top:calc(100% + 12px);left:0;width:340px;max-height:calc(100vh - 80px);overflow-y:auto;background:#fff;border:1px solid #E8EAED;border-radius:12px;box-shadow:0 18px 44px rgba(12,26,46,.28);padding:8px;z-index:3000;font-family:"Manrope",sans-serif}' +
    '.tk-nav__menu[hidden]{display:none}' +
    '.tk-nav__h{font:500 9px "DM Mono",monospace;letter-spacing:2px;text-transform:uppercase;color:#6B7A90;margin:8px 10px 6px}' +
    '.tk-nav .tk-nav__item{display:flex;align-items:center;gap:12px;width:100%;padding:9px 10px;border-radius:8px;color:#0C1A2E;font-size:13px;font-weight:600;line-height:1.3;text-decoration:none}' +
    '.tk-nav .tk-nav__item:hover{background:#F4F5F7;text-decoration:none}' +
    '.tk-nav__ic{width:30px;height:30px;border-radius:6px;background:#E4EAF3;display:grid;place-items:center;font:500 10px "DM Mono",monospace;color:#0C447C;flex-shrink:0}' +
    '.tk-nav__item small{display:block;font:400 11px "Manrope",sans-serif;color:#6B7A90;margin-top:1px}' +
    '.tk-nav__item[aria-current="page"]{background:#E6F4EE}' +
    '.tk-nav__item[aria-current="page"] .tk-nav__ic{background:#1A7A42;color:#fff}' +
    '.tk-nav__here{margin-left:auto;font:500 9px "DM Mono",monospace;letter-spacing:1px;text-transform:uppercase;color:#1A7A42}' +
    '.tk-nav__hr{border:0;border-top:1px solid #E8EAED;margin:6px 0}' +
    '@media(max-width:720px){.wb-topbar .tk-nav__lbl,.wb-topbar .tk-nav__sep{display:none}.wb-topbar .tk-nav{gap:0}}' +
    '@media(max-width:700px){.tk-nav{position:static}.tk-nav__menu{position:fixed;top:64px;left:16px;right:16px;width:auto}}';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // Monogrammes explicites : les initiales calculées se télescopent
  // (Analyse de capacité / Administration).
  var MONOGRAMMES = {
    'sprint-planning': 'SP', 'poker-planning': 'PP', 'analyse-capacite': 'AC',
    'whiteboard': 'WB', 'releases-planning': 'PL', 'bug-dashboard': 'BD',
    'bug-dashboard-v2': 'B2', 'admin': '\u2699'
  };
  function initiales(label) {
    var mots = String(label).replace(/\(.*\)/, '').trim().split(/\s+/);
    return (mots.length > 1 ? mots[0][0] + mots[1][0] : mots[0].slice(0, 2)).toUpperCase();
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

  function item(o, courant) {
    var ici = o.slug === courant;
    return '<a class="tk-nav__item" role="menuitem" href="' + esc(urlOutil(o.slug)) + '"' +
      (ici ? ' aria-current="page"' : '') + '>' +
      '<span class="tk-nav__ic">' + esc(MONOGRAMMES[o.slug] || initiales(o.label)) + '</span>' +
      '<span>' + esc(o.label) + '<small>' + esc(DESCRIPTIONS[o.slug] || '') + '</small></span>' +
      (ici ? '<span class="tk-nav__here">ici</span>' : '') + '</a>';
  }

  function monter(outils) {
    var barres = document.querySelectorAll('.tk-topbar, .wb-topbar');
    if (!barres.length) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    Array.prototype.forEach.call(barres, function (barre) { monterDans(barre, outils); });
  }

  function monterDans(barre, outils) {
    var nom = barre.querySelector('.tk-topbar__tool, .tool-name');
    if (!nom || barre.querySelector('.tk-nav')) return;

    var courant = slugCourant();
    var normaux = outils.filter(function (o) { return o.slug !== 'admin'; });
    var admin = outils.filter(function (o) { return o.slug === 'admin'; });

    var nav = document.createElement('span');
    nav.className = 'tk-nav';
    nav.innerHTML =
      '<button type="button" class="tk-nav__btn" aria-haspopup="menu" aria-expanded="false">' +
        '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="5" height="5" rx="1"/><rect x="9.5" y="1.5" width="5" height="5" rx="1"/><rect x="1.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></svg>' +
        '<span class="tk-nav__lbl">Outils</span></button>' +
      '<span class="tk-nav__sep" aria-hidden="true"></span>' +
      '<div class="tk-nav__menu" role="menu" hidden>' +
        '<div class="tk-nav__h">Mes outils</div>' +
        normaux.map(function (o) { return item(o, courant); }).join('') +
        (admin.length ? '<hr class="tk-nav__hr">' + admin.map(function (o) { return item(o, courant); }).join('') : '') +
        '<hr class="tk-nav__hr">' +
        '<a class="tk-nav__item" role="menuitem" href="' + esc(RACINE) + '"><span class="tk-nav__ic">⌂</span>' +
        '<span>Tous les outils<small>Retour au lanceur</small></span></a>' +
      '</div>';
    nom.parentNode.insertBefore(nav, nom);

    var btn = nav.querySelector('.tk-nav__btn');
    var menu = nav.querySelector('.tk-nav__menu');
    function ouvrir(o) {
      menu.hidden = !o;
      btn.setAttribute('aria-expanded', o ? 'true' : 'false');
      if (o) { var ici = menu.querySelector('[aria-current]') || menu.querySelector('.tk-nav__item'); if (ici) ici.focus(); }
    }
    btn.addEventListener('click', function () { ouvrir(menu.hidden); });
    document.addEventListener('click', function (e) { if (!menu.hidden && !nav.contains(e.target)) ouvrir(false); });
    document.addEventListener('keydown', function (e) {
      if (menu.hidden) return;
      if (e.key === 'Escape') { ouvrir(false); btn.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var items = Array.prototype.slice.call(menu.querySelectorAll('.tk-nav__item'));
        var i = items.indexOf(document.activeElement);
        i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[i].focus(); e.preventDefault();
      }
    });
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
    } catch (e) { console.warn('Menu Outils indisponible :', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
