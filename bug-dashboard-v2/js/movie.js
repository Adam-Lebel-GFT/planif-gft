/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — « Bug movie » : les photos du journal rejouées.
   Chaque ticket est un point coloré (équipe ou version) qui se déplace de
   statut en statut, version par version. Un ticket qui sort d'une version va
   dans le nuage ; un ticket rejeté (Declined, Duplicate, Not replicable,
   Incomplete, Abandoned) va à la poubelle. Dessous, les aires ouvert/terminé
   de chaque version se chevauchent sur l'axe des dates, sous la barre
   « aujourd'hui » qui avance avec le curseur.
   Les mouvements sont connus à la photo près : un ticket change de place à
   l'instant de la photo où on le voit ailleurs, pas avant.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core, P = root.BDV2Palette, CFG = root.BDV2Config, APP = root.BDV2App, HI = root.BDV2History;
  var esc = APP.esc, $ = function (id) { return document.getElementById(id); };

  // Résolutions qui envoient un ticket à la poubelle (comparées sans accents ni casse).
  var REJECT = [['Declined', /declin|reject/], ['Duplicate', /duplic/], ['Not replicable', /not.?replic|cannot.?repro|not.?reprod|non.?repro/], ['Incomplete', /incomplet/], ['Abandoned', /abandon|won.?t.?do|wont.?do/]];
  // Statuts de fin : « ready for testing » compte comme Closed ; un statut declined/decline
  // n'a pas de colonne (le ticket part à la poubelle).
  function foldStatus(st) { return /^ready for testing$/i.test(C.normalize(st || '')) ? 'Closed' : st; }
  function statusReject(st) { return /^(decline|declined)$/i.test(C.normalize(st || '')) ? 'Declined' : null; }
  function rejectReason(res) {
    var r = C.normalize(res || ''); if (!r) return null;
    for (var i = 0; i < REJECT.length; i++) if (REJECT[i][1].test(r)) return REJECT[i][0];
    return null;
  }
  var VERSION_COLORS = ['#0d366b', '#c026d3', '#14b8a6', '#6366f1', '#5b8def', '#a16207', '#be123c', '#0e7490'];
  var DUR = 0.45;
  var LEG2 = '<span><i class="mv-tg"></i>repoussé vers une version plus tardive</span><span><i class="mv-tg mv-tg--ok"></i>ramené vers une version antérieure</span><span>✦ flash et traînée : recule d\'un statut</span>';
  var ui = { nVers: 0, color: 'team', axis: 'fixed', speed: 1, playing: false, t: 0, built: null };
  var M = null;          // données construites (photos, tickets, positions)
  var DOW = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], MON = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  // ── Données ────────────────────────────────────────────────────────
  function openWin() { var b = CFG.get().burnup || {}, a = b.openFrom == null ? 8 : b.openFrom, z = b.openTo == null ? 19 : b.openTo; return { a: a, z: z, h: z - a }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function build(items, nVers) {
    var cfg = CFG.get();
    var photos = items.filter(function (i) { return i.tickets && i.tickets.length; }).slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    if (photos.length < 2) return null;
    // versions affichées : les Target dates les plus récentes (au moins 3 tickets dans une photo) ; toutes par défaut
    var tdMax = {}, tdPhotos = {};
    photos.forEach(function (p) { var c = {}; p.tickets.forEach(function (t) { if (t.td) c[t.td] = (c[t.td] || 0) + 1; }); Object.keys(c).forEach(function (td) { tdMax[td] = Math.max(tdMax[td] || 0, c[td]); tdPhotos[td] = (tdPhotos[td] || 0) + 1; }); });
    var tds = Object.keys(tdMax).filter(function (td) { return tdMax[td] >= 3 && tdPhotos[td] >= 2; })   // une version vue sur une seule photo n'a pas de film.sort();
    if (nVers > 0) tds = tds.slice(-nVers);   // 0 = toutes les versions du journal
    if (!tds.length) return null;
    var rowOf = {}; tds.forEach(function (td, i) { rowOf[td] = i; });
    // photos utiles : à partir de la première qui contient une de ces versions
    var first = 0; while (first < photos.length && !photos[first].tickets.some(function (t) { return rowOf[t.td] != null; })) first++;
    photos = photos.slice(first);
    if (photos.length < 2) return null;
    var t0 = new Date(photos[0].at).getTime();
    // Le temps du film est le temps ouvré (fenêtre du burn-up, Configurer → Règles) : une nuit ou
    // un week-end ne compte pas, une photo saisie la nuit se place à la fermeture.
    var wn = openWin(), t0d = new Date(t0);
    var T = photos.map(function (p) { return C.openHours(t0d, new Date(p.at), wn.a, wn.z) / wn.h; });
    // statuts (colonnes), du moins au plus avancé
    var statSet = {}, teamSet = {}, fakeTeams = [];
    photos.forEach(function (p) { p.tickets.forEach(function (t) {
      if (rowOf[t.td] == null) return;
      if (!statusReject(t.st)) statSet[foldStatus(t.st)] = 1;
      var lab = (cfg.teams.alias && cfg.teams.alias[t.tm]) || t.tm || 'Non affecté';
      if (!teamSet[lab]) { teamSet[lab] = 1; fakeTeams.push({ team: t.tm || 'Non affecté', teamLabel: lab }); }
    }); });
    var statuses = C.DIMS.status.order(Object.keys(statSet), cfg, []);
    var colOf = {}; statuses.forEach(function (s, i) { colOf[s] = i; });
    var doneSet = {}; (cfg.statuses.done || []).forEach(function (s) { doneSet[C.normalize(s)] = true; });
    var teamLabels = C.DIMS.team.order(Object.keys(teamSet), cfg, fakeTeams);
    var teamColors = P.colorsForDim('team', teamLabels, cfg, fakeTeams);
    // tickets et état par photo
    var keys = [], idx = {}, tk = [];
    photos.forEach(function (p) { p.tickets.forEach(function (t) { if (rowOf[t.td] != null && idx[t.k] == null) { idx[t.k] = keys.length; keys.push(t.k); tk.push({ moves: [], k: t.k, team: (cfg.teams.alias && cfg.teams.alias[t.tm]) || t.tm || 'Non affecté', first: -1, res: null }); } }); });
    var N = keys.length;
    // st[i][j] = { kind: 'board'|'cloud'|'trash', row, col } ou null (pas encore vu)
    var st = photos.map(function () { return new Array(N).fill(null); });
    var counts = tds.map(function () { return photos.map(function () { return { open: 0, done: 0 }; }); });
    // Une photo ne parle d'une version que si elle la couvre : les analyses du journal sont des
    // extraits séparés (une autre version, un extrait filtré). Dans une photo qui ne contient
    // qu'une poignée des tickets d'une version, leur absence ne veut pas dire « sortis » ni « zéro ».
    var maxTd = {};
    photos.forEach(function (p) { var c = {}; p.tickets.forEach(function (t) { if (rowOf[t.td] != null) c[t.td] = (c[t.td] || 0) + 1; }); Object.keys(c).forEach(function (td) { maxTd[td] = Math.max(maxTd[td] || 0, c[td]); }); });
    var covered = photos.map(function (p) {
      var c = {}; p.tickets.forEach(function (t) { if (rowOf[t.td] != null) c[t.td] = (c[t.td] || 0) + 1; });
      return tds.map(function (td) { return (c[td] || 0) >= Math.max(Math.min(5, maxTd[td] || 0), .5 * (maxTd[td] || 0)); });
    });
    // Version terminée et officielle : sa photo épinglée (celle dont la date du nom est la Target
    // date, à défaut la plus récente des épinglées qui la contiennent) reste en place, les photos
    // suivantes ne la modifient plus. « Terminée » : la Target date est atteinte à la dernière photo.
    var lastAt = new Date(photos[photos.length - 1].at);
    var officialK = tds.map(function (td, r) {
      if (new Date(td + 'T00:00:00') > lastAt) return -1;
      var best = -1, bestMatch = false;
      photos.forEach(function (p, i) {
        if (!p.epingle || !covered[i][r]) return;
        var mm = (p.nom || '').match(/(\d{4})-(\d{2})-(\d{2})/), m2 = (p.nom || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
        var nameTd = mm ? mm[1] + '-' + mm[2] + '-' + mm[3] : m2 ? m2[3] + '-' + m2[2] + '-' + m2[1] : '';
        var match = nameTd === td;
        if (best < 0 || (match && !bestMatch) || (match === bestMatch && i > best)) { best = i; bestMatch = match; }
      });
      return best;
    });
    photos.forEach(function (p, i) {
      var seen = {};
      p.tickets.forEach(function (t) {
        var r = rowOf[t.td]; if (r == null) return;
        var j = idx[t.k]; seen[j] = 1;
        var why = rejectReason(t.r) || statusReject(t.st), fst = foldStatus(t.st), done = t.d ? 1 : (doneSet[C.normalize(fst)] ? 1 : 0);
        if (tk[j].first < 0) tk[j].first = i;
        if (why) { st[i][j] = { kind: 'trash', row: r, col: colOf[fst], why: why }; tk[j].res = why; }
        else { st[i][j] = { kind: 'board', row: r, col: colOf[fst] }; tk[j].res = null; counts[r][i][done ? 'done' : 'open']++; }
      });
      for (var j = 0; j < N; j++) {
        if (seen[j] || tk[j].first < 0) continue;
        var prev = i > 0 ? st[i - 1][j] : null;
        if (prev && !covered[i][prev.row]) { st[i][j] = prev; continue; }   // photo hors sujet pour sa version : rien de nouveau
        st[i][j] = prev && prev.kind === 'trash' ? prev : { kind: 'cloud', row: prev ? prev.row : 0, col: prev ? prev.col : 0, why: null };
      }
      tds.forEach(function (td, r) { if (i > 0 && !covered[i][r]) counts[r][i] = counts[r][i - 1]; });
      // figer les versions officielles terminées sur leur photo officielle
      tds.forEach(function (td, r) {
        var k = officialK[r]; if (k < 0 || i <= k) return;
        counts[r][i] = counts[r][k];
        for (var j = 0; j < N; j++) {
          var s0 = st[k][j];
          if (s0 && s0.row === r) st[i][j] = s0;
          else if (st[i][j] && st[i][j].row === r) st[i][j] = i > 0 ? st[i - 1][j] : null;   // arrivé après la photo officielle : ignoré
        }
      });
      // ticket qui change de version (ligne) d'une photo à l'autre : repoussé (dir +1, version plus tardive) ou ramené (dir -1)
      if (i > 0) for (var q = 0; q < N; q++) { var s0 = st[i - 1][q], s1 = st[i][q]; if (s0 && s1 && s0.row !== s1.row) tk[q].moves.push({ i: i, dir: s1.row > s0.row ? 1 : -1 }); }
    });
    return { win: wn, photos: photos, T: T, tds: tds, statuses: statuses, colOf: colOf, doneSet: doneSet, tk: tk, st: st, counts: counts, teamLabels: teamLabels, teamColors: teamColors, doneCols: statuses.map(function (s) { return !!doneSet[C.normalize(s)]; }), t0: t0 };
  }

  // ── Géométrie et positions ─────────────────────────────────────────
  var G = null;
  function layout(w) {
    var K = M.statuses.length, nR = M.tds.length;
    var PW = 118, GAP = 12, HEAD = 46, ROWH = nR > 4 ? 92 : 112;
    var boardW = Math.max(K * 64, w - 2 * PW - 2 * GAP);
    var W = 2 * PW + 2 * GAP + boardW, H = HEAD + nR * ROWH;
    var g = { W: W, H: H, PW: PW, GAP: GAP, HEAD: HEAD, ROWH: ROWH, K: K, nR: nR, cw: boardW / K, bx: PW + GAP, tx: PW + GAP + boardW + GAP };
    // capacité des cellules : le plus gros remplissage d'une cellule, d'un panneau
    var maxCell = 1, maxPanel = 1;
    M.st.forEach(function (row) {
      var cell = {}, cl = 0, tr = 0;
      row.forEach(function (s) { if (!s) return; if (s.kind === 'board') { var c = s.row + ':' + s.col; cell[c] = (cell[c] || 0) + 1; maxCell = Math.max(maxCell, cell[c]); } else if (s.kind === 'cloud') cl++; else tr++; });
      maxPanel = Math.max(maxPanel, cl, tr);
    });
    function pitchFor(wd, ht, n) { return Math.max(5.2, Math.min(10, Math.sqrt((wd * ht) / (n * 1.25)))); }
    g.cellPitch = pitchFor(g.cw - 8, ROWH - 10, maxCell);
    g.panelTop = 40; g.cloudBottom = H - 30; g.trashBottom = H - 104;
    g.cloudPitch = pitchFor(PW - 14, g.cloudBottom - g.panelTop - 8, maxPanel);
    g.trashPitch = pitchFor(PW - 14, g.trashBottom - g.panelTop - 8, maxPanel);
    G = g;
    // positions par photo : placement par hachage, collisions résolues par sondage linéaire
    M.pos = M.st.map(function (row) {
      var used = {}, out = new Array(row.length);
      function place(area, key, j, ox, oy, wd, ht, pitch) {
        var cols = Math.max(1, Math.floor(wd / pitch)), rows = Math.max(1, Math.floor(ht / pitch)), n = cols * rows;
        var u = used[area] = used[area] || {};
        var s = hash(M.tk[j].k) % n, tries = 0;
        while (u[s] && tries < n) { s = (s + 1) % n; tries++; }
        u[s] = 1;
        return [ox + (s % cols + 0.5) * (wd / cols), oy + (Math.floor(s / cols) + 0.5) * (ht / rows)];
      }
      row.forEach(function (s, j) {
        if (!s) { out[j] = null; return; }
        if (s.kind === 'board') out[j] = place('b' + s.row + ':' + s.col, 0, j, g.bx + s.col * g.cw + 4, HEAD + s.row * ROWH + 5, g.cw - 8, ROWH - 10, g.cellPitch);
        else if (s.kind === 'cloud') out[j] = place('c', 0, j, 7, g.panelTop + 4, PW - 14, g.cloudBottom - g.panelTop - 8, g.cloudPitch);
        else out[j] = place('t', 0, j, g.tx + 7, g.panelTop + 4, PW - 14, g.trashBottom - g.panelTop - 8, g.trashPitch);
      });
      return out;
    });
  }

  // ── Dessin ─────────────────────────────────────────────────────────
  var cs = null;
  function readTheme() {
    var g = getComputedStyle(document.documentElement), q = function (n, d) { return g.getPropertyValue(n).trim() || d; };
    cs = { ink: q('--text', '#0C1A2E'), muted: q('--muted', '#6B7A90'), line: q('--border', '#E8EAED'), surf: q('--white', '#fff'), soft: q('--surface-2', '#F3F5F8'), green: q('--green', '#1A7A42'), font: q('--font', 'sans-serif'), mono: q('--font-mono', 'monospace'), red: q('--red', '#C0392B') };
  }
  function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); var n = parseInt(h, 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function ease(p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function dotColor(j) { return ui.color === 'team' ? (M.teamColors[M.tk[j].team] || P.NEUTRAL) : VERSION_COLORS[M.st[M.cur][j] ? M.st[M.cur][j].row % VERSION_COLORS.length : 0]; }
  function lastMove(j, i) { var mv = M.tk[j].moves, d = 0; for (var k = 0; k < mv.length && mv[k].i <= i; k++) d = mv[k].dir; return d; }
  function frameAt(t) { var i = 0; for (var k = 0; k < M.T.length; k++) if (M.T[k] <= t) i = k; return i; }
  function label(t) {
    var d = C.addOpenHours(new Date(M.t0), t * M.win.h, M.win.a, M.win.z) || new Date(M.t0), h = d.getHours(), m = Math.floor(d.getMinutes() / 5) * 5;
    if (h < M.win.a) { h = M.win.a; m = 0; } else if (h >= M.win.z) { h = M.win.z; m = 0; }
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fit(cv, w, h) { var dpr = window.devicePixelRatio || 1; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }

  function cloudPath(ctx, cx, cy, w) {
    var r = w / 2; ctx.beginPath();
    ctx.arc(cx - r * .45, cy + r * .12, r * .42, Math.PI * .5, Math.PI * 1.5);
    ctx.arc(cx - r * .1, cy - r * .3, r * .5, Math.PI, Math.PI * 2);
    ctx.arc(cx + r * .5, cy + r * .07, r * .4, Math.PI * 1.5, Math.PI * 2.5);
    ctx.closePath();
  }
  function trashPath(ctx, cx, cy, w) {
    ctx.beginPath();
    ctx.rect(cx - w * .5, cy - w * .34, w, w * .14);
    ctx.rect(cx - w * .14, cy - w * .46, w * .28, w * .12);
    ctx.moveTo(cx - w * .4, cy - w * .17); ctx.lineTo(cx + w * .4, cy - w * .17); ctx.lineTo(cx + w * .32, cy + w * .58); ctx.lineTo(cx - w * .32, cy + w * .58); ctx.closePath();
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawBoard(t) {
    var ctx = $('mvBoard').getContext('2d'), g = G;
    ctx.clearRect(0, 0, g.W, g.H);
    ctx.fillStyle = cs.surf; ctx.fillRect(0, 0, g.W, g.H);
    var i = frameAt(t); M.cur = i;
    // tableau
    ctx.fillStyle = cs.soft;
    for (var r = 0; r < g.nR; r++) if (r % 2 === 0) ctx.fillRect(g.bx, g.HEAD + r * g.ROWH, g.W - 2 * (g.PW + g.GAP) + 0, g.ROWH);
    M.doneCols.forEach(function (d, c) { if (d) { ctx.fillStyle = rgba(cs.green, .09); ctx.fillRect(g.bx + c * g.cw, g.HEAD, g.cw, g.nR * g.ROWH); } });
    ctx.strokeStyle = cs.line; ctx.lineWidth = 1;
    for (var c = 0; c <= g.K; c++) { var x = Math.round(g.bx + c * g.cw) + .5; ctx.beginPath(); ctx.moveTo(x, g.HEAD - 8); ctx.lineTo(x, g.H); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(g.bx, g.HEAD + .5); ctx.lineTo(g.tx - g.GAP, g.HEAD + .5); ctx.stroke();
    ctx.font = '700 10.5px ' + cs.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = cs.ink;
    M.statuses.forEach(function (s, c) {
      var words = s.split(' '), lines = [''], wmax = g.cw - 8;
      words.forEach(function (w) { var cand = (lines[lines.length - 1] + ' ' + w).trim(); if (ctx.measureText(cand).width > wmax && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = cand; });
      lines = lines.slice(0, 3);
      lines.forEach(function (ln, k) { ctx.fillText(ln, g.bx + (c + .5) * g.cw, g.HEAD / 2 + (k - (lines.length - 1) / 2) * 12); });
    });
    ctx.textAlign = 'left';
    M.tds.forEach(function (td, r) {
      ctx.fillStyle = VERSION_COLORS[r % VERSION_COLORS.length]; ctx.font = '800 12px ' + cs.mono;
      ctx.save(); ctx.translate(g.bx + 5, g.HEAD + r * g.ROWH + 14); ctx.fillText(C.fmtDate(new Date(td + 'T00:00:00')).slice(0, 5), 0, 0); ctx.restore();
    });
    // panneaux nuage / poubelle, hors du tableau
    [['cloud', 0, 'Nuage', 'sortis de la version'], ['trash', g.tx, 'Poubelle', 'rejetés']].forEach(function (pn) {
      var px = pn[1], pbot = pn[0] === 'cloud' ? g.cloudBottom : g.trashBottom;
      roundRect(ctx, px + .5, 4.5, g.PW - 1, g.H - 9, 16); ctx.fillStyle = cs.soft; ctx.fill(); ctx.strokeStyle = cs.line; ctx.stroke();
      ctx.save(); ctx.globalAlpha = .1; ctx.fillStyle = cs.ink;
      if (pn[0] === 'cloud') cloudPath(ctx, px + g.PW / 2, (g.panelTop + pbot) / 2, g.PW * .98); else trashPath(ctx, px + g.PW / 2, (g.panelTop + pbot) / 2, g.PW * .72);
      ctx.fill(); ctx.restore();
      ctx.fillStyle = cs.ink; ctx.font = '800 12.5px ' + cs.font; ctx.textAlign = 'center'; ctx.fillText(pn[2], px + g.PW / 2, 18);
      ctx.fillStyle = cs.muted; ctx.font = '600 10px ' + cs.font; ctx.fillText(pn[3], px + g.PW / 2, 31);
    });
    // points : chaque ticket glisse de sa place de la photo précédente à celle de la suivante,
    // avec un petit décalage qui lui est propre ; il n'y arrive qu'à l'instant de la photo suivante
    var ja = i, jb = Math.min(i + 1, M.T.length - 1), span = M.T[jb] - M.T[ja], seg = span > 0 ? Math.max(0, Math.min(1, (t - M.T[ja]) / span)) : 1;
    var cnt = { cloud: 0, trash: 0 }, why = {}, cells = {}, dots = [], W = .6;
    REJECT.forEach(function (r) { why[r[0]] = 0; });
    for (var j = 0; j < M.tk.length; j++) {
      var sa = M.st[ja][j], sb = M.st[jb][j]; if (!sa && !sb) continue;
      var delay = (hash(M.tk[j].k) % 35) / 100, tp = ja === jb ? 1 : Math.max(0, Math.min(1, (seg - delay) / W)), e = ease(tp);
      var pa = M.pos[ja][j], pb = M.pos[jb][j], alpha = 1;
      if (!sa) { if (tp <= 0) continue; pa = [g.PW / 2 + (hash(M.tk[j].k) % 40 - 20), g.H / 2]; alpha = Math.min(1, tp + .05); }   // nouveau : vient du nuage
      if (!sb) { sb = sa; pb = pa; }
      var cur = (tp >= .5 || !sa) ? sb : sa;
      var x = pa[0] + (pb[0] - pa[0]) * e, y = pa[1] + (pb[1] - pa[1]) * e + Math.sin(e * Math.PI) * ((hash(M.tk[j].k) % 5) - 2) * 3;
      var moving = tp > 0 && tp < 1 && (pa[0] !== pb[0] || pa[1] !== pb[1]);
      var age = t - (M.T[ja] + (delay + W) * span);
      var back = !!(sa && sb && sa.kind === 'board' && sb.kind === 'board' && sb.row === sa.row && sb.col < sa.col);
      var path = null;
      if (back && tp > 0 && age < 1.1) { path = []; for (var u = 0; u <= 10; u++) { var eu = ease(tp * u / 10); path.push([pa[0] + (pb[0] - pa[0]) * eu, pa[1] + (pb[1] - pa[1]) * eu - Math.sin(eu * Math.PI) * 6]); } }
      dots.push({ x: x, y: y, j: j, alpha: alpha, moving: moving, tp: tp, done: cur.kind === 'board' && M.doneCols[cur.col], back: back, age: age, path: path, mark: cur.kind === 'trash' ? 0 : lastMove(j, tp >= .5 ? jb : ja) });
      if (cur.kind === 'board') { var ck = cur.row + ':' + cur.col; cells[ck] = (cells[ck] || 0) + 1; } else if (cur.kind === 'cloud') cnt.cloud++; else { cnt.trash++; why[cur.why]++; }
    }
    dots.forEach(function (d) { if (d.moving) { ctx.strokeStyle = rgba(dotColor(d.j), .45 * (1 - d.tp)); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(d.x, d.y, 3.4 + d.tp * 8, 0, 7); ctx.stroke(); } });
    var rad = Math.max(2.2, Math.min(3.6, G.cellPitch * .38));
    // étoile filante : traînée effilée du point de départ vers la nouvelle place, qui s'estompe
    dots.forEach(function (d) {
      if (!d.path || d.path.length < 2) return; var fade = Math.max(0, 1 - Math.max(0, d.age - .45) / .65);
      for (var k = 1; k < d.path.length; k++) { var f = k / (d.path.length - 1); ctx.strokeStyle = rgba(dotColor(d.j), (.15 + .75 * f) * fade); ctx.lineWidth = .8 + f * 2.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(d.path[k - 1][0], d.path[k - 1][1]); ctx.lineTo(d.path[k][0], d.path[k][1]); ctx.stroke(); }
    });
    dots.forEach(function (d) {
      ctx.globalAlpha = d.alpha * (d.done && !d.moving ? .9 : 1);
      var flash = d.back && d.age < 1.1 && (Math.floor(d.age * 9) % 2 + 2) % 2 === 0;
      ctx.fillStyle = flash ? '#ffffff' : dotColor(d.j); ctx.beginPath(); ctx.arc(d.x, d.y, d.moving ? rad + .5 : rad, 0, 7); ctx.fill();
      if (d.back && d.age < 1.1) { ctx.strokeStyle = rgba(dotColor(d.j), .9 * (1 - Math.max(0, d.age) / 1.1)); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(d.x, d.y, rad + 2 + 3 * Math.abs(Math.sin(d.age * 14)), 0, 7); ctx.stroke(); }
    });
    ctx.globalAlpha = 1;
    // cible : rouge si le ticket a été repoussé vers une version plus tardive, verte s'il est revenu vers une version antérieure ; elle le suit
    ctx.lineWidth = 1.2;
    dots.forEach(function (d) {
      if (!d.mark) return; ctx.strokeStyle = d.mark > 0 ? cs.red : cs.green; var r1 = rad + 3.2; ctx.beginPath(); ctx.arc(d.x, d.y, r1, 0, 7);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) { ctx.moveTo(d.x + v[0] * (r1 - 1.2), d.y + v[1] * (r1 - 1.2)); ctx.lineTo(d.x + v[0] * (r1 + 2.6), d.y + v[1] * (r1 + 2.6)); });
      ctx.stroke();
    });
    // compteurs
    ctx.font = '600 10.5px ' + cs.mono; ctx.textAlign = 'right'; ctx.fillStyle = cs.muted;
    Object.keys(cells).forEach(function (k) { var rc = k.split(':'); ctx.fillText(cells[k], g.bx + (+rc[1] + 1) * g.cw - 5, g.HEAD + (+rc[0] + 1) * g.ROWH - 7); });
    ctx.textAlign = 'center'; ctx.fillStyle = cs.ink; ctx.font = '800 20px ' + cs.mono; ctx.fillText(cnt.cloud, g.PW / 2, g.H - 14);
    ctx.fillText(cnt.trash, g.tx + g.PW / 2, g.trashBottom + 20);
    ctx.font = '600 10.5px ' + cs.font; ctx.textAlign = 'left'; ctx.fillStyle = cs.muted;
    REJECT.forEach(function (r, k) { ctx.fillText(r[0], g.tx + 12, g.trashBottom + 38 + k * 12.5); ctx.textAlign = 'right'; ctx.font = '600 10.5px ' + cs.mono; ctx.fillText(why[r[0]], g.tx + g.PW - 12, g.trashBottom + 38 + k * 12.5); ctx.textAlign = 'left'; ctx.font = '600 10.5px ' + cs.font; });
  }

  var CH = { w: 900, h: 250, pl: 40, pr: 14, pt: 16, pb: 28 };
  function niceMax(v) { var s = [8, 12, 20, 40, 60, 80, 100, 120, 160, 200, 240, 320, 400, 480, 600]; for (var i = 0; i < s.length; i++) if (v <= s[i]) return s[i]; return Math.ceil(v / 200) * 200; }
  function drawChart(t) {
    var ctx = $('mvChart').getContext('2d'), c = CH;
    ctx.clearRect(0, 0, c.w, c.h); ctx.fillStyle = cs.surf; ctx.fillRect(0, 0, c.w, c.h);
    var pw = c.w - c.pl - c.pr, ph = c.h - c.pt - c.pb, end = M.T[M.T.length - 1] + 1;
    var span = ui.axis === 'fixed' ? end : Math.min(end, 28), vs = ui.axis === 'fixed' ? 0 : t - .62 * span;
    var ymax = 10; M.counts.forEach(function (cr) { cr.forEach(function (p) { ymax = Math.max(ymax, p.open + p.done); }); }); ymax = niceMax(ymax * 1.08);
    var xOf = function (d) { return c.pl + (d - vs) / span * pw; }, yOf = function (v) { return c.pt + ph - v / ymax * ph; };
    ctx.save(); ctx.beginPath(); ctx.rect(c.pl, c.pt - 6, pw, ph + 6); ctx.clip();
    ctx.strokeStyle = cs.line; ctx.lineWidth = 1;
    for (var k = 0; k <= 4; k++) { var yy = Math.round(yOf(ymax * k / 4)) + .5; ctx.beginPath(); ctx.moveTo(c.pl, yy); ctx.lineTo(c.pl + pw, yy); ctx.stroke(); }
    // photos : repères
    ctx.strokeStyle = rgba(cs.muted, .25); M.T.forEach(function (d) { var x = Math.round(xOf(d)) + .5; ctx.beginPath(); ctx.moveTo(x, c.pt + ph - 5); ctx.lineTo(x, c.pt + ph); ctx.stroke(); });
    M.tds.forEach(function (td, r) {
      var col = VERSION_COLORS[r % VERSION_COLORS.length], pts = function (f) {
        var a = [];
        for (var i = 0; i < M.T.length && M.T[i] <= t; i++) a.push([xOf(M.T[i]), yOf(f(M.counts[r][i]))]);
        var n = a.length; if (n && n < M.T.length) { var q = Math.min(1, (t - M.T[n - 1]) / (M.T[n] - M.T[n - 1])), v0 = f(M.counts[r][n - 1]), v1 = f(M.counts[r][n]); a.push([xOf(t), yOf(v0 + (v1 - v0) * q)]); }
        return a;
      };
      var tot = pts(function (p) { return p.open + p.done; }), dn = pts(function (p) { return p.done; });
      if (tot.length < 2) return;
      var poly = function (a) { ctx.beginPath(); ctx.moveTo(a[0][0], yOf(0)); a.forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.lineTo(a[a.length - 1][0], yOf(0)); ctx.closePath(); };
      poly(tot); ctx.fillStyle = rgba(col, .16); ctx.fill(); poly(dn); ctx.fillStyle = rgba(col, .46); ctx.fill();
      ctx.beginPath(); tot.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
      var l = tot[tot.length - 1]; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(l[0], l[1], 3, 0, 7); ctx.fill();
    });
    var xt = xOf(t); ctx.strokeStyle = cs.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xt, c.pt - 4); ctx.lineTo(xt, c.pt + ph); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = cs.muted; ctx.font = '500 10.5px ' + cs.mono; ctx.textAlign = 'right';
    for (var k2 = 0; k2 <= 4; k2++) ctx.fillText(Math.round(ymax * k2 / 4), c.pl - 6, yOf(ymax * k2 / 4) + 4);
    ctx.textAlign = 'center';
    // graduations aux jours ouvrés : un lundi sur la vue d'ensemble, chaque jour ouvré en vue serrée
    var d0 = new Date(M.t0); d0.setHours(0, 0, 0, 0);
    for (var n = 0; n < 400; n++) {
      var day = new Date(d0.getTime() + n * 864e5); if (!C.isWorkday(day)) continue;
      if (span > 12 && day.getDay() !== 1) continue;
      var open = new Date(day); open.setHours(M.win.a, 0, 0, 0);
      var w = open >= new Date(M.t0) ? C.openHours(new Date(M.t0), open, M.win.a, M.win.z) / M.win.h : -C.openHours(open, new Date(M.t0), M.win.a, M.win.z) / M.win.h;
      var x2 = xOf(w); if (x2 < c.pl - 1) continue; if (x2 > c.pl + pw + 1) break;
      ctx.fillText(day.getDate() + ' ' + MON[day.getMonth()], x2, c.h - 10);
      ctx.strokeStyle = cs.line; ctx.beginPath(); ctx.moveTo(Math.round(x2) + .5, c.pt + ph); ctx.lineTo(Math.round(x2) + .5, c.pt + ph + 4); ctx.stroke();
    }
    ctx.strokeStyle = cs.line; ctx.strokeRect(.5, .5, c.w - 1, c.h - 1);
  }

  // ── Chiffres en direct ─────────────────────────────────────────────
  function stats(t) {
    var i = M.cur, tot = M.tds.map(function () { return { o: 0, d: 0 }; });
    M.tds.forEach(function (td, r) { var p = M.counts[r][i]; tot[r].o = p.open; tot[r].d = p.done; });
    M.tds.forEach(function (td, r) {
      var n = tot[r].o + tot[r].d, pc = n ? Math.round(100 * tot[r].d / n) : 0;
      $('mvPc' + r).textContent = pc; $('mvBr' + r).style.width = pc + '%';
      $('mvSub' + r).textContent = tot[r].o + ' ouverts · ' + tot[r].d + ' terminés · ' + n + ' au total';
    });
    var ent = 0, rem = 0, tr = 0, mv = 0, cl = 0, push = 0, pull = 0, back = 0;
    if (i > 0) for (var j = 0; j < M.tk.length; j++) {
      var a = M.st[i - 1][j], b = M.st[i][j]; if (!b) continue;
      if (!a) { if (b.kind === 'board') ent++; continue; }
      if (a.kind === b.kind && a.kind === 'board') { if (a.row !== b.row) { if (b.row > a.row) push++; else pull++; } else if (a.col !== b.col) { mv++; if (b.col < a.col) back++; if (M.doneCols[b.col] && !M.doneCols[a.col]) cl++; } }
      else if (b.kind === 'cloud' && a.kind !== 'cloud') rem++;
      else if (b.kind === 'trash' && a.kind !== 'trash') tr++;
      else if (a.kind === 'cloud' && b.kind === 'board') ent++;
    }
    $('mvFlow').innerHTML = i === 0 ? '<span>Première photo : état de départ</span>' :
      '<span class="mv-pos">+' + ent + ' entrés</span><span class="mv-neg">−' + rem + ' sortis (nuage)</span><span class="mv-neg">' + tr + ' à la poubelle</span><span>' + mv + ' changements de statut</span><span class="mv-neg">' + back + ' reculs</span><span class="mv-neg">' + push + ' repoussés</span><span class="mv-pos">' + pull + ' ramenés</span><span class="mv-pos">' + cl + ' clôturés</span>';
    $('mvFlowLbl').textContent = i === 0 ? 'Photo 1 / ' + M.T.length : 'Photo ' + (i + 1) + ' / ' + M.T.length + ' · depuis la précédente (' + Math.round((M.T[i] - M.T[i - 1]) * M.win.h) + ' h ouvrées)';
  }

  function render() {
    if (!M || !$('mvBoard')) return;
    readTheme();
    drawBoard(ui.t); drawChart(ui.t); stats(ui.t);
    $('mvDate').textContent = label(ui.t);
    $('mvSlider').value = Math.round(ui.t / M.T[M.T.length - 1] * 6000);
  }
  var last = 0, raf = 0;
  function frame(ts) {
    raf = 0; if (!M || !$('mvBoard')) return;
    if (ui.playing) {
      var dt = Math.min(.1, (ts - last) / 1000), end = M.T[M.T.length - 1];
      ui.t += dt * ui.speed * 1.2; if (ui.t >= end) { ui.t = end; setPlay(false); }
      render();
    }
    last = ts; if (ui.playing) raf = requestAnimationFrame(frame);
  }
  function setPlay(on) {
    ui.playing = on; var b = $('mvPlay'); if (b) b.textContent = on ? '❚❚ Pause' : '▶ Lire';
    if (on) { if (ui.t >= M.T[M.T.length - 1] - .01) ui.t = 0; last = performance.now(); if (!raf) raf = requestAnimationFrame(frame); }
  }

  // ── Mise en page de la carte ───────────────────────────────────────
  function sizeCanvases() {
    var host = $('mvHost'); if (!host || !M) return;
    var w = host.clientWidth || 900;
    layout(w);
    fit($('mvBoard'), G.W, G.H);
    CH.w = Math.max(560, w); fit($('mvChart'), CH.w, CH.h);
    render();
  }
  function legendHtml() {
    return ui.color === 'team'
      ? M.teamLabels.map(function (l) { return '<span><i class="mv-sw" style="background:' + M.teamColors[l] + '"></i>' + esc(l) + '</span>'; }).join('')
      : M.tds.map(function (td, r) { return '<span><i class="mv-sw" style="background:' + VERSION_COLORS[r % VERSION_COLORS.length] + '"></i>' + esc(C.fmtDate(new Date(td + 'T00:00:00'))) + '</span>'; }).join('');
  }
  function mount(rootEl) {
    var tiles = M.tds.map(function (td, r) {
      var col = VERSION_COLORS[r % VERSION_COLORS.length];
      return '<div class="mv-tile"><div class="mv-tt"><i class="mv-sw" style="background:' + col + '"></i>Version du ' + esc(C.fmtDate(new Date(td + 'T00:00:00'))) + '</div>' +
        '<div class="mv-big"><span id="mvPc' + r + '">0</span><small>% terminé</small></div><div class="mv-bar"><i id="mvBr' + r + '" style="background:' + col + '"></i></div><div class="mv-sub" id="mvSub' + r + '"></div></div>';
    }).join('');
    var nOpts = [0, 1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (ui.nVers === n ? ' selected' : '') + '>' + (n === 0 ? 'Toutes les versions' : n === 1 ? 'La dernière version' : 'Les ' + n + ' dernières') + '</option>'; }).join('');
    rootEl.innerHTML = '<div class="card" id="mvCard"><div class="card-head"><div><h2>🎬 Bug movie</h2>' +
      '<div class="sub">Les photos du journal rejouées : chaque ticket est un point qui avance de statut en statut. Un ticket sorti de la version part dans le nuage, un ticket rejeté va à la poubelle. Un ticket change de place à la photo où on le voit ailleurs, pas avant. Les photos ne sont pas filtrées.</div></div>' +
      '<div class="card-tools"><select class="dim-select" id="mvN" aria-label="Versions affichées">' + nOpts + '</select></div></div>' +
      '<div id="mvHost"><div class="mv-tiles">' + tiles + '</div>' +
      '<div class="mv-flow"><div class="mv-lbl" id="mvFlowLbl"></div><div class="mv-row" id="mvFlow"></div></div>' +
      '<div class="mv-ctl"><button type="button" class="ghost small" id="mvPlay">▶ Lire</button><input type="range" id="mvSlider" min="0" max="6000" value="0" aria-label="Date de l\'animation"><span class="mv-date" id="mvDate"></span>' +
      '<span class="seg" role="group" aria-label="Vitesse">' + [[.5, '×0,5'], [1, '×1'], [2, '×2'], [4, '×4']].map(function (s) { return '<button type="button" data-mv-speed="' + s[0] + '"' + (ui.speed === s[0] ? ' class="is-on"' : '') + '>' + s[1] + '</button>'; }).join('') + '</span></div>' +
      '<div class="mv-scroll"><canvas id="mvBoard"></canvas></div>' +
      '<div class="mv-legend" id="mvLegend">' + legendHtml() + '<span>Anneau : vient de bouger</span>' + LEG2 + '</div>' +
      '<div class="mv-scroll"><canvas id="mvChart"></canvas></div>' +
      '<div class="mv-ctl"><span class="mv-hint">Axe du temps</span><span class="seg" role="group" aria-label="Mode de l\'axe"><button type="button" data-mv-axis="fixed"' + (ui.axis === 'fixed' ? ' class="is-on"' : '') + '>Axe fixe, la barre avance</button><button type="button" data-mv-axis="scroll"' + (ui.axis === 'scroll' ? ' class="is-on"' : '') + '>Barre fixe, l\'axe défile</button></span>' +
      '<span class="mv-hint">Couleur des points</span><span class="seg" role="group" aria-label="Couleur des points"><button type="button" data-mv-color="team"' + (ui.color === 'team' ? ' class="is-on"' : '') + '>Équipe</button><button type="button" data-mv-color="version"' + (ui.color === 'version' ? ' class="is-on"' : '') + '>Version</button></span></div></div></div>';
    $('mvN').addEventListener('change', function () { ui.nVers = +this.value; ui.built = null; renderMovie(true); });
    $('mvPlay').addEventListener('click', function () { setPlay(!ui.playing); });
    $('mvSlider').addEventListener('input', function () { ui.t = this.value / 6000 * M.T[M.T.length - 1]; render(); });
    rootEl.addEventListener('click', function (e) {
      var s = e.target.closest('[data-mv-speed]'), a = e.target.closest('[data-mv-axis]'), c = e.target.closest('[data-mv-color]');
      var pick = function (btn, attr, fn) { fn(btn.getAttribute(attr)); [].forEach.call(btn.parentNode.children, function (x) { x.classList.toggle('is-on', x === btn); }); };
      if (s) pick(s, 'data-mv-speed', function (v) { ui.speed = +v; });
      if (a) { pick(a, 'data-mv-axis', function (v) { ui.axis = v; }); render(); }
      if (c) { pick(c, 'data-mv-color', function (v) { ui.color = v; }); $('mvLegend').innerHTML = legendHtml() + '<span>Anneau : vient de bouger</span>' + LEG2; render(); }
    });
    sizeCanvases();
  }

  // ── Rendu (appelé à chaque rerender de l'application) ──────────────
  function renderMovie(force) {
    // Avec des données analysées, la carte suit l'évolution dans le tableau de bord ;
    // sans, elle se pose sous le journal, comme lui.
    var dash = $('dashboard'), hasData = dash && !dash.classList.contains('hidden');
    var rootEl = $(hasData ? 'movieRoot' : 'emptyMovieRoot'), other = $(hasData ? 'emptyMovieRoot' : 'movieRoot');
    if (!rootEl) return; if (other && other.innerHTML) other.innerHTML = '';
    var items = HI && HI.get ? HI.get().items : [];
    var sig = items.length + '|' + (items.length ? items[items.length - 1].at : '') + '|' + ui.nVers;
    if (!force && ui.built === sig && rootEl.querySelector('#mvBoard')) return;
    ui.built = sig; ui.playing = false;
    M = build(items, ui.nVers);
    if (!M) { rootEl.innerHTML = items.length ? '<div class="card"><h2>🎬 Bug movie</h2><div class="sub">Il faut au moins deux photos du journal qui contiennent une même version (Target date, 5 tickets minimum) pour rejouer son mouvement.</div></div>' : ''; return; }
    ui.t = Math.min(ui.t, M.T[M.T.length - 1]) || M.T[M.T.length - 1] * .5;
    mount(rootEl);
  }
  APP.hooks.render.push(function () { renderMovie(false); });
  var rz = 0; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (M && $('mvBoard')) sizeCanvases(); }, 120); });
  root.BDV2Movie = { render: function () { renderMovie(false); }, build: build, rejectReason: rejectReason };
})(window);
