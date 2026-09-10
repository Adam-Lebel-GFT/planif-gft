/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — lot 2 : plan de livraisons et train.
   - charge les versions publiées (Supabase plan_versions) ou, à défaut,
     le snapshot local écrit par releases-planning (même navigateur) ;
   - rattache chaque ticket à une version selon sa Target date (première
     version dont le jalon de référence — Déploiement par défaut — tombe
     le jour de la Target date ou après, tolérance configurable) ;
   - rend la frise du train, les tuiles et alertes liées aux versions.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core, P = root.BDV2Palette, CFG = root.BDV2Config, CH = root.BDV2Charts, APP = root.BDV2App, DD = root.BDV2Drill;
  var esc = APP.esc, $ = function (id) { return document.getElementById(id); };
  var LOCAL_KEY = 'planif:plan-publie';
  var S = APP.state;
  var plan = { versions: [], source: null, meta: null };

  function boundaryDate(v, cfg) {
    var b = cfg.version.boundary;
    var iso = b === 'start' ? v.start : b === 'end' ? v.end : (v.jalons && v.jalons[b]) || v.jalons && v.jalons.deploy || v.end;
    return iso ? new Date(iso + 'T00:00:00') : null;
  }

  async function load() {
    plan = { versions: [], source: null, meta: null };
    if (S.client) {
      try {
        var res = await S.client.from('plan_versions').select('id,label,debut,fin,jalons,ordre,publie_le,publie_par').order('ordre');
        if (!res.error && res.data && res.data.length) {
          plan.versions = res.data.map(function (r) { return { id: r.id, label: r.label, start: r.debut, end: r.fin, jalons: r.jalons || {}, ordre: r.ordre }; });
          plan.source = 'supabase';
          plan.meta = res.data.reduce(function (a, r) { return !a || r.publie_le > a ? r.publie_le : a; }, null);
        }
      } catch (e) { console.warn('plan_versions indisponible', e); }
    }
    if (!plan.versions.length) {
      try {
        var raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
        if (raw && raw.versions && raw.versions.length) { plan.versions = raw.versions; plan.source = 'local'; plan.meta = raw.maj; }
      } catch (e) {}
    }
    S.hasPlan = plan.versions.length > 0;
    APP.available.train = true;
    document.dispatchEvent(new CustomEvent('bdv2:plan', { detail: plan }));
  }

  // Versions triées par jalon de référence (le train).
  function orderedVersions(cfg) {
    return plan.versions.map(function (v) { return { v: v, at: boundaryDate(v, cfg) }; })
      .filter(function (x) { return x.at; })
      .sort(function (a, b) { return a.at - b.at; });
  }

  // ── Rattachement ticket → version (hook prepare) ───────────────────
  APP.hooks.prepare.push(function (tickets) {
    var cfg = CFG.get();
    var ov = orderedVersions(cfg);
    var byLabel = {}; ov.forEach(function (x) { byLabel[C.normalize(x.v.label)] = x; });
    var tol = (cfg.version.toleranceDays || 0) * 86400000;
    var ref = C.startOfDay(S.refDate);
    tickets.forEach(function (t) {
      t.version = null; t.versionState = 'none'; t.versionDeploy = null; t.versionReason = '';
      var hit = null;
      if (cfg.version.useFixVersion && t.fixVersion && byLabel[C.normalize(t.fixVersion)]) { hit = byLabel[C.normalize(t.fixVersion)]; t.versionReason = 'Fix Version'; }
      else if (t.targetDate && ov.length) {
        var target = C.startOfDay(t.targetDate).getTime() + tol;
        for (var i = 0; i < ov.length; i++) { if (ov[i].at.getTime() >= target) { hit = ov[i]; break; } }
        t.versionReason = hit ? 'Target date' : 'au-delà du plan';
      } else if (!t.targetDate) t.versionReason = 'sans Target date';
      if (hit) { t.version = hit.v.label; t.versionDeploy = hit.at; t.versionState = hit.at < ref ? 'deployed' : 'planned'; }
    });
  });

  // ── Filtre version ─────────────────────────────────────────────────
  APP.hooks.versionOptions.push(function () {
    if (!S.hasPlan) return [];
    var cfg = CFG.get();
    var opts = orderedVersions(cfg).map(function (x) { return [x.v.label, x.v.label]; });
    opts.push(['__deployed', 'Déjà déployées']); opts.push(['__none', 'Sans version']);
    return opts;
  });

  // ── Tuiles ─────────────────────────────────────────────────────────
  APP.hooks.extraTiles.push(function (vis, k) {
    if (!S.hasPlan) return [];
    var cfg = CFG.get(), ref = C.startOfDay(S.refDate);
    var next = orderedVersions(cfg).filter(function (x) { return x.at >= ref; })[0];
    var tiles = [];
    if (next) {
      var inNext = vis.filter(function (t) { return t.version === next.v.label; }), openNext = inNext.filter(function (t) { return !t.isDone; });
      var days = C.dayDiff(ref, next.at);
      tiles.push({ id: 'nextVersion', label: 'Prochaine version · ' + next.v.label, value: openNext.length, unit: '/ ' + inNext.length + ' à livrer', sub: 'déploiement ' + C.fmtDate(next.at) + ' — J' + (days >= 0 ? '-' + days : '+' + (-days)) + ' · ' + openNext.filter(function (t) { return t.isBlocker; }).length + ' blocker' + (openNext.filter(function (t) { return t.isBlocker; }).length > 1 ? 's' : ''), tone: days <= (cfg.alerts.daysBefore || 7) && openNext.length ? 'serious' : 'accent',
        drill: function () { return { title: 'Version ' + next.v.label, subtitle: 'Déploiement le ' + C.fmtDate(next.at), tabs: [{ label: 'Reste à livrer', tickets: openNext }, { label: 'Terminés', tickets: inNext.filter(function (t) { return t.isDone; }) }] }; } });
    }
    tiles.push({ id: 'deployedOpen', label: 'Retard réel', value: k.deployedOpen, sub: 'ouverts sur des versions déjà déployées', tone: k.deployedOpen ? 'critical' : 'neutral',
      drill: function () { return { title: 'Retard réel', subtitle: 'Tickets non terminés rattachés à une version dont le jalon de déploiement est passé', tabs: [{ label: 'Ouverts (retard)', tickets: vis.filter(function (t) { return t.versionState === 'deployed' && !t.isDone; }) }, { label: 'Terminés sur versions déployées', tickets: vis.filter(function (t) { return t.versionState === 'deployed' && t.isDone; }) }] }; } });
    tiles.push({ id: 'noVersion', label: 'Sans version', value: k.noVersion, sub: 'Target date vide ou au-delà du plan publié', tone: k.noVersion ? 'warn' : 'neutral',
      drill: function () { return { title: 'Sans version', tabs: [{ label: 'Sans Target date', tickets: vis.filter(function (t) { return t.versionState === 'none' && !t.targetDate; }) }, { label: 'Au-delà du plan', tickets: vis.filter(function (t) { return t.versionState === 'none' && t.targetDate; }) }] }; } });
    return tiles;
  });

  // ── Alertes ────────────────────────────────────────────────────────
  APP.hooks.alerts.push(function (vis) {
    if (!S.hasPlan) return [];
    var cfg = CFG.get(), ref = C.startOfDay(S.refDate), out = [];
    var lateReal = vis.filter(function (t) { return t.versionState === 'deployed' && !t.isDone; });
    if (lateReal.length) out.push({ level: 'critical', icon: '⚠', html: '<b>' + lateReal.length + ' ticket' + (lateReal.length > 1 ? 's' : '') + ' ouvert' + (lateReal.length > 1 ? 's' : '') + ' sur des versions déjà déployées</b> — retard réel, à replanifier ou à livrer en correctif.', tickets: lateReal, title: 'Retard réel' });
    var soon = vis.filter(function (t) { return t.versionState === 'planned' && !t.isDone && C.dayDiff(ref, t.versionDeploy) <= (cfg.alerts.daysBefore || 7) && t.pct < (cfg.alerts.minPct || 50); });
    if (soon.length) {
      var byV = {}; soon.forEach(function (t) { byV[t.version] = (byV[t.version] || 0) + 1; });
      out.push({ level: 'serious', icon: '⏳', html: '<b>' + soon.length + ' ticket' + (soon.length > 1 ? 's' : '') + ' sous ' + cfg.alerts.minPct + '% d\'avancement</b> alors que leur version est déployée dans moins de ' + cfg.alerts.daysBefore + ' jours — ' + Object.keys(byV).map(function (v) { return esc(v) + ' (' + byV[v] + ')'; }).join(', ') + '.', tickets: soon, title: 'Version imminente, ticket peu avancé' });
    }
    var beyond = vis.filter(function (t) { return t.versionState === 'none' && t.targetDate && !t.isDone; });
    if (beyond.length) out.push({ level: 'info', icon: '→', html: '<b>' + beyond.length + ' ticket' + (beyond.length > 1 ? 's' : '') + ' avec une Target date au-delà du plan publié</b> — ajoutez des versions dans le plan de livraisons ou avancez la Target date.', tickets: beyond, title: 'Au-delà du plan' });
    return out;
  });

  // ── Drill personnalisé (segments du train) ─────────────────────────
  APP.hooks.drill['train'] = function (el, vis) {
    var d = el.dataset, list;
    var inV = function (t) { return d.version === '__none' ? t.versionState === 'none' : t.version === d.version; };
    if (d.what === 'status') list = vis.filter(function (t) { return inV(t) && t.status === d.status; });
    else if (d.what === 'blockers') list = vis.filter(function (t) { return inV(t) && t.isBlocker && !t.isDone; });
    else if (d.what === 'prj') list = vis.filter(function (t) { return inV(t) && t.isPrj301; });
    else if (d.what === 'late') list = vis.filter(function (t) { return inV(t) && t.isOverdue; });
    else list = vis.filter(inV);
    var title = d.version === '__none' ? 'Sans version' : 'Version ' + d.version;
    return { title: title, subtitle: d.what === 'status' ? 'Statut : ' + d.status : d.what === 'blockers' ? 'Blockers ouverts' : d.what === 'prj' ? 'Origine PRJ301' : d.what === 'late' ? 'Target date dépassée' : '', tabs: [{ label: 'Reste à livrer', tickets: list.filter(function (t) { return !t.isDone; }) }, { label: 'Terminés', tickets: list.filter(function (t) { return t.isDone; }) }, { label: 'Tous', tickets: list }] };
  };

  // ── Frise du train (hook render) ───────────────────────────────────
  APP.hooks.render.push(function (vis) {
    var card = $('trainCard'); if (!card) return;
    var cfg = CFG.get(), ref = C.startOfDay(S.refDate);
    if (!S.hasPlan) {
      card.innerHTML = '<h2>Train de livraison</h2><div class="sub">Aucun plan publié. Ouvrez le <a href="../releases-planning/">Plan de livraisons</a>, vérifiez les versions et leurs jalons, puis cliquez « Publier le plan → Bug Dashboard v2 ». Les tickets seront alors rattachés à une version selon leur Target date.</div>';
      return;
    }
    var base = APP.baseTickets();
    var allStatuses = []; base.forEach(function (t) { if (allStatuses.indexOf(t.status) === -1) allStatuses.push(t.status); });
    var stColors = P.colorsForDim('status', allStatuses, cfg, base);
    var ov = orderedVersions(cfg);
    var nextIdx = -1; ov.forEach(function (x, i) { if (nextIdx === -1 && x.at >= ref) nextIdx = i; });
    var cols = ov.map(function (x, i) {
      var inV = vis.filter(function (t) { return t.version === x.v.label; });
      return col(x.v.label, x.at, inV, i < nextIdx ? 'past' : i === nextIdx ? 'next' : 'future');
    });
    var none = vis.filter(function (t) { return t.versionState === 'none'; });
    cols.push(col('__none', null, none, 'none'));
    var srcTxt = plan.source === 'supabase' ? 'Plan partagé (publié le ' + (plan.meta ? new Date(plan.meta).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '?') + ')' : 'Plan local de ce navigateur (non publié)';
    var rule = { deploy: 'Déploiement sur la branche', freeze: 'Code freeze', gonogo: 'Go / No-go', start: 'Début de version', end: 'Fin de version' }[cfg.version.boundary] || cfg.version.boundary;
    card.innerHTML = '<div class="card-head"><div><h2>Train de livraison — ' + ov.length + ' versions</h2><div class="sub">Chaque ticket est rattaché à la première version dont le jalon « ' + esc(rule) + '» tombe à sa Target date ou après' + (cfg.version.toleranceDays ? ' (tolérance ' + cfg.version.toleranceDays + ' j)' : '') + '. Grand chiffre = <b>stock à livrer</b> (tickets ouverts) ; jauge = avancement pondéré. Cliquez un nom de version pour filtrer tout le dashboard.</div></div>' +
      '<div class="card-tools"><span class="plan-note">' + esc(srcTxt) + '</span><button type="button" class="ghost small" id="planReload">Recharger le plan</button><a class="ghost small btn-like" href="../releases-planning/">Ouvrir le plan</a></div></div>' +
      '<div class="train" style="margin-top:12px">' + cols.join('') + '</div>';
    $('planReload').addEventListener('click', async function () { await load(); APP.rerender(); });

    function col(label, at, list, kind) {
      var open = list.filter(function (t) { return !t.isDone; });
      var k = C.computeKpis(list);
      var days = at ? C.dayDiff(ref, at) : null;
      var urgent = kind === 'next' && days != null && days <= (cfg.alerts.daysBefore || 7) && open.length;
      var selected = S.filters.version === label;
      var stack = C.DIMS.status.order(allStatuses, cfg).map(function (st) {
        var n = list.filter(function (t) { return t.status === st; }).length; if (!n) return '';
        return '<div style="flex:' + n + ';background:' + stColors[st] + '" data-dd="train" data-version="' + esc(label) + '" data-what="status" data-status="' + esc(st) + '" data-tip="' + esc(st + ' : ' + n) + '"></div>';
      }).join('');
      var flag = kind === 'past' ? 'Déployée' : kind === 'next' ? 'Prochaine' : kind === 'none' ? 'Hors plan' : '';
      var dtxt = at ? (kind === 'past' ? 'déployée le ' : 'déploiement le ') + C.fmtDate(at) : 'Target date vide ou au-delà du plan';
      var jtxt = days == null ? '' : days >= 0 ? 'J-' + days : 'J+' + (-days);
      return '<div class="tcol is-' + kind + (urgent ? ' urgent' : '') + (selected ? ' is-selected' : '') + '">' + (flag ? '<span class="tflag">' + flag + '</span>' : '') +
        '<div class="tname" data-version-filter="' + esc(label) + '" title="Filtrer le dashboard sur cette version"><span>' + (label === '__none' ? 'Sans version' : esc(label)) + '</span>' + (jtxt ? '<span class="tdays">' + jtxt + '</span>' : '') + '</div>' +
        '<div class="tdate">' + esc(dtxt) + '</div>' +
        '<div class="tbig" data-dd="train" data-version="' + esc(label) + '" data-what="all">' + open.length + '<small>à livrer / ' + list.length + '</small></div>' +
        '<div class="tmeter" data-tip="' + esc('Avancement pondéré : ' + k.progress.toFixed(0) + '%') + '"><div style="width:' + k.progress.toFixed(1) + '%;background:' + P.progressColor(k.progress) + '"></div></div>' +
        '<div class="tstack">' + (stack || '<div style="flex:1;background:var(--surface-2)"></div>') + '</div>' +
        '<div class="tfacts"><span data-dd="train" data-version="' + esc(label) + '" data-what="blockers"><b>' + k.blockersOpen + '</b> blocker' + (k.blockersOpen > 1 ? 's' : '') + '</span><span data-dd="train" data-version="' + esc(label) + '" data-what="prj"><b>' + k.prj301 + '</b> PRJ301</span><span data-dd="train" data-version="' + esc(label) + '" data-what="late"><b>' + k.overdue + '</b> en retard</span><span><b>' + k.progress.toFixed(0) + '%</b></span></div>' +
        '</div>';
    }
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-version-filter]'); if (!el) return;
    var v = el.dataset.versionFilter;
    S.filters.version = S.filters.version === v ? 'all' : v;
    APP.rerender();
  });

  document.addEventListener('bdv2:ready', async function () { await load(); if (S.tickets.length) APP.rerender(); });
  root.BDV2Plan = { load: load, get: function () { return plan; }, orderedVersions: orderedVersions };
})(window);
