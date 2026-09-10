/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — moteur : détection des colonnes, parsing, modèle
   ticket, dimensions et agrégation multidimensionnelle (pivot).
   Aucune dépendance DOM : tout ici est testable en isolation.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // ── Détection des colonnes ─────────────────────────────────────────
  // Chaque entrée : liste de libellés candidats (comparés après normalize()).
  // L'ordre compte : le premier candidat trouvé gagne, et une égalité stricte
  // est préférée à une inclusion (évite que "target date" capte "due date").
  var COLUMN_CANDIDATES = {
    key:        ['issue key', 'key', 'clé', 'cle', 'ticket'],
    summary:    ['summary', 'résumé', 'resume', 'titre', 'title'],
    type:       ['issue type', 'type de ticket', 'type'],
    priority:   ['priority', 'priorité', 'priorite'],
    status:     ['status', 'statut', 'état', 'etat'],
    resolution: ['resolution', 'résolution'],
    team:       ['team code', 'équipe', 'equipe', 'team', 'squad'],
    targetDate: ['target date', 'target end date', 'target end', 'date cible', 'cible', 'target'],
    dueDate:    ['due date', "date d'échéance", 'date echeance', 'échéance', 'echeance'],
    fixVersion: ['fix version/s', 'fix versions', 'fix version', 'fixversion', 'version corrigée', 'version corrigee'],
    labels:     ['labels', 'étiquettes', 'etiquettes', 'label', 'tags'],
    assignee:   ['assignee', 'responsable', 'assigné', 'assigne'],
    created:    ['created', 'créé', 'cree', 'creation', 'création'],
    updated:    ['updated', 'mis à jour', 'mise a jour', 'modifié']
  };

  var PRJ301_LABEL = 'sourceproject_prj301';

  function normalize(s) {
    return (s == null ? '' : String(s)).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function findColumnIndex(headers, candidates) {
    var norm = headers.map(normalize);
    for (var i = 0; i < candidates.length; i++) {
      var nc = normalize(candidates[i]);
      var exact = norm.indexOf(nc);
      if (exact !== -1) return exact;
    }
    for (var j = 0; j < candidates.length; j++) {
      var nc2 = normalize(candidates[j]);
      var idx = norm.findIndex(function (h) { return h.indexOf(nc2) !== -1; });
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function detectColumns(headers) {
    var cols = {};
    Object.keys(COLUMN_CANDIDATES).forEach(function (k) {
      cols[k] = findColumnIndex(headers, COLUMN_CANDIDATES[k]);
    });
    // "Target" (générique) ne doit jamais capter la colonne Due Date ni Created.
    if (cols.targetDate !== -1 && (cols.targetDate === cols.dueDate || cols.targetDate === cols.created)) cols.targetDate = -1;
    return cols;
  }

  // ── Parsing du collage (TSV Excel/Jira) ────────────────────────────
  // Gère les cellules entre guillemets contenant des tabulations ou des
  // retours à la ligne (résumés multi-lignes copiés depuis Excel).
  // Répare un texte UTF-8 lu comme Latin-1 (« Ã© » → « é ») — typique d'un CSV
  // Jira ouvert dans Excel puis copié. Appliqué seulement si ça réduit les
  // séquences suspectes.
  function fixMojibake(text) {
    if (!/Ã.|Î£|â€/.test(text)) return text;
    try {
      var fixed = decodeURIComponent(escape(text));
      var before = (text.match(/Ã/g) || []).length, after = (fixed.match(/Ã/g) || []).length;
      return after < before ? fixed : text;
    } catch (e) { return text; }
  }

  // Détecte le séparateur (tabulation = collage Excel ; virgule ou point-virgule = CSV).
  function detectDelimiter(text) {
    var first = text.split('\n')[0] || '';
    var best = '\t', bestN = 0;
    ['\t', ',', ';'].forEach(function (d) {
      var n = parseDelimited(first, d)[0]; n = n ? n.length : 0;
      if (n > bestN) { bestN = n; best = d; }
    });
    return best;
  }

  function parseTSV(raw) { return parseDelimited(raw, null); }

  function parseDelimited(raw, delim) {
    var text = String(raw || '').replace(/\r\n?/g, '\n');
    if (!delim) delim = detectDelimiter(text);
    var rows = [], row = [], cell = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else cell += ch;
      } else if (ch === '"' && cell === '') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  // En-têtes Jira : « Custom field (Team code) » → « Team code » ; les colonnes
  // répétées (Labels, Sprint, Fix Version/s…) sont fusionnées en une seule,
  // valeurs jointes par « , ».
  function cleanHeader(h) {
    h = String(h == null ? '' : h).trim().replace(/^\ufeff/, '');
    var m = h.match(/^custom field \((.+)\)$/i);
    return m ? m[1].trim() : h;
  }
  function parsePastedData(raw) {
    var lines = parseTSV(fixMojibake(String(raw || '')));
    if (lines.length < 2) return { headers: [], rows: [] };
    var rawHeaders = lines[0].map(cleanHeader);
    var headers = [], slots = {};
    rawHeaders.forEach(function (h, i) { if (!slots[h]) { slots[h] = []; headers.push(h); } slots[h].push(i); });
    var rows = lines.slice(1).map(function (cells) {
      var obj = {};
      headers.forEach(function (h) {
        var vals = slots[h].map(function (i) { return String(cells[i] == null ? '' : cells[i]).trim(); }).filter(function (v) { return v !== ''; });
        obj[h] = vals.join(', ');
      });
      return obj;
    });
    return { headers: headers, rows: rows };
  }

  // ── Dates ──────────────────────────────────────────────────────────
  var MONTHS = {
    jan: 0, janv: 0, feb: 1, fev: 1, fevr: 1, mar: 2, mars: 2, apr: 3, avr: 3, may: 4, mai: 4,
    jun: 5, juin: 5, jul: 6, juil: 6, aug: 7, aou: 7, aout: 7, sep: 8, sept: 8, oct: 9,
    nov: 10, dec: 11
  };
  function parseDate(cell) {
    if (!cell) return null;
    var s = normalize(cell);
    var m;
    if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/))) return new Date(+m[3], +m[2] - 1, +m[1]);
    if ((m = s.match(/(\d{1,2})[\/ .-]([a-z]{3,5})\.?[\/ .-](\d{2,4})/))) {
      var mo = MONTHS[m[2].replace(/\./g, '')];
      if (mo == null) return null;
      var y = +m[3]; if (y < 100) y += 2000;
      return new Date(y, mo, +m[1]);
    }
    if ((m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})(?!\d)/))) return new Date(2000 + +m[3], +m[2] - 1, +m[1]);
    return null;
  }
  function toISO(d) {
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(d) {
    if (!d) return '—';
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  }
  function dayDiff(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  // ── Modèle ticket ──────────────────────────────────────────────────
  function cellAt(row, headers, idx) { return idx !== -1 ? (row[headers[idx]] || '') : ''; }

  function buildTickets(rows, headers, cols) {
    return rows.map(function (r, i) {
      var status = (cellAt(r, headers, cols.status) || 'Inconnu').trim();
      var team = cellAt(r, headers, cols.team).trim() || 'Non affecté';
      var priority = cellAt(r, headers, cols.priority).trim() || 'Non défini';
      var labels = cellAt(r, headers, cols.labels).trim();
      var targetRaw = cellAt(r, headers, cols.targetDate).trim();
      var dueRaw = cellAt(r, headers, cols.dueDate).trim();
      var fix = cellAt(r, headers, cols.fixVersion).trim();
      return {
        idx: i,
        key: cellAt(r, headers, cols.key).trim(),
        summary: cellAt(r, headers, cols.summary).trim(),
        type: cellAt(r, headers, cols.type).trim(),
        status: status, statusKey: normalize(status),
        resolution: cellAt(r, headers, cols.resolution).trim(),
        team: team,
        priority: priority, priorityKey: normalize(priority),
        labels: labels,
        isPrj301: normalize(labels).indexOf(PRJ301_LABEL) !== -1,
        targetRaw: targetRaw, targetDate: parseDate(targetRaw),
        dueRaw: dueRaw, dueDate: parseDate(dueRaw),
        fixVersion: fix, hasFix: fix !== '',
        assignee: cellAt(r, headers, cols.assignee).trim(),
        created: parseDate(cellAt(r, headers, cols.created)),
        version: null, versionState: 'none', versionDeploy: null // renseignés par plan.js
      };
    });
  }

  // Champs dérivés dépendant de la configuration (pondération, statuts
  // terminés, date de référence). Recalculés à chaque rendu — jamais figés
  // dans le ticket pour qu'un changement de config soit immédiat.
  function enrich(tickets, cfg, refDate) {
    var doneSet = {};
    (cfg.statuses.done || []).forEach(function (s) { doneSet[normalize(s)] = true; });
    tickets.forEach(function (t) {
      t.pct = pctForStatus(t.statusKey, cfg);
      t.isDone = !!doneSet[t.statusKey];
      t.isBlocker = (cfg.priorities.blockerKeys || ['blocker', 'highest']).indexOf(t.priorityKey) !== -1 || t.priorityKey.indexOf('block') !== -1;
      var ref = t.targetDate || t.dueDate;
      t.isOverdue = !!(ref && refDate && startOfDay(ref) < startOfDay(refDate) && !t.isDone);
      t.origin = t.isPrj301 ? 'PRJ301' : 'Interne';
      t.fixState = t.hasFix ? 'Fix Version renseignée' : 'Sans Fix Version';
      t.doneState = t.isDone ? 'Terminé' : 'En cours';
      t.priorityLabel = priorityDisplay(t.priorityKey, t.priority, cfg);
      t.teamLabel = teamDisplay(t.team, cfg);
    });
    return tickets;
  }

  function pctForStatus(statusKey, cfg) {
    var v = cfg.statuses.pct[statusKey];
    if (v !== undefined && v !== null && v !== '') return Number(v);
    var d = DEFAULT_STATUS_PCT[statusKey];
    return d !== undefined ? d : 50;
  }
  var DEFAULT_STATUS_PCT = {
    'open': 0, 'to do': 5, 'backlog': 5, 'in analyze': 10, 'in analysis': 10, 'ready for development': 20,
    'under review': 25, 'in progress': 30, 'code review': 65, 'code review - completed': 80,
    'quality assurance testing': 90, 'qa': 90, 'dev done': 95, 'done': 100, 'closed': 100,
    'decline': 100, 'declined': 100, 'resolved': 100, "won't do": 100, 'wont do': 100
  };

  function priorityDisplay(key, label, cfg) {
    var g = cfg.priorities.groups && cfg.priorities.groups[key];
    return g || label;
  }
  function teamDisplay(team, cfg) {
    var a = cfg.teams.alias && cfg.teams.alias[team];
    return a || team;
  }

  // ── Dimensions ─────────────────────────────────────────────────────
  // Une dimension = un libellé, une fonction clé(ticket) et une fonction
  // d'ordre des clés (pilotée par la configuration).
  var PRIORITY_ORDER_DEFAULT = ['blocker', 'critical', 'highest', 'high', 'major', 'medium', 'minor', 'low', 'lowest', 'trivial'];

  var DIMS = {
    team: {
      label: 'Équipe', keyOf: function (t) { return t.teamLabel; },
      order: function (keys, cfg, tickets) {
        // clés affichées = alias ; l'ordre configuré est sur les noms bruts.
        var rawByLabel = {};
        tickets.forEach(function (t) { rawByLabel[t.teamLabel] = t.team; });
        var pos = {};
        (cfg.teams.order || []).forEach(function (n, i) { pos[n] = i; });
        return keys.slice().sort(function (a, b) {
          var pa = pos[rawByLabel[a]], pb = pos[rawByLabel[b]];
          if (pa != null && pb != null) return pa - pb;
          if (pa != null) return -1;
          if (pb != null) return 1;
          if (a === 'Non affecté') return 1;
          if (b === 'Non affecté') return -1;
          return a.localeCompare(b);
        });
      }
    },
    status: {
      label: 'Statut', keyOf: function (t) { return t.status; },
      order: function (keys, cfg) {
        return keys.slice().sort(function (a, b) {
          var d = pctForStatus(normalize(a), cfg) - pctForStatus(normalize(b), cfg);
          return d !== 0 ? d : a.localeCompare(b);
        });
      }
    },
    priority: {
      label: 'Priorité', keyOf: function (t) { return t.priorityLabel; },
      order: function (keys, cfg, tickets) {
        var keyByLabel = {};
        tickets.forEach(function (t) { keyByLabel[t.priorityLabel] = t.priorityKey; });
        var order = (cfg.priorities.order && cfg.priorities.order.length) ? cfg.priorities.order : PRIORITY_ORDER_DEFAULT;
        var pos = {};
        order.forEach(function (k, i) { pos[normalize(k)] = i; });
        return keys.slice().sort(function (a, b) {
          var pa = pos[keyByLabel[a]], pb = pos[keyByLabel[b]];
          if (pa == null) pa = pos[normalize(a)];
          if (pb == null) pb = pos[normalize(b)];
          if (pa != null && pb != null) return pa - pb;
          if (pa != null) return -1;
          if (pb != null) return 1;
          return a.localeCompare(b);
        });
      }
    },
    origin: {
      label: 'Origine', keyOf: function (t) { return t.origin; },
      order: function (keys) { return ['PRJ301', 'Interne'].filter(function (k) { return keys.indexOf(k) !== -1; }); }
    },
    fixState: {
      label: 'Fix Version', keyOf: function (t) { return t.fixState; },
      order: function (keys) { return ['Fix Version renseignée', 'Sans Fix Version'].filter(function (k) { return keys.indexOf(k) !== -1; }); }
    },
    doneState: {
      label: 'Terminé / en cours', keyOf: function (t) { return t.doneState; },
      order: function (keys) { return ['Terminé', 'En cours'].filter(function (k) { return keys.indexOf(k) !== -1; }); }
    },
    resolution: {
      label: 'Résolution', keyOf: function (t) { return t.resolution || '(vide)'; },
      order: function (keys) { return keys.slice().sort(function (a, b) { return a === '(vide)' ? 1 : b === '(vide)' ? -1 : a.localeCompare(b); }); }
    },
    version: {
      label: 'Version', keyOf: function (t) { return t.version || 'Sans version'; },
      order: function (keys, cfg, tickets) {
        var deployByLabel = {};
        tickets.forEach(function (t) { if (t.version) deployByLabel[t.version] = t.versionDeploy ? +t.versionDeploy : 0; });
        return keys.slice().sort(function (a, b) {
          var sa = a === 'Sans version' ? 2 : 0;
          var sb = b === 'Sans version' ? 2 : 0;
          if (sa !== sb) return sa - sb;
          return (deployByLabel[a] || 0) - (deployByLabel[b] || 0) || a.localeCompare(b);
        });
      }
    },
    assignee: {
      label: 'Responsable', keyOf: function (t) { return t.assignee || '(non assigné)'; },
      order: function (keys) { return keys.slice().sort(function (a, b) { return a.localeCompare(b); }); }
    }
  };

  // ── Pivot ──────────────────────────────────────────────────────────
  // pivot(tickets, 'team', 'priority') →
  //   { rows:[...], cols:[...], cell(r,c) → {count,pctSum,tickets}, rowTotal, colTotal, total, max }
  function pivot(tickets, rowDim, colDim, cfg) {
    var rd = DIMS[rowDim], cd = colDim ? DIMS[colDim] : null;
    var cells = {}, rowKeys = {}, colKeys = {};
    var rowTot = {}, colTot = {};
    tickets.forEach(function (t) {
      var r = rd.keyOf(t), c = cd ? cd.keyOf(t) : '_';
      rowKeys[r] = true; colKeys[c] = true;
      cells[r] = cells[r] || {};
      var cell = cells[r][c] = cells[r][c] || { count: 0, pctSum: 0, tickets: [] };
      cell.count++; cell.pctSum += t.pct; cell.tickets.push(t);
      rowTot[r] = rowTot[r] || { count: 0, pctSum: 0, tickets: [] };
      rowTot[r].count++; rowTot[r].pctSum += t.pct; rowTot[r].tickets.push(t);
      colTot[c] = colTot[c] || { count: 0, pctSum: 0, tickets: [] };
      colTot[c].count++; colTot[c].pctSum += t.pct; colTot[c].tickets.push(t);
    });
    var rows = rd.order(Object.keys(rowKeys), cfg, tickets);
    var cols = cd ? cd.order(Object.keys(colKeys), cfg, tickets) : ['_'];
    var max = 0;
    rows.forEach(function (r) { cols.forEach(function (c) { var v = cells[r] && cells[r][c] ? cells[r][c].count : 0; if (v > max) max = v; }); });
    var rowMax = 0;
    rows.forEach(function (r) { if (rowTot[r].count > rowMax) rowMax = rowTot[r].count; });
    return {
      rowDim: rowDim, colDim: colDim, rows: rows, cols: cols,
      cell: function (r, c) { return (cells[r] && cells[r][c]) || { count: 0, pctSum: 0, tickets: [] }; },
      rowTotal: function (r) { return rowTot[r] || { count: 0, pctSum: 0, tickets: [] }; },
      colTotal: function (c) { return colTot[c] || { count: 0, pctSum: 0, tickets: [] }; },
      total: tickets.length, max: max, rowMax: rowMax
    };
  }

  function measureValue(cell, measure, pv, r, c) {
    if (measure === 'progress') return cell.count ? cell.pctSum / cell.count : 0;
    if (measure === 'shareRow') { var rt = pv.rowTotal(r).count; return rt ? cell.count / rt * 100 : 0; }
    if (measure === 'shareCol') { var ct = pv.colTotal(c).count; return ct ? cell.count / ct * 100 : 0; }
    if (measure === 'shareTotal') return pv.total ? cell.count / pv.total * 100 : 0;
    return cell.count;
  }
  function formatMeasure(v, measure) {
    if (measure === 'count') return String(v);
    if (measure === 'progress') return v.toFixed(0) + '%';
    return v.toFixed(0) + '%';
  }

  // ── KPI ────────────────────────────────────────────────────────────
  function computeKpis(tickets) {
    var k = { total: tickets.length, open: 0, done: 0, blockers: 0, blockersOpen: 0, overdue: 0, prj301: 0,
      hasFix: 0, doneNoFix: 0, doneWithFix: 0, noVersion: 0, deployedOpen: 0, pctSum: 0 };
    tickets.forEach(function (t) {
      k.pctSum += t.pct;
      if (t.isDone) k.done++; else k.open++;
      if (t.isBlocker) { k.blockers++; if (!t.isDone) k.blockersOpen++; }
      if (t.isOverdue) k.overdue++;
      if (t.isPrj301) k.prj301++;
      if (t.hasFix) k.hasFix++;
      if (t.isDone && !t.hasFix) k.doneNoFix++;
      if (t.isDone && t.hasFix) k.doneWithFix++;
      if (t.versionState === 'none') k.noVersion++;
      if (t.versionState === 'deployed' && !t.isDone) k.deployedOpen++;
    });
    k.progress = k.total ? k.pctSum / k.total : 0;
    return k;
  }

  root.BDV2Core = {
    COLUMN_CANDIDATES: COLUMN_CANDIDATES, PRJ301_LABEL: PRJ301_LABEL,
    DEFAULT_STATUS_PCT: DEFAULT_STATUS_PCT, PRIORITY_ORDER_DEFAULT: PRIORITY_ORDER_DEFAULT,
    normalize: normalize, detectColumns: detectColumns, parsePastedData: parsePastedData, parseTSV: parseTSV,
    parseDate: parseDate, toISO: toISO, fixMojibake: fixMojibake, detectDelimiter: detectDelimiter, parseDelimited: parseDelimited, fmtDate: fmtDate, dayDiff: dayDiff, startOfDay: startOfDay,
    buildTickets: buildTickets, enrich: enrich, pctForStatus: pctForStatus,
    DIMS: DIMS, pivot: pivot, measureValue: measureValue, formatMeasure: formatMeasure, computeKpis: computeKpis
  };
})(window);
