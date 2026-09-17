/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — rendu des graphiques (HTML/SVG, sans librairie).
   Styles d'une carte pivot : hstack, vstack, heatmap, bars, donut, table.
   Chaque mark cliquable porte des attributs data-dd (résolus par app.js
   en drill-down) ; chaque carte ≥ 2 séries a une légende ; le survol
   affiche une infobulle commune.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core, P = root.BDV2Palette;
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var attr = function (o) { return Object.keys(o).map(function (k) { return o[k] == null ? '' : ' data-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }) + '="' + esc(o[k]) + '"'; }).join(''); };

  // ── KPI ────────────────────────────────────────────────────────────
  // tile : { id, label, value, unit, sub, tone, delta:{value,label,goodUp}, spark:[..], dd }
  function renderTiles(el, tiles) {
    el.innerHTML = tiles.map(function (t) {
      var delta = '';
      if (t.delta && t.delta.value != null && !isNaN(t.delta.value)) {
        var v = t.delta.value, cls = v === 0 ? 'flat' : ((v > 0) === !!t.delta.goodUp ? 'up' : 'down');
        var sign = v > 0 ? '+' : (v < 0 ? '−' : '±');
        delta = '<span class="delta ' + cls + '" title="' + esc(t.delta.label || 'vs analyse précédente') + '">' + sign + Math.abs(v) + (t.delta.unit || '') + '</span>';
      }
      var spark = t.spark && t.spark.length > 1 ? sparkline(t.spark, t.tone) : '';
      return '<div class="kpi tone-' + (t.tone || 'accent') + (spark ? ' has-spark' : '') + '"' + attr({ dd: t.dd || '', ddKpi: t.id }) + ' title="Cliquer pour voir les tickets">' +
        '<div class="label">' + esc(t.label) + '</div>' +
        '<div class="value">' + esc(t.value) + (t.unit ? '<small>' + esc(t.unit) + '</small>' : '') + delta + '</div>' +
        '<div class="sub">' + esc(t.sub || '') + '</div>' + spark + '</div>';
    }).join('');
  }

  function sparkline(values, tone) {
    var w = 84, h = 26, n = values.length;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (max === min) { max = min + 1; }
    var pts = values.map(function (v, i) { return [(i / (n - 1)) * (w - 4) + 2, h - 3 - ((v - min) / (max - min)) * (h - 6)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    var col = '#B9C0CC';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5" fill="#0C1A2E" stroke="#fff" stroke-width="2"/></svg>';
  }

  // ── Légende ────────────────────────────────────────────────────────
  function legend(keys, colors, dim) {
    if (!keys || keys.length < 2) return '';
    return '<div class="legend">' + keys.map(function (k) {
      return '<span class="legend-item"' + attr({ dd: 'col', dim: dim, key: k }) + '><span class="dot" style="background:' + colors[k] + '"></span>' + esc(k) + '</span>';
    }).join('') + '</div>';
  }

  // ── Cartes pivot ───────────────────────────────────────────────────
  // ctx : { pivot, style, measure, colors (par clé de colonne, ou de ligne si 1D), rowColors, card }
  function renderPivot(ctx) {
    var pv = ctx.pivot;
    if (!pv.rows.length) return '<div class="empty">Aucun ticket dans la sélection.</div>';
    var oneD = !pv.colDim;
    var fn = { hstack: hstack, vstack: vstack, heatmap: heatmap, split: splitHeatmap, bars: bars, donut: donut, table: table,
      nest: nest, subcols: subcols, nestbars: nestbars }[ctx.style] || hstack;
    if (oneD && (ctx.style === 'hstack' || ctx.style === 'vstack' || ctx.style === 'heatmap' || ctx.style === 'split')) fn = bars;
    if (!oneD && ctx.style === 'donut') fn = hstack;
    // Les trois placements à trois niveaux n'ont rien à poser tant que la carte
    // n'a pas de découpage : sans lui, la carte retombe sur l'empilé horizontal
    // plutôt que d'afficher un tableau à une seule colonne.
    if ((fn === nest || fn === subcols || fn === nestbars) && !pv.splitDim) fn = hstack;
    // Séparer en cours et terminé n'a de sens que sur des statuts : ailleurs,
    // la carte retombe sur la heatmap ordinaire plutôt que de mentir.
    if (fn === splitHeatmap && pv.colDim !== 'status') fn = heatmap;
    return fn(ctx, oneD);
  }

  function cellAttrs(ctx, r, c) {
    var pv = ctx.pivot;
    return attr({ dd: 'cell', card: ctx.card.id, rdim: pv.rowDim, rkey: r, cdim: pv.colDim || '', ckey: pv.colDim ? c : '' });
  }
  function tipAttr(text) { return ' data-tip="' + esc(text) + '"'; }
  function fmt(v, measure) { return C.formatMeasure(v, measure); }
  function segLabel(count, widthPx) { return widthPx >= 22 ? String(count) : ''; }

  function hstack(ctx) {
    var pv = ctx.pivot, colors = ctx.colors, measure = ctx.measure;
    var h = pv.rows.map(function (r) {
      var rt = pv.rowTotal(r);
      var segs = pv.cols.map(function (c) {
        var cell = pv.cell(r, c); if (!cell.count) return '';
        var w = (cell.count / pv.rowMax * 100).toFixed(2);
        var mv = C.measureValue(cell, measure, pv, r, c);
        var tip = r + ' · ' + c + ' : ' + cell.count + ' ticket' + (cell.count > 1 ? 's' : '') + (measure !== 'count' ? ' — ' + fmt(mv, measure) : '') + ' (' + (cell.count / rt.count * 100).toFixed(0) + '% de la ligne)';
        return '<div class="hs-seg" style="width:' + w + '%;background:' + colors[c] + ';color:' + P.textOn(colors[c]) + '"' + cellAttrs(ctx, r, c) + tipAttr(tip) + '><span class="seg-txt">' + (measure === 'count' ? cell.count : fmt(mv, measure)) + '</span></div>';
      }).join('');
      var rowVal = measure === 'progress' ? fmt(rt.count ? rt.pctSum / rt.count : 0, 'progress') : rt.count;
      return '<div class="hs-row"><div class="hs-label"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + ' title="' + esc(r) + '">' + esc(r) + '</div><div class="hs-track">' + segs + '</div><div class="hs-total">' + rowVal + '</div></div>';
    }).join('');
    return h + legend(pv.cols, colors, pv.colDim);
  }

  function vstack(ctx) {
    var pv = ctx.pivot, colors = ctx.colors, measure = ctx.measure;
    var h = '<div class="vs-wrap">' + pv.rows.map(function (r) {
      var rt = pv.rowTotal(r);
      var fill = (rt.count / pv.rowMax * 100).toFixed(2);
      var segs = pv.cols.map(function (c) {
        var cell = pv.cell(r, c); if (!cell.count) return '';
        var hp = (cell.count / rt.count * 100).toFixed(2);
        var mv = C.measureValue(cell, measure, pv, r, c);
        var tip = r + ' · ' + c + ' : ' + cell.count + ' ticket' + (cell.count > 1 ? 's' : '') + (measure !== 'count' ? ' — ' + fmt(mv, measure) : '');
        return '<div class="vs-seg" style="height:' + hp + '%;background:' + colors[c] + ';color:' + P.textOn(colors[c]) + '"' + cellAttrs(ctx, r, c) + tipAttr(tip) + '><span class="seg-txt">' + cell.count + '</span></div>';
      }).join('');
      var rowVal = measure === 'progress' ? fmt(rt.count ? rt.pctSum / rt.count : 0, 'progress') : rt.count;
      return '<div class="vs-col"><div class="vs-total">' + rowVal + '</div><div class="vs-track"><div class="vs-fill" style="height:' + fill + '%">' + segs + '</div></div><div class="vs-label"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '>' + esc(r) + '</div></div>';
    }).join('') + '</div>';
    return h + legend(pv.cols, colors, pv.colDim);
  }

  // Heatmap scindée : les statuts en cours à gauche, les terminés à droite,
  // séparés par un filet, chaque bloc avec sa colonne de sous-total, et une
  // rampe par bloc — bleu « en cours », vert « terminé », les couleurs que
  // l'outil donne déjà à ces deux états. L'échelle d'intensité reste commune :
  // un 5 bleu et un 5 vert pèsent pareil. La carte porte donc la distinction
  // elle-même, sans rien demander au filtre d'état de la barre.
  function splitHeatmap(ctx) {
    var pv = ctx.pivot, measure = ctx.measure, cfg = root.BDV2Config.get();
    var doneKeys = (cfg.statuses.done || []).map(C.normalize);
    var isDone = function (c) { return doneKeys.indexOf(C.normalize(c)) !== -1; };
    var gOpen = pv.cols.filter(function (c) { return !isDone(c); });
    var gDone = pv.cols.filter(isDone);
    ctx.split = { open: gOpen, done: gDone };

    var vals = {}, max = 0;
    pv.rows.forEach(function (r) {
      vals[r] = {};
      pv.cols.forEach(function (c) { var v = C.measureValue(pv.cell(r, c), measure, pv, r, c); vals[r][c] = v; if (v > max) max = v; });
    });
    // Cellules d'un bloc, agrégées : le sous-total parle la même mesure que les
    // cellules. Deux mesures n'ont pas de sens ici et deviennent « % du total »,
    // la seule lecture qui en garde un : « % de la colonne », faute de colonne
    // unique, et « % de la ligne » sur la ligne Total, faute de ligne.
    function groupCell(r, cols) {
      var g = { count: 0, pctSum: 0, tickets: [] };
      cols.forEach(function (c) { var cell = r == null ? pv.colTotal(c) : pv.cell(r, c); g.count += cell.count; g.pctSum += cell.pctSum; });
      return g;
    }
    function groupVal(r, cols) {
      var m = measure === 'shareCol' || (r == null && measure === 'shareRow') ? 'shareTotal' : measure;
      return C.measureValue(groupCell(r, cols), m, pv, r, null);
    }
    var gAttr = function (r, g) { return attr({ dd: 'hmgroup', card: ctx.card.id, rdim: pv.rowDim, rkey: r || '', group: g }); };

    // Un bloc peut être vide — un extrait où tout est terminé, par exemple. On
    // garde alors les deux blocs, celui qui est vide affichant un franc zéro :
    // « rien en cours » est une information, pas une panne d'affichage.
    var track = function (n) { return n ? 'repeat(' + n + ', minmax(52px,1fr)) ' : ''; };
    var subW = function (n) { return n ? '68px ' : '96px '; };   // bloc vide : la bande a besoin d'une ligne
    var cols = 'minmax(110px,1.3fr) ' + track(gOpen.length) + subW(gOpen.length) + '14px ' + track(gDone.length) + subW(gDone.length) + '54px';
    var head = function (c) { return '<div class="hm-colhead"' + attr({ dd: 'col', dim: pv.colDim, key: c }) + ' title="' + esc(c) + '">' + esc(c) + '</div>'; };
    var band = function (cls, label, n, span) {
      return '<div class="hm-band ' + cls + '" style="grid-column:span ' + span + '"><span class="dot"></span>' + label +
        '<b>' + esc(fmt(n, measure === 'count' ? 'count' : measure)) + '</b></div>';
    };
    var h = '<div class="hm hm-split" style="grid-template-columns:' + cols + '">';
    h += '<div class="hm-corner"></div>' + band('g-open', 'En cours', groupVal(null, gOpen), gOpen.length + 1) +
      '<div class="hm-gap"></div>' + band('g-done', 'Terminé', groupVal(null, gDone), gDone.length + 1) + '<div class="hm-corner"></div>';
    h += '<div class="hm-corner"></div>' + gOpen.map(head).join('') +
      '<div class="hm-colhead">Σ en cours</div><div class="hm-gap"></div>' +
      gDone.map(head).join('') +
      '<div class="hm-colhead">Σ terminé</div><div class="hm-colhead">Total</div>';
    var cellOf = function (r, c, ramp) {
      var cell = pv.cell(r, c), v = vals[r][c];
      var bg = P.seqColor(v, max, ramp), color = P.textOn(bg);
      var tip = r + ' · ' + c + ' : ' + cell.count + ' ticket' + (cell.count > 1 ? 's' : '') + (measure !== 'count' ? ' — ' + fmt(v, measure) : '');
      return '<div class="hm-cell' + (cell.count ? '' : ' zero') + '" style="background:' + bg + ';color:' + (cell.count ? color : '') + '"' + cellAttrs(ctx, r, c) + tipAttr(tip) + '>' + (cell.count ? fmt(v, measure) : '·') + '</div>';
    };
    var sub = function (r, cols2, cls, g) {
      var n = groupCell(r, cols2).count, v = groupVal(r, cols2);
      return '<div class="hm-sub ' + cls + '"' + gAttr(r, g) + tipAttr(r + ' · ' + (g === 'done' ? 'terminés' : 'en cours') + ' : ' + n + ' ticket' + (n > 1 ? 's' : '')) + '>' + fmt(v, measure) + '</div>';
    };
    pv.rows.forEach(function (r) {
      h += '<div class="hm-rowhead"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + ' title="' + esc(r) + '">' + esc(r) + '</div>' +
        gOpen.map(function (c) { return cellOf(r, c, P.SEQ_BLUE); }).join('') + sub(r, gOpen, 'g-open', 'open') +
        '<div class="hm-gap"></div>' + gDone.map(function (c) { return cellOf(r, c, P.SEQ_GREEN); }).join('') + sub(r, gDone, 'g-done', 'done');
      var rt = pv.rowTotal(r);
      h += '<div class="hm-tot"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '>' + (measure === 'progress' ? fmt(rt.count ? rt.pctSum / rt.count : 0, 'progress') : rt.count) + '</div>';
    });
    var colTot = function (c) { var ct = pv.colTotal(c); return '<div class="hm-tot"' + attr({ dd: 'col', dim: pv.colDim, key: c }) + '>' + (measure === 'progress' ? fmt(ct.count ? ct.pctSum / ct.count : 0, 'progress') : ct.count) + '</div>'; };
    h += '<div class="hm-rowhead">Total</div>' + gOpen.map(colTot).join('') +
      '<div class="hm-tot strong"' + gAttr('', 'open') + '>' + fmt(groupVal(null, gOpen), measure) + '</div><div class="hm-gap"></div>' +
      gDone.map(colTot).join('') + '<div class="hm-tot strong"' + gAttr('', 'done') + '>' + fmt(groupVal(null, gDone), measure) + '</div>' +
      '<div class="hm-tot"><b>' + pv.total + '</b></div>';
    h += '</div>';
    var scale = function (ramp, label) {
      return '<span class="hm-scale">0 <span class="steps">' + ramp.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') + '</span> ' + fmt(max, measure) + ' <span class="muted">— ' + label + '</span></span>';
    };
    h += '<div class="hm-scales">' + scale(P.SEQ_BLUE, 'en cours') + scale(P.SEQ_GREEN, 'terminé') + '</div>';
    return h;
  }

  // ── Cartes à trois niveaux ─────────────────────────────────────────
  // Le « découpage » d'une carte est toujours le niveau le plus fin : il ne
  // remplace ni les lignes ni les colonnes, il vient se poser dessous. Trois
  // placements, dans l'ordre où l'outil les propose :
  //   nest     — les colonnes descendent en sous-lignes sous chaque ligne et le
  //              découpage prend les colonnes : le tableau croisé, à la lettre ;
  //   subcols  — les colonnes restent des bandeaux, que le découpage scinde en
  //              sous-colonnes, teintées comme une heatmap ;
  //   nestbars — même imbriquement que « nest », la ligne devenant une barre
  //              empilée (largeur = volume, coupe = répartition du découpage).
  //
  // Mesures : « % de la ligne » se lit sur la ligne la plus fine — la paire
  // ligne × colonne, dont les cellules du découpage font 100 %. « % de la
  // colonne » n'a plus de colonne unique à quoi se rapporter et devient « % du
  // total », la seule lecture qui en garde un — même parti pris que la heatmap
  // scindée.
  function val3(measure, cell, line, total) {
    if (measure === 'progress') return cell.count ? cell.pctSum / cell.count : 0;
    if (measure === 'count') return cell.count;
    if (measure === 'shareRow') return line && line.count ? cell.count / line.count * 100 : 0;
    return total ? cell.count / total * 100 : 0;
  }
  // Colonnes et lignes de total : « % de la ligne » y vaudrait 100 % partout,
  // on le rapporte donc au total général — la seule référence qui reste.
  function totVal(measure, cell, total) { return val3(measure === 'shareRow' ? 'shareTotal' : measure, cell, null, total); }
  function grandTotal(pv) {
    var g = { count: 0, pctSum: 0, tickets: [] };
    pv.rows.forEach(function (r) { var rt = pv.rowTotal(r); g.count += rt.count; g.pctSum += rt.pctSum; });
    return g;
  }
  // Une clé vide = « toutes » : la même cellule sert au détail, au sous-total
  // et au total, et app.js n'a qu'un seul drill à résoudre.
  function c3Attrs(ctx, r, c, s) { return attr({ dd: 'cell3', card: ctx.card.id, rkey: r || '', ckey: c || '', skey: s || '' }); }
  function tip3(r, c, s, cell, measure, v) {
    var parts = [r, c, s].filter(Boolean);
    return (parts.join(' · ') || 'Total') + ' : ' + cell.count + ' ticket' + (cell.count > 1 ? 's' : '') +
      (measure !== 'count' ? ' — ' + fmt(v, measure) : '');
  }

  function nest(ctx) { return nestTable(ctx, false); }
  function nestbars(ctx) { return nestTable(ctx, true); }

  function nestTable(ctx, withBar) {
    var pv = ctx.pivot, measure = ctx.measure, sc = ctx.splitColors || {};
    var nS = pv.splits.length;
    var tpl = 'minmax(140px,1.4fr) ' + (withBar ? 'minmax(90px,1.5fr) ' : '') + 'repeat(' + nS + ', minmax(62px,1fr)) 58px';
    var tot = function (cell) { return totVal(measure, cell, pv.total); };
    var num = function (cls, cell, v, at, tip) {
      return '<div class="' + cls + (cell.count ? '' : ' zero') + '"' + at + tipAttr(tip) + '>' + (cell.count ? fmt(v, measure) : '·') + '</div>';
    };
    // La barre compte toujours des tickets, à une seule échelle pour les lignes
    // et leurs sous-lignes : c'est un volume, pas la mesure choisie, que les
    // colonnes chiffrées portent déjà.
    var bar = function (r, c, line) {
      if (!withBar) return '';
      var w = pv.rowMax ? line.count / pv.rowMax * 100 : 0;
      var segs = pv.splits.map(function (s) {
        var cell = c ? pv.cell3(r, c, s) : pv.rowSplit(r, s);
        if (!cell.count) return '';
        var col = sc[s] || P.NEUTRAL;
        return '<div class="nst-seg" style="flex:' + cell.count + ';background:' + col + ';color:' + P.textOn(col) + '"' +
          c3Attrs(ctx, r, c, s) + tipAttr(tip3(r, c, s, cell, measure, val3(measure, cell, line, pv.total))) +
          '><span class="seg-txt">' + segLabel(cell.count, pv.rowMax ? cell.count / pv.rowMax * 180 : 0) + '</span></div>';
      }).join('');
      return '<div class="nst-bar"><div class="nst-track" style="width:' + w.toFixed(1) + '%">' + segs + '</div></div>';
    };

    var h = '<div class="hm-scroll"><div class="nst" style="grid-template-columns:' + tpl + '">';
    h += '<div class="nst-corner"></div>' + (withBar ? '<div class="nst-corner"></div>' : '') +
      pv.splits.map(function (s) {
        return '<div class="nst-colhead"' + attr({ dd: 'col', dim: pv.splitDim, key: s }) + ' title="' + esc(s) + '">' +
          '<span class="dot" style="background:' + (sc[s] || P.NEUTRAL) + '"></span><span class="t">' + esc(s) + '</span></div>';
      }).join('') + '<div class="nst-colhead">Total</div>';

    pv.rows.forEach(function (r) {
      var rt = pv.rowTotal(r);
      // Sous-lignes vides passées sous silence : un tableau croisé ne liste pas
      // les croisements sans ticket, il les omet.
      var subs = pv.cols.filter(function (c) { return pv.cell(r, c).count; });
      h += '<div class="nst-grp"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + ' title="' + esc(r) + '">' + esc(r) + '</div>' + bar(r, '', rt);
      pv.splits.forEach(function (s) {
        var g = pv.rowSplit(r, s), v = val3(measure, g, rt, pv.total);
        h += num('nst-gnum', g, v, c3Attrs(ctx, r, '', s), tip3(r, '', s, g, measure, v));
      });
      h += '<div class="nst-gnum strong"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '>' + fmt(tot(rt), measure) + '</div>';
      subs.forEach(function (c) {
        var line = pv.cell(r, c);
        h += '<div class="nst-sub"' + cellAttrs(ctx, r, c) + ' title="' + esc(c) + '"><span class="tick">└</span>' + esc(c) + '</div>' + bar(r, c, line);
        pv.splits.forEach(function (s) {
          var cell = pv.cell3(r, c, s), v = val3(measure, cell, line, pv.total);
          h += num('nst-snum', cell, v, c3Attrs(ctx, r, c, s), tip3(r, c, s, cell, measure, v));
        });
        h += '<div class="nst-snum strong"' + cellAttrs(ctx, r, c) + '>' + fmt(tot(line), measure) + '</div>';
      });
    });

    var g = grandTotal(pv);
    h += '<div class="nst-rule" style="grid-column:span ' + (nS + (withBar ? 3 : 2)) + '"></div>';
    h += '<div class="nst-totl">Total</div>' + (withBar ? '<div class="nst-totl"></div>' : '') +
      pv.splits.map(function (s) {
        var st = pv.splitTotal(s);
        return '<div class="nst-tnum' + (st.count ? '' : ' zero') + '"' + attr({ dd: 'col', dim: pv.splitDim, key: s }) + '>' +
          (st.count ? fmt(tot(st), measure) : '·') + '</div>';
      }).join('') + '<div class="nst-tnum">' + fmt(tot(g), measure) + '</div>';
    h += '</div></div>';
    if (withBar) h += legend(pv.splits, sc, pv.splitDim) +
      (measure === 'count' ? '' : '<div class="chart-note">La barre compte des tickets ; les colonnes suivent la mesure choisie.</div>');
    return h;
  }

  function subcols(ctx) {
    var pv = ctx.pivot, measure = ctx.measure, sc = ctx.splitColors || {}, cc = ctx.colors || {};
    var nS = pv.splits.length;
    var tot = function (cell) { return totVal(measure, cell, pv.total); };
    var max = 0;
    pv.rows.forEach(function (r) {
      pv.cols.forEach(function (c) {
        var line = pv.cell(r, c);
        pv.splits.forEach(function (s) { var v = val3(measure, pv.cell3(r, c, s), line, pv.total); if (v > max) max = v; });
      });
    });
    var band = 'repeat(' + nS + ', minmax(58px,1fr)) 54px ';
    var tpl = 'minmax(104px,1.2fr) ' + pv.cols.map(function (c, i) { return (i ? '14px ' : '') + band; }).join('') + '54px';
    var gap = function (i) { return i ? '<div class="hm-gap"></div>' : ''; };

    var h = '<div class="hm-scroll"><div class="hm hm-split hm-subcols" style="grid-template-columns:' + tpl + '">';
    h += '<div class="hm-corner"></div>';
    pv.cols.forEach(function (c, i) {
      h += gap(i) + '<div class="hm-band g-flat" style="grid-column:span ' + (nS + 1) + '"' +
        attr({ dd: 'col', dim: pv.colDim, key: c }) + ' title="' + esc(c) + '">' +
        '<span class="dot" style="background:' + (cc[c] || P.NEUTRAL) + '"></span>' + esc(c) +
        '<b>' + fmt(tot(pv.colTotal(c)), measure) + '</b></div>';
    });
    h += '<div class="hm-corner"></div>';
    h += '<div class="hm-corner"></div>';
    pv.cols.forEach(function (c, i) {
      h += gap(i) + pv.splits.map(function (s) {
        return '<div class="hm-colhead"' + attr({ dd: 'col', dim: pv.splitDim, key: s }) + ' title="' + esc(s) + '">' +
          '<span class="dot" style="background:' + (sc[s] || P.NEUTRAL) + '"></span><span class="t">' + esc(s) + '</span></div>';
      }).join('') + '<div class="hm-colhead">Σ</div>';
    });
    h += '<div class="hm-colhead">Total</div>';

    pv.rows.forEach(function (r) {
      h += '<div class="hm-rowhead"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + ' title="' + esc(r) + '">' + esc(r) + '</div>';
      pv.cols.forEach(function (c, i) {
        var line = pv.cell(r, c);
        h += gap(i) + pv.splits.map(function (s) {
          var cell = pv.cell3(r, c, s), v = val3(measure, cell, line, pv.total);
          var bg = P.seqColor(v, max);
          return '<div class="hm-cell' + (cell.count ? '' : ' zero') + '" style="background:' + bg + ';color:' + (cell.count ? P.textOn(bg) : '') + '"' +
            c3Attrs(ctx, r, c, s) + tipAttr(tip3(r, c, s, cell, measure, v)) + '>' + (cell.count ? fmt(v, measure) : '·') + '</div>';
        }).join('') +
          '<div class="hm-sub g-flat' + (line.count ? '' : ' zero') + '"' + cellAttrs(ctx, r, c) +
          tipAttr(tip3(r, c, '', line, measure, tot(line))) + '>' + (line.count ? fmt(tot(line), measure) : '·') + '</div>';
      });
      h += '<div class="hm-tot strong"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '>' + fmt(tot(pv.rowTotal(r)), measure) + '</div>';
    });

    h += '<div class="hm-rowhead">Total</div>';
    pv.cols.forEach(function (c, i) {
      h += gap(i) + pv.splits.map(function (s) {
        var cs = pv.colSplit(c, s);
        return '<div class="hm-tot' + (cs.count ? '' : ' zero') + '"' + c3Attrs(ctx, '', c, s) + '>' + (cs.count ? fmt(tot(cs), measure) : '·') + '</div>';
      }).join('') + '<div class="hm-tot strong"' + attr({ dd: 'col', dim: pv.colDim, key: c }) + '>' + fmt(tot(pv.colTotal(c)), measure) + '</div>';
    });
    h += '<div class="hm-tot"><b>' + fmt(tot(grandTotal(pv)), measure) + '</b></div></div></div>';
    h += '<div class="hm-scales"><span class="hm-scale">0 <span class="steps">' +
      P.SEQ_BLUE.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') +
      '</span> ' + fmt(max, measure) + ' <span class="muted">— intensité = ' + esc(root.BDV2Config.MEASURE_LABELS[measure] || measure).toLowerCase() + '</span></span></div>';
    return h + legend(pv.splits, sc, pv.splitDim);
  }

  function heatmap(ctx) {
    var pv = ctx.pivot, measure = ctx.measure;
    var vals = {}, max = 0;
    pv.rows.forEach(function (r) { vals[r] = {}; pv.cols.forEach(function (c) { var v = C.measureValue(pv.cell(r, c), measure, pv, r, c); vals[r][c] = v; if (v > max) max = v; }); });
    var cols = 'minmax(110px,1.3fr) repeat(' + pv.cols.length + ', minmax(52px,1fr)) 54px';
    var h = '<div class="hm" style="grid-template-columns:' + cols + '">';
    h += '<div class="hm-corner"></div>' + pv.cols.map(function (c) { return '<div class="hm-colhead"' + attr({ dd: 'col', dim: pv.colDim, key: c }) + ' title="' + esc(c) + '">' + esc(c) + '</div>'; }).join('') + '<div class="hm-colhead">Total</div>';
    pv.rows.forEach(function (r) {
      h += '<div class="hm-rowhead"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + ' title="' + esc(r) + '">' + esc(r) + '</div>';
      pv.cols.forEach(function (c) {
        var cell = pv.cell(r, c), v = vals[r][c];
        var bg = P.seqColor(v, max), color = P.textOn(bg);
        var tip = r + ' · ' + c + ' : ' + cell.count + ' ticket' + (cell.count > 1 ? 's' : '') + (measure !== 'count' ? ' — ' + fmt(v, measure) : '');
        h += '<div class="hm-cell' + (cell.count ? '' : ' zero') + '" style="background:' + bg + ';color:' + (cell.count ? color : '') + '"' + cellAttrs(ctx, r, c) + tipAttr(tip) + '>' + (cell.count ? fmt(v, measure) : '·') + '</div>';
      });
      var rt = pv.rowTotal(r);
      h += '<div class="hm-tot"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '>' + (measure === 'progress' ? fmt(rt.count ? rt.pctSum / rt.count : 0, 'progress') : rt.count) + '</div>';
    });
    h += '<div class="hm-rowhead">Total</div>' + pv.cols.map(function (c) { var ct = pv.colTotal(c); return '<div class="hm-tot"' + attr({ dd: 'col', dim: pv.colDim, key: c }) + '>' + (measure === 'progress' ? fmt(ct.count ? ct.pctSum / ct.count : 0, 'progress') : ct.count) + '</div>'; }).join('') + '<div class="hm-tot"><b>' + pv.total + '</b></div>';
    h += '</div>';
    h += '<div class="hm-scale">0 <span class="steps">' + P.SEQ_BLUE.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') + '</span> ' + fmt(max, measure) + ' <span class="muted">— intensité = ' + esc(root.BDV2Config.MEASURE_LABELS[measure] || measure).toLowerCase() + '</span></div>';
    return h;
  }

  function bars(ctx, oneD) {
    var pv = ctx.pivot, measure = ctx.measure;
    if (oneD) {
      var maxv = 0;
      pv.rows.forEach(function (r) { var v = C.measureValue(pv.rowTotal(r), measure, pv, r, '_'); if (v > maxv) maxv = v; });
      if (measure === 'progress') maxv = 100;
      var single = P.CATEGORICAL[0];
      return pv.rows.map(function (r) {
        var rt = pv.rowTotal(r), v = C.measureValue(rt, measure, pv, r, '_');
        var col = measure === 'progress' ? P.progressColor(v) : (ctx.rowColors ? ctx.rowColors[r] : single);
        var tip = r + ' : ' + rt.count + ' ticket' + (rt.count > 1 ? 's' : '') + (measure !== 'count' ? ' — ' + fmt(v, measure) : '') + ' (' + (pv.total ? (rt.count / pv.total * 100).toFixed(0) : 0) + '% du total)';
        return '<div class="bar-row"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + tipAttr(tip) + '><div class="bar-label" title="' + esc(r) + '">' + esc(r) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + (maxv ? v / maxv * 100 : 0).toFixed(1) + '%;background:' + col + '"></div></div><div class="bar-val">' + fmt(v, measure) + '</div></div>';
      }).join('');
    }
    // 2D : barres groupées (une petite barre par colonne dans chaque ligne)
    var colors = ctx.colors, max = 0;
    pv.rows.forEach(function (r) { pv.cols.forEach(function (c) { var v = C.measureValue(pv.cell(r, c), measure, pv, r, c); if (v > max) max = v; }); });
    if (measure === 'progress') max = 100;
    var h = pv.rows.map(function (r) {
      return '<div class="gb-row"><div class="gb-label"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '>' + esc(r) + '</div><div class="gb-bars">' + pv.cols.map(function (c) {
        var cell = pv.cell(r, c); if (!cell.count) return '';
        var v = C.measureValue(cell, measure, pv, r, c);
        var tip = r + ' · ' + c + ' : ' + cell.count + (measure !== 'count' ? ' — ' + fmt(v, measure) : '');
        return '<div class="gb-bar"><div class="gb-track"><div class="gb-fill" style="width:' + (max ? v / max * 100 : 0).toFixed(1) + '%;background:' + colors[c] + '"' + cellAttrs(ctx, r, c) + tipAttr(tip) + '></div></div><div class="gb-val">' + fmt(v, measure) + '</div></div>';
      }).join('') + '</div></div>';
    }).join('');
    return h + legend(pv.cols, colors, pv.colDim);
  }

  function donut(ctx) {
    var pv = ctx.pivot, colors = ctx.rowColors || {};
    var acc = 0, total = pv.total || 1;
    var parts = pv.rows.map(function (r, i) {
      var n = pv.rowTotal(r).count;
      var s = acc / total * 100; acc += n; var e = acc / total * 100;
      var col = colors[r] || P.CATEGORICAL[i % 8];
      // liseré 2px de surface entre les parts (gap "surface")
      return col + ' ' + s.toFixed(2) + '% ' + Math.max(s, e - 0.6).toFixed(2) + '%, #fff ' + Math.max(s, e - 0.6).toFixed(2) + '% ' + e.toFixed(2) + '%';
    });
    var h = '<div class="donut-wrap"><div class="donut" style="background:conic-gradient(' + parts.join(',') + ')"><div class="donut-hole"><div class="n">' + pv.total + '</div><div class="l">tickets</div></div></div>';
    h += '<div class="donut-legend">' + pv.rows.map(function (r, i) {
      var n = pv.rowTotal(r).count;
      return '<div class="donut-legend-item"' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '><span class="dot" style="background:' + (colors[r] || P.CATEGORICAL[i % 8]) + '"></span><span>' + esc(r) + '</span><span class="val">' + n + ' (' + (n / total * 100).toFixed(0) + '%)</span></div>';
    }).join('') + '</div></div>';
    return h;
  }

  function table(ctx, oneD) {
    var pv = ctx.pivot, measure = ctx.measure;
    var h = '<div style="overflow-x:auto"><table><thead><tr><th>' + esc(C.DIMS[pv.rowDim].label) + '</th>';
    if (!oneD) pv.cols.forEach(function (c) { h += '<th class="num"' + attr({ dd: 'col', dim: pv.colDim, key: c }) + '>' + esc(c) + '</th>'; });
    h += '<th class="num">Tickets</th>' + (measure === 'progress' || oneD ? '<th>Avancement pondéré</th><th class="num">%</th>' : '') + '</tr></thead><tbody>';
    pv.rows.forEach(function (r) {
      var rt = pv.rowTotal(r), pct = rt.count ? rt.pctSum / rt.count : 0;
      h += '<tr' + attr({ dd: 'row', dim: pv.rowDim, key: r }) + '><td>' + esc(r) + '</td>';
      if (!oneD) pv.cols.forEach(function (c) { var cell = pv.cell(r, c); h += '<td class="num"' + (cell.count ? cellAttrs(ctx, r, c) : '') + '>' + (cell.count ? fmt(C.measureValue(cell, measure === 'progress' ? 'count' : measure, pv, r, c), measure === 'progress' ? 'count' : measure) : '<span class="dd-empty">·</span>') + '</td>'; });
      h += '<td class="num"><b>' + rt.count + '</b></td>';
      if (measure === 'progress' || oneD) h += '<td><div class="pct-track"><div class="pct-fill" style="width:' + pct.toFixed(1) + '%;background:' + P.progressColor(pct) + '"></div></div></td><td class="num">' + pct.toFixed(1) + '%</td>';
      h += '</tr>';
    });
    h += '</tbody><tfoot><tr><td>Total</td>';
    if (!oneD) pv.cols.forEach(function (c) { h += '<td class="num"' + attr({ dd: 'col', dim: pv.colDim, key: c }) + '>' + pv.colTotal(c).count + '</td>'; });
    var all = pv.rows.reduce(function (a, r) { var rt = pv.rowTotal(r); a.count += rt.count; a.pctSum += rt.pctSum; return a; }, { count: 0, pctSum: 0 });
    h += '<td class="num">' + all.count + '</td>' + (measure === 'progress' || oneD ? '<td></td><td class="num">' + (all.count ? (all.pctSum / all.count).toFixed(1) : '0.0') + '%</td>' : '') + '</tr></tfoot></table></div>';
    return h;
  }

  // ── Infobulle commune ──────────────────────────────────────────────
  function initTooltip() {
    var tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
    var cur = null;
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tip]'); if (!el) { if (cur) { cur = null; tip.classList.remove('is-on'); } return; }
      cur = el; tip.innerHTML = esc(el.dataset.tip).replace(/ : /, ' : <b>').replace(/( —| \(|$)/, '</b>$1'); tip.classList.add('is-on');
    });
    document.addEventListener('mousemove', function (e) {
      if (!cur) return;
      var x = e.clientX + 14, y = e.clientY + 14;
      var r = tip.getBoundingClientRect();
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
    document.addEventListener('mouseout', function (e) { if (cur && !e.relatedTarget) { cur = null; tip.classList.remove('is-on'); } });
  }

  // ── Courbe multi-séries (évolution, lot 3) ─────────────────────────
  // series : [{label, color, values:[...]}], labels : ['09.09', ...]
  // ── Histogrammes ───────────────────────────────────────────────────
  // Trois formes, même repère que la courbe : barres groupées (comparer des
  // séries entre elles), empilées (composition d'un total), et bandes empilées
  // à 100 % (part de chaque série). Extrémité arrondie côté valeur, 2 px de
  // fond entre deux remplissages — les segments restent distincts sans trait.
  function barPath(x, y, w, h, r) {
    if (h <= 0.2) return '';
    r = Math.min(r || 0, w / 2, h);
    if (!r) return 'M' + x + ' ' + y + ' h' + w + ' v' + h + ' h' + (-w) + ' Z';
    return 'M' + x + ' ' + (y + h) + ' L' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
      ' L' + (x + w - r) + ' ' + y + ' Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) +
      ' L' + (x + w) + ' ' + (y + h) + ' Z';
  }
  function barChart(opts) {
    var series = opts.series, labels = opts.labels, mode = opts.mode || 'group';
    var h = opts.height || 220, n = labels.length, k = series.length;
    var padL = 36, padR = 14, padT = 12, padB = 26;
    var pct = mode === 'percent', stacked = pct || mode === 'stack';
    var totals = labels.map(function (_, i) {
      var t = 0; series.forEach(function (s) { var v = s.values[i]; if (v != null) t += v; }); return t;
    });
    var max = 0;
    if (pct) max = 100;
    else if (stacked) totals.forEach(function (t) { if (t > max) max = t; });
    else series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && v > max) max = v; }); });
    if (!max) max = 1;
    // Ligne de repère : un plafond en tickets. Sans objet sur une échelle en
    // pourcentage, où rien ne se compte en tickets.
    var thr = (!pct && opts.threshold > 0) ? opts.threshold : 0;
    if (thr > max) max = thr;
    var nice = pct ? 100 : niceMax(max), steps = 4;
    // Largeur : on s'élargit et on laisse défiler plutôt que d'aligner des
    // barres illisibles quand le journal compte beaucoup de photos.
    var w = opts.width || 720;
    var need = padL + padR + n * (stacked ? 34 : Math.max(k * 9 + 12, 34));
    var scroll = need > w;
    if (scroll) w = need;
    var plot = w - padL - padR, band = plot / Math.max(n, 1);
    var inner = Math.min(band * 0.78, stacked ? 46 : 120);
    var yOf = function (v) { return padT + (1 - v / nice) * (h - padT - padB); };
    var g = '';
    for (var i = 0; i <= steps; i++) {
      var gv = nice * i / steps, gy = yOf(gv);
      g += '<line class="grid" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>' +
        '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + fmtTick(gv, pct ? '%' : opts.unit) + '</text>';
    }
    var lx = '', every = Math.max(1, Math.ceil(n / (scroll ? 30 : 9)));
    var bars = '';
    labels.forEach(function (lab, i) {
      var cx = padL + band * i + band / 2;
      if (i % every === 0 || i === n - 1) lx += '<text x="' + cx.toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle">' + esc(lab) + '</text>';
      if (stacked) {
        var x = cx - inner / 2, acc = 0, tot = totals[i];
        // du bas vers le haut : seul le segment de tête porte l'arrondi
        var stack = series.map(function (s) { return { s: s, v: s.values[i] == null ? 0 : s.values[i] }; }).filter(function (o) { return o.v > 0; });
        stack.forEach(function (o, j) {
          var val = pct ? (tot ? o.v / tot * 100 : 0) : o.v;
          var y0 = yOf(acc), y1 = yOf(acc + val), hh = y0 - y1;
          var top = j === stack.length - 1;
          var gap = top ? 0 : 2;
          var tip = lab + ' — ' + o.s.label + ' : ' + fmtTick(o.v, opts.unit) + (pct && tot ? ' (' + Math.round(o.v / tot * 100) + ' %)' : '');
          bars += '<path class="bar" d="' + barPath(x, y1, inner, Math.max(hh - gap, 0), top ? 4 : 0) + '" fill="' + o.s.color + '" data-tip="' + esc(tip) + '"/>';
          acc += val;
        });
      } else {
        var bw = Math.max((inner - 2 * (k - 1)) / k, 1.5);
        series.forEach(function (s, j) {
          var v = s.values[i]; if (v == null || v <= 0) return;
          var bx = cx - inner / 2 + j * (bw + 2), by = yOf(v), bh = yOf(0) - by;
          bars += '<path class="bar" d="' + barPath(bx, by, bw, bh, 4) + '" fill="' + s.color + '" data-tip="' +
            esc(lab + ' — ' + s.label + ' : ' + fmtTick(v, opts.unit)) + '"/>';
        });
      }
    });
    var thrEl = '';
    if (thr) {
      var ty = yOf(thr);
      thrEl = '<line class="thr" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '"/>' +
        '<text class="thr-l" x="' + (w - padR - 2) + '" y="' + (ty - 5).toFixed(1) + '" text-anchor="end">' + fmtTick(thr, opts.unit) + esc(opts.thresholdLabel ? ' ' + opts.thresholdLabel : '') + '</text>';
    }
    var svg = '<svg class="lc bc" viewBox="0 0 ' + w + ' ' + h + '"' + (scroll ? ' width="' + w + '" height="' + h + '"' : '') + ' role="img">' +
      g + '<line class="axis" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + yOf(0).toFixed(1) + '" y2="' + yOf(0).toFixed(1) + '"/>' + lx + bars + thrEl + '</svg>';
    if (scroll) svg = '<div class="chart-scroll">' + svg + '</div>';
    return svg + (k >= 2 ? '<div class="legend">' + series.map(function (s) {
      return '<span class="legend-item"><span class="dot" style="background:' + s.color + '"></span>' + esc(s.label) + '</span>';
    }).join('') + '</div>' : '');
  }

  // ── Burn-up d'une version ──────────────────────────────────────────
  // Axe des dates réel (et non un cran par photo), rampe de référence du début
  // de version au Code freeze puis plateau, trait « aujourd'hui », et
  // prolongement du rythme observé. On lit l'écart à la rampe d'un coup d'œil.
  function burnupChart(opts) {
    var pts = (opts.points || []).slice().sort(function (a, b) { return a.t - b.t; });
    var h = opts.height || 240, w = opts.width || 720;
    var padL = 36, padR = 16, padT = 14, padB = 26;
    var startPct = opts.startPct == null ? 25 : opts.startPct;
    var t0 = opts.start.getTime(), t1 = opts.end.getTime();
    // Une photo hors des bornes du plan élargit le domaine plutôt que d'être rognée.
    pts.forEach(function (p) { var t = p.t.getTime(); if (t < t0) t0 = t; if (t > t1) t1 = t; });
    if (opts.today) { var tt = opts.today.getTime(); if (tt > t1) t1 = tt; if (tt < t0) t0 = tt; }
    if (t1 <= t0) t1 = t0 + 86400000;
    var plotW = w - padL - padR;
    // Journée de travail (8 h – 19 h par défaut) et compression. Les nuits et
    // les week-ends ne portent
    // presque jamais de données : les supprimer les rendrait invisibles, alors
    // qu'une analyse saisie à 22 h existe. Ils sont donc comprimés — un temps
    // fermé compte pour 1/SQUASH de sa durée — plutôt qu'effacés.
    var OPEN_A = opts.openFrom == null ? 8 : opts.openFrom;
    var OPEN_B = opts.openTo == null ? 19 : opts.openTo;
    // Heures ouvertes d'un intervalle et sa largeur visuelle (voir visualSpan).
    function spans(a, b) {
      if (!(b > a)) return { open: 0, visual: 0 };
      return { open: C.openHours(a, b, OPEN_A, OPEN_B), visual: visualSpan(a, b, OPEN_A, OPEN_B) };
    }
    var vTotal = spans(t0, t1).visual || 1;
    var xOf = function (t) { return padL + spans(t0, Math.max(t0, Math.min(t, t1))).visual / vTotal * plotW; };
    var yOf = function (v) { return padT + (1 - v / 100) * (h - padT - padB); };
    // Valeur attendue à une date. La rampe ne progresse que les jours ouvrés :
    // elle monte du lundi au vendredi, reste plate le week-end, et atteint
    // 100 % au gel. Un écart constaté le lundi matin se lit alors pour ce qu'il
    // est, sans le faux retard qu'ajoutaient deux jours sans personne au travail.
    var fz = opts.deadline ? opts.deadline.getTime() : t1, s0 = opts.start.getTime();
    var workTotal = spans(s0, fz).open || 1;
    var expected = function (t) {
      if (t <= s0) return startPct;
      if (t >= fz) return 100;
      return startPct + (100 - startPct) * spans(s0, t).open / workTotal;
    };
    var g = '';
    for (var i = 0; i <= 4; i++) {
      var gv = i * 25, gy = yOf(gv);
      g += '<line class="grid" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>' +
        '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + gv + '%</text>';
    }
    // graduations de dates : une par jour tant que ça respire, sinon espacées
    var days = Math.max(1, Math.round((t1 - t0) / 86400000));
    var stepD = Math.ceil(days / 8), lx = '';
    for (var d = 0; d <= days; d += stepD) {
      var td = t0 + d * 86400000;
      lx += '<text x="' + xOf(td).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle">' + fmtDay(new Date(td)) + '</text>';
    }
    // Graduations de demi-journées : tout se compte en demi-journées dans le
    // radar — le gel tombe le matin, le reste à courir aussi. Les traits de midi
    // disparaissent quand la fenêtre est trop large pour qu'on les distingue.
    var ticks = '', dayW = plotW * ((OPEN_B - OPEN_A) + (24 - OPEN_B + OPEN_A) / SQUASH) / vTotal;
    var tk = new Date(t0); tk.setHours(0, 0, 0, 0);
    while (tk.getTime() <= t1) {
      for (var hh = 0; hh <= 12; hh += 12) {
        if (hh === 12 && dayW < 26) continue;
        var tt = new Date(tk); tt.setHours(hh);
        if (tt.getTime() < t0 || tt.getTime() > t1) continue;
        var tx2 = xOf(tt.getTime());
        ticks += '<line class="tick' + (hh ? ' half' : '') + '" x1="' + tx2.toFixed(1) + '" x2="' + tx2.toFixed(1) +
          '" y1="' + yOf(0).toFixed(1) + '" y2="' + (yOf(0) + (hh ? 4 : 7)).toFixed(1) + '"/>';
      }
      tk.setDate(tk.getDate() + 1);
    }

    // rampe attendue
    // Un sommet par frontière de journée : c'est ce qui donne les paliers.
    var rEnd = Math.min(fz, t1), rampD = 'M' + xOf(s0).toFixed(1) + ' ' + yOf(startPct).toFixed(1);
    var rd = new Date(s0); rd.setHours(0, 0, 0, 0);
    for (var guard = 0; rd.getTime() < rEnd && guard < 400; guard++) {
      [OPEN_A, OPEN_B].forEach(function (hh) {
        var e = new Date(rd); e.setHours(hh);
        if (e.getTime() > s0 && e.getTime() < rEnd) rampD += ' L' + xOf(e.getTime()).toFixed(1) + ' ' + yOf(expected(e.getTime())).toFixed(1);
      });
      rd.setDate(rd.getDate() + 1);
    }
    rampD += ' L' + xOf(rEnd).toFixed(1) + ' ' + yOf(expected(rEnd)).toFixed(1);
    if (fz < t1) rampD += ' L' + xOf(t1).toFixed(1) + ' ' + yOf(100).toFixed(1);
    var ramp = '<path class="ramp" d="' + rampD + '"/>';
    // jalon qui fait foi (gel de code par défaut, réglable)
    var marks = '';
    if (opts.deadline && fz >= t0 && fz <= t1) {
      marks += '<line class="mark" x1="' + xOf(fz).toFixed(1) + '" x2="' + xOf(fz).toFixed(1) + '" y1="' + padT + '" y2="' + yOf(0).toFixed(1) + '"/>' +
        '<text class="mark-l" x="' + (xOf(fz) - 5).toFixed(1) + '" y="' + (yOf(0) - 6).toFixed(1) + '" text-anchor="end">' + esc(opts.deadlineLabel || 'Code freeze') + '</text>';
    }
    // Week-ends en gris : personne n'avance, alors que la rampe, elle, monte —
    // c'est la moitié de l'explication d'un écart un lundi matin.
    var bands = '', cur = new Date(t0); cur.setHours(0, 0, 0, 0);
    while (cur.getTime() <= t1) {
      var wd = cur.getDay();
      if (wd === 0 || wd === 6) {
        var wx0 = Math.max(xOf(cur.getTime()), padL);
        var nxt = new Date(cur); nxt.setDate(nxt.getDate() + 1);
        var wx1 = Math.min(xOf(nxt.getTime()), w - padR);
        if (wx1 > wx0) bands += '<rect class="weekend" x="' + wx0.toFixed(1) + '" y="' + padT + '" width="' + (wx1 - wx0).toFixed(1) +
          '" height="' + (yOf(0) - padT).toFixed(1) + '"/>';
      }
      cur.setDate(cur.getDate() + 1); // incrément par date : insensible au changement d'heure
    }

    // La date de référence est une journée, pas un instant : on la surligne en
    // entier plutôt que de tirer un trait au milieu de rien.
    if (opts.today) {
      var d0 = new Date(opts.today.getFullYear(), opts.today.getMonth(), opts.today.getDate()).getTime();
      var bx0 = Math.max(xOf(d0), padL), bx1 = Math.min(xOf(d0 + 86400000), w - padR);
      if (bx1 > bx0) marks += '<rect class="today-band" x="' + bx0.toFixed(1) + '" y="' + padT + '" width="' + (bx1 - bx0).toFixed(1) +
        '" height="' + (yOf(0) - padT).toFixed(1) + '"/>';
      marks += '<line class="today" x1="' + bx0.toFixed(1) + '" x2="' + bx0.toFixed(1) + '" y1="' + padT + '" y2="' + yOf(0).toFixed(1) + '"/>' +
        '<text class="mark-l" x="' + (bx0 + 5).toFixed(1) + '" y="' + (yOf(0) - 6).toFixed(1) + '">réf. ' + fmtDay(opts.today) + '</text>';
    }
    // avancement observé
    var dpath = '', dots = '';
    pts.forEach(function (p) {
      var x = xOf(p.t.getTime()), y = yOf(p.v);
      dpath += (dpath ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      var exp = Math.round(expected(p.t.getTime()) * 10) / 10;
      dots += '<circle class="pt" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="' + opts.color + '" data-tip="' +
        esc(p.label + ' — ' + p.v + ' % · attendu ' + exp + ' % · écart ' + (p.v >= exp ? '+' : '') + Math.round((p.v - exp) * 10) / 10 + ' pt') + '"/>';
    });
    var line = dpath ? '<path class="ln" d="' + dpath + '" stroke="' + opts.color + '"/>' : '';
    // Prolongement du rythme observé jusqu'aux 100 %. `rate` est un nombre de
    // points par jour OUVRÉ : le trait avance donc dans le même temps que la
    // rampe et reste plat la nuit et le week-end, au lieu de créditer des
    // journées où personne ne travaille. Il s'arrête au jalon : au-delà, le
    // temps ne compte plus pour cette échéance — le gel tombe le jeudi matin,
    // le jeudi ouvré n'a pas à pousser la courbe jusqu'aux 100 %.
    var proj = '';
    if (pts.length >= 2 && opts.rate > 0) {
      var last = pts[pts.length - 1], dayH = OPEN_B - OPEN_A;
      var needH = (100 - last.v) / opts.rate * dayH;
      if (needH > 0 && Math.min(fz, t1) > last.t.getTime()) {
        var reach = C.addOpenHours(last.t, needH, OPEN_A, OPEN_B);
        var pEnd = Math.min(reach ? reach.getTime() : t1, t1, fz);
        var vAt = function (t) { return Math.min(100, last.v + spans(last.t.getTime(), t).open / dayH * opts.rate); };
        var pd = 'M' + xOf(last.t.getTime()).toFixed(1) + ' ' + yOf(last.v).toFixed(1);
        var pday = new Date(last.t); pday.setHours(0, 0, 0, 0);
        for (var pg = 0; pday.getTime() < pEnd && pg < 400; pg++) {
          [OPEN_A, OPEN_B].forEach(function (hh) {
            var e = new Date(pday); e.setHours(hh, 0, 0, 0);
            if (e.getTime() > last.t.getTime() && e.getTime() < pEnd) pd += ' L' + xOf(e.getTime()).toFixed(1) + ' ' + yOf(vAt(e.getTime())).toFixed(1);
          });
          pday.setDate(pday.getDate() + 1);
        }
        pd += ' L' + xOf(pEnd).toFixed(1) + ' ' + yOf(vAt(pEnd)).toFixed(1);
        proj = '<path class="proj" d="' + pd + '" stroke="' + opts.color + '"/>';
      }
    }
    // écart à la rampe, à la dernière photo : un trait et un nombre, plutôt
    // qu'un aplat coloré qui mentirait dès que les courbes se croisent.
    var gap = '';
    if (pts.length) {
      var lp = pts[pts.length - 1], le = expected(lp.t.getTime()), diff = Math.round((lp.v - le) * 10) / 10;
      var gx = xOf(lp.t.getTime()), gy1 = yOf(lp.v), gy2 = yOf(le), late = diff < 0;
      if (Math.abs(diff) >= 0.5) {
        gap = '<line class="gap" x1="' + gx.toFixed(1) + '" x2="' + gx.toFixed(1) + '" y1="' + gy1.toFixed(1) + '" y2="' + gy2.toFixed(1) +
          '" stroke="' + (late ? 'var(--critical)' : '#006300') + '"/>' +
          '<text class="gap-l" x="' + (gx + 6).toFixed(1) + '" y="' + ((gy1 + gy2) / 2 + 3).toFixed(1) + '" fill="' + (late ? 'var(--critical)' : '#006300') + '">' +
          (diff > 0 ? '+' : '') + diff + ' pt</text>';
      }
    }
    var svg = '<svg class="lc bu" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + bands + g +
      '<line class="axis" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + yOf(0).toFixed(1) + '" y2="' + yOf(0).toFixed(1) + '"/>' +
      ticks + lx + marks + ramp + proj + line + gap + dots + '</svg>';
    return svg + '<div class="legend">' +
      '<span class="legend-item"><span class="dot" style="background:' + opts.color + '"></span>Avancement pondéré</span>' +
      '<span class="legend-item"><span class="dot dash"></span>Attendu — ' + startPct + ' % au début, 100 % au ' + esc(opts.deadlineLabel || 'Code freeze') + ', heures ouvrées seulement (' + OPEN_A + ' h – ' + OPEN_B + ' h)</span>' +
      (proj ? '<span class="legend-item"><span class="dot dash" style="background:' + opts.color + '"></span>Rythme observé prolongé jusqu\'au ' + esc(opts.deadlineLabel || 'Code freeze') + '</span>' : '') +
      '</div>';
  }

  // ── Barres empilées sur le calendrier ──────────────────────────────
  // Même fenêtre et même échelle de temps que le burn-up : une barre par photo,
  // posée à sa date réelle, hauteur = nombre de tickets. On y lit d'un coup le
  // rythme des analyses (les rafales, les week-ends vides) et le périmètre qui
  // bouge — ce qu'une barre par photo régulièrement espacée efface.
  function barTimeChart(opts) {
    var pts = (opts.points || []).slice().sort(function (a, b) { return a.t - b.t; });
    if (!pts.length) return '';
    var series = opts.series || [];
    var h = opts.height || 260, w = opts.width || 720;
    var padL = 40, padR = 16, padT = 14, padB = 28;
    var t0 = opts.start.getTime(), t1 = opts.end.getTime();
    pts.forEach(function (p) { var t = p.t.getTime(); if (t < t0) t0 = t; if (t > t1) t1 = t; });
    if (opts.today) { var tt = opts.today.getTime(); if (tt > t1) t1 = tt; if (tt < t0) t0 = tt; }
    if (t1 <= t0) t1 = t0 + 86400000;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var OPEN_A = opts.openFrom == null ? 8 : opts.openFrom, OPEN_B = opts.openTo == null ? 19 : opts.openTo;
    var vTotal = visualSpan(t0, t1, OPEN_A, OPEN_B) || 1;
    var xOf = function (t) { return padL + visualSpan(t0, Math.max(t0, Math.min(t, t1)), OPEN_A, OPEN_B) / vTotal * plotW; };
    var totalOf = function (p) { var n = 0; series.forEach(function (sr) { n += p.values[sr.key] || 0; }); return n; };
    var maxTot = 0; pts.forEach(function (p) { var n = totalOf(p); if (n > maxTot) maxTot = n; });
    var thr = opts.threshold > 0 ? opts.threshold : 0;
    var nice = niceMax(Math.max(maxTot, thr) || 1), steps = 4;
    var yOf = function (v) { return padT + (1 - v / nice) * plotH; };
    // Largeur des barres : la plus petite distance entre deux photos, bornée —
    // quatre analyses dans la même journée ne doivent pas se chevaucher.
    var gapMin = plotW;
    for (var i = 1; i < pts.length; i++) gapMin = Math.min(gapMin, xOf(pts[i].t.getTime()) - xOf(pts[i - 1].t.getTime()));
    var bw = Math.max(5, Math.min(20, (pts.length > 1 ? gapMin : 40) * 0.8));

    var bands = weekendBands(t0, t1, xOf, padL, w - padR, padT, plotH);
    var g = '';
    for (var k = 0; k <= steps; k++) {
      var gv = nice * k / steps, gy = yOf(gv);
      g += '<line class="grid" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>' +
        '<text x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + fmtTick(gv, opts.unit) + '</text>';
    }
    var days = Math.max(1, Math.round((t1 - t0) / 86400000)), stepD = Math.ceil(days / 8), lx = '';
    for (var d = 0; d <= days; d += stepD) {
      var td = t0 + d * 86400000;
      lx += '<text x="' + xOf(td).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle">' + fmtDay(new Date(td)) + '</text>';
    }
    var marks = '';
    if (opts.today) {
      var d0 = new Date(opts.today.getFullYear(), opts.today.getMonth(), opts.today.getDate()).getTime();
      var bx0 = Math.max(xOf(d0), padL), bx1 = Math.min(xOf(d0 + 86400000), w - padR);
      if (bx1 > bx0) marks += '<rect class="today-band" x="' + bx0.toFixed(1) + '" y="' + padT + '" width="' + (bx1 - bx0).toFixed(1) +
        '" height="' + plotH.toFixed(1) + '"/>';
      // Le libellé va en haut : en bas, les barres lui passeraient dessus.
      marks += '<line class="today" x1="' + bx0.toFixed(1) + '" x2="' + bx0.toFixed(1) + '" y1="' + padT + '" y2="' + yOf(0).toFixed(1) + '"/>' +
        '<text class="mark-l" x="' + (bx0 + 5).toFixed(1) + '" y="' + (padT + 11) + '">réf. ' + fmtDay(opts.today) + '</text>';
    }
    // Ligne de repère : un plafond de tickets qu'on se donne, constant sur toute
    // la fenêtre. Réglable (Configurer → Règles), 0 = pas de ligne.
    var thrEl = '';
    if (thr) {
      var ty = yOf(thr);
      thrEl = '<line class="thr" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '"/>' +
        '<text class="thr-l" x="' + (w - padR - 2) + '" y="' + (ty - 5).toFixed(1) + '" text-anchor="end">' + fmtTick(thr, opts.unit) + esc(opts.thresholdLabel ? ' ' + opts.thresholdLabel : '') + '</text>';
    }
    var bars = '';
    pts.forEach(function (p) {
      var x = xOf(p.t.getTime()) - bw / 2, acc = 0;
      var stack = series.map(function (sr) { return { s: sr, v: p.values[sr.key] || 0 }; }).filter(function (o) { return o.v > 0; });
      stack.forEach(function (o, j) {
        var y0 = yOf(acc), y1 = yOf(acc + o.v), hh = y0 - y1, top = j === stack.length - 1;
        var tip = p.label + ' — ' + o.s.label + ' : ' + fmtTick(o.v, opts.unit) + ' sur ' + totalOf(p);
        bars += '<path class="bar" d="' + barPath(x, y1, bw, Math.max(hh - (top ? 0 : 2), 0), top ? 4 : 0) + '" fill="' + o.s.color + '" data-tip="' + esc(tip) + '"/>';
        acc += o.v;
      });
    });
    var svg = '<svg class="lc bc bt" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + bands + g +
      '<line class="axis" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + yOf(0).toFixed(1) + '" y2="' + yOf(0).toFixed(1) + '"/>' +
      lx + marks + bars + thrEl + '</svg>';
    return svg + '<div class="legend">' +
      series.map(function (sr) { return '<span class="legend-item"><span class="dot" style="background:' + sr.color + '"></span>' + esc(sr.label) + '</span>'; }).join('') +
      (thr ? '<span class="legend-item"><span class="dot dash thr-dot"></span>Repère — ' + fmtTick(thr, opts.unit) + esc(opts.thresholdLabel ? ' ' + opts.thresholdLabel : '') + '</span>' : '') +
      '<span class="legend-item"><span class="dot" style="background:#8d94a3;opacity:.35"></span>Week-end</span>' +
      '</div>';
  }

  function lineChart(opts) {
    var series = opts.series, labels = opts.labels, w = opts.width || 720, h = opts.height || 220;
    var padL = 36, padR = 14, padT = 12, padB = 26;
    var n = labels.length;
    var max = 0; series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && v > max) max = v; }); });
    if (opts.max) max = opts.max;
    if (!max) max = 1;
    var nice = niceMax(max), steps = 4;
    var xOf = function (i) { return n <= 1 ? (padL + (w - padL - padR) / 2) : padL + (i / (n - 1)) * (w - padL - padR); };
    var yOf = function (v) { return padT + (1 - v / nice) * (h - padT - padB); };
    var g = '';
    for (var i = 0; i <= steps; i++) { var v = nice * i / steps, y = yOf(v); g += '<line class="grid" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + fmtTick(v, opts.unit) + '</text>'; }
    var lx = '';
    var every = Math.max(1, Math.ceil(n / 9));
    labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1) lx += '<text x="' + xOf(i).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    var paths = series.map(function (s) {
      var d = '', area = '';
      s.values.forEach(function (v, i) { if (v == null) return; d += (d ? ' L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(v).toFixed(1); });
      if (opts.area && series.length === 1 && d) area = '<path class="area" d="' + d + ' L' + xOf(n - 1).toFixed(1) + ' ' + yOf(0).toFixed(1) + ' L' + xOf(0).toFixed(1) + ' ' + yOf(0).toFixed(1) + ' Z" fill="' + s.color + '"/>';
      var pts = s.values.map(function (v, i) { if (v == null) return ''; return '<circle class="pt" cx="' + xOf(i).toFixed(1) + '" cy="' + yOf(v).toFixed(1) + '" r="4" fill="' + s.color + '" data-tip="' + esc(labels[i] + ' — ' + s.label + ' : ' + fmtTick(v, opts.unit)) + '"' + (opts.pointAttr ? opts.pointAttr(s, i) : '') + '/>'; }).join('');
      return area + '<path class="ln" d="' + d + '" stroke="' + s.color + '"/>' + pts;
    }).join('');
    var svg = '<svg class="lc" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + g + '<line class="axis" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + yOf(0).toFixed(1) + '" y2="' + yOf(0).toFixed(1) + '"/>' + lx + paths + '</svg>';
    var colors = {}; series.forEach(function (s) { colors[s.label] = s.color; });
    return svg + (series.length >= 2 ? '<div class="legend">' + series.map(function (s) { return '<span class="legend-item"><span class="dot" style="background:' + s.color + '"></span>' + esc(s.label) + '</span>'; }).join('') + '</div>' : '');
  }
  // ── Échelle de temps de l'outil ────────────────────────────────────
  // Les nuits et les week-ends ne portent presque jamais de données : les
  // supprimer les rendrait invisibles, alors qu'une analyse saisie à 22 h
  // existe. Ils sont donc comprimés — un temps fermé compte pour 1/SQUASH de
  // sa durée. Le burn-up et les barres d'évolution la partagent, pour que les
  // deux graphiques racontent exactement le même calendrier.
  var SQUASH = 6;
  function visualSpan(a, b, from, to) {
    if (!(b > a)) return 0;
    var open = C.openHours(a, b, from, to);
    return open + ((b - a) / 3600000 - open) / SQUASH;
  }
  // Bandes de week-end et graduations de dates, dans la géométrie de l'appelant.
  function weekendBands(t0, t1, xOf, x0, x1, yTop, hh) {
    var out = '', cur = new Date(t0); cur.setHours(0, 0, 0, 0);
    for (var g = 0; cur.getTime() <= t1 && g < 400; g++) {
      if (!C.isWorkday(cur)) {
        var nx = new Date(cur); nx.setDate(nx.getDate() + 1);
        var a = Math.max(xOf(cur.getTime()), x0), b = Math.min(xOf(nx.getTime()), x1);
        if (b > a) out += '<rect class="weekend" x="' + a.toFixed(1) + '" y="' + yTop + '" width="' + (b - a).toFixed(1) + '" height="' + hh.toFixed(1) + '"/>';
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function niceMax(v) { var p = Math.pow(10, Math.floor(Math.log10(v))); var f = v / p; var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10; return nf * p; }
  function fmtDay(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); }
  function fmtTick(v, unit) { return (Number.isInteger(v) ? v : v.toFixed(1)) + (unit || ''); }

  root.BDV2Charts = { renderTiles: renderTiles, barChart: barChart, barTimeChart: barTimeChart, burnupChart: burnupChart, renderPivot: renderPivot, legend: legend, sparkline: sparkline, initTooltip: initTooltip, lineChart: lineChart };
})(window);
