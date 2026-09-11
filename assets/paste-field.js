/* ════════════════════════════════════════════════════════════════════
   Agile Toolkit — champ « copier-coller » partagé
   ────────────────────────────────────────────────────────────────────
   Le moteur de collage du Bug Dashboard v2 (radar), extrait pour être
   réutilisé par les autres outils : Sprint Planning, Poker Planning et
   Bug Dashboard (lite).

   Ce qu'il apporte, quel que soit l'outil :
     • collage Excel (TSV), CSV (virgule ou point-virgule), cellules entre
       guillemets, résumés multi-lignes ;
     • réparation des accents cassés (« Ã© » → « é ») d'un CSV Jira ouvert
       dans Excel ;
     • copie directe du navigateur de tickets Jira (page HTML, un ticket
       étalé sur plusieurs lignes) ;
     • en-têtes « Custom field (Team code) » → « Team code », colonnes
       répétées fusionnées ;
     • détection des colonnes par équivalences (« Clé » = « Key » =
       « Issue key »…), avec les champs trouvés affichés en vert avec un
       crochet et les autres en gris avec une croix.

   Chaque outil déclare simplement SES champs et lesquels sont
   nécessaires pour progresser — l'équivalence utile n'est pas la même
   pour un radar de bugs, un backlog de sprint ou une session de poker.

   Usage :
     var champ = TKPaste.mount({
       mount: 'monConteneur',
       fields: [ { key: 'key', label: 'Clé', need: 'req' }, … ],
       onParse: function (res) { … }   // res = {raw, headers, rows, cols}
     });

   Aucune dépendance : un simple <script src="../assets/paste-field.js">
   suffit, y compris en file://.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── Équivalences d'en-têtes connues ───────────────────────────────
     Un candidat préfixé par « = » n'est comparé qu'en égalité stricte
     (ex. « =sp » ne doit pas capter la colonne « Sprint »). */
  var CATALOG = {
    key:         ['issue key', 'key', 'clé', 'cle', 'clef', 'clé de ticket', 'ticket'],
    summary:     ['summary', 'résumé', 'resume', 'titre', 'title', 'objet'],
    description: ['description', 'descriptif'],
    type:        ['issue type', 'type de ticket', 'type'],
    priority:    ['priority', 'priorité', 'priorite'],
    status:      ['status', 'statut', 'état', 'etat'],
    resolution:  ['resolution', 'résolution'],
    team:        ['team code', 'équipe', 'equipe', 'team', 'squad'],
    sprint:      ['sprint', 'sprints', 'itération', 'iteration'],
    storyPoints: ['story points', 'story point', '=story point', '=points', '=sp', 'estimation'],
    epic:        ["lien d'épopée", 'lien d epopee', 'epic link', 'épopée', 'epopee', '=epic'],
    targetDate:  ['target date', 'target end date', 'target end', 'date cible', 'cible', 'target'],
    dueDate:     ['due date', "date d'échéance", 'date echeance', 'échéance', 'echeance'],
    fixVersion:  ['fix version/s', 'fix versions', 'fix version', 'fixversion', 'version corrigée', 'version corrigee'],
    labels:      ['labels', 'étiquettes', 'etiquettes', 'label', 'tags'],
    assignee:    ['assignee', 'responsable', 'assigné', 'assigne'],
    created:     ['created', 'créé', 'cree', 'creation', 'création'],
    updated:     ['updated', 'mis à jour', 'mise a jour', 'modifié']
  };

  function normalize(s) {
    return (s == null ? '' : String(s)).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── Détection des colonnes ─────────────────────────────────────────
     L'ordre compte : l'égalité stricte est toujours préférée à
     l'inclusion, pour éviter que « target » capte « due date ». */
  function findColumnIndex(headers, candidates) {
    var norm = headers.map(normalize), i, nc, idx;
    for (i = 0; i < candidates.length; i++) {
      nc = normalize(String(candidates[i]).replace(/^=/, ''));
      idx = norm.indexOf(nc);
      if (idx !== -1) return { idx: idx, exact: true };
    }
    for (i = 0; i < candidates.length; i++) {
      if (String(candidates[i]).charAt(0) === '=') continue;   // candidat « strict »
      nc = normalize(candidates[i]);
      for (var j = 0; j < norm.length; j++) {
        if (norm[j].indexOf(nc) !== -1) return { idx: j, exact: false };
      }
    }
    return { idx: -1, exact: false };
  }

  function candidatesOf(field) {
    return field.candidates || CATALOG[field.key] || [field.label || field.key];
  }

  // fields : [{ key, label, need, candidates }] → { key: index, … } (-1 si absent).
  // Deux champs ne peuvent pas pointer la même colonne : l'égalité stricte
  // l'emporte, sinon le champ déclaré en premier garde la colonne.
  function detect(headers, fields) {
    var hits = {}, cols = {};
    fields.forEach(function (f) { hits[f.key] = findColumnIndex(headers, candidatesOf(f)); });
    var owner = {};
    fields.forEach(function (f) {
      var h = hits[f.key];
      if (h.idx === -1) return;
      var prev = owner[h.idx];
      if (prev === undefined) { owner[h.idx] = f.key; return; }
      if (h.exact && !hits[prev].exact) { cols[prev] = -1; owner[h.idx] = f.key; }
      else { h.idx = -1; }
    });
    fields.forEach(function (f) { if (cols[f.key] !== -1) cols[f.key] = hits[f.key].idx; });
    return cols;
  }

  function cellAt(row, headers, idx) {
    return idx !== undefined && idx !== -1 ? String(row[headers[idx]] == null ? '' : row[headers[idx]]).trim() : '';
  }

  /* ── Réparation d'un UTF-8 lu comme du Latin-1 ───────────────────── */
  function fixMojibake(text) {
    if (!/Ã.|Î£|â€/.test(text)) return text;
    try {
      var fixed = decodeURIComponent(escape(text));
      var before = (text.match(/Ã/g) || []).length, after = (fixed.match(/Ã/g) || []).length;
      return after < before ? fixed : text;
    } catch (e) { return text; }
  }

  /* ── Parsing délimité (tabulation, virgule, point-virgule) ───────── */
  function detectDelimiter(text) {
    var first = text.split('\n')[0] || '';
    var best = '\t', bestN = 0;
    ['\t', ',', ';'].forEach(function (d) {
      var n = parseDelimited(first, d)[0]; n = n ? n.length : 0;
      if (n > bestN) { bestN = n; best = d; }
    });
    return best;
  }

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

  // « Custom field (Team code) » → « Team code ».
  function cleanHeader(h) {
    h = String(h == null ? '' : h).trim().replace(/^﻿/, '');
    var m = h.match(/^custom field \((.+)\)$/i);
    return m ? m[1].trim() : h;
  }

  /* ── Copie depuis le navigateur de tickets Jira (page HTML) ────────
     Chaque ticket s'étale sur plusieurs lignes ; on les recompose en une
     ligne tabulaire équivalente à un export. */
  var NAV_RECORD = /^([A-Za-zÀ-ÿ][\w À-ÿ-]*)\t([A-Z][A-Z0-9]+-\d+)\t/;
  var D_ONLY = /^\d{2}\.\d{2}\.\d{4}$/, D_TIME = /^\d{2}\.\d{2}\.\d{4} \d{1,2}:\d{2}$/;

  function isJiraNavigator(text) {
    if (/^T\tKey\tP\t/m.test(text)) return true;
    var recs = text.split('\n').filter(function (l) { return NAV_RECORD.test(l); });
    if (recs.length < 2) return false;
    var head = (text.split('\n')[0].match(/\t/g) || []).length, first = (recs[0].match(/\t/g) || []).length;
    return head !== first;
  }

  function parseJiraNavigator(raw) {
    var lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
    var blocks = [], cur = null;
    lines.forEach(function (l) {
      if (NAV_RECORD.test(l)) { cur = [l]; blocks.push(cur); }
      else if (cur) cur.push(l);
    });
    var headers = ['Issue Type', 'Issue key', 'Priority', 'Story Points', 'Assignee', 'Status', 'Summary', 'Team code', 'Due Date', 'Created', 'Updated', 'Sprint', 'Labels', 'Time Spent', 'Target date', 'Fix Version/s', 'Last Time Status Changed', 'Resolution'];
    var rows = blocks.map(function (b) {
      var r = {}; headers.forEach(function (h) { r[h] = ''; });
      var first = b[0].split('\t');
      r['Issue Type'] = first[0].trim(); r['Issue key'] = first[1].trim(); r['Priority'] = (first[2] || '').trim();
      r['Story Points'] = (first[3] || '').trim(); r['Assignee'] = (first[4] || '').trim(); r['Status'] = (first[5] || '').trim();
      var i = 1, summary = [];
      while (i < b.length && b[i].trim() !== '' && b[i].indexOf('\t') === -1) { summary.push(b[i].trim()); i++; }
      r['Summary'] = summary.join(' ');
      while (i < b.length && b[i].trim() === '') i++;
      if (i < b.length) {
        var cells = b[i].split('\t').map(function (c) { return c.trim(); });
        var dates = cells.filter(function (c) { return D_ONLY.test(c); });
        var firstNonEmpty = cells.find(function (c) { return c !== ''; }) || '';
        if (firstNonEmpty && !D_ONLY.test(firstNonEmpty) && !/^Sprint /.test(firstNonEmpty)) r['Team code'] = firstNonEmpty;
        if (dates.length >= 3) { r['Due Date'] = dates[0]; r['Created'] = dates[1]; r['Updated'] = dates[2]; }
        else if (dates.length === 2) { r['Created'] = dates[0]; r['Updated'] = dates[1]; }
        else if (dates.length === 1) { r['Created'] = dates[0]; }
        r['Sprint'] = cells.filter(function (c) { return /^Sprint /.test(c); }).join(', ');
        i++;
      }
      while (i < b.length && b[i].trim() === '') i++;
      if (i < b.length && b[i].indexOf('\t') === -1 && !D_ONLY.test(b[i].trim().split(' ')[0])) {
        var lab = b[i].trim(); r['Labels'] = lab === 'None' ? '' : lab.split(/\s+/).join(', '); i++;
      }
      var last = null;
      for (var j = b.length - 1; j >= i; j--) { if (b[j].indexOf('\t') !== -1 || D_ONLY.test(b[j].trim())) { last = b[j]; break; } }
      if (last) {
        var c = last.split('\t').map(function (x) { return x.trim(); });
        var ti = -1; c.forEach(function (x, k) { if (D_TIME.test(x)) ti = k; });
        if (ti !== -1) {
          r['Last Time Status Changed'] = c[ti];
          r['Resolution'] = (c[ti + 1] || '').replace(/^Unresolved$/i, '');
          var tgt = -1; for (var k = ti - 1; k >= 0; k--) { if (D_ONLY.test(c[k])) { tgt = k; break; } }
          if (tgt !== -1) { r['Target date'] = c[tgt]; r['Fix Version/s'] = c.slice(tgt + 1, ti).filter(Boolean).join(', '); if (tgt > 0) r['Time Spent'] = c[tgt - 1]; }
        } else {
          var only = c.filter(function (x) { return D_ONLY.test(x); });
          if (only.length) r['Target date'] = only[only.length - 1];
        }
      }
      return r;
    });
    return { headers: headers, rows: rows };
  }

  /* ── Matrice (tableau de tableaux) → { headers, rows } ──────────────
     Utilisé aussi par les imports de fichiers (xlsx / export HTML Jira) :
     ils profitent ainsi du même nettoyage d'en-têtes et des mêmes
     équivalences que le collage. */
  function fromMatrix(matrix, hdrIdx) {
    hdrIdx = hdrIdx || 0;
    var rawHeaders = (matrix[hdrIdx] || []).map(cleanHeader);
    var headers = [], slots = {};
    rawHeaders.forEach(function (h, i) { if (!slots[h]) { slots[h] = []; headers.push(h); } slots[h].push(i); });
    var rows = [];
    matrix.slice(hdrIdx + 1).forEach(function (cells) {
      if (!cells || !cells.some(function (c) { return String(c == null ? '' : c).trim() !== ''; })) return;
      var obj = {};
      headers.forEach(function (h) {
        var vals = slots[h].map(function (i) { return String(cells[i] == null ? '' : cells[i]).trim(); })
          .filter(function (v) { return v !== ''; });
        obj[h] = vals.join(', ');
      });
      rows.push(obj);
    });
    return { headers: headers, rows: rows };
  }

  // Retrouve la ligne d'en-têtes dans une matrice qui commence par du
  // préambule (exports Jira « Excel » HTML). Celle qui reconnaît le plus de
  // champs déclarés gagne ; -1 si aucune n'atteint le minimum.
  function findHeaderRow(matrix, fields, opts) {
    opts = opts || {};
    var scan = Math.min(matrix.length, opts.scan || 20);
    var minHits = opts.minHits || 2;
    var best = -1, bestN = 0;
    for (var i = 0; i < scan; i++) {
      var cells = (matrix[i] || []).map(cleanHeader);
      if (!cells.length) continue;
      var cols = detect(cells, fields), n = 0;
      fields.forEach(function (f) { if (cols[f.key] !== -1) n++; });
      if (n > bestN) { bestN = n; best = i; }
    }
    return bestN >= minHits ? best : -1;
  }

  // Point d'entrée du parsing : texte collé → { headers, rows }.
  function parse(raw) {
    var text = fixMojibake(String(raw || ''));
    if (isJiraNavigator(text)) { var nav = parseJiraNavigator(text); if (nav.rows.length) return nav; }
    var lines = parseDelimited(text, null);
    if (lines.length < 2) return { headers: [], rows: [] };
    return fromMatrix(lines, 0);
  }

  /* ── Champs requis ──────────────────────────────────────────────────
     need = 'req' (obligatoire) · 'any' + group (au moins un du groupe)
          · 'imp' (utile, signalé s'il manque) · 'opt' (facultatif) */
  function missingRequired(fields, cols) {
    var miss = [], groups = {};
    fields.forEach(function (f) {
      var found = cols[f.key] !== undefined && cols[f.key] !== -1;
      if (f.need === 'req' && !found) miss.push(f);
      if (f.need === 'any') {
        var g = f.group || 'any';
        if (!groups[g]) groups[g] = { found: false, fields: [] };
        groups[g].fields.push(f);
        if (found) groups[g].found = true;
      }
    });
    Object.keys(groups).forEach(function (g) {
      if (!groups[g].found) groups[g].fields.forEach(function (f) { miss.push(f); });
    });
    return miss;
  }

  /* ── Pastilles « champs trouvés » ───────────────────────────────────
     Trouvé  → vert avec un crochet.
     Absent  → gris avec une croix (liseré rouge s'il bloque l'analyse). */
  function chipsHtml(fields, cols, headers, blocking) {
    var blockKeys = {};
    (blocking || []).forEach(function (f) { blockKeys[f.key] = true; });
    return fields.map(function (f) {
      var idx = cols[f.key];
      var ok = idx !== undefined && idx !== -1;
      var label = f.label || f.key;
      var title;
      if (ok) title = 'Colonne détectée : ' + (headers && headers[idx] ? headers[idx] : label);
      else {
        var eq = candidatesOf(f).map(function (c) { return String(c).replace(/^=/, ''); }).join(', ');
        title = (blockKeys[f.key] ? 'Colonne nécessaire pour progresser — ' : 'Colonne non trouvée — ')
          + 'en-têtes acceptés : ' + eq;
      }
      var cls = 'tkp-chip' + (ok ? ' is-on' : (blockKeys[f.key] ? ' is-req' : ''));
      return '<span class="' + cls + '" title="' + esc(title) + '">' +
        '<span class="tkp-mk" aria-hidden="true">' + (ok ? '✓' : '✗') + '</span>' + esc(label) + '</span>';
    }).join('');
  }

  /* ── Styles (injectés une seule fois, classes préfixées .tkp-) ───── */
  var STYLE_ID = 'tkp-styles';
  var CSS = [
    '.tkp{font-family:inherit;color:var(--text,#0C1A2E);}',
    '.tkp *{box-sizing:border-box;}',
    '.tkp-title{font-size:13.5px;font-weight:700;margin:0 0 2px;color:var(--navy,#0C1A2E);}',
    '.tkp-sub{font-size:11.5px;line-height:1.5;color:var(--muted,#6B7A90);margin:0 0 10px;}',
    '.tkp-area{width:100%;min-height:104px;display:block;border:1.5px dashed var(--border,#E8EAED);border-radius:10px;',
    'padding:12px;font-family:var(--font-mono,"DM Mono",ui-monospace,monospace);font-size:12px;line-height:1.5;',
    'color:var(--text,#0C1A2E);background:#FBFCFE;resize:vertical;}',
    '.tkp-area:focus{outline:2px solid var(--accent,#0C447C);border-style:solid;}',
    '.tkp-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;}',
    '.tkp-btn{font-family:inherit;font-weight:700;font-size:12.5px;border:none;border-radius:8px;padding:9px 16px;',
    'cursor:pointer;line-height:1.2;transition:all .18s ease;}',
    '.tkp-btn--primary{background:var(--navy,#0C1A2E);color:#fff;}',
    '.tkp-btn--primary:hover{background:var(--accent,#0C447C);}',
    '.tkp-btn--ghost{background:#fff;color:var(--muted,#6B7A90);border:1px solid var(--border,#E8EAED);}',
    '.tkp-btn--ghost:hover{color:var(--navy,#0C1A2E);border-color:var(--muted,#6B7A90);}',
    '.tkp-msg{font-size:12px;color:var(--muted,#6B7A90);}',
    '.tkp-msg.is-ok{color:var(--green,#1A7A42);font-weight:700;}',
    '.tkp-msg.is-err{color:var(--red,#C0392B);font-weight:700;}',
    '.tkp-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}',
    '.tkp-chips:empty{display:none;}',
    '.tkp-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;',
    'border-radius:999px;border:1px solid var(--border,#E8EAED);background:#F4F5F7;color:var(--muted,#6B7A90);}',
    '.tkp-chip.is-on{background:var(--green-bg,#E7F2EC);color:var(--green,#1A7A42);border-color:rgba(26,122,66,.28);}',
    '.tkp-chip.is-req{color:var(--red,#C0392B);border-color:rgba(192,57,43,.35);}',
    '.tkp-legend{font-size:11px;color:var(--muted,#6B7A90);margin-top:8px;}',
    '@media (max-width:640px){.tkp-actions{flex-direction:column;align-items:stretch;}.tkp-btn{width:100%;}}'
  ].join('');

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ── Montage du champ dans une page ─────────────────────────────── */
  function mount(opts) {
    opts = opts || {};
    var host = typeof opts.mount === 'string' ? document.getElementById(opts.mount) : opts.mount;
    if (!host) return null;
    injectStyles();

    var fields = opts.fields || [];
    var box = document.createElement('div');
    box.className = 'tkp' + (opts.className ? ' ' + opts.className : '');
    box.innerHTML =
      (opts.title ? '<p class="tkp-title">' + esc(opts.title) + '</p>' : '') +
      (opts.sub ? '<p class="tkp-sub">' + opts.sub + '</p>' : '') +
      '<textarea class="tkp-area" spellcheck="false" placeholder="' +
        esc(opts.placeholder || 'Collez votre tableau Excel ici (Ctrl+V)…') + '"></textarea>' +
      '<div class="tkp-actions">' +
        '<button type="button" class="tkp-btn tkp-btn--primary">' + esc(opts.analyzeLabel || 'Analyser le collage') + '</button>' +
        '<button type="button" class="tkp-btn tkp-btn--ghost">' + esc(opts.clearLabel || 'Effacer') + '</button>' +
        '<span class="tkp-msg"></span>' +
      '</div>' +
      '<div class="tkp-chips"></div>';
    host.appendChild(box);

    var area = box.querySelector('.tkp-area');
    var msgEl = box.querySelector('.tkp-msg');
    var chipsEl = box.querySelector('.tkp-chips');
    var btnGo = box.querySelector('.tkp-btn--primary');
    var btnClear = box.querySelector('.tkp-btn--ghost');

    function msg(text, cls) { msgEl.textContent = text || ''; msgEl.className = 'tkp-msg' + (cls ? ' is-' + cls : ''); }
    function chips(cols, headers, blocking) { chipsEl.innerHTML = chipsHtml(fields, cols || {}, headers || [], blocking); }
    function store(raw) {
      if (!opts.storageKey) return;
      try { raw ? localStorage.setItem(opts.storageKey, raw) : localStorage.removeItem(opts.storageKey); } catch (e) {}
    }

    function analyze(silent) {
      var raw = area.value;
      if (!raw.trim()) { chipsEl.innerHTML = ''; msg('Collez des données avant d\'analyser.', 'err'); return false; }
      var parsed = parse(raw);
      if (!parsed.rows.length) {
        chipsEl.innerHTML = '';
        msg('Aucune ligne détectée — la première ligne collée doit contenir les en-têtes.', 'err');
        return false;
      }
      var cols = detect(parsed.headers, fields);
      var blocking = missingRequired(fields, cols);
      chips(cols, parsed.headers, blocking);
      if (blocking.length) {
        var names = blocking.map(function (f) { return '« ' + (f.label || f.key) + ' »'; });
        var uniq = [];
        names.forEach(function (n) { if (uniq.indexOf(n) === -1) uniq.push(n); });
        msg('Colonne' + (uniq.length > 1 ? 's' : '') + ' manquante' + (uniq.length > 1 ? 's' : '') + ' : ' +
          uniq.join(', ') + ' — introuvable' + (uniq.length > 1 ? 's' : '') + ' dans les en-têtes collés.', 'err');
        return false;
      }
      store(raw);
      var res = { raw: raw, headers: parsed.headers, rows: parsed.rows, cols: cols, silent: !!silent };
      var out;
      try { out = opts.onParse ? opts.onParse(res) : undefined; }
      catch (e) { msg((e && e.message) || 'Traitement impossible.', 'err'); return false; }
      if (out === false) return false;
      if (out && typeof out === 'object' && out.error) { msg(out.error, 'err'); return false; }
      msg(typeof out === 'string' ? out : parsed.rows.length + ' ligne(s) analysée(s).', 'ok');
      return true;
    }

    function clear() {
      area.value = ''; chipsEl.innerHTML = ''; msg('', '');
      store('');
      if (opts.onClear) opts.onClear();
    }

    btnGo.addEventListener('click', function () { analyze(false); });
    btnClear.addEventListener('click', clear);

    var api = {
      element: box, textarea: area,
      analyze: analyze, clear: clear, msg: msg, chips: chips,
      getRaw: function () { return area.value; },
      setRaw: function (v, run) { area.value = v == null ? '' : v; if (run) analyze(true); }
    };

    if (opts.storageKey && opts.restore !== false) {
      var saved = null;
      try { saved = localStorage.getItem(opts.storageKey); } catch (e) {}
      if (saved) api.setRaw(saved, true);
    }
    return api;
  }

  root.TKPaste = {
    CATALOG: CATALOG,
    normalize: normalize,
    parse: parse,
    fromMatrix: fromMatrix,
    findHeaderRow: findHeaderRow,
    parseDelimited: parseDelimited,
    detectDelimiter: detectDelimiter,
    cleanHeader: cleanHeader,
    isJiraNavigator: isJiraNavigator,
    fixMojibake: fixMojibake,
    findColumnIndex: findColumnIndex,
    detect: detect,
    cellAt: cellAt,
    missingRequired: missingRequired,
    chipsHtml: chipsHtml,
    injectStyles: injectStyles,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
