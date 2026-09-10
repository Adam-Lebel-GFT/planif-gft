/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — lot 3 : journal des analyses et évolution.
   - à chaque « Analyser » : snapshot (agrégats + tickets compacts) dans
     Supabase bdv2_analyses, dédoublonné par hash du collage ; miroir
     local (30 dernières) pour le mode hors connexion ;
   - deltas et sparklines sur les tuiles du bandeau ;
   - courbes d'évolution (global, stock à livrer par version, par équipe) ;
   - comparateur entre deux analyses (apparus, disparus, changements).
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core, P = root.BDV2Palette, CFG = root.BDV2Config, CH = root.BDV2Charts, APP = root.BDV2App, DD = root.BDV2Drill;
  var esc = APP.esc, $ = function (id) { return document.getElementById(id); };
  var S = APP.state;
  var LOCAL_KEY = 'bdv2:history', LOCAL_MAX = 30;
  var H = { items: [], source: null, currentHash: null, compare: [] };
  var ui = { metric: 'global', team: '' };

  async function sha256(text) {
    try {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } catch (e) { var h = 0; for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0; return 'fallback-' + (h >>> 0).toString(16) + '-' + text.length; }
  }

  // ── Snapshot ───────────────────────────────────────────────────────
  function snapshot(tickets) {
    var k = C.computeKpis(tickets);
    var byTeam = {}, byVersion = {}, byStatus = {}, byPriority = {}, byOrigin = { PRJ301: 0, Interne: 0 };
    tickets.forEach(function (t) {
      var tm = byTeam[t.team] = byTeam[t.team] || { total: 0, open: 0, done: 0, blockersOpen: 0, overdue: 0, pctSum: 0 };
      tm.total++; tm.pctSum += t.pct; if (t.isDone) tm.done++; else tm.open++; if (t.isBlocker && !t.isDone) tm.blockersOpen++; if (t.isOverdue) tm.overdue++;
      var vk = t.version || 'Sans version';
      var vv = byVersion[vk] = byVersion[vk] || { total: 0, open: 0, done: 0, pctSum: 0, deploy: t.versionDeploy ? C.toISO(t.versionDeploy) : null };
      vv.total++; vv.pctSum += t.pct; if (t.isDone) vv.done++; else vv.open++;
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priorityLabel] = (byPriority[t.priorityLabel] || 0) + 1;
      byOrigin[t.origin]++;
    });
    return {
      kpis: { total: k.total, open: k.open, done: k.done, blockers: k.blockers, blockersOpen: k.blockersOpen, overdue: k.overdue, prj301: k.prj301, hasFix: k.hasFix, doneNoFix: k.doneNoFix, noVersion: k.noVersion, deployedOpen: k.deployedOpen, progress: Math.round(k.progress * 10) / 10 },
      byTeam: byTeam, byVersion: byVersion, byStatus: byStatus, byPriority: byPriority, byOrigin: byOrigin,
      refDate: C.toISO(S.refDate)
    };
  }
  function compactTickets(tickets) {
    return tickets.map(function (t) {
      return { k: t.key, s: t.summary ? t.summary.slice(0, 120) : '', st: t.status, r: t.resolution, tm: t.team, p: t.priority, o: t.origin, v: t.version, vs: t.versionState, fx: t.fixVersion, td: t.targetDate ? C.toISO(t.targetDate) : '', d: t.isDone ? 1 : 0, pc: t.pct, lb: t.labels };
    });
  }
  // Reconstruit des objets ticket exploitables par le drill-down à partir d'un snapshot.
  function inflate(list) {
    var cfg = CFG.get();
    return (list || []).map(function (c) {
      var pk = C.normalize(c.p || '');
      return { key: c.k, summary: c.s, status: c.st, statusKey: C.normalize(c.st), resolution: c.r, team: c.tm, teamLabel: (cfg.teams.alias && cfg.teams.alias[c.tm]) || c.tm, priority: c.p, priorityKey: pk, priorityLabel: (cfg.priorities.groups && cfg.priorities.groups[pk]) || c.p, origin: c.o, isPrj301: c.o === 'PRJ301', version: c.v, versionState: c.vs, fixVersion: c.fx, hasFix: !!c.fx, targetDate: c.td ? new Date(c.td + 'T00:00:00') : null, targetRaw: c.td, dueDate: null, dueRaw: '', created: null, type: '', assignee: '', versionDeploy: null, isDone: !!c.d, pct: c.pc, labels: c.lb || '' };
    });
  }

  // ── Persistance ────────────────────────────────────────────────────
  function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { return []; } }
  function saveLocal(items) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(-LOCAL_MAX))); } catch (e) {} }

  async function load() {
    H.items = []; H.source = null;
    if (S.client) {
      try {
        var res = await S.client.from('bdv2_analyses').select('id,cree_le,cree_par,nom,hash,nb_tickets,resume,tickets,synthese,epingle').order('cree_le', { ascending: true }).limit(120);
        if (!res.error) {
          H.items = (res.data || []).map(function (r) { return { id: r.id, at: r.cree_le, by: r.cree_par, nom: r.nom, hash: r.hash, nb: r.nb_tickets, resume: r.resume || {}, tickets: r.tickets || [], synthese: r.synthese, epingle: r.epingle }; });
          H.source = 'supabase';
          // noms des auteurs
          var ids = []; H.items.forEach(function (i) { if (i.by && ids.indexOf(i.by) === -1) ids.push(i.by); });
          if (ids.length) { var pr = await S.client.from('profils').select('id,nom_utilisateur').in('id', ids); if (!pr.error) { var m = {}; (pr.data || []).forEach(function (p) { m[p.id] = p.nom_utilisateur; }); H.items.forEach(function (i) { i.byName = m[i.by] || ''; }); } }
        }
      } catch (e) { console.warn('journal indisponible', e); }
    }
    if (!H.source) { H.items = loadLocal(); H.source = 'local'; }
    APP.available.history = true;
  }

  async function record(state) {
    var raw = state.raw, hash = await sha256(raw + '|' + C.toISO(S.refDate));
    H.currentHash = hash;
    var last = H.items[H.items.length - 1];
    if (last && last.hash === hash) {
      S.analysisId = last.id || null;
      if (S.analysisName && S.analysisName !== last.nom) { last.nom = S.analysisName; if (H.source === 'supabase' && last.id) await S.client.from('bdv2_analyses').update({ nom: last.nom }).eq('id', last.id); else saveLocal(H.items); }
      APP.setMsg(state.tickets.length + ' tickets analysés — données identiques à l\'analyse du ' + fmtWhen(last.at) + ' (pas de nouvelle entrée au journal).', 'ok');
      APP.rerender();
      document.dispatchEvent(new CustomEvent('bdv2:recorded', { detail: { item: last, isNew: false } }));
      return last;
    }
    var base = APP.baseTickets();
    var item = { at: new Date().toISOString(), by: S.session ? S.session.user.id : null, byName: S.profil ? S.profil.nom_utilisateur : '', nom: S.analysisName || '', hash: hash, nb: base.length, resume: snapshot(base), tickets: CFG.get().history.keepTickets ? compactTickets(base) : [], synthese: null, epingle: false };
    if (H.source === 'supabase') {
      try {
        var ins = await S.client.from('bdv2_analyses').insert({ cree_par: item.by, nom: item.nom || null, hash: hash, nb_tickets: item.nb, resume: item.resume, tickets: item.tickets }).select('id,cree_le').single();
        if (ins.error) throw ins.error;
        item.id = ins.data.id; item.at = ins.data.cree_le;
      } catch (e) { console.warn('journal : insertion refusée', e); APP.setMsg('Analyse affichée mais non journalisée : ' + (e.message || e), 'err'); }
    }
    H.items.push(item);
    if (H.source !== 'supabase') saveLocal(H.items);
    S.analysisId = item.id || null;
    APP.setMsg(base.length + ' tickets analysés — analyse n°' + H.items.length + ' journalisée' + (H.source === 'supabase' ? ' (partagée)' : ' (localement)') + '.', 'ok');
    APP.rerender();
    document.dispatchEvent(new CustomEvent('bdv2:recorded', { detail: { item: item, isNew: true } }));
    return item;
  }
  APP.hooks.afterAnalyze.push(function (state) { record(state); });

  function fmtWhen(iso) { var d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function shortWhen(iso) { var d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }

  // Analyses « précédentes » = tout sauf celle qui porte le hash courant.
  function previousItems() {
    var idx = -1; H.items.forEach(function (i, k) { if (i.hash === H.currentHash) idx = k; });
    return idx === -1 ? H.items.slice() : H.items.slice(0, idx);
  }
  function filtersActive() { var f = S.filters; return f.origin !== 'all' || f.version !== 'all' || f.teams.length > 0; }

  // ── Deltas + sparklines sur les tuiles ────────────────────────────
  var TILE_METRIC = { total: ['total', false], progress: ['progress', true], done: ['done', true], fix: ['hasFix', true], doneNoFix: ['doneNoFix', false], blockers: ['blockersOpen', false], overdue: ['overdue', false], prj301: ['prj301', false], noVersion: ['noVersion', false], deployedOpen: ['deployedOpen', false] };
  APP.hooks.kpiExtras.push(function (tileId, k) {
    var m = TILE_METRIC[tileId]; if (!m || filtersActive()) return null;
    var prev = previousItems(); if (!prev.length) return null;
    var cur = tileId === 'progress' ? Math.round(k.progress * 10) / 10 : k[m[0]];
    var last = prev[prev.length - 1].resume.kpis[m[0]];
    var n = CFG.get().history.sparkPoints || 10;
    var spark = prev.slice(-(n - 1)).map(function (i) { return i.resume.kpis[m[0]] || 0; }).concat([cur]);
    var delta = last == null ? null : Math.round((cur - last) * 10) / 10;
    return { delta: { value: delta, goodUp: m[1], label: 'vs analyse du ' + fmtWhen(prev[prev.length - 1].at), unit: tileId === 'progress' ? ' pt' : '' }, spark: spark };
  });

  // ── Section Évolution ──────────────────────────────────────────────
  APP.hooks.render.push(renderHistory);
  function renderHistory() {
    var hasData = S.tickets.length > 0;
    var rootEl = $(hasData ? 'historyRoot' : 'emptyHistoryRoot'); if (!rootEl) return;
    var other = $(hasData ? 'emptyHistoryRoot' : 'historyRoot'); if (other) other.innerHTML = '';
    var items = H.items;
    if (!items.length) { rootEl.innerHTML = hasData ? '<div class="card"><h2>Évolution</h2><div class="sub">Le journal est vide : chaque clic sur « Analyser » avec de nouvelles données ajoute un point. Revenez après la prochaine analyse.</div></div>' : ''; return; }
    var labels = items.map(function (i) { return shortWhen(i.at); });
    var colorsC = P.CATEGORICAL;
    var h = '';
    // 1. global
    var metricOpts = [['global', 'Global (ouverts, terminés, blockers, retards)'], ['progress', 'Avancement pondéré (%)'], ['versions', 'Stock à livrer par version'], ['teams', 'Tickets ouverts par équipe'], ['origin', 'Origine PRJ301 / Interne']];
    h += '<div class="card"><div class="card-head"><div><h2>Évolution des analyses — ' + items.length + ' point' + (items.length > 1 ? 's' : '') + '</h2><div class="sub">Un point par analyse journalisée (' + (H.source === 'supabase' ? 'journal partagé' : 'journal local de ce navigateur') + '). Survolez un point pour la valeur, cliquez pour ouvrir cette analyse dans le comparateur.</div></div>' +
      '<div class="card-tools"><select class="dim-select" id="histMetric">' + metricOpts.map(function (o) { return '<option value="' + o[0] + '"' + (ui.metric === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div></div><div class="chart-body" id="histChart">' + chartFor(ui.metric, items, labels) + '</div></div>';
    // 2. journal + comparateur
    h += '<div class="card"><div class="card-head"><div><h2>Journal des analyses</h2><div class="sub">Cochez deux analyses pour les comparer (tickets apparus, disparus, changements de statut, d\'équipe ou de version, stock par version).</div></div></div>' +
      '<ul class="hist-list" style="margin-top:12px">' + items.slice().reverse().map(function (i, idx) {
        var real = items.length - 1 - idx;
        var checked = H.compare.indexOf(real) !== -1;
        return '<li class="hist-item' + (i.hash === H.currentHash ? ' is-current' : '') + '"><input type="checkbox" data-cmp="' + real + '" ' + (checked ? 'checked' : '') + ' title="Comparer"><span class="when">' + fmtWhen(i.at) + '</span><span class="name">' + esc(i.nom || 'Analyse n°' + (real + 1)) + (i.epingle ? ' 📌' : '') + (i.hash === H.currentHash ? ' <span class="tk-badge tk-badge--preview">courante</span>' : '') + '</span><span class="meta">' + i.nb + ' tickets · ' + (i.resume.kpis ? i.resume.kpis.open + ' ouverts · ' + i.resume.kpis.progress + '%' : '') + (i.byName ? ' · ' + esc(i.byName) : '') + '</span>' +
          '<button type="button" class="ghost small" data-hist-open="' + real + '" ' + (i.tickets && i.tickets.length ? '' : 'disabled title="Tickets non conservés"') + '>' + (S.archived && S.archived.index === real ? 'Ouverte' : 'Ouvrir') + '</button><button type="button" class="icon-btn" data-hist-rename="' + real + '" title="Renommer">✎</button><button type="button" class="icon-btn" data-hist-pin="' + real + '" title="Épingler">' + (i.epingle ? '📌' : '📍') + '</button><button type="button" class="icon-btn" data-hist-del="' + real + '" title="Supprimer">🗑</button></li>';
      }).join('') + '</ul><div id="histCompare">' + compareHtml(items) + '</div></div>';
    rootEl.innerHTML = h;
    $('histMetric').addEventListener('change', function () { ui.metric = this.value; $('histChart').innerHTML = chartFor(ui.metric, items, labels); });
  }

  function chartFor(metric, items, labels) {
    var kp = function (f) { return items.map(function (i) { return i.resume.kpis ? i.resume.kpis[f] : null; }); };
    if (metric === 'global') return CH.lineChart({ labels: labels, series: [{ label: 'Ouverts', color: P.CATEGORICAL[0], values: kp('open') }, { label: 'Terminés', color: P.CATEGORICAL[5], values: kp('done') }, { label: 'Blockers ouverts', color: P.CATEGORICAL[7], values: kp('blockersOpen') }, { label: 'Target date dépassée', color: P.CATEGORICAL[1], values: kp('overdue') }] });
    if (metric === 'progress') return CH.lineChart({ labels: labels, series: [{ label: 'Avancement pondéré', color: P.CATEGORICAL[0], values: kp('progress') }], unit: '%', max: 100, area: true });
    if (metric === 'origin') return CH.lineChart({ labels: labels, series: [{ label: 'PRJ301', color: '#4a3aa7', values: items.map(function (i) { return i.resume.byOrigin ? i.resume.byOrigin.PRJ301 : null; }) }, { label: 'Interne', color: P.CATEGORICAL[0], values: items.map(function (i) { return i.resume.byOrigin ? i.resume.byOrigin.Interne : null; }) }] });
    if (metric === 'versions') {
      var keys = []; items.forEach(function (i) { Object.keys(i.resume.byVersion || {}).forEach(function (v) { if (keys.indexOf(v) === -1) keys.push(v); }); });
      keys.sort(function (a, b) { if (a === 'Sans version') return 1; if (b === 'Sans version') return -1; return a.localeCompare(b, 'fr', { numeric: true }); });
      if (keys.length > 8) keys = keys.slice(-8);
      return '<p class="sub">Stock à livrer = tickets non terminés rattachés à chaque version, à la date de chaque analyse. Une courbe qui descend = la version se vide ; une courbe qui monte = du stock arrive (nouveaux bugs ou report).</p>' + CH.lineChart({ labels: labels, series: keys.map(function (v, idx) { return { label: v, color: v === 'Sans version' ? P.NEUTRAL : P.CATEGORICAL[idx % 8], values: items.map(function (i) { var b = i.resume.byVersion && i.resume.byVersion[v]; return b ? b.open : null; }) }; }) });
    }
    if (metric === 'teams') {
      var tk = []; items.forEach(function (i) { Object.keys(i.resume.byTeam || {}).forEach(function (t) { if (tk.indexOf(t) === -1) tk.push(t); }); });
      var cfg = CFG.get(); tk = C.DIMS.team.order(tk, cfg, []).slice(0, 8);
      var cols = P.colorsForDim('team', tk, cfg, tk.map(function (t) { return { team: t, teamLabel: t }; }));
      return CH.lineChart({ labels: labels, series: tk.map(function (t) { return { label: (cfg.teams.alias && cfg.teams.alias[t]) || t, color: cols[t], values: items.map(function (i) { var b = i.resume.byTeam && i.resume.byTeam[t]; return b ? b.open : null; }) }; }) });
    }
    return '';
  }

  // ── Comparateur ────────────────────────────────────────────────────
  var lastDiff = null;
  function compareHtml(items) {
    if (H.compare.length !== 2) return '<p class="sub" style="margin-top:10px">Sélectionnez deux analyses pour afficher le comparateur.</p>';
    var a = items[Math.min(H.compare[0], H.compare[1])], b = items[Math.max(H.compare[0], H.compare[1])];
    if (!a.tickets.length || !b.tickets.length) return '<p class="sub" style="margin-top:10px">Ces analyses n\'ont pas conservé la liste des tickets — comparaison impossible.</p>';
    var A = {}, B = {}; a.tickets.forEach(function (t) { A[t.k] = t; }); b.tickets.forEach(function (t) { B[t.k] = t; });
    var appeared = b.tickets.filter(function (t) { return !A[t.k]; }), gone = a.tickets.filter(function (t) { return !B[t.k]; });
    var statusChanged = [], teamChanged = [], versionChanged = [], closed = [], reopened = [];
    b.tickets.forEach(function (t) {
      var o = A[t.k]; if (!o) return;
      if (o.st !== t.st) statusChanged.push(t);
      if (o.tm !== t.tm) teamChanged.push(t);
      if ((o.v || '') !== (t.v || '')) versionChanged.push(t);
      if (!o.d && t.d) closed.push(t);
      if (o.d && !t.d) reopened.push(t);
    });
    lastDiff = { a: a, b: b, sets: { appeared: appeared, gone: gone, statusChanged: statusChanged, teamChanged: teamChanged, versionChanged: versionChanged, closed: closed, reopened: reopened } };
    var box = function (id, n, l) { return '<div class="diff-box" data-diff="' + id + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; };
    var ka = a.resume.kpis || {}, kb = b.resume.kpis || {};
    var d = function (f) { var v = (kb[f] || 0) - (ka[f] || 0); return (v > 0 ? '+' : '') + v; };
    var vh = '';
    var vkeys = []; [a, b].forEach(function (i) { Object.keys(i.resume.byVersion || {}).forEach(function (v) { if (vkeys.indexOf(v) === -1) vkeys.push(v); }); });
    if (vkeys.length) vh = '<table style="margin-top:12px"><thead><tr><th>Version</th><th class="num">Stock ' + shortWhen(a.at) + '</th><th class="num">Stock ' + shortWhen(b.at) + '</th><th class="num">Δ</th><th class="num">Terminés ' + shortWhen(b.at) + '</th></tr></thead><tbody>' + vkeys.map(function (v) { var x = (a.resume.byVersion || {})[v] || { open: 0, done: 0 }, y = (b.resume.byVersion || {})[v] || { open: 0, done: 0 }; var dv = y.open - x.open; return '<tr><td>' + esc(v) + '</td><td class="num">' + x.open + '</td><td class="num">' + y.open + '</td><td class="num" style="color:' + (dv > 0 ? 'var(--critical)' : dv < 0 ? '#006300' : 'inherit') + '">' + (dv > 0 ? '+' : '') + dv + '</td><td class="num">' + y.done + '</td></tr>'; }).join('') + '</tbody></table>';
    return '<h4 style="margin:14px 0 4px;font-size:13px;color:var(--navy)">Comparaison : ' + esc(a.nom || fmtWhen(a.at)) + ' → ' + esc(b.nom || fmtWhen(b.at)) + '</h4>' +
      '<p class="sub">Tickets ' + d('total') + ' · ouverts ' + d('open') + ' · terminés ' + d('done') + ' · blockers ouverts ' + d('blockersOpen') + ' · retards ' + d('overdue') + ' · avancement ' + d('progress') + ' pt</p>' +
      '<div class="diff-grid">' + box('appeared', appeared.length, 'nouveaux tickets') + box('gone', gone.length, 'tickets disparus de l\'extrait') + box('closed', closed.length, 'terminés depuis') + box('reopened', reopened.length, 'rouverts') + box('statusChanged', statusChanged.length, 'changements de statut') + box('teamChanged', teamChanged.length, 'changements d\'équipe') + box('versionChanged', versionChanged.length, 'changements de version') + '</div>' + vh;
  }

  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-diff]');
    if (b && lastDiff) { var set = lastDiff.sets[b.dataset.diff] || []; DD.open({ title: 'Comparateur — ' + b.querySelector('.l').textContent, subtitle: fmtWhen(lastDiff.a.at) + ' → ' + fmtWhen(lastDiff.b.at), tickets: inflate(set) }); return; }
    var op = e.target.closest('[data-hist-open]');
    if (op) { var io = +op.dataset.histOpen, it0 = H.items[io]; H.currentHash = it0.hash; APP.loadArchived(inflate(it0.tickets), { id: it0.id, index: io, nom: it0.nom, when: fmtWhen(it0.at), refDate: it0.resume && it0.resume.refDate, hash: it0.hash }); document.dispatchEvent(new CustomEvent('bdv2:recorded', { detail: { item: it0, isNew: false } })); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    var r = e.target.closest('[data-hist-rename]');
    if (r) { var it = H.items[+r.dataset.histRename]; var nom = prompt('Nom de l\'analyse :', it.nom || ''); if (nom == null) return; it.nom = nom.trim(); if (H.source === 'supabase' && it.id) await S.client.from('bdv2_analyses').update({ nom: it.nom || null }).eq('id', it.id); else saveLocal(H.items); refresh(); return; }
    var p = e.target.closest('[data-hist-pin]');
    if (p) { var ip = H.items[+p.dataset.histPin]; ip.epingle = !ip.epingle; if (H.source === 'supabase' && ip.id) await S.client.from('bdv2_analyses').update({ epingle: ip.epingle }).eq('id', ip.id); else saveLocal(H.items); refresh(); return; }
    var dl = e.target.closest('[data-hist-del]');
    if (dl) { var idx = +dl.dataset.histDel, id = H.items[idx]; if (!confirm('Supprimer cette analyse du journal ?')) return; if (H.source === 'supabase' && id.id) { var res = await S.client.from('bdv2_analyses').delete().eq('id', id.id); if (res.error) { alert(res.error.message); return; } } H.items.splice(idx, 1); if (H.source !== 'supabase') saveLocal(H.items); H.compare = []; refresh(); return; }
  });
  function refresh() { if (S.tickets.length) APP.rerender(); else renderHistory(); }
  document.addEventListener('change', function (e) {
    var c = e.target.closest('[data-cmp]'); if (!c) return;
    var i = +c.dataset.cmp;
    if (c.checked) { H.compare.push(i); if (H.compare.length > 2) H.compare.shift(); } else H.compare = H.compare.filter(function (x) { return x !== i; });
    refresh();
  });

  document.addEventListener('bdv2:ready', async function () {
    await load();
    if (S.raw) { H.currentHash = await sha256(S.raw + '|' + C.toISO(S.refDate)); }
    if (S.tickets.length) APP.rerender(); else renderHistory();
    var cur = H.items.filter(function (i) { return i.hash === H.currentHash; }).pop();
    if (cur) { S.analysisId = cur.id || null; document.dispatchEvent(new CustomEvent('bdv2:recorded', { detail: { item: cur, isNew: false } })); }
  });
  document.addEventListener('bdv2:archived', async function (e) {
    if (e.detail && e.detail.meta) return;
    H.currentHash = S.raw ? await sha256(S.raw + '|' + C.toISO(S.refDate)) : null;
    refresh();
  });
  root.BDV2History = { get: function () { return H; }, load: load, record: record, inflate: inflate, snapshot: snapshot, sha256: sha256 };
})(window);
