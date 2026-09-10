/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — configuration : valeurs par défaut, persistance
   (localStorage immédiat + Supabase partagé quand une session existe),
   et tiroir de configuration (équipes, priorités, statuts, cartes,
   règles, vues, IA).
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core, P = root.BDV2Palette;
  var LS_KEY = 'bdv2:config';
  var REMOTE_KEY = 'bug-dashboard-v2';

  var DEFAULT_CARDS = [
    { id: 'team_status',     title: 'Statuts par équipe',            rows: 'team',       cols: 'status',   measure: 'count',    style: 'hstack',  visible: true },
    { id: 'team_priority',   title: 'Priorités par équipe',          rows: 'team',       cols: 'priority', measure: 'count',    style: 'heatmap', visible: true },
    { id: 'version_status',  title: 'Statuts par version',           rows: 'version',    cols: 'status',   measure: 'count',    style: 'vstack',  visible: true },
    { id: 'version_team',    title: 'Équipes par version',           rows: 'version',    cols: 'team',     measure: 'count',    style: 'hstack',  visible: false },
    { id: 'status',          title: 'Répartition par statut',        rows: 'status',     cols: null,       measure: 'count',    style: 'bars',    visible: true },
    { id: 'team',            title: 'Répartition par équipe',        rows: 'team',       cols: null,       measure: 'count',    style: 'donut',   visible: true },
    { id: 'priority_origin', title: 'Priorités × origine',           rows: 'priority',   cols: 'origin',   measure: 'count',    style: 'vstack',  visible: true },
    { id: 'team_progress',   title: 'Avancement pondéré par équipe', rows: 'team',       cols: null,       measure: 'progress', style: 'table',   visible: true },
    { id: 'done_fix',        title: 'Résolutions × Fix Version',     rows: 'resolution', cols: 'fixState', measure: 'count',    style: 'table',   visible: true }
  ];

  var DEFAULTS = {
    teams:      { order: [], alias: {}, hidden: [], colors: {} },
    priorities: { order: C.PRIORITY_ORDER_DEFAULT.slice(), colors: {}, groups: {}, blockerKeys: ['blocker', 'highest'] },
    statuses:   { pct: {}, colors: {}, done: ['closed', 'decline', 'declined', 'done', 'resolved', "won't do", 'wont do'] },
    version:    { boundary: 'deploy', toleranceDays: 0, useFixVersion: false },
    alerts:     { daysBefore: 7, minPct: 50 },
    cards:      DEFAULT_CARDS,
    views: {
      direction: { label: 'Direction',      cards: ['team_status', 'team_priority', 'version_status'], sections: { kpis: true, ai: true, train: true, cube: true, history: true, alerts: true } },
      projet:    { label: 'Chef de projet', cards: DEFAULT_CARDS.map(function (c) { return c.id; }), sections: { kpis: true, ai: true, train: true, cube: true, history: true, alerts: true } },
      scrum:     { label: 'Scrum',          cards: ['team_status', 'team_priority', 'status', 'team', 'done_fix'], sections: { kpis: true, ai: false, train: true, cube: true, history: false, alerts: true } }
    },
    ai:         { model: 'claude-haiku-4-5', auto: true, tone: 'direction' },
    history:    { keepTickets: true, sparkPoints: 10 }
  };

  var cfg = deepClone(DEFAULTS);
  var listeners = [];
  var remoteReady = false, saveTimer = null;

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, over) {
    if (!over || typeof over !== 'object') return base;
    Object.keys(over).forEach(function (k) {
      if (k === 'cards' && Array.isArray(over.cards)) {
        // cartes : fusion par id (les nouvelles cartes livrées avec l'outil
        // apparaissent même sur une config enregistrée avant leur ajout)
        var byId = {};
        over.cards.forEach(function (c) { byId[c.id] = c; });
        var known = {};
        base.cards = DEFAULT_CARDS.map(function (d) { known[d.id] = true; return Object.assign({}, d, byId[d.id] || {}); });
        over.cards.forEach(function (c) { if (!known[c.id]) base.cards.push(c); });
        // ordre : celui de la config enregistrée, les nouvelles cartes à la fin
        var pos = {}; over.cards.forEach(function (c, i) { pos[c.id] = i; });
        base.cards.sort(function (a, b) { var pa = pos[a.id], pb = pos[b.id]; if (pa == null && pb == null) return 0; if (pa == null) return 1; if (pb == null) return -1; return pa - pb; });
        return;
      }
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], over[k]);
      else base[k] = over[k];
    });
    return base;
  }

  function loadLocal() {
    try { var raw = localStorage.getItem(LS_KEY); if (raw) cfg = merge(deepClone(DEFAULTS), JSON.parse(raw)); } catch (e) {}
  }
  function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }

  var remoteClient = null, remoteUser = null;
  async function loadRemote(client, userId) {
    remoteClient = client; remoteUser = userId;
    if (!client) return false;
    try {
      var res = await client.from('bdv2_config').select('valeur, maj_le').eq('cle', REMOTE_KEY).maybeSingle();
      if (res.error) throw res.error;
      remoteReady = true;
      if (res.data && res.data.valeur) {
        cfg = merge(deepClone(DEFAULTS), res.data.valeur);
        saveLocal();
      } else {
        saveRemote(); // première utilisation connectée : publie la config locale
      }
      return true;
    } catch (e) { console.warn('config distante indisponible', e); return false; }
  }
  function saveRemote() {
    if (!remoteClient || !remoteReady) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      try {
        var res = await remoteClient.from('bdv2_config').upsert({ cle: REMOTE_KEY, valeur: cfg, maj_par: remoteUser, maj_le: new Date().toISOString() });
        if (res.error) console.warn('config : enregistrement partagé refusé', res.error);
      } catch (e) { console.warn(e); }
    }, 600);
  }

  function get() { return cfg; }
  function notify() { listeners.forEach(function (l) { l(cfg); }); }
  function update(fn) { fn(cfg); saveLocal(); saveRemote(); notify(); }
  function onChange(fn) { listeners.push(fn); }
  function reset() { cfg = deepClone(DEFAULTS); saveLocal(); saveRemote(); notify(); }
  function exportJSON() { return JSON.stringify(cfg, null, 2); }
  function importJSON(text) { var o = JSON.parse(text); cfg = merge(deepClone(DEFAULTS), o); saveLocal(); saveRemote(); notify(); }

  // ── Tiroir de configuration ────────────────────────────────────────
  var STYLE_LABELS = { hstack: 'Empilé horizontal', vstack: 'Empilé vertical', heatmap: 'Heatmap', bars: 'Barres', donut: 'Donut', table: 'Tableau' };
  var MEASURE_LABELS = { count: 'Nombre de tickets', progress: '% avancement pondéré', shareRow: '% de la ligne', shareCol: '% de la colonne', shareTotal: '% du total' };
  var DIM_LABELS = {};
  Object.keys(C.DIMS).forEach(function (k) { DIM_LABELS[k] = C.DIMS[k].label; });

  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var drawerTab = 'teams';
  var ctxRef = { teams: [], priorities: [], statuses: [] };
  var bound = false;

  function open(ctx, tab) {
    if (ctx) ctxRef = ctx;
    if (tab) drawerTab = tab;
    document.getElementById('cfgDrawer').classList.add('is-open');
    document.getElementById('cfgBackdrop').classList.add('is-open');
    renderDrawer();
  }
  function close() {
    document.getElementById('cfgDrawer').classList.remove('is-open');
    document.getElementById('cfgBackdrop').classList.remove('is-open');
  }

  function swatchPicker(current, dataAttrs) {
    var opts = P.SWATCHES.map(function (c) {
      return '<button type="button" class="sw' + (c === current ? ' is-on' : '') + '" style="background:' + c + '" data-color="' + c + '" ' + dataAttrs + ' title="' + c + '"></button>';
    }).join('');
    return '<div class="sw-row">' + opts + '<button type="button" class="sw sw-auto" data-color="" ' + dataAttrs + ' title="Automatique">auto</button></div>';
  }

  function renderDrawer() {
    var el = document.getElementById('cfgBody');
    var tabs = [['teams', 'Équipes'], ['priorities', 'Priorités'], ['statuses', 'Statuts'], ['cards', 'Cartes'], ['rules', 'Règles'], ['views', 'Vues'], ['ai', 'IA'], ['data', 'Sauvegarde']];
    document.getElementById('cfgTabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" class="cfg-tab' + (t[0] === drawerTab ? ' is-on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
    var h = '';
    if (drawerTab === 'teams') {
      var seen = ctxRef.teams.slice();
      var order = cfg.teams.order.slice();
      seen.forEach(function (t) { if (order.indexOf(t) === -1) order.push(t); });
      h += '<p class="cfg-help">Glissez la poignée ⠿ (ou ↑/↓) pour changer l\'ordre d\'affichage des équipes dans tous les graphiques. L\'alias remplace le code technique à l\'écran ; une équipe masquée disparaît des graphiques et des KPI (ses tickets ne sont plus comptés tant qu\'elle est masquée).</p>';
      h += '<ul class="cfg-list" id="cfgTeamList">' + order.map(function (t, i) {
        var hidden = cfg.teams.hidden.indexOf(t) !== -1;
        var missing = seen.indexOf(t) === -1;
        return '<li class="cfg-item" draggable="true" data-team="' + esc(t) + '">' +
          '<span class="grip" title="Glisser pour réordonner">⠿</span>' +
          '<span class="dot" style="background:' + (cfg.teams.colors[t] || P.CATEGORICAL[i % 8]) + '"></span>' +
          '<span class="cfg-name" title="' + esc(t) + '">' + esc(t) + (missing ? ' <em class="cfg-muted">(absente de l\'extrait)</em>' : '') + '</span>' +
          '<input type="text" class="cfg-input" placeholder="Alias" value="' + esc(cfg.teams.alias[t] || '') + '" data-alias="' + esc(t) + '">' +
          '<label class="cfg-check"><input type="checkbox" data-hide="' + esc(t) + '" ' + (hidden ? 'checked' : '') + '> masquer</label>' +
          '<button type="button" class="icon-btn" data-move="up" data-team="' + esc(t) + '" title="Monter">↑</button>' +
          '<button type="button" class="icon-btn" data-move="down" data-team="' + esc(t) + '" title="Descendre">↓</button>' +
          '<details class="cfg-color"><summary title="Couleur">🎨</summary>' + swatchPicker(cfg.teams.colors[t] || '', 'data-team-color="' + esc(t) + '"') + '</details>' +
          '</li>';
      }).join('') + '</ul>';
    } else if (drawerTab === 'priorities') {
      var prSeen = ctxRef.priorities.slice(); // [{key,label}]
      var prOrder = cfg.priorities.order.slice();
      prSeen.forEach(function (p) { if (prOrder.indexOf(p.key) === -1) prOrder.push(p.key); });
      var labelOf = {}; prSeen.forEach(function (p) { labelOf[p.key] = p.label; });
      h += '<p class="cfg-help">Ordre de sévérité (le plus critique en haut) — il pilote l\'ordre des segments et l\'intensité de la rampe rouge. « Regrouper sous… » fusionne plusieurs priorités sous un même libellé (ex. Blocker et Critical → « Critique »). Cochez les priorités comptées comme <strong>Blockers</strong> dans le bandeau.</p>';
      var prShown = prOrder.filter(function (k) { return labelOf[k] || cfg.priorities.colors[k] || cfg.priorities.groups[k]; });
      h += '<ul class="cfg-list" id="cfgPrioList">' + prShown.map(function (k, i) {
        var n = prShown.length, step = n <= 1 ? 0 : Math.round(i / (n - 1) * 4);
        var missing = !labelOf[k];
        return '<li class="cfg-item" draggable="true" data-prio="' + esc(k) + '">' +
          '<span class="grip">⠿</span>' +
          '<span class="dot" style="background:' + (cfg.priorities.colors[k] || P.PRIORITY_RAMP[step]) + '"></span>' +
          '<span class="cfg-name">' + esc(labelOf[k] || k) + (missing ? ' <em class="cfg-muted">(absente)</em>' : '') + '</span>' +
          '<input type="text" class="cfg-input" placeholder="Regrouper sous…" value="' + esc(cfg.priorities.groups[k] || '') + '" data-group="' + esc(k) + '">' +
          '<label class="cfg-check"><input type="checkbox" data-blocker="' + esc(k) + '" ' + (cfg.priorities.blockerKeys.indexOf(k) !== -1 ? 'checked' : '') + '> blocker</label>' +
          '<button type="button" class="icon-btn" data-move="up" data-prio="' + esc(k) + '">↑</button>' +
          '<button type="button" class="icon-btn" data-move="down" data-prio="' + esc(k) + '">↓</button>' +
          '<details class="cfg-color"><summary>🎨</summary>' + swatchPicker(cfg.priorities.colors[k] || '', 'data-prio-color="' + esc(k) + '"') + '</details>' +
          '</li>';
      }).join('') + '</ul>';
    } else if (drawerTab === 'statuses') {
      var stSeen = ctxRef.statuses.slice(); // [{key,label,count}]
      Object.keys(cfg.statuses.pct).forEach(function (k) { if (!stSeen.some(function (s) { return s.key === k; })) stSeen.push({ key: k, label: k, count: 0, missing: true }); });
      stSeen.sort(function (a, b) { return C.pctForStatus(a.key, cfg) - C.pctForStatus(b.key, cfg); });
      h += '<p class="cfg-help">Pondération : % d\'avancement attribué à chaque statut (sert à l\'avancement pondéré — les bugs n\'ont pas de points, tout le reste est en nombre de tickets). « Terminé » = statut compté comme clôturé (KPI Terminés, retards, stock à livrer). Les couleurs alimentent tous les graphiques par statut.</p>';
      h += '<table class="cfg-table"><thead><tr><th>Statut</th><th class="num">Tickets</th><th>% avancement</th><th>Terminé</th><th>Couleur</th></tr></thead><tbody>' + stSeen.map(function (s, i) {
        var done = cfg.statuses.done.indexOf(s.key) !== -1;
        return '<tr data-status="' + esc(s.key) + '"><td>' + esc(s.label) + (s.missing ? ' <em class="cfg-muted">(absent)</em>' : '') + '</td><td class="num">' + (s.count || 0) + '</td>' +
          '<td><input type="number" min="0" max="100" class="cfg-input num" value="' + C.pctForStatus(s.key, cfg) + '" data-pct="' + esc(s.key) + '"></td>' +
          '<td><input type="checkbox" data-done="' + esc(s.key) + '" ' + (done ? 'checked' : '') + '></td>' +
          '<td><details class="cfg-color"><summary title="Choisir la couleur"><span class="dot" style="background:' + (cfg.statuses.colors[s.key] || P.CATEGORICAL[i % 8]) + '"></span>' + (cfg.statuses.colors[s.key] ? '' : 'auto') + '</summary>' + swatchPicker(cfg.statuses.colors[s.key] || '', 'data-status-color="' + esc(s.key) + '"') + '</details></td></tr>';
      }).join('') + '</tbody></table>';
    } else if (drawerTab === 'cards') {
      h += '<p class="cfg-help">Chaque carte du cube croise deux dimensions (ou une seule) avec une mesure et un style de graphique. Réordonnez avec ↑/↓, décochez pour masquer. Le style se change aussi directement sur la carte.</p>';
      h += '<ul class="cfg-list cfg-cards" id="cfgCardList">' + cfg.cards.map(function (c) {
        var dimOpts = function (sel, allowNone) {
          var o = allowNone ? '<option value=""' + (!sel ? ' selected' : '') + '>— aucune —</option>' : '';
          Object.keys(DIM_LABELS).forEach(function (k) { o += '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + DIM_LABELS[k] + '</option>'; });
          return o;
        };
        return '<li class="cfg-item cfg-card" data-card="' + esc(c.id) + '">' +
          '<label class="cfg-check" title="Visible"><input type="checkbox" data-card-visible="' + esc(c.id) + '" ' + (c.visible ? 'checked' : '') + '></label>' +
          '<input type="text" class="cfg-input cfg-title" value="' + esc(c.title) + '" data-card-title="' + esc(c.id) + '">' +
          '<select class="cfg-select" data-card-rows="' + esc(c.id) + '">' + dimOpts(c.rows, false) + '</select>' +
          '<span class="cfg-x">×</span>' +
          '<select class="cfg-select" data-card-cols="' + esc(c.id) + '">' + dimOpts(c.cols, true) + '</select>' +
          '<select class="cfg-select" data-card-measure="' + esc(c.id) + '">' + Object.keys(MEASURE_LABELS).map(function (m) { return '<option value="' + m + '"' + (c.measure === m ? ' selected' : '') + '>' + MEASURE_LABELS[m] + '</option>'; }).join('') + '</select>' +
          '<select class="cfg-select" data-card-style="' + esc(c.id) + '">' + Object.keys(STYLE_LABELS).map(function (s) { return '<option value="' + s + '"' + (c.style === s ? ' selected' : '') + '>' + STYLE_LABELS[s] + '</option>'; }).join('') + '</select>' +
          '<button type="button" class="icon-btn" data-move="up" data-card="' + esc(c.id) + '">↑</button>' +
          '<button type="button" class="icon-btn" data-move="down" data-card="' + esc(c.id) + '">↓</button>' +
          '<button type="button" class="icon-btn" data-card-del="' + esc(c.id) + '" title="Supprimer">🗑</button>' +
          '</li>';
      }).join('') + '</ul><p style="margin-top:10px"><button type="button" class="ghost" id="cfgAddCard">+ Ajouter une carte</button></p>';
    } else if (drawerTab === 'rules') {
      h += '<h4>Rattachement d\'un ticket à une version</h4>' +
        '<p class="cfg-help">Un ticket est rattaché à la <strong>première version</strong> dont le jalon choisi tombe le jour de sa Target date ou après (les Target dates sont des vendredis ; la version déployée le mardi suivant l\'emporte donc). Une tolérance négative autorise un jalon quelques jours <em>avant</em> la Target date. La Fix Version reste informative, sauf si vous cochez l\'option ci-dessous.</p>' +
        '<div class="cfg-grid">' +
        '<label>Jalon de référence <select class="cfg-select" data-rule="boundary">' + [['deploy', 'Déploiement sur la branche'], ['freeze', 'Code freeze'], ['gonogo', 'Go / No-go'], ['start', 'Début de la version'], ['end', 'Fin de la version']].map(function (o) { return '<option value="' + o[0] + '"' + (cfg.version.boundary === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<label>Tolérance (jours) <input type="number" class="cfg-input num" data-rule="toleranceDays" value="' + cfg.version.toleranceDays + '"></label>' +
        '<label class="cfg-check"><input type="checkbox" data-rule="useFixVersion" ' + (cfg.version.useFixVersion ? 'checked' : '') + '> si la Fix Version correspond au nom d\'une version publiée, elle l\'emporte sur la Target date</label>' +
        '</div>' +
        '<h4>Alertes</h4>' +
        '<div class="cfg-grid">' +
        '<label>Version déployée dans moins de <input type="number" class="cfg-input num" data-alert="daysBefore" value="' + cfg.alerts.daysBefore + '"> jours</label>' +
        '<label>… et avancement du ticket sous <input type="number" class="cfg-input num" data-alert="minPct" value="' + cfg.alerts.minPct + '"> %</label>' +
        '</div>';
    } else if (drawerTab === 'views') {
      h += '<p class="cfg-help">Une vue = un jeu de cartes et de sections visibles. Sélectionnez une vue en haut de page ; le bouton « Enregistrer la vue » (en haut de page) fige la visibilité actuelle des cartes dans la vue sélectionnée.</p>';
      h += '<table class="cfg-table"><thead><tr><th>Vue</th><th class="num">Cartes</th><th>Sections</th></tr></thead><tbody>' + Object.keys(cfg.views).map(function (id) {
        var v = cfg.views[id];
        return '<tr><td><input type="text" class="cfg-input" value="' + esc(v.label) + '" data-view-label="' + id + '"></td><td class="num">' + v.cards.length + '</td><td>' + ['kpis', 'alerts', 'ai', 'train', 'cube', 'history'].map(function (s) { return '<label class="cfg-check"><input type="checkbox" data-view-section="' + id + '" data-section="' + s + '" ' + (v.sections[s] ? 'checked' : '') + '> ' + s + '</label>'; }).join(' ') + '</td></tr>';
      }).join('') + '</tbody></table>';
    } else if (drawerTab === 'ai') {
      h += '<p class="cfg-help">La synthèse est générée par une fonction serveur (la clé d\'API n\'est jamais dans la page). Le modèle le moins coûteux est sélectionné par défaut.</p>' +
        '<div class="cfg-grid">' +
        '<label>Modèle <select class="cfg-select" data-ai="model">' + [['claude-haiku-4-5', 'Claude Haiku 4.5 — le moins coûteux'], ['claude-sonnet-5', 'Claude Sonnet 5 — équilibré'], ['claude-opus-5', 'Claude Opus 5 — le plus fin']].map(function (o) { return '<option value="' + o[0] + '"' + (cfg.ai.model === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="cfg-check"><input type="checkbox" data-ai="auto" ' + (cfg.ai.auto ? 'checked' : '') + '> générer automatiquement la synthèse après chaque analyse</label>' +
        '<label>Ton <select class="cfg-select" data-ai="tone">' + [['direction', 'Direction (synthétique, décisionnel)'], ['projet', 'Chef de projet (détaillé, orienté actions)']].map(function (o) { return '<option value="' + o[0] + '"' + (cfg.ai.tone === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '</div>';
    } else if (drawerTab === 'data') {
      h += '<p class="cfg-help">La configuration est enregistrée dans ce navigateur et, quand vous êtes connecté, partagée avec les autres utilisateurs de l\'outil.</p>' +
        '<div class="cfg-actions"><button type="button" class="ghost" id="cfgExport">Exporter (JSON)</button><label class="btn-like">Importer <input type="file" id="cfgImport" accept="application/json" hidden></label><button type="button" class="ghost danger" id="cfgReset">Réinitialiser tout</button></div>' +
        '<pre class="cfg-pre">' + esc(exportJSON()) + '</pre>';
    }
    el.innerHTML = h;
    if (!bound) { bindDrawer(); bound = true; }
    bindDnD();
  }

  function moveIn(arr, item, dir) {
    var i = arr.indexOf(item); if (i === -1) return;
    var j = i + (dir === 'up' ? -1 : 1); if (j < 0 || j >= arr.length) return;
    arr.splice(i, 1); arr.splice(j, 0, item);
  }
  function ensureTeamOrder() { ctxRef.teams.forEach(function (t) { if (cfg.teams.order.indexOf(t) === -1) cfg.teams.order.push(t); }); }
  function ensurePrioOrder() { ctxRef.priorities.forEach(function (p) { if (cfg.priorities.order.indexOf(p.key) === -1) cfg.priorities.order.push(p.key); }); }
  function findCard(c, id) { return c.cards.find(function (x) { return x.id === id; }); }

  function bindDrawer() {
    var body = document.getElementById('cfgBody');
    document.getElementById('cfgTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.cfg-tab'); if (b) { drawerTab = b.dataset.tab; renderDrawer(); }
    });
    // Un attribut data-* = une modification de configuration.
    body.addEventListener('change', function (e) {
      var t = e.target, d = t.dataset;
      if (d.alias !== undefined) update(function (c) { if (t.value.trim()) c.teams.alias[d.alias] = t.value.trim(); else delete c.teams.alias[d.alias]; });
      else if (d.hide !== undefined) update(function (c) { c.teams.hidden = c.teams.hidden.filter(function (x) { return x !== d.hide; }); if (t.checked) c.teams.hidden.push(d.hide); });
      else if (d.group !== undefined) update(function (c) { if (t.value.trim()) c.priorities.groups[d.group] = t.value.trim(); else delete c.priorities.groups[d.group]; });
      else if (d.blocker !== undefined) update(function (c) { c.priorities.blockerKeys = c.priorities.blockerKeys.filter(function (x) { return x !== d.blocker; }); if (t.checked) c.priorities.blockerKeys.push(d.blocker); });
      else if (d.pct !== undefined) update(function (c) { c.statuses.pct[d.pct] = Math.max(0, Math.min(100, Number(t.value) || 0)); });
      else if (d.done !== undefined) update(function (c) { c.statuses.done = c.statuses.done.filter(function (x) { return x !== d.done; }); if (t.checked) c.statuses.done.push(d.done); });
      else if (d.cardVisible !== undefined) update(function (c) { var card = findCard(c, d.cardVisible); if (card) card.visible = t.checked; });
      else if (d.cardTitle !== undefined) update(function (c) { var card = findCard(c, d.cardTitle); if (card) card.title = t.value; });
      else if (d.cardRows !== undefined) update(function (c) { var card = findCard(c, d.cardRows); if (card) card.rows = t.value; });
      else if (d.cardCols !== undefined) update(function (c) { var card = findCard(c, d.cardCols); if (card) card.cols = t.value || null; });
      else if (d.cardMeasure !== undefined) update(function (c) { var card = findCard(c, d.cardMeasure); if (card) card.measure = t.value; });
      else if (d.cardStyle !== undefined) update(function (c) { var card = findCard(c, d.cardStyle); if (card) card.style = t.value; });
      else if (d.rule !== undefined) update(function (c) { c.version[d.rule] = t.type === 'checkbox' ? t.checked : (t.type === 'number' ? Number(t.value) || 0 : t.value); });
      else if (d.alert !== undefined) update(function (c) { c.alerts[d.alert] = Number(t.value) || 0; });
      else if (d.ai !== undefined) update(function (c) { c.ai[d.ai] = t.type === 'checkbox' ? t.checked : t.value; });
      else if (d.viewLabel !== undefined) update(function (c) { c.views[d.viewLabel].label = t.value; });
      else if (d.viewSection !== undefined) update(function (c) { c.views[d.viewSection].sections[d.section] = t.checked; });
      else if (t.id === 'cfgImport' && t.files && t.files[0]) {
        t.files[0].text().then(function (txt) { try { importJSON(txt); renderDrawer(); } catch (err) { alert('Fichier invalide : ' + err.message); } });
      }
    });
    body.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var d = b.dataset;
      if (d.color !== undefined && d.teamColor !== undefined) { update(function (c) { if (d.color) c.teams.colors[d.teamColor] = d.color; else delete c.teams.colors[d.teamColor]; }); renderDrawer(); return; }
      if (d.color !== undefined && d.prioColor !== undefined) { update(function (c) { if (d.color) c.priorities.colors[d.prioColor] = d.color; else delete c.priorities.colors[d.prioColor]; }); renderDrawer(); return; }
      if (d.color !== undefined && d.statusColor !== undefined) { update(function (c) { if (d.color) c.statuses.colors[d.statusColor] = d.color; else delete c.statuses.colors[d.statusColor]; }); renderDrawer(); return; }
      if (d.move && d.team !== undefined) { update(function (c) { ensureTeamOrder(); moveIn(c.teams.order, d.team, d.move); }); renderDrawer(); return; }
      if (d.move && d.prio !== undefined) { update(function (c) { ensurePrioOrder(); moveIn(c.priorities.order, d.prio, d.move); }); renderDrawer(); return; }
      if (d.move && d.card !== undefined) { update(function (c) { moveIn(c.cards, findCard(c, d.card), d.move); }); renderDrawer(); return; }
      if (d.cardDel !== undefined) { if (!confirm('Supprimer cette carte ?')) return; update(function (c) { c.cards = c.cards.filter(function (x) { return x.id !== d.cardDel; }); }); renderDrawer(); return; }
      if (b.id === 'cfgAddCard') { update(function (c) { c.cards.push({ id: 'card_' + Date.now().toString(36), title: 'Nouvelle carte', rows: 'team', cols: 'status', measure: 'count', style: 'hstack', visible: true }); }); renderDrawer(); return; }
      if (b.id === 'cfgExport') { var blob = new Blob([exportJSON()], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bug-dashboard-v2-config.json'; a.click(); return; }
      if (b.id === 'cfgReset') { if (confirm('Réinitialiser toute la configuration (ordre des équipes, couleurs, pondérations, cartes) ?')) { reset(); renderDrawer(); } return; }
    });
  }

  // Glisser-déposer des listes (équipes, priorités) — relié à chaque rendu.
  function bindDnD() {
    ['cfgTeamList', 'cfgPrioList'].forEach(function (id) {
      var ul = document.getElementById(id); if (!ul) return;
      var dragged = null;
      ul.addEventListener('dragstart', function (e) { dragged = e.target.closest('.cfg-item'); if (dragged) { dragged.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch (err) {} } });
      ul.addEventListener('dragend', function () { if (dragged) dragged.classList.remove('dragging'); dragged = null; });
      ul.addEventListener('dragover', function (e) {
        e.preventDefault();
        var over = e.target.closest('.cfg-item'); if (!over || over === dragged || !dragged) return;
        var rect = over.getBoundingClientRect();
        ul.insertBefore(dragged, (e.clientY - rect.top) < rect.height / 2 ? over : over.nextSibling);
      });
      ul.addEventListener('drop', function (e) {
        e.preventDefault();
        var items = Array.prototype.slice.call(ul.querySelectorAll('.cfg-item'));
        if (id === 'cfgTeamList') update(function (c) { c.teams.order = items.map(function (li) { return li.dataset.team; }); });
        else update(function (c) { var shown = items.map(function (li) { return li.dataset.prio; }); var rest = c.priorities.order.filter(function (k) { return shown.indexOf(k) === -1; }); c.priorities.order = shown.concat(rest); });
        renderDrawer();
      });
    });
  }

  root.BDV2Config = {
    DEFAULTS: DEFAULTS, STYLE_LABELS: STYLE_LABELS, MEASURE_LABELS: MEASURE_LABELS, DIM_LABELS: DIM_LABELS,
    get: get, update: update, onChange: onChange, reset: reset, exportJSON: exportJSON, importJSON: importJSON,
    loadLocal: loadLocal, loadRemote: loadRemote,
    open: open, close: close, renderDrawer: renderDrawer
  };
})(window);
