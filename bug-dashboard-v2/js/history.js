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
  // Vue par défaut : l'avancement pondéré de la version en cours. `touched`
  // distingue « pas encore choisi » de « a choisi la vue d'ensemble », pour ne
  // pas ramener l'utilisateur de force sur la version courante à chaque rendu.
  var ui = { metric: 'progress', selectedTd: null, touched: false };

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
      refDate: C.toISO(S.refDate), refHalf: S.refHalf || 0
    };
  }
  function compactTickets(tickets) {
    return tickets.map(function (t) {
      return { k: t.key, s: t.summary ? t.summary.slice(0, 120) : '', st: t.status, r: t.resolution, tm: t.team, p: t.priority, o: t.origin, v: t.version, vs: t.versionState, fx: t.fixVersion, td: t.targetDate ? C.toISO(t.targetDate) : '', d: t.isDone ? 1 : 0, pc: t.pct, lb: t.labels, a: t.assignee || '', du: t.dueDate ? C.toISO(t.dueDate) : '', cr: t.created ? C.toISO(t.created) : '', ty: t.type || '' };
    });
  }
  // Reconstruit des objets ticket exploitables par le drill-down à partir d'un snapshot.
  function inflate(list) {
    var cfg = CFG.get();
    return (list || []).map(function (c) {
      var pk = C.normalize(c.p || '');
      return { key: c.k, summary: c.s, status: c.st, statusKey: C.normalize(c.st), resolution: c.r, team: c.tm, teamLabel: (cfg.teams.alias && cfg.teams.alias[c.tm]) || c.tm, priority: c.p, priorityKey: pk, priorityLabel: (cfg.priorities.groups && cfg.priorities.groups[pk]) || c.p, origin: c.o, isPrj301: c.o === 'PRJ301', version: c.v, versionState: c.vs, fixVersion: c.fx, hasFix: !!c.fx, targetDate: c.td ? new Date(c.td + 'T00:00:00') : null, targetRaw: c.td, dueDate: c.du ? new Date(c.du + 'T00:00:00') : null, dueRaw: c.du || '', created: c.cr ? new Date(c.cr + 'T00:00:00') : null, type: c.ty || '', assignee: c.a || '', versionDeploy: null, isDone: !!c.d, pct: c.pc, labels: c.lb || '' };
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
  function filtersActive() { var f = S.filters; return !!S.pick || f.state !== 'all' || f.origin !== 'all' || f.version !== 'all' || f.teams.length > 0; }

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

  // ── Tuiles « périmètre de la version » ────────────────────────────
  // Ce qui est entré et sorti de la version depuis sa première photo (le début
  // de la version) ; le delta de chaque tuile donne le mouvement depuis
  // l'analyse précédente. La comparaison se fait par clé de ticket : un ticket
  // dont la Target date a changé sort de la version, donc « retiré ».
  function dominantTd(tickets) {
    var by = {}, best = null, n = -1;
    tickets.forEach(function (t) {
      var td = t.targetDate ? C.toISO(t.targetDate) : 'none';
      by[td] = (by[td] || 0) + 1;
      if (by[td] > n) { n = by[td]; best = td; }
    });
    return best;
  }
  function ticketsAt(item, td) {
    var out = {};
    (item.tickets || []).forEach(function (t) { if ((t.td || 'none') === td) out[t.k] = t; });
    return out;
  }
  APP.hooks.extraTiles.push(function (vis) {
    // Les photos du journal ne sont pas filtrées : comparer un extrait filtré
    // ferait passer pour « retirés » des tickets simplement masqués.
    if (filtersActive() || !vis.length) return [];
    var td = dominantTd(vis); if (!td || td === 'none') return [];
    var mine = vis.filter(function (t) { return (t.targetDate ? C.toISO(t.targetDate) : 'none') === td; });
    // Photos antérieures à l'analyse affichée : en ouvrant une analyse archivée,
    // on compare à ce qui la précède, pas à ce qui l'a suivie.
    var cur = H.items.filter(function (i) { return i.hash === H.currentHash; })[0];
    var limit = cur ? new Date(cur.at).getTime() : Date.now();
    var olders = H.items.filter(function (i) {
      return i.hash !== H.currentHash && new Date(i.at).getTime() < limit && (i.tickets || []).some(function (t) { return (t.td || 'none') === td; });
    }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    if (!olders.length) return []; // première photo de cette version : rien à comparer
    var first = olders[0], last = olders[olders.length - 1];
    var now = {}; mine.forEach(function (t) { now[t.key] = t; });
    var diff = function (ref) {
      var was = ticketsAt(ref, td);
      return {
        added: mine.filter(function (t) { return !was[t.key]; }),
        removed: inflate(Object.keys(was).filter(function (k) { return !now[k]; }).map(function (k) { return was[k]; }))
      };
    };
    var since = diff(first), prev = diff(last);
    var depuis = 'depuis la 1re photo de la version (' + shortWhen(first.at) + ')';
    var deltaOf = function (n) { return { value: n, goodUp: false, label: 'depuis l\'analyse du ' + fmtWhen(last.at) }; };
    return [
      { id: 'scopeAdded', label: 'Ajoutés à la version', value: since.added.length, sub: depuis + ' — Target date ' + C.fmtDate(new Date(td + 'T00:00:00')),
        tone: since.added.length ? 'warn' : 'neutral', delta: deltaOf(prev.added.length),
        drill: function () { return { title: 'Tickets ajoutés à la version', subtitle: 'Absents de la photo du ' + fmtWhen(first.at) + ', présents aujourd\'hui', tabs: [{ label: 'Depuis le début (' + shortWhen(first.at) + ')', tickets: since.added }, { label: 'Depuis l\'analyse du ' + shortWhen(last.at), tickets: prev.added }] }; } },
      { id: 'scopeRemoved', label: 'Retirés de la version', value: since.removed.length, sub: depuis + ' — Target date modifiée ou ticket disparu de l\'extrait',
        tone: since.removed.length ? 'good' : 'neutral', delta: deltaOf(prev.removed.length),
        drill: function () { return { title: 'Tickets retirés de la version', subtitle: 'Présents dans la photo du ' + fmtWhen(first.at) + ', absents aujourd\'hui — état au moment de cette photo', tabs: [{ label: 'Depuis le début (' + shortWhen(first.at) + ')', tickets: since.removed }, { label: 'Depuis l\'analyse du ' + shortWhen(last.at), tickets: prev.removed }] }; } }
    ];
  });


  // ── Section Évolution ──────────────────────────────────────────────
  APP.hooks.render.push(renderHistory);

  // Date « métier » d'une analyse : celle écrite dans son nom (2026-09-11 ou
  // 11.09.2026), sinon la date de référence utilisée, sinon la date de création.
  function bizDate(i) {
    var m = (i.nom || '').match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = (i.nom || '').match(/(\d{2})\.(\d{2})\.(\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    if (i.resume && i.resume.refDate) return new Date(i.resume.refDate + 'T00:00:00');
    return new Date(i.at);
  }
  function versionNum(i) { var m = (i.nom || '').match(/\d+(?:\.\d+)+/); return m ? m[0] : ''; }

  // ── Stats d'une analyse, par Target date (une Target date = une version) ──
  // Les photos gardent chaque ticket avec son état, son équipe et son origine :
  // l'évolution peut donc se recalculer sur le périmètre choisi dans la barre
  // de filtres. La version n'en fait pas partie (la section est déjà rangée par
  // version), ni la sélection issue d'une alerte (figée sur l'extrait courant).
  var EMPTY_ST = { total: 0, open: 0, done: 0, blockersOpen: 0, prj301: 0, prj301Open: 0, hasFix: 0, doneNoFix: 0,
    pctSum: 0, progress: 0, byStatus: {}, byPriority: {}, byTeam: {}, byOrigin: { PRJ301: 0, Interne: 0 } };
  function scopeKey() { var f = S.filters; return [f.state, f.origin, (f.teams || []).slice().sort().join(',')].join('|'); }
  function scopeOn() { var f = S.filters; return f.state !== 'all' || f.origin !== 'all' || (f.teams || []).length > 0; }
  function scopeLabel() {
    var f = S.filters, out = [];
    if (f.state !== 'all') out.push(f.state === 'open' ? 'Ouverts' : 'Terminés');
    if (f.origin !== 'all') out.push(f.origin === 'prj301' ? 'PRJ301' : 'Interne');
    (f.teams || []).forEach(function (t) { out.push(t); });
    return out.join(' · ');
  }
  function inScope(c) {
    var f = S.filters;
    if (f.state === 'open' && c.d) return false;
    if (f.state === 'done' && !c.d) return false;
    if (f.origin === 'prj301' && c.o !== 'PRJ301') return false;
    if (f.origin === 'internal' && c.o === 'PRJ301') return false;
    if ((f.teams || []).length && f.teams.indexOf(c.tm) === -1) return false;
    return true;
  }
  // `raw` : les statistiques hors filtre, pour que la liste des versions et
  // leurs photos ne bougent pas quand on restreint le périmètre.
  function tdStats(item, raw) {
    var key = raw ? null : scopeKey();
    if (raw) { if (item._byTdRaw) return item._byTdRaw; }
    else if (item._byTd && item._byTdKey === key) return item._byTd;
    var cfg = CFG.get(), bk = cfg.priorities.blockerKeys || ['blocker', 'highest'];
    var out = {};
    (item.tickets || []).forEach(function (c) {
      if (!raw && !inScope(c)) return;
      var td = c.td || 'none';
      var st = out[td] = out[td] || { total: 0, open: 0, done: 0, blockersOpen: 0, prj301: 0, prj301Open: 0, hasFix: 0, doneNoFix: 0, pctSum: 0, byStatus: {}, byPriority: {}, byTeam: {}, byOrigin: { PRJ301: 0, Interne: 0 } };
      var pk = C.normalize(c.p || ''), isB = bk.indexOf(pk) !== -1 || pk.indexOf('block') !== -1;
      st.total++; st.pctSum += c.pc || 0; if (c.d) st.done++; else st.open++;
      if (isB && !c.d) st.blockersOpen++;
      if (c.o === 'PRJ301') { st.prj301++; if (!c.d) st.prj301Open++; st.byOrigin.PRJ301++; } else st.byOrigin.Interne++;
      if (c.fx) st.hasFix++; if (c.d && !c.fx) st.doneNoFix++;
      st.byStatus[c.st] = (st.byStatus[c.st] || 0) + 1;
      var pl = c.p || 'Non défini'; st.byPriority[pl] = (st.byPriority[pl] || 0) + 1;
      var tm = c.tm || 'Non affecté'; st.byTeam[tm] = st.byTeam[tm] || { open: 0, done: 0 }; if (c.d) st.byTeam[tm].done++; else st.byTeam[tm].open++;
    });
    Object.keys(out).forEach(function (td) { out[td].progress = out[td].total ? Math.round(out[td].pctSum / out[td].total * 10) / 10 : 0; });
    if (raw) item._byTdRaw = out; else { item._byTd = out; item._byTdKey = key; }
    return out;
  }
  CFG.onChange(function () { H.items.forEach(function (i) { delete i._byTd; delete i._byTdRaw; }); });
  function mainTd(item) { var b = tdStats(item), best = 'none', n = -1; Object.keys(b).forEach(function (td) { if (b[td].total > n) { n = b[td].total; best = td; } }); return best; }

  // Versions = Target dates rencontrées dans le journal ; photos = analyses qui
  // contiennent des tickets de cette Target date ; officielle = photo épinglée
  // la plus récente.
  function versionsIndex() {
    var map = {};
    H.items.forEach(function (it, k) {
      Object.keys(tdStats(it, true)).forEach(function (td) {
        var v = map[td] = map[td] || { td: td, photos: [], official: null, officialMatch: false };
        v.photos.push(k);
        // officielle : la photo épinglée dont la date du nom est cette Target date ;
        // à défaut, la plus récente des épinglées contenant cette Target date.
        if (it.epingle && td !== 'none') {
          var match = C.toISO(bizDate(it)) === td;
          if (v.official == null || (match && !v.officialMatch) || (match === v.officialMatch && it.at > H.items[v.official].at)) { v.official = k; v.officialMatch = match; }
        }
      });
    });
    return Object.keys(map).sort(function (a, b) { if (a === 'none') return 1; if (b === 'none') return -1; return a.localeCompare(b); }).map(function (td) { return map[td]; });
  }
  function tdLabel(td, withYear) { if (td === 'none') return 'Sans Target date'; var d = new Date(td + 'T00:00:00'); return withYear ? C.fmtDate(d) : C.fmtDate(d).slice(0, 5); }
  // Numéro d'une version (Target date) : 1) photo épinglée dont la date du nom
  // est cette Target date ; 2) version du plan publié dont le jalon de
  // référence tombe ce jour ; 3) photo (même non épinglée) nommée avec cette
  // date et un numéro.
  function planNumFor(td) {
    if (!root.BDV2Plan || td === 'none') return '';
    var hit = root.BDV2Plan.orderedVersions(CFG.get()).filter(function (x) { return C.toISO(x.at) === td; })[0];
    return hit ? (versionNum({ nom: hit.v.label }) || hit.v.label) : '';
  }
  function versionNumFor(v) {
    var off = v.official != null ? H.items[v.official] : null;
    var num = off && v.officialMatch ? versionNum(off) : '';
    if (!num) num = planNumFor(v.td);
    if (!num) v.photos.slice().reverse().some(function (k) { var it = H.items[k]; if (C.toISO(bizDate(it)) === v.td) num = versionNum(it); return !!num; });
    return num;
  }
  function versionLabel(v, withYear) {
    var num = versionNumFor(v);
    return (num ? num + ' · ' : '') + tdLabel(v.td, withYear);
  }
  function officialIdx() { return versionsIndex().filter(function (v) { return v.official != null; }).map(function (v) { return v.official; }); }

  // ── Séries d'un graphique à partir de points {label, st} ─────────────────
  var METRICS = [['global', 'Global (total, ouverts, terminés, blockers, PRJ301 ouverts)'], ['status', 'Par statut (nombre)'], ['priority', 'Par priorité (nombre)'], ['teams', 'Ouverts par équipe'], ['fix', 'Fix Version renseignée / terminés sans'], ['origin', 'Origine PRJ301 / Interne'], ['progress', 'Avancement pondéré (%)']];
  // Burn-up : rend null si le plan ne connaît pas cette Target date (pas de
  // début ni de gel à opposer aux photos) — on retombe alors sur la courbe.
  function burnupFor(sel, pts2, photos) {
    if (!root.BDV2Plan || !root.BDV2Plan.versionForDate) return null;
    var cfg = CFG.get();
    var pv = root.BDV2Plan.versionForDate(sel.td, cfg);
    if (!pv || !pv.start || !pv.freeze) return null;
    var items = H.items;
    var points = pts2.map(function (p, i) {
      return { t: new Date(items[photos[i]].at), v: p.st.progress, label: fmtWhen(items[photos[i]].at) };
    }).filter(function (p) { return p.t && !isNaN(p.t.getTime()); });
    if (!points.length) return null;
    // rythme observé entre la première et la dernière photo, en points par jour
    var rate = null;
    if (points.length >= 2) {
      var days = (points[points.length - 1].t - points[0].t) / 86400000;
      if (days >= 0.5) rate = (points[points.length - 1].v - points[0].v) / days;
    }
    return CH.burnupChart({
      start: pv.start, end: pv.deploy || pv.end || pv.freeze, freeze: pv.freeze,
      freezeLabel: root.BDV2Plan.boundaryLabel ? root.BDV2Plan.boundaryLabel(cfg.alerts.boundary || 'freeze') : 'Code freeze',
      startPct: cfg.burnup ? cfg.burnup.startPct : 25,
      today: C.startOfDay(S.refDate), points: points, rate: rate, color: P.CATEGORICAL[0]
    });
  }

  function scopeNote() {
    return scopeOn()
      ? ' <b>Périmètre : ' + esc(scopeLabel()) + '</b> — chaque photo est recalculée sur ce filtre (état, équipes, origine).'
      : ' Les filtres d\'état, d\'équipe et d\'origine de la barre s\'appliquent à ces graphiques.';
  }

  // Forme par vue : des comptages photo par photo se lisent mieux en barres
  // (groupées pour comparer des séries, empilées pour une composition, en
  // bandes à 100 % pour une part) ; la courbe reste à l'avancement, seule
  // mesure vraiment continue.
  var CHART_KIND = { global: 'line', progress: 'line', status: 'group', priority: 'stack', teams: 'group', fix: 'stack', origin: 'percent' };
  function chartFrom(metric, points) {
    var cfg = CFG.get(), labels = points.map(function (p) { return p.label; });
    var g = function (f) { return points.map(function (p) { return p.st ? p.st[f] : null; }); };
    var kind = CHART_KIND[metric] || 'line';
    var lines = function (series, opts) {
      if (kind !== 'line') return CH.barChart(Object.assign({ labels: labels, series: series, mode: kind }, opts || {}));
      return CH.lineChart(Object.assign({ labels: labels, series: series }, opts || {}));
    };
    if (metric === 'global') return lines([{ label: 'Total', color: P.NEUTRAL, values: g('total') }, { label: 'Ouverts', color: P.CATEGORICAL[0], values: g('open') }, { label: 'Terminés', color: P.CATEGORICAL[5], values: g('done') }, { label: 'Blockers ouverts', color: P.CATEGORICAL[7], values: g('blockersOpen') }, { label: 'PRJ301 ouverts', color: '#4a3aa7', values: g('prj301Open') }]);
    if (metric === 'progress') return lines([{ label: 'Avancement pondéré', color: P.CATEGORICAL[0], values: g('progress') }], { unit: '%', max: 100, area: true });
    if (metric === 'fix') return lines([{ label: 'Fix Version renseignée', color: '#008300', values: g('hasFix') }, { label: 'Terminés sans Fix Version', color: P.CATEGORICAL[1], values: g('doneNoFix') }]);
    if (metric === 'origin') return lines([{ label: 'PRJ301', color: '#4a3aa7', values: points.map(function (p) { return p.st ? p.st.byOrigin.PRJ301 : null; }) }, { label: 'Interne', color: P.CATEGORICAL[0], values: points.map(function (p) { return p.st ? p.st.byOrigin.Interne : null; }) }]);
    var field = metric === 'status' ? 'byStatus' : metric === 'priority' ? 'byPriority' : 'byTeam';
    var keys = []; points.forEach(function (p) { if (p.st) Object.keys(p.st[field]).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); });
    var dim = metric === 'status' ? 'status' : metric === 'priority' ? 'priority' : 'team';
    var fake = keys.map(function (k) { return { team: k, teamLabel: k, priority: k, priorityLabel: k, priorityKey: C.normalize(k), status: k }; });
    keys = C.DIMS[dim].order(keys, cfg, fake);
    if (keys.length > 8) keys = keys.slice(0, 8);
    var colors = P.colorsForDim(dim, keys, cfg, fake);
    return (metric === 'teams' ? '<p class="sub">Tickets ouverts (non terminés) par équipe.</p>' : '') + lines(keys.map(function (k) { return { label: k, color: colors[k], values: points.map(function (p) { if (!p.st) return null; var v = p.st[field][k]; return v == null ? 0 : (metric === 'teams' ? v.open : v); }) }; }));
  }

  // ── Section Évolution ────────────────────────────────────────────────────
  function renderHistory() {
    var hasData = S.tickets.length > 0;
    var rootEl = $(hasData ? 'historyRoot' : 'emptyHistoryRoot'); if (!rootEl) return;
    var other = $(hasData ? 'emptyHistoryRoot' : 'historyRoot'); if (other) other.innerHTML = '';
    var items = H.items;
    if (!items.length) { rootEl.innerHTML = hasData ? '<div class="card"><h2>Évolution</h2><div class="sub">Le journal est vide : chaque clic sur « Analyser » avec de nouvelles données ajoute un point. Revenez après la prochaine analyse.</div></div>' : ''; return; }
    var versions = versionsIndex();
    if (!ui.touched) {
      var cur = items.filter(function (i) { return i.hash === H.currentHash; })[0] || items[items.length - 1];
      var td = cur ? mainTd(cur) : null;
      if (td && td !== 'none' && versions.some(function (v) { return v.td === td; })) ui.selectedTd = td;
    }
    var sel = versions.find(function (v) { return v.td === ui.selectedTd; }) || null;
    var h = '';
    // puces de versions
    var chips = '<button type="button" class="fchip' + (!sel ? ' is-on' : '') + '" data-ver="">Versions officielles</button>' + versions.map(function (v) {
      return '<button type="button" class="fchip' + (sel && sel.td === v.td ? ' is-on' : '') + '" data-ver="' + esc(v.td) + '" title="' + v.photos.length + ' photo' + (v.photos.length > 1 ? 's' : '') + (v.official != null ? ' · officielle : ' + esc(items[v.official].nom || '') : ' · aucune photo épinglée') + '">' + (v.official != null ? '📌 ' : '') + esc(versionLabel(v, false)) + ' <span class="dd-count">' + v.photos.length + '</span></button>';
    }).join('');
    var metricSel = '<select class="dim-select" id="histMetric">' + METRICS.map(function (o) { return '<option value="' + o[0] + '"' + (ui.metric === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
    var title, sub, chart, extra = '';
    if (!sel) {
      var pts = versions.filter(function (v) { return v.td !== 'none'; }).map(function (v) { var k = v.official != null ? v.official : v.photos[v.photos.length - 1]; return { label: versionLabel(v, false) + (v.official == null ? ' ?' : ''), st: tdStats(items[k])[v.td] || EMPTY_ST }; });
      title = 'Évolution entre versions — ' + pts.length + ' version' + (pts.length > 1 ? 's' : '');
      sub = 'Un point par version (Target date), dans l\'ordre des dates : la photo épinglée fait foi (« ? » = aucune photo épinglée, la dernière est utilisée). Cliquez une version pour voir l\'évolution de son backlog photo par photo.' + scopeNote();
      chart = pts.length ? chartFrom(ui.metric, pts) : '<div class="empty">Aucune Target date dans le journal.</div>';
    } else {
      var photos = sel.photos.slice().sort(function (a, b) { return new Date(items[a].at) - new Date(items[b].at); });
      var pts2 = photos.map(function (k) { return { label: fmtWhen(items[k].at), st: tdStats(items[k])[sel.td] || EMPTY_ST, k: k }; });
      title = 'Version ' + versionLabel(sel, true) + ' — ' + photos.length + ' photo' + (photos.length > 1 ? 's' : '');
      sub = (ui.metric === 'progress'
        ? 'Avancement de la version sur son calendrier : chaque photo se place à sa date, la rampe grise dit où l\'on devrait être, le nombre coloré donne l\'écart à la dernière photo.'
        : 'Évolution du backlog de cette version, photo par photo (toutes les analyses contenant des tickets de cette Target date, épinglée ou non).') + scopeNote();
      // L'avancement d'une version se lit en burn-up quand le plan donne ses
      // dates : axe de dates réel, rampe attendue, écart à la rampe.
      var bu = ui.metric === 'progress' && sel.td !== 'none' ? burnupFor(sel, pts2, photos) : null;
      chart = bu || chartFrom(ui.metric, pts2);
      // rythme
      if (pts2.length >= 2) {
        var f = pts2[0], l = pts2[pts2.length - 1];
        var days = Math.max((new Date(items[l.k].at) - new Date(items[f.k].at)) / 86400000, 0);
        var closed = l.st.done - f.st.done, appeared = l.st.total - f.st.total;
        var pace = days >= 0.5 ? closed / days : null;
        // Prévision : rythme d'<b>avancement pondéré</b> (points par jour) plutôt
        // que nombre de tickets terminés par jour. Un ticket qui passe de « In
        // Progress » à « Code Review » avance sans être terminé : le compte de
        // terminés ne le voit pas et projetait donc bien trop loin.
        var gain = l.st.progress - f.st.progress;
        var ppd = days >= 0.5 ? gain / days : null;
        var td = sel.td !== 'none' ? new Date(sel.td + 'T00:00:00') : null;
        // Sous « Ouverts » ou « Terminés », l'avancement ne décrit plus qu'une
        // part du périmètre : les 100 % ne veulent plus rien dire, donc pas de
        // date projetée plutôt qu'une date fausse.
        var stateOnly = S.filters.state !== 'all';
        var proj = !stateOnly && ppd && ppd > 0 && l.st.progress < 100 ? new Date(new Date(items[l.k].at).getTime() + (100 - l.st.progress) / ppd * 86400000) : null;
        var dec = function (n) { return n.toFixed(1).replace('.', ','); };
        extra = '<div class="diff-grid" style="margin-top:12px">' +
          '<div class="diff-box"><div class="n">' + l.st.open + '</div><div class="l">reste à livrer (dernière photo)</div></div>' +
          '<div class="diff-box"><div class="n">' + (closed >= 0 ? '+' : '') + closed + '</div><div class="l">terminés entre la 1<sup>re</sup> et la dernière photo (' + (days >= 1 ? days.toFixed(1) + ' j' : Math.round(days * 24) + ' h') + ')</div></div>' +
          '<div class="diff-box"><div class="n">' + (appeared >= 0 ? '+' : '') + appeared + '</div><div class="l">tickets apparus dans la version</div></div>' +
          '<div class="diff-box"><div class="n">' + (ppd == null ? '—' : (ppd >= 0 ? '+' : '') + dec(ppd)) + '</div><div class="l">points d\'avancement par jour (rythme moyen)' + (pace == null ? '' : ' — ' + dec(pace) + ' terminé' + (pace >= 2 ? 's' : '') + '/j') + '</div></div>' +
          '<div class="diff-box"><div class="n" style="font-size:16px">' + (stateOnly ? '—' : l.st.open === 0 ? 'Backlog vidé' : proj ? C.fmtDate(proj) : 'indéterminé') + '</div><div class="l">' + (stateOnly ? 'prévision indisponible : filtre d\'état actif, les 100 % ne sont pas atteignables' : l.st.open === 0 ? 'plus rien à livrer' : proj ? '100 % d\'avancement à ce rythme' : 'avancement à l\'arrêt entre la 1<sup>re</sup> et la dernière photo') + (td && !stateOnly ? ' — Target date ' + C.fmtDate(td) + (proj ? (proj > td ? ' <b style="color:var(--critical)">(dépassement ' + C.dayDiff(td, proj) + ' j)</b>' : ' <b style="color:#006300">(dans les temps)</b>') : '') : '') + '</div></div></div>';
        extra += '<ul class="hist-list" style="margin-top:12px">' + pts2.slice().reverse().map(function (p, idx) {
          var prev = pts2[pts2.length - 2 - idx]; var it = items[p.k];
          var d = prev ? ' · Δ terminés ' + (p.st.done - prev.st.done >= 0 ? '+' : '') + (p.st.done - prev.st.done) + ' · Δ total ' + (p.st.total - prev.st.total >= 0 ? '+' : '') + (p.st.total - prev.st.total) : '';
          return '<li class="hist-item' + (it.hash === H.currentHash ? ' is-current' : '') + '"><span class="when">' + fmtWhen(it.at) + '</span><span class="name">' + (it.epingle ? '📌 ' : '') + esc(it.nom || 'Analyse n°' + (p.k + 1)) + '</span><span class="meta">' + p.st.total + ' tickets · ' + p.st.open + ' ouverts · ' + p.st.done + ' terminés · ' + p.st.progress + '%' + d + '</span><button type="button" class="ghost small" data-hist-open="' + p.k + '">' + (S.archived && S.archived.index === p.k ? 'Ouverte' : 'Ouvrir') + '</button></li>';
        }).join('') + '</ul>';
      }
    }
    h += '<div class="card"><div class="card-head"><div><h2>' + esc(title) + '</h2><div class="sub">' + sub + '</div></div><div class="card-tools">' + metricSel + '</div></div>' +
      '<div class="filter-group" style="margin-top:10px" id="histVersions">' + chips + '</div><div class="chart-body" id="histChart">' + chart + '</div>' + extra + '</div>';

    // journal : officielles + travail regroupées par version
    var row = function (real, official) {
      var i = items[real], checked = H.compare.indexOf(real) !== -1, cur = i.hash === H.currentHash, d = bizDate(i);
      return '<li class="hist-item' + (cur ? ' is-current' : '') + '"><input type="checkbox" data-cmp="' + real + '" ' + (checked ? 'checked' : '') + ' title="Comparer"><span class="when" title="Journalisée le ' + fmtWhen(i.at) + '">' + (official ? C.fmtDate(d) : fmtWhen(i.at)) + '</span><span class="name">' + esc(i.nom || 'Analyse n°' + (real + 1)) + (cur ? ' <span class="tk-badge tk-badge--preview">courante</span>' : '') + '</span><span class="meta">' + i.nb + ' tickets · ' + (i.resume.kpis ? i.resume.kpis.open + ' ouverts · ' + i.resume.kpis.progress + '%' : '') + (i.byName ? ' · ' + esc(i.byName) : '') + '</span>' +
        '<button type="button" class="ghost small" data-hist-open="' + real + '" ' + (i.tickets && i.tickets.length ? '' : 'disabled title="Tickets non conservés"') + '>' + (S.archived && S.archived.index === real ? 'Ouverte' : 'Ouvrir') + '</button>' +
        '<button type="button" class="icon-btn" data-hist-rename="' + real + '" title="Renommer">✎</button><button type="button" class="icon-btn" data-hist-pin="' + real + '" title="' + (official ? 'Retirer des versions officielles' : 'Marquer comme version officielle') + '">' + (official ? '📌' : '📍') + '</button><button type="button" class="icon-btn" data-hist-del="' + real + '" title="Supprimer">🗑</button></li>';
    };
    var off = officialIdx();
    h += '<div class="card"><div class="card-head"><div><h2>📌 Versions officielles <span class="tk-badge tk-badge--preview">' + off.length + '</span></h2><div class="sub">Photos épinglées, une par Target date (la plus récente fait foi), dans l\'ordre des Target dates. Cochez deux analyses (ici ou ci-dessous) pour les comparer.</div></div></div>' +
      (off.length ? '<ul class="hist-list" style="margin-top:12px">' + off.map(function (k) { return row(k, true); }).join('') + '</ul>' : '<p class="sub" style="margin-top:10px">Aucune version officielle : épinglez (📍) une analyse pour la faire apparaître ici.</p>') + '</div>';
    var groups = {};
    items.forEach(function (it, k) { if (it.epingle) return; var td = mainTd(it); (groups[td] = groups[td] || []).push(k); });
    var gkeys = Object.keys(groups).sort(function (a, b) { if (a === 'none') return 1; if (b === 'none') return -1; return b.localeCompare(a); });
    var nWork = items.filter(function (i) { return !i.epingle; }).length;
    h += '<div class="card"><div class="card-head"><div><h2>Analyses de travail <span class="tk-badge tk-badge--muted">' + nWork + '</span></h2><div class="sub">Les sous-versions, regroupées par version (Target date), de la plus récente à la plus ancienne.</div></div></div>' +
      (gkeys.length ? gkeys.map(function (td) {
        var v = versions.find(function (x) { return x.td === td; });
        return '<h4 style="margin:14px 0 6px;font-size:12.5px;color:var(--navy)">' + esc(v ? versionLabel(v, true) : tdLabel(td, true)) + ' <span class="tk-badge tk-badge--muted">' + groups[td].length + '</span></h4><ul class="hist-list">' + groups[td].reverse().map(function (k) { return row(k, false); }).join('') + '</ul>';
      }).join('') : '<p class="sub" style="margin-top:10px">Aucune analyse de travail.</p>') +
      '<div id="histCompare">' + compareHtml(items) + '</div></div>';
    rootEl.innerHTML = h;
    $('histMetric').addEventListener('change', function () { ui.metric = this.value; renderHistory(); });
    $('histVersions').addEventListener('click', function (e) { var b = e.target.closest('[data-ver]'); if (!b) return; ui.selectedTd = b.dataset.ver || null; ui.touched = true; renderHistory(); });
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
    if (op) { var io = +op.dataset.histOpen, it0 = H.items[io]; H.currentHash = it0.hash; APP.loadArchived(inflate(it0.tickets), { id: it0.id, index: io, nom: it0.nom, when: fmtWhen(it0.at), refDate: it0.resume && it0.resume.refDate, refHalf: it0.resume && it0.resume.refHalf, hash: it0.hash }); document.dispatchEvent(new CustomEvent('bdv2:recorded', { detail: { item: it0, isNew: false } })); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
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
  document.addEventListener('bdv2:plan', function () { if (H.items.length) refresh(); });
  document.addEventListener('bdv2:archived', async function (e) {
    if (e.detail && e.detail.meta) return;
    H.currentHash = S.raw ? await sha256(S.raw + '|' + C.toISO(S.refDate)) : null;
    refresh();
  });
  root.BDV2History = { get: function () { return H; }, load: load, record: record, inflate: inflate, snapshot: snapshot, sha256: sha256 };
})(window);
