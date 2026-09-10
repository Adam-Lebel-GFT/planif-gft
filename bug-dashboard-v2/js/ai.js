/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — lot 4 : synthèse IA « lecture de la direction » et
   « Demander au Radar ». Appelle la fonction serveur bug-radar-ai (qui
   détient la clé Anthropic) avec un contexte compact de l'analyse ;
   la synthèse est persistée dans le journal (bdv2_analyses.synthese) pour
   que tous les utilisateurs la voient sans la régénérer.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core, CFG = root.BDV2Config, APP = root.BDV2App, DD = root.BDV2Drill;
  var esc = APP.esc, $ = function (id) { return document.getElementById(id); };
  var S = APP.state;
  var A = { text: null, model: null, at: null, busy: false, setup: false, error: null, answer: null, answerBusy: false };

  // ── Contexte compact envoyé au modèle ──────────────────────────────
  function buildContext() {
    var vis = APP.baseTickets();
    var k = C.computeKpis(vis);
    var cfg = CFG.get();
    var byTeam = {};
    vis.forEach(function (t) {
      var tm = byTeam[t.teamLabel] = byTeam[t.teamLabel] || { ouverts: 0, termines: 0, blockersOuverts: 0, targetDepassee: 0, prj301: 0, pctSum: 0, total: 0 };
      tm.total++; tm.pctSum += t.pct; if (t.isDone) tm.termines++; else tm.ouverts++; if (t.isBlocker && !t.isDone) tm.blockersOuverts++; if (t.isOverdue) tm.targetDepassee++; if (t.isPrj301) tm.prj301++;
    });
    Object.keys(byTeam).forEach(function (t) { byTeam[t].avancementPct = Math.round(byTeam[t].pctSum / byTeam[t].total); delete byTeam[t].pctSum; });
    var versions = [];
    if (root.BDV2Plan && S.hasPlan) {
      var ref = C.startOfDay(S.refDate);
      root.BDV2Plan.orderedVersions(cfg).forEach(function (x) {
        var inV = vis.filter(function (t) { return t.version === x.v.label; });
        if (!inV.length && x.at < ref) return;
        var kk = C.computeKpis(inV);
        versions.push({ version: x.v.label, deploiement: C.toISO(x.at), joursAvantDeploiement: C.dayDiff(ref, x.at), etat: x.at < ref ? 'déjà déployée' : 'à venir', total: kk.total, stockALivrer: kk.open, termines: kk.done, blockersOuverts: kk.blockersOpen, prj301: kk.prj301, avancementPct: Math.round(kk.progress) });
      });
      var none = vis.filter(function (t) { return t.versionState === 'none'; });
      if (none.length) versions.push({ version: 'Sans version', total: none.length, stockALivrer: none.filter(function (t) { return !t.isDone; }).length, note: 'Target date vide ou au-delà du plan' });
    }
    var byPriority = {};
    vis.forEach(function (t) { var p = byPriority[t.priorityLabel] = byPriority[t.priorityLabel] || { ouverts: 0, termines: 0 }; if (t.isDone) p.termines++; else p.ouverts++; });
    var tk = function (t) { return { cle: t.key, resume: t.summary ? t.summary.slice(0, 90) : undefined, equipe: t.teamLabel, statut: t.status, priorite: t.priorityLabel, version: t.version || 'Sans version', targetDate: t.targetDate ? C.toISO(t.targetDate) : undefined, origine: t.origin, resolution: t.resolution || undefined }; };
    var blockers = vis.filter(function (t) { return t.isBlocker && !t.isDone; }).slice(0, 20).map(tk);
    var late = vis.filter(function (t) { return t.isOverdue; }).sort(function (a, b) { return (a.targetDate || 0) - (b.targetDate || 0); }).slice(0, 20).map(tk);
    var deployedOpen = vis.filter(function (t) { return t.versionState === 'deployed' && !t.isDone; }).slice(0, 20).map(tk);
    var doneNoFix = vis.filter(function (t) { return t.isDone && !t.hasFix; }).slice(0, 15).map(tk);
    var alerts = (S.alerts || []).map(function (a) { return { niveau: a.level, texte: a.html.replace(/<[^>]+>/g, ''), nb: a.tickets.length }; });
    var previous = null;
    if (root.BDV2History) {
      var H = root.BDV2History.get();
      var prev = H.items.filter(function (i) { return i.hash !== H.currentHash; }).pop();
      if (prev && prev.resume && prev.resume.kpis) previous = { date: prev.at, nom: prev.nom || undefined, kpis: prev.resume.kpis, stockParVersion: Object.keys(prev.resume.byVersion || {}).reduce(function (o, v) { o[v] = prev.resume.byVersion[v].open; return o; }, {}) };
    }
    return {
      dateReference: C.toISO(S.refDate), nomAnalyse: S.analysisName || undefined,
      kpis: { total: k.total, ouverts: k.open, termines: k.done, blockersOuverts: k.blockersOpen, targetDateDepassee: k.overdue, prj301: k.prj301, internes: k.total - k.prj301, fixVersionRenseignee: k.hasFix, terminesSansFixVersion: k.doneNoFix, sansVersion: k.noVersion, retardReel: k.deployedOpen, avancementPonderePct: Math.round(k.progress * 10) / 10 },
      analysePrecedente: previous || undefined,
      trainDeLivraison: versions.length ? versions : undefined,
      parEquipe: byTeam, parPriorite: byPriority, alertes: alerts,
      ticketsCles: { blockersOuverts: blockers, targetDateDepassee: late, retardReel: deployedOpen, terminesSansFixVersion: doneNoFix }
    };
  }

  // ── Appel de la fonction serveur ───────────────────────────────────
  async function call(mode, question) {
    if (!S.client || !S.session) throw new Error('Connectez-vous depuis le lanceur pour utiliser la synthèse IA.');
    var cfg = CFG.get();
    var res = await S.client.functions.invoke('bug-radar-ai', { body: { mode: mode, model: cfg.ai.model, tone: cfg.ai.tone, context: buildContext(), question: question || '' } });
    if (res.error) {
      var msg = res.error.message || String(res.error);
      try { var ctx = res.error.context; if (ctx && typeof ctx.json === 'function') { var j = await ctx.json(); if (j && j.error) msg = j.error; } } catch (e) {}
      throw new Error(msg);
    }
    var data = res.data || {};
    if (data.setup) { A.setup = true; throw new Error(data.error || 'Clé non configurée'); }
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function generate(force) {
    if (A.busy) return;
    A.busy = true; A.error = null; render();
    try {
      var data = await call('summary');
      A.text = data.text; A.model = data.model; A.at = new Date().toISOString(); A.setup = false;
      if (S.client && S.analysisId) { try { await S.client.from('bdv2_analyses').update({ synthese: A.text }).eq('id', S.analysisId); } catch (e) {} }
      if (root.BDV2History) { var H = root.BDV2History.get(); var cur = H.items.filter(function (i) { return i.hash === H.currentHash; }).pop(); if (cur) cur.synthese = A.text; }
    } catch (e) { A.error = e.message || String(e); }
    A.busy = false; render();
  }

  async function ask(q) {
    if (A.answerBusy || !q.trim()) return;
    A.answerBusy = true; A.answer = null; A.error = null; render();
    try { var data = await call('ask', q); A.answer = { q: q, text: data.text, model: data.model }; }
    catch (e) { A.error = e.message || String(e); }
    A.answerBusy = false; render();
  }

  // ── Markdown léger → HTML (titres, puces, gras, clés Jira → liens) ──
  function md(text) {
    var lines = String(text || '').split('\n'), out = '', inList = false;
    var inline = function (s) {
      s = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      return s.replace(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g, function (m) { return '<a href="' + DD.JIRA_BASE_URL + m + '" target="_blank" rel="noopener">' + m + '</a>'; });
    };
    lines.forEach(function (l) {
      var t = l.trim();
      if (!t) { if (inList) { out += '</ul>'; inList = false; } return; }
      var h = t.match(/^#{1,4}\s+(.*)$/);
      if (h) { if (inList) { out += '</ul>'; inList = false; } out += '<h4>' + inline(h[1]) + '</h4>'; return; }
      var li = t.match(/^[-*•]\s+(.*)$/) || t.match(/^\d+[.)]\s+(.*)$/);
      if (li) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + inline(li[1]) + '</li>'; return; }
      if (inList) { out += '</ul>'; inList = false; }
      out += '<p>' + inline(t) + '</p>';
    });
    if (inList) out += '</ul>';
    return out;
  }

  var MODEL_LABELS = { 'claude-haiku-4-5': 'Claude Haiku 4.5', 'claude-sonnet-5': 'Claude Sonnet 5', 'claude-opus-5': 'Claude Opus 5' };

  function render() {
    var card = $('aiCard'); if (!card) return;
    var cfg = CFG.get();
    var connected = !!(S.client && S.session);
    var h = '<div class="card-head"><div><h2>Synthèse IA — lecture de la direction</h2><div class="sub">Rédigée à partir des chiffres de l\'analyse courante (KPI, train de livraison, équipes, alertes, tickets clés) par ' + esc(MODEL_LABELS[cfg.ai.model] || cfg.ai.model) + ' — ton « ' + (cfg.ai.tone === 'projet' ? 'chef de projet' : 'direction') + ' ». Aucun chiffre n\'est inventé : tout provient des données collées.</div></div>' +
      '<div class="card-tools"><button type="button" class="ghost small" id="aiGen" ' + (A.busy || !connected ? 'disabled' : '') + '>' + (A.busy ? '<span class="spinner"></span> Rédaction…' : (A.text ? 'Régénérer' : 'Générer la synthèse')) + '</button><button type="button" class="ghost small" id="aiCfg">Modèle & ton</button></div></div>';
    if (!connected) h += '<p class="sub" style="margin-top:12px">Connectez-vous depuis le <a href="../">lanceur</a> pour activer la synthèse IA (la fonction serveur vérifie votre compte).</p>';
    if (A.setup) h += '<div class="ai-setup" style="margin-top:12px"><b>Configuration à faire une fois par l\'administrateur :</b> dans le tableau de bord Supabase → <b>Edge Functions</b> → <code>bug-radar-ai</code> → <b>Secrets</b>, ajoutez <code>ANTHROPIC_API_KEY</code> (clé d\'API Anthropic). La synthèse fonctionnera immédiatement après, sans redéploiement.</div>';
    else if (A.error) h += '<div class="ai-setup" style="margin-top:12px">' + esc(A.error) + '</div>';
    if (A.text) h += '<div class="ai-text" style="margin-top:12px">' + md(A.text) + '</div><div class="ai-meta">' + (A.model ? esc(MODEL_LABELS[A.model] || A.model) + ' · ' : '') + (A.at ? 'générée le ' + new Date(A.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '') + ' · relecture humaine recommandée avant diffusion</div>';
    else if (!A.busy && connected && !A.setup) h += '<p class="sub" style="margin-top:12px">' + (cfg.ai.auto ? 'La synthèse se génère automatiquement après chaque nouvelle analyse journalisée.' : 'Cliquez « Générer la synthèse ».') + '</p>';
    h += '<div class="ai-ask"><input type="text" id="aiQ" placeholder="Demander au Radar — ex. quels tickets PRJ301 risquent de rater la prochaine version ?" ' + (connected ? '' : 'disabled') + '><button type="button" class="primary" id="aiAsk" ' + (A.answerBusy || !connected ? 'disabled' : '') + '>' + (A.answerBusy ? '<span class="spinner"></span>' : 'Demander') + '</button></div>';
    if (A.answer) h += '<div class="ai-answer"><div class="sub" style="margin-bottom:6px"><b>' + esc(A.answer.q) + '</b></div><div class="ai-text">' + md(A.answer.text) + '</div></div>';
    card.innerHTML = h;
    $('aiGen').addEventListener('click', function () { generate(true); });
    $('aiCfg').addEventListener('click', function () { CFG.open(APP.configCtx(), 'ai'); });
    $('aiAsk').addEventListener('click', function () { ask($('aiQ').value); });
    $('aiQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') ask($('aiQ').value); });
  }

  APP.hooks.render.push(function () { render(); });
  APP.available.ai = true;

  // Synthèse existante ou génération automatique après journalisation.
  document.addEventListener('bdv2:recorded', function (e) {
    var d = e.detail || {};
    if (d.item && d.item.synthese && !d.isNew) { A.text = d.item.synthese; A.model = null; A.at = d.item.at; render(); return; }
    if (d.isNew) { A.text = null; A.answer = null; if (CFG.get().ai.auto && S.client && S.session) generate(false); else render(); }
  });
  root.BDV2AI = { generate: generate, ask: ask, buildContext: buildContext, md: md };
})(window);
