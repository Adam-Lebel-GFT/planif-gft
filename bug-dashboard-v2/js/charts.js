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
    var fn = { hstack: hstack, vstack: vstack, heatmap: heatmap, bars: bars, donut: donut, table: table }[ctx.style] || hstack;
    if (oneD && (ctx.style === 'hstack' || ctx.style === 'vstack' || ctx.style === 'heatmap')) fn = bars;
    if (!oneD && ctx.style === 'donut') fn = hstack;
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
  function niceMax(v) { var p = Math.pow(10, Math.floor(Math.log10(v))); var f = v / p; var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10; return nf * p; }
  function fmtTick(v, unit) { return (Number.isInteger(v) ? v : v.toFixed(1)) + (unit || ''); }

  root.BDV2Charts = { renderTiles: renderTiles, renderPivot: renderPivot, legend: legend, sparkline: sparkline, initTooltip: initTooltip, lineChart: lineChart };
})(window);
