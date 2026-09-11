/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — orchestration : état, analyse du collage, filtres,
   bandeau exécutif, alertes, cube, drill-down, vues, session Supabase.
   Les lots suivants (plan de livraisons, journal, IA) se branchent via
   BDV2App.hooks sans modifier ce fichier.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core, P = root.BDV2Palette, CFG = root.BDV2Config, CH = root.BDV2Charts, DD = root.BDV2Drill;
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (id) { return document.getElementById(id); };
  var LS = { raw: 'bdv2:rawPaste', refDate: 'bdv2:refDate', view: 'bdv2:view', filters: 'bdv2:filters', collapsed: 'bdv2:collapsed', name: 'bdv2:analysisName' };

  var S = {
    raw: '', headers: [], cols: {}, tickets: [], refDate: new Date(),
    filters: { origin: 'all', version: 'all', teams: [] },
    view: 'projet', session: null, client: null, profil: null,
    alerts: [], cardCtx: {}, kpiDrills: {}, analysisId: null, analysisName: ''
  };
  // Points d'extension pour les lots suivants.
  var hooks = { prepare: [], afterAnalyze: [], render: [], kpiExtras: [], extraTiles: [], alerts: [], drill: {}, versionOptions: [] };
  // Sections fournies par les lots suivants (affichées seulement quand leur module est chargé).
  var available = { kpis: true, alerts: true, cube: true, ai: false, train: false, history: false };

  // ── Utilitaires ────────────────────────────────────────────────────
  function setMsg(text, cls) { var el = $('statusMsg'); el.textContent = text; el.className = 'status-msg' + (cls ? ' ' + cls : ''); }
  function cfg() { return CFG.get(); }
  function ratio(a, b) { return a + ' / ' + b; }
  function pct(a, b) { return b ? (a / b * 100).toFixed(0) + '%' : '0%'; }

  // Tickets après masquage des équipes (base de toutes les vues).
  function baseTickets() {
    var hidden = cfg().teams.hidden || [];
    return S.tickets.filter(function (t) { return hidden.indexOf(t.team) === -1; });
  }
  // Tickets affichés (filtres de la barre).
  function visibleTickets() {
    var f = S.filters;
    return baseTickets().filter(function (t) {
      if (f.origin === 'prj301' && !t.isPrj301) return false;
      if (f.origin === 'internal' && t.isPrj301) return false;
      if (f.version !== 'all') {
        var vk = C.DIMS.version.keyOf(t);
        if (f.version === '__none' ? t.versionState !== 'none' : f.version === '__deployed' ? t.versionState !== 'deployed' : vk !== f.version) return false;
      }
      if (f.teams.length && f.teams.indexOf(t.team) === -1) return false;
      return true;
    });
  }

  // ── Analyse ────────────────────────────────────────────────────────
  function analyze(opts) {
    opts = opts || {};
    var raw = $('pasteArea').value;
    if (!raw.trim()) { setMsg('Collez des données avant d\'analyser.', 'err'); return false; }
    var parsed = C.parsePastedData(raw);
    if (!parsed.rows.length) { setMsg('Aucune ligne détectée — la première ligne collée doit contenir les en-têtes.', 'err'); return false; }
    var cols = C.detectColumns(parsed.headers);
    if (cols.status === -1) { setMsg('Colonne « Status » introuvable dans les en-têtes collés.', 'err'); renderColumnChips(cols); return false; }
    S.raw = raw; S.headers = parsed.headers; S.cols = cols; S.archived = null; $('archiveBanner').classList.add('hidden');
    S.tickets = C.buildTickets(parsed.rows, parsed.headers, cols);
    S.analysisName = ($('analysisName').value || '').trim();
    try { localStorage.setItem(LS.raw, raw); localStorage.setItem(LS.name, S.analysisName); } catch (e) {}
    renderColumnChips(cols);
    if (cols.labels === -1 && S.filters.origin !== 'all') S.filters.origin = 'all';
    rerender();
    $('emptyState').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    setMsg(S.tickets.length + ' tickets analysés' + (cols.targetDate === -1 ? ' — sans colonne Target date (retards et versions indisponibles)' : '') + '.', 'ok');
    if (!opts.silent) hooks.afterAnalyze.forEach(function (fn) { try { fn(S); } catch (e) { console.error(e); } });
    return true;
  }

  // Ouvre une analyse du journal (lecture seule) comme jeu de données courant.
  function loadArchived(tickets, meta) {
    S.tickets = tickets.map(function (t, i) { t.idx = i; return t; });
    S.raw = ''; S.archived = meta; S.analysisId = meta.id || null; S.analysisName = meta.nom || '';
    if (meta.refDate) { S.refDate = new Date(meta.refDate + 'T00:00:00'); $('refDateInput').value = meta.refDate; }
    var has = function (f) { return tickets.some(function (t) { return t[f]; }) ? 0 : -1; };
    S.cols = { key: has('key'), status: 0, team: has('team'), priority: has('priority'), targetDate: has('targetDate'), labels: has('labels'), fixVersion: has('fixVersion'), resolution: has('resolution'), summary: has('summary'), assignee: has('assignee'), dueDate: has('dueDate'), created: has('created') };
    S.headers = [];
    renderColumnChips(S.cols);
    var b = $('archiveBanner');
    b.classList.remove('hidden');
    b.innerHTML = '📂 <span>Analyse archivée <b>' + esc(meta.nom || ('n°' + (meta.index + 1))) + '</b> du <b>' + esc(meta.when) + '</b> (' + tickets.length + ' tickets, lecture seule). Les chiffres, le train et les graphiques reflètent cette analyse ; collez de nouvelles données pour en créer une nouvelle.</span><button type="button" class="ghost small" id="archiveExit">Revenir à l\'analyse courante</button>';
    $('archiveExit').addEventListener('click', exitArchive);
    $('emptyState').classList.add('hidden'); $('emptyHistoryRoot').innerHTML = '';
    $('dashboard').classList.remove('hidden');
    setMsg('Analyse archivée ouverte en lecture seule.', 'ok');
    rerender();
    document.dispatchEvent(new CustomEvent('bdv2:archived', { detail: { meta: meta } }));
  }
  function exitArchive() {
    S.archived = null; $('archiveBanner').classList.add('hidden');
    var saved = null; try { saved = localStorage.getItem(LS.raw); } catch (e) {}
    try { var rd = localStorage.getItem(LS.refDate); if (rd) { $('refDateInput').value = rd; S.refDate = new Date(rd + 'T00:00:00'); } } catch (e) {}
    if (saved) { $('pasteArea').value = saved; analyze({ silent: true }); document.dispatchEvent(new CustomEvent('bdv2:archived', { detail: { meta: null } })); }
    else { S.tickets = []; $('dashboard').classList.add('hidden'); $('emptyState').classList.remove('hidden'); setMsg('', ''); document.dispatchEvent(new CustomEvent('bdv2:archived', { detail: { meta: null } })); }
  }

  function renderColumnChips(cols) {
    var spec = [['key', 'Clé', 'imp'], ['status', 'Statut', 'req'], ['team', 'Équipe', 'imp'], ['priority', 'Priorité', 'imp'], ['targetDate', 'Target date', 'imp'], ['labels', 'Labels (PRJ301)', 'imp'], ['fixVersion', 'Fix Version', 'imp'], ['resolution', 'Résolution', 'imp'], ['summary', 'Résumé', 'opt'], ['assignee', 'Responsable', 'opt'], ['dueDate', 'Due date', 'opt'], ['created', 'Created', 'opt']];
    $('colChips').innerHTML = spec.map(function (s) {
      var ok = cols[s[0]] !== -1;
      // Trouvé → vert avec un crochet ; absent → gris avec une croix. Le rouge est
      // réservé à la seule colonne qui bloque l'analyse (Statut), comme dans les
      // autres outils du toolkit (assets/paste-field.js).
      var cls = ok ? 'on' : (s[2] === 'req' ? 'off' : 'opt');
      return '<span class="chip ' + cls + '" title="' + (ok ? 'Colonne détectée : ' + esc(S.headers[cols[s[0]]] || s[1]) : (s[2] === 'req' ? 'Colonne nécessaire pour progresser — non trouvée' : 'Colonne non trouvée')) + '">' + (ok ? '✓ ' : '✗ ') + s[1] + '</span>';
    }).join('');
  }

  // ── Rendu ──────────────────────────────────────────────────────────
  function rerender() {
    if (!S.tickets.length) return;
    var conf = cfg();
    hooks.prepare.forEach(function (fn) { try { fn(S.tickets, S); } catch (e) { console.error(e); } });
    C.enrich(S.tickets, conf, S.refDate);
    applyView();
    renderFilterBar();
    var vis = visibleTickets();
    renderKpis(vis);
    renderAlerts(vis);
    renderCube(vis);
    hooks.render.forEach(function (fn) { try { fn(vis, S); } catch (e) { console.error(e); } });
    $('filterSummary').textContent = vis.length === baseTickets().length ? vis.length + ' tickets' : vis.length + ' tickets affichés sur ' + baseTickets().length;
  }

  function applyView() {
    var v = cfg().views[S.view] || cfg().views.projet;
    var sec = v.sections || {};
    ['kpis', 'alerts', 'ai', 'train', 'cube', 'history'].forEach(function (s) {
      var el = $('sec-' + s); if (el) el.classList.toggle('hidden', sec[s] === false || !available[s]);
    });
  }

  // ── Barre de filtres ───────────────────────────────────────────────
  function renderFilterBar() {
    var conf = cfg();
    var hasLabels = S.cols.labels !== -1;
    $('fOrigin').innerHTML = [['all', 'Tous'], ['prj301', 'PRJ301'], ['internal', 'Interne']].map(function (o) {
      return '<button type="button" data-origin="' + o[0] + '" class="' + (S.filters.origin === o[0] ? 'is-on' : '') + '" ' + (!hasLabels && o[0] !== 'all' ? 'disabled title="Colonne Labels introuvable"' : '') + '>' + o[1] + '</button>';
    }).join('');
    // versions : fournies par le lot "plan" ; sinon le groupe est masqué
    var vopts = [];
    hooks.versionOptions.forEach(function (fn) { vopts = vopts.concat(fn(S) || []); });
    var vg = $('fVersionGroup');
    if (vopts.length) {
      vg.classList.remove('hidden');
      var all = [['all', 'Toutes']].concat(vopts);
      $('fVersion').innerHTML = all.map(function (o) { return '<button type="button" data-version="' + esc(o[0]) + '" class="' + (S.filters.version === o[0] ? 'is-on' : '') + '">' + esc(o[1]) + '</button>'; }).join('');
    } else { vg.classList.add('hidden'); if (S.filters.version !== 'all') S.filters.version = 'all'; }
    // équipes
    var base = baseTickets();
    var teamsRaw = []; base.forEach(function (t) { if (teamsRaw.indexOf(t.team) === -1) teamsRaw.push(t.team); });
    var labels = {}; base.forEach(function (t) { labels[t.team] = t.teamLabel; });
    var allLabels = teamsRaw.map(function (r) { return labels[r]; });
    var colors = P.colorsForDim('team', allLabels, conf, base);
    var ordered = C.DIMS.team.order(allLabels, conf, base);
    var rawByLabel = {}; base.forEach(function (t) { rawByLabel[t.teamLabel] = t.team; });
    $('fTeams').innerHTML = ordered.map(function (lbl) {
      var raw = rawByLabel[lbl];
      return '<button type="button" class="fchip' + (S.filters.teams.indexOf(raw) !== -1 ? ' is-on' : '') + '" data-team="' + esc(raw) + '"><span class="dot" style="background:' + colors[lbl] + '"></span>' + esc(lbl) + '</button>';
    }).join('');
    try { localStorage.setItem(LS.filters, JSON.stringify(S.filters)); } catch (e) {}
  }

  // ── Bandeau exécutif ───────────────────────────────────────────────
  function renderKpis(vis) {
    var k = C.computeKpis(vis);
    var open = vis.filter(function (t) { return !t.isDone; }), done = vis.filter(function (t) { return t.isDone; });
    var tiles = [
      { id: 'total', label: 'Tickets', value: k.total, sub: k.open + ' ouverts · ' + k.done + ' terminés', tone: 'accent',
        drill: function () { return { title: 'Tous les tickets', tabs: [{ label: 'Tous', tickets: vis }, { label: 'Ouverts', tickets: open }, { label: 'Terminés', tickets: done }] }; } },
      { id: 'progress', label: 'Avancement pondéré', value: k.progress.toFixed(1), unit: '%', sub: 'pondération par statut (pas de points sur les bugs)', tone: k.progress >= 90 ? 'good' : k.progress >= 50 ? 'accent' : 'serious',
        drill: function () { return { title: 'Avancement pondéré', subtitle: 'Tous les tickets affichés, avec leur statut', tabs: [{ label: 'Ouverts', tickets: open }, { label: 'Terminés', tickets: done }] }; } },
      { id: 'done', label: 'Terminés', value: ratio(k.done, k.total), sub: pct(k.done, k.total) + ' du périmètre — reste ' + k.open, tone: 'good',
        drill: function () { return { title: 'Terminés vs reste', tabs: [{ label: 'Terminés', tickets: done }, { label: 'Reste à faire', tickets: open }] }; } },
      { id: 'fix', label: 'Fix Version renseignée', value: ratio(k.hasFix, k.total), sub: pct(k.hasFix, k.total) + ' mergés — reste ' + (k.total - k.hasFix) + ' sans Fix Version', tone: 'good',
        drill: function () { return { title: 'Fix Version', subtitle: 'Réalisé (Fix Version renseignée) vs reste', tabs: [{ label: 'Avec Fix Version', tickets: vis.filter(function (t) { return t.hasFix; }) }, { label: 'Sans Fix Version', tickets: vis.filter(function (t) { return !t.hasFix; }) }] }; } },
      { id: 'doneNoFix', label: 'Terminés sans Fix Version', value: k.doneNoFix, sub: k.done + ' terminés, ' + k.doneWithFix + ' avec Fix Version — voir la résolution', tone: k.doneNoFix ? 'warn' : 'neutral',
        drill: function () { return { title: 'Terminés sans Fix Version', subtitle: 'La colonne Résolution explique pourquoi un ticket est clos sans version (Decline, Duplicate, Cannot reproduce…)', tabs: [{ label: 'Terminés sans Fix Version', tickets: done.filter(function (t) { return !t.hasFix; }) }, { label: 'Terminés avec Fix Version', tickets: done.filter(function (t) { return t.hasFix; }) }] }; } },
      { id: 'blockers', label: 'Blockers ouverts', value: k.blockersOpen, sub: 'sur ' + k.blockers + ' blockers au total', tone: k.blockersOpen ? 'critical' : 'neutral',
        drill: function () { return { title: 'Blockers', tabs: [{ label: 'Ouverts', tickets: vis.filter(function (t) { return t.isBlocker && !t.isDone; }) }, { label: 'Terminés', tickets: vis.filter(function (t) { return t.isBlocker && t.isDone; }) }] }; } },
      { id: 'overdue', label: 'Target date dépassée', value: k.overdue, sub: pct(k.overdue, k.open) + ' des tickets ouverts — au ' + C.fmtDate(S.refDate), tone: k.overdue ? 'serious' : 'neutral',
        drill: function () { return { title: 'Target date dépassée', subtitle: 'Tickets ouverts dont la Target date est antérieure au ' + C.fmtDate(S.refDate), tabs: [{ label: 'En retard', tickets: vis.filter(function (t) { return t.isOverdue; }) }, { label: 'Ouverts dans les temps', tickets: open.filter(function (t) { return !t.isOverdue; }) }] }; } },
      { id: 'prj301', label: 'Origine PRJ301', value: ratio(k.prj301, k.total), sub: pct(k.prj301, k.total) + ' tests fournis — ' + (k.total - k.prj301) + ' bugs internes', tone: 'purple',
        drill: function () { return { title: 'Origine des tickets', tabs: [{ label: 'PRJ301', tickets: vis.filter(function (t) { return t.isPrj301; }) }, { label: 'Interne', tickets: vis.filter(function (t) { return !t.isPrj301; }) }] }; } }
    ];
    hooks.extraTiles.forEach(function (fn) { tiles = tiles.concat(fn(vis, k, S) || []); });
    S.kpiDrills = {};
    tiles.forEach(function (t) {
      S.kpiDrills[t.id] = t.drill; t.dd = 'kpi';
      hooks.kpiExtras.forEach(function (fn) { var x = fn(t.id, k, S); if (x) { if (x.delta) t.delta = x.delta; if (x.spark) t.spark = x.spark; } });
    });
    CH.renderTiles($('kpiGrid'), tiles);
  }

  // ── Alertes déterministes ──────────────────────────────────────────
  function renderAlerts(vis) {
    var alerts = [];
    var open = vis.filter(function (t) { return !t.isDone; });
    var bnoTeam = open.filter(function (t) { return t.isBlocker && t.team === 'Non affecté'; });
    if (bnoTeam.length) alerts.push({ level: 'critical', icon: '!', html: '<b>' + bnoTeam.length + ' blocker' + (bnoTeam.length > 1 ? 's' : '') + ' ouvert' + (bnoTeam.length > 1 ? 's' : '') + ' sans équipe</b> — personne ne les porte.', tickets: bnoTeam, title: 'Blockers sans équipe' });
    var k = C.computeKpis(vis);
    if (k.doneNoFix) alerts.push({ level: 'warning', icon: '?', html: '<b>' + k.doneNoFix + ' ticket' + (k.doneNoFix > 1 ? 's' : '') + ' terminé' + (k.doneNoFix > 1 ? 's' : '') + ' sans Fix Version</b> sur ' + k.done + ' terminés — vérifier la résolution (déclinés, doublons, non reproductibles…).', tickets: vis.filter(function (t) { return t.isDone && !t.hasFix; }), title: 'Terminés sans Fix Version' });
    var late = open.filter(function (t) { return t.isOverdue; });
    if (late.length) {
      var byTeam = {}; late.forEach(function (t) { byTeam[t.teamLabel] = (byTeam[t.teamLabel] || 0) + 1; });
      var top = Object.keys(byTeam).sort(function (a, b) { return byTeam[b] - byTeam[a]; }).slice(0, 3).map(function (t) { return esc(t) + ' (' + byTeam[t] + ')'; }).join(', ');
      alerts.push({ level: late.length >= 5 ? 'serious' : 'warning', icon: '⏱', html: '<b>' + late.length + ' ticket' + (late.length > 1 ? 's' : '') + ' ouvert' + (late.length > 1 ? 's' : '') + ' avec Target date dépassée</b> — ' + top + '.', tickets: late, title: 'Target date dépassée' });
    }
    var noTarget = open.filter(function (t) { return !t.targetDate; });
    if (noTarget.length && S.cols.targetDate !== -1) alerts.push({ level: 'info', icon: 'i', html: '<b>' + noTarget.length + ' ticket' + (noTarget.length > 1 ? 's' : '') + ' ouvert' + (noTarget.length > 1 ? 's' : '') + ' sans Target date</b> — impossible de les rattacher à une version.', tickets: noTarget, title: 'Sans Target date' });
    var prjBlock = open.filter(function (t) { return t.isPrj301 && t.isBlocker; });
    if (prjBlock.length) alerts.push({ level: 'serious', icon: '★', html: '<b>' + prjBlock.length + ' blocker' + (prjBlock.length > 1 ? 's' : '') + ' PRJ301 ouvert' + (prjBlock.length > 1 ? 's' : '') + '</b> — attendus par le projet de test.', tickets: prjBlock, title: 'Blockers PRJ301 ouverts' });
    hooks.alerts.forEach(function (fn) { alerts = alerts.concat(fn(vis, S) || []); });
    var order = { critical: 0, serious: 1, warning: 2, info: 3 };
    alerts.sort(function (a, b) { return order[a.level] - order[b.level]; });
    S.alerts = alerts;
    $('alertsList').innerHTML = alerts.length ? alerts.map(function (a, i) {
      return '<div class="alert ' + a.level + '" data-dd="alert" data-idx="' + i + '"><span class="ic">' + a.icon + '</span><span class="txt">' + a.html + '</span><span class="cnt">' + a.tickets.length + '</span></div>';
    }).join('') : '<div class="empty" style="padding:14px">Aucune alerte — rien ne dépasse des seuils configurés.</div>';
    $('alertsCount').textContent = alerts.length ? alerts.length : '';
  }

  // ── Cube ───────────────────────────────────────────────────────────
  function renderCube(vis) {
    var conf = cfg();
    var view = conf.views[S.view];
    var cards = conf.cards.filter(function (c) {
      if (!c.visible) return false;
      if (!S.hasPlan && (c.rows === 'version' || c.cols === 'version')) return false; // sans plan publié, la dimension Version est vide
      return !view || view.cards.indexOf(c.id) !== -1 || S.view === 'projet';
    });
    var base = baseTickets();
    S.cardCtx = {};
    var grid = $('cubeGrid');
    grid.innerHTML = cards.map(function (card) {
      var pv = C.pivot(vis, card.rows, card.cols, conf);
      var allRow = []; base.forEach(function (t) { var k = C.DIMS[card.rows].keyOf(t); if (allRow.indexOf(k) === -1) allRow.push(k); });
      var rowColors = P.colorsForDim(card.rows, allRow, conf, base);
      var colors = {};
      if (card.cols) { var allCol = []; base.forEach(function (t) { var k = C.DIMS[card.cols].keyOf(t); if (allCol.indexOf(k) === -1) allCol.push(k); }); colors = P.colorsForDim(card.cols, allCol, conf, base); }
      var ctx = { pivot: pv, style: card.style, measure: card.measure, colors: colors, rowColors: rowColors, card: card };
      S.cardCtx[card.id] = ctx;
      var wide = card.style === 'heatmap' && pv.cols.length > 5 || card.style === 'table' && pv.cols.length > 4 || card.style === 'vstack' && pv.rows.length > 7;
      var styles = Object.keys(CFG.STYLE_LABELS).filter(function (s) { return card.cols ? s !== 'donut' : (s === 'bars' || s === 'donut' || s === 'table'); });
      var dimOpts = function (sel, allowNone) { var o = allowNone ? '<option value=""' + (!sel ? ' selected' : '') + '>× —</option>' : ''; Object.keys(CFG.DIM_LABELS).forEach(function (k) { o += '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + (allowNone ? '× ' : '') + CFG.DIM_LABELS[k] + '</option>'; }); return o; };
      return '<div class="card' + (wide ? ' wide' : '') + '" data-card-el="' + esc(card.id) + '"><div class="card-head"><div><h2>' + esc(card.title) + '</h2><div class="sub">' + esc(CFG.DIM_LABELS[card.rows]) + (card.cols ? ' × ' + esc(CFG.DIM_LABELS[card.cols]) : '') + ' · ' + esc(CFG.MEASURE_LABELS[card.measure]) + '</div></div>' +
        '<div class="card-tools"><select class="dim-select" data-card-rows="' + esc(card.id) + '" title="Lignes">' + dimOpts(card.rows, false) + '</select><select class="dim-select" data-card-cols="' + esc(card.id) + '" title="Colonnes">' + dimOpts(card.cols, true) + '</select><select class="dim-select" data-card-measure="' + esc(card.id) + '" title="Mesure">' + Object.keys(CFG.MEASURE_LABELS).map(function (m) { return '<option value="' + m + '"' + (card.measure === m ? ' selected' : '') + '>' + CFG.MEASURE_LABELS[m] + '</option>'; }).join('') + '</select>' +
        '<span class="style-seg">' + styles.map(function (s) { return '<button type="button" data-card-style="' + esc(card.id) + '" data-style="' + s + '" class="' + (card.style === s ? 'is-on' : '') + '" title="' + CFG.STYLE_LABELS[s] + '">' + STYLE_ICONS[s] + '</button>'; }).join('') + '</span></div></div>' +
        '<div class="chart-body">' + CH.renderPivot(ctx) + '</div></div>';
    }).join('') || '<div class="empty">Aucune carte visible dans cette vue — ouvrez la configuration (Cartes).</div>';
  }
  var STYLE_ICONS = { hstack: '▬', vstack: '▮', heatmap: '▦', bars: '≡', donut: '◔', table: '⊞' };

  // ── Drill-down ─────────────────────────────────────────────────────
  function resolveDrill(el) {
    var d = el.dataset, vis = visibleTickets();
    if (d.dd === 'kpi') { var fn = S.kpiDrills[d.ddKpi]; return fn ? fn() : null; }
    if (d.dd === 'alert') { var a = S.alerts[+d.idx]; return a ? { title: a.title, subtitle: el.querySelector('.txt').textContent, tickets: a.tickets } : null; }
    if (d.dd === 'cell') {
      var ctx = S.cardCtx[d.card]; if (!ctx) return null;
      var pv = ctx.pivot;
      var cell = pv.cell(d.rkey, d.cdim ? d.ckey : '_');
      var doneT = cell.tickets.filter(function (t) { return t.isDone; }), openT = cell.tickets.filter(function (t) { return !t.isDone; });
      return { title: ctx.card.title, subtitle: C.DIMS[d.rdim].label + ' : ' + d.rkey + (d.cdim ? ' · ' + C.DIMS[d.cdim].label + ' : ' + d.ckey : ''), tabs: [{ label: 'Tous', tickets: cell.tickets }, { label: 'Ouverts', tickets: openT }, { label: 'Terminés', tickets: doneT }] };
    }
    if (d.dd === 'row' || d.dd === 'col') {
      var dim = C.DIMS[d.dim]; if (!dim) return null;
      var list = vis.filter(function (t) { return dim.keyOf(t) === d.key; });
      return { title: dim.label + ' : ' + d.key, tabs: [{ label: 'Tous', tickets: list }, { label: 'Ouverts', tickets: list.filter(function (t) { return !t.isDone; }) }, { label: 'Terminés', tickets: list.filter(function (t) { return t.isDone; }) }] };
    }
    var custom = hooks.drill[d.dd];
    return custom ? custom(el, vis, S) : null;
  }

  // ── Session Supabase (optionnelle) ─────────────────────────────────
  async function initSession() {
    var A = root.PlanifAuth;
    var badge = $('modeBadge');
    if (!A) { badge.className = 'mode-badge local'; badge.innerHTML = 'Mode local'; return; }
    try {
      S.session = await A.getSession();
      if (S.session) {
        S.client = A.getClient();
        try { S.profil = await A.monProfil(); } catch (e) {}
        var name = S.profil ? S.profil.nom_utilisateur : 'connecté';
        $('topbarUser').innerHTML = 'Connecté : <b>' + esc(name) + '</b>';
        badge.className = 'mode-badge'; badge.innerHTML = '● Mode partagé — configuration et journal communs';
        await CFG.loadRemote(S.client, S.session.user.id);
      } else {
        badge.className = 'mode-badge local';
        badge.innerHTML = 'Mode local — <a href="../">connectez-vous depuis le lanceur</a> pour partager configuration et journal';
      }
    } catch (e) { console.warn(e); badge.className = 'mode-badge local'; badge.textContent = 'Mode local'; }
    // Compte le temps passé ici comme de l'activité, et coupe la
    // session après 1 h d'inactivité (voir acces/auth.js).
    try { await A.surveillerInactiviteOutil(); } catch (e) { console.warn(e); }
  }

  // ── Liaison de l'interface ─────────────────────────────────────────
  function bind() {
    $('analyzeBtn').addEventListener('click', function () { analyze(); });
    $('clearBtn').addEventListener('click', function () {
      $('pasteArea').value = ''; $('analysisName').value = '';
      try { localStorage.removeItem(LS.raw); } catch (e) {}
      S.tickets = []; S.raw = ''; S.archived = null; $('archiveBanner').classList.add('hidden'); $('dashboard').classList.add('hidden'); $('emptyState').classList.remove('hidden'); $('colChips').innerHTML = ''; setMsg('', ''); DD.close();
      document.dispatchEvent(new CustomEvent('bdv2:archived', { detail: { meta: null } }));
    });
    var refInput = $('refDateInput');
    refInput.value = (function () { try { return localStorage.getItem(LS.refDate); } catch (e) { return null; } })() || C.toISO(new Date());
    S.refDate = new Date(refInput.value + 'T00:00:00');
    refInput.addEventListener('change', function () { S.refDate = refInput.value ? new Date(refInput.value + 'T00:00:00') : new Date(); try { localStorage.setItem(LS.refDate, refInput.value); } catch (e) {} rerender(); });
    // vues
    var viewSel = $('viewSelect');
    function fillViews() { var v = cfg().views; viewSel.innerHTML = Object.keys(v).map(function (id) { return '<option value="' + id + '"' + (id === S.view ? ' selected' : '') + '>' + esc(v[id].label) + '</option>'; }).join(''); }
    try { S.view = localStorage.getItem(LS.view) || 'projet'; } catch (e) {}
    if (!cfg().views[S.view]) S.view = 'projet';
    fillViews();
    viewSel.addEventListener('change', function () { S.view = viewSel.value; try { localStorage.setItem(LS.view, S.view); } catch (e) {} rerender(); });
    $('saveViewBtn').addEventListener('click', function () {
      CFG.update(function (c) { var v = c.views[S.view]; if (v) v.cards = c.cards.filter(function (x) { return x.visible; }).map(function (x) { return x.id; }); });
      setMsg('Vue « ' + cfg().views[S.view].label + ' » enregistrée avec les cartes visibles.', 'ok');
    });
    $('cfgBtn').addEventListener('click', function () { CFG.open(configCtx()); });
    $('cfgClose').addEventListener('click', CFG.close);
    $('cfgBackdrop').addEventListener('click', CFG.close);
    $('printBtn').addEventListener('click', function () { window.print(); });
    CFG.onChange(function () { fillViews(); rerender(); });
    // filtres
    try { var f = JSON.parse(localStorage.getItem(LS.filters) || 'null'); if (f) S.filters = Object.assign(S.filters, f); } catch (e) {}
    $('fOrigin').addEventListener('click', function (e) { var b = e.target.closest('[data-origin]'); if (b && !b.disabled) { S.filters.origin = b.dataset.origin; rerender(); } });
    $('fVersion').addEventListener('click', function (e) { var b = e.target.closest('[data-version]'); if (b) { S.filters.version = b.dataset.version; rerender(); } });
    $('fTeams').addEventListener('click', function (e) { var b = e.target.closest('[data-team]'); if (!b) return; var i = S.filters.teams.indexOf(b.dataset.team); if (i === -1) S.filters.teams.push(b.dataset.team); else S.filters.teams.splice(i, 1); rerender(); });
    $('filterReset').addEventListener('click', function () { S.filters = { origin: 'all', version: 'all', teams: [] }; rerender(); });
    // sections repliables
    var collapsed = {}; try { collapsed = JSON.parse(localStorage.getItem(LS.collapsed) || '{}'); } catch (e) {}
    document.querySelectorAll('.collapse-btn[data-target]').forEach(function (b) {
      var target = $(b.dataset.target);
      var apply = function (isC) { target.classList.toggle('hidden', isC); b.classList.toggle('is-collapsed', isC); b.querySelector('.lbl').textContent = isC ? 'Afficher' : 'Réduire'; };
      apply(!!collapsed[b.dataset.target]);
      b.addEventListener('click', function () { collapsed[b.dataset.target] = !collapsed[b.dataset.target]; apply(collapsed[b.dataset.target]); try { localStorage.setItem(LS.collapsed, JSON.stringify(collapsed)); } catch (e) {} });
    });
    // délégation : drill-down + outils de carte
    document.addEventListener('click', function (e) {
      var st = e.target.closest('[data-card-style]');
      if (st) { CFG.update(function (c) { var card = c.cards.find(function (x) { return x.id === st.dataset.cardStyle; }); if (card) card.style = st.dataset.style; }); return; }
      var el = e.target.closest('[data-dd]'); if (!el) return;
      if (e.target.closest('select, input, a')) return;
      var spec = resolveDrill(el);
      if (spec) DD.open(spec);
    });
    document.addEventListener('change', function (e) {
      var t = e.target, d = t.dataset;
      if (d.cardRows !== undefined && t.classList.contains('dim-select')) CFG.update(function (c) { var card = c.cards.find(function (x) { return x.id === d.cardRows; }); if (card) card.rows = t.value; });
      else if (d.cardCols !== undefined && t.classList.contains('dim-select')) CFG.update(function (c) { var card = c.cards.find(function (x) { return x.id === d.cardCols; }); if (card) card.cols = t.value || null; });
      else if (d.cardMeasure !== undefined && t.classList.contains('dim-select')) CFG.update(function (c) { var card = c.cards.find(function (x) { return x.id === d.cardMeasure; }); if (card) card.measure = t.value; });
    });
  }

  function configCtx() {
    var teams = [], prios = {}, statuses = {};
    S.tickets.forEach(function (t) {
      if (teams.indexOf(t.team) === -1) teams.push(t.team);
      prios[t.priorityKey] = t.priority;
      statuses[t.statusKey] = statuses[t.statusKey] || { key: t.statusKey, label: t.status, count: 0 }; statuses[t.statusKey].count++;
    });
    return { teams: teams.sort(), priorities: Object.keys(prios).map(function (k) { return { key: k, label: prios[k] }; }), statuses: Object.keys(statuses).map(function (k) { return statuses[k]; }) };
  }

  async function init() {
    CFG.loadLocal();
    CH.initTooltip();
    DD.init();
    bind();
    await initSession();
    try { $('analysisName').value = localStorage.getItem(LS.name) || ''; } catch (e) {}
    var saved = null; try { saved = localStorage.getItem(LS.raw); } catch (e) {}
    if (saved) { $('pasteArea').value = saved; analyze({ silent: true }); }
    document.dispatchEvent(new CustomEvent('bdv2:ready'));
  }

  root.BDV2App = { state: S, hooks: hooks, available: available, loadArchived: loadArchived, exitArchive: exitArchive, rerender: rerender, analyze: analyze, visibleTickets: visibleTickets, baseTickets: baseTickets, configCtx: configCtx, setMsg: setMsg, esc: esc };
  document.addEventListener('DOMContentLoaded', init);
})(window);
