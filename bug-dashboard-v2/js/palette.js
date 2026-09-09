/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — palettes (validées avec le contrôleur dataviz :
   bande de luminosité, plancher de chroma, séparation daltonisme).
   - catégoriel : 8 teintes en ordre FIXE, jamais cyclées (la couleur suit
     l'entité, pas son rang d'affichage) ;
   - priorités : rampe ordinale rouge, une seule teinte, clair → foncé =
     Trivial → Blocker ;
   - heatmap : rampe séquentielle bleue ;
   - statut (bon/alerte/critique) : réservé aux indicateurs qui portent
     un jugement, jamais réutilisé pour une série.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var N = root.BDV2Core.normalize;

  var CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  var PRIORITY_RAMP = ['#7a1a1a', '#a52a2a', '#c9463f', '#e46a5f', '#f39a8c'];   // sévère → léger
  var SEQ_BLUE = ['#eef4fc', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab', '#0d366b'];
  var STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
  var NEUTRAL = '#8d94a3';
  var SWATCHES = CATEGORICAL.concat(PRIORITY_RAMP, ['#0d366b', '#5b8def', '#14b8a6', '#c026d3', '#6366f1', NEUTRAL]);

  function hexToRgb(h) { var x = h.replace('#', ''); if (x.length === 3) x = x.split('').map(function (c) { return c + c; }).join(''); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
  function luminance(h) {
    var c = hexToRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // Texte posé DANS une teinte : blanc ou encre selon la luminance de la teinte.
  function textOn(hex) { return luminance(hex) > 0.36 ? '#0b1a2e' : '#ffffff'; }

  function seqColor(v, max) {
    if (!max || v <= 0) return SEQ_BLUE[0];
    var i = Math.min(SEQ_BLUE.length - 1, 1 + Math.floor((v / max) * (SEQ_BLUE.length - 2) + 0.0001));
    if (v >= max) i = SEQ_BLUE.length - 1;
    return SEQ_BLUE[i];
  }
  function progressColor(p) { return p >= 90 ? STATUS.good : p >= 50 ? CATEGORICAL[0] : STATUS.serious; }

  // Couleur par entité pour une dimension. `allKeys` = toutes les clés vues
  // dans le jeu complet (non filtré) pour que la couleur reste stable quand
  // un filtre retire des séries.
  function colorsForDim(dim, allKeys, cfg, tickets) {
    var C = root.BDV2Core;
    var map = {};
    if (dim === 'team') {
      var rawByLabel = {};
      tickets.forEach(function (t) { rawByLabel[t.teamLabel] = t.team; });
      var ordered = C.DIMS.team.order(allKeys, cfg, tickets);
      ordered.forEach(function (k, i) {
        var raw = rawByLabel[k] || k;
        map[k] = (cfg.teams.colors && cfg.teams.colors[raw]) || CATEGORICAL[i % CATEGORICAL.length];
      });
    } else if (dim === 'status') {
      var st = C.DIMS.status.order(allKeys, cfg, tickets);
      st.forEach(function (k, i) { map[k] = (cfg.statuses.colors && cfg.statuses.colors[N(k)]) || CATEGORICAL[i % CATEGORICAL.length]; });
    } else if (dim === 'priority') {
      var keyByLabel = {};
      tickets.forEach(function (t) { keyByLabel[t.priorityLabel] = t.priorityKey; });
      var pr = C.DIMS.priority.order(allKeys, cfg, tickets);
      var n = pr.length;
      pr.forEach(function (k, i) {
        var pk = keyByLabel[k] || N(k);
        var custom = cfg.priorities.colors && cfg.priorities.colors[pk];
        var step = n <= 1 ? 0 : Math.round(i / (n - 1) * (PRIORITY_RAMP.length - 1));
        map[k] = custom || PRIORITY_RAMP[step];
      });
    } else if (dim === 'origin') {
      map['PRJ301'] = '#4a3aa7'; map['Interne'] = '#2a78d6';
    } else if (dim === 'fixState') {
      map['Fix Version renseignée'] = '#008300'; map['Sans Fix Version'] = '#eb6834';
    } else if (dim === 'doneState') {
      map['Terminé'] = '#008300'; map['En cours'] = '#2a78d6';
    } else {
      var keys = C.DIMS[dim].order(allKeys, cfg, tickets);
      keys.forEach(function (k, i) { map[k] = CATEGORICAL[i % CATEGORICAL.length]; });
      if (dim === 'version') map['Sans version'] = NEUTRAL;
    }
    return map;
  }

  root.BDV2Palette = {
    CATEGORICAL: CATEGORICAL, PRIORITY_RAMP: PRIORITY_RAMP, SEQ_BLUE: SEQ_BLUE, STATUS: STATUS, NEUTRAL: NEUTRAL, SWATCHES: SWATCHES,
    textOn: textOn, seqColor: seqColor, progressColor: progressColor, colorsForDim: colorsForDim, luminance: luminance
  };
})(window);
