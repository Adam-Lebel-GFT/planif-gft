/* ════════════════════════════════════════════════════════════════════
   Bug Dashboard v2 — drill-down : fenêtre de détail des tickets avec
   onglets (ex. « Réalisé » / « Reste »), tri par colonne, copie des clés,
   copie d'une requête JQL, export CSV, lien Jira.
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var C = root.BDV2Core;
  var JIRA_BASE_URL = 'https://vaudoise.atlassian.net/browse/';
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var COLS = [
    { id: 'key', label: 'Clé', get: function (t) { return t.key; }, render: function (t) { return t.key ? '<a href="' + JIRA_BASE_URL + encodeURIComponent(t.key) + '" target="_blank" rel="noopener">' + esc(t.key) + '</a>' : '—'; } },
    { id: 'summary', label: 'Résumé', get: function (t) { return t.summary; }, render: function (t) { return '<span class="dd-sum" title="' + esc(t.summary) + '">' + esc(t.summary || '—') + '</span>'; } },
    { id: 'status', label: 'Statut', get: function (t) { return t.status; } },
    { id: 'resolution', label: 'Résolution', get: function (t) { return t.resolution || ''; }, render: function (t) { return t.resolution ? esc(t.resolution) : '<span class="dd-empty">—</span>'; } },
    { id: 'team', label: 'Équipe', get: function (t) { return t.teamLabel; } },
    { id: 'priority', label: 'Priorité', get: function (t) { return t.priorityLabel; } },
    { id: 'target', label: 'Target date', get: function (t) { return t.targetDate ? +t.targetDate : 0; }, render: function (t) { return t.targetDate ? C.fmtDate(t.targetDate) : (t.targetRaw ? esc(t.targetRaw) : '—'); } },
    { id: 'version', label: 'Version', get: function (t) { return t.version || ''; }, render: function (t) { return t.version ? esc(t.version) : (t.versionState === 'deployed' ? '<span class="dd-warn">déjà déployée</span>' : '<span class="dd-empty">—</span>'); } },
    { id: 'fix', label: 'Fix Version', get: function (t) { return t.fixVersion; }, render: function (t) { return t.fixVersion ? esc(t.fixVersion) : '<span class="dd-empty">—</span>'; } },
    { id: 'origin', label: 'Origine', get: function (t) { return t.origin; } },
    { id: 'labels', label: 'Labels', get: function (t) { return t.labels; }, render: function (t) { return '<span class="dd-sum" title="' + esc(t.labels) + '">' + (t.labels ? esc(t.labels) : '<span class="dd-empty">—</span>') + '</span>'; } }
  ];

  var state = { tabs: [], active: 0, sort: { col: 'key', dir: 1 }, title: '', subtitle: '' };

  function open(opts) {
    state.tabs = opts.tabs || [{ label: 'Tickets', tickets: opts.tickets || [] }];
    state.active = Math.min(opts.activeTab || 0, state.tabs.length - 1);
    state.title = opts.title || 'Tickets';
    state.subtitle = opts.subtitle || '';
    render();
    var ov = document.getElementById('ddOverlay');
    ov.classList.add('is-open'); ov.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dd-open');
  }
  function close() {
    var ov = document.getElementById('ddOverlay');
    ov.classList.remove('is-open'); ov.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dd-open');
  }

  function render() {
    document.getElementById('ddTitle').textContent = state.title;
    document.getElementById('ddSub').textContent = state.subtitle;
    document.getElementById('ddTabs').innerHTML = state.tabs.map(function (tb, i) {
      return '<button type="button" class="dd-tab' + (i === state.active ? ' is-on' : '') + '" data-tab="' + i + '">' + esc(tb.label) + ' <span class="dd-count">' + tb.tickets.length + '</span></button>';
    }).join('');
    var tickets = state.tabs[state.active].tickets.slice();
    var col = COLS.find(function (c) { return c.id === state.sort.col; }) || COLS[0];
    tickets.sort(function (a, b) {
      var va = col.get(a), vb = col.get(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * state.sort.dir;
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * state.sort.dir;
    });
    var thead = '<tr>' + COLS.map(function (c) {
      var on = c.id === state.sort.col;
      return '<th data-sort="' + c.id + '" class="' + (on ? 'is-sorted' : '') + '">' + esc(c.label) + (on ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : '') + '</th>';
    }).join('') + '</tr>';
    var tbody = tickets.map(function (t) {
      return '<tr>' + COLS.map(function (c) { return '<td class="dd-' + c.id + '">' + (c.render ? c.render(t) : esc(c.get(t) || '—')) + '</td>'; }).join('') + '</tr>';
    }).join('');
    document.getElementById('ddThead').innerHTML = thead;
    document.getElementById('ddTbody').innerHTML = tbody;
    document.getElementById('ddEmpty').classList.toggle('hidden', tickets.length > 0);
    document.getElementById('ddTable').classList.toggle('hidden', tickets.length === 0);
    var keys = tickets.map(function (t) { return t.key; }).filter(Boolean);
    var copy = document.getElementById('ddCopy');
    copy.dataset.keys = keys.join(', ');
    copy.disabled = keys.length === 0;
    document.getElementById('ddCsv').disabled = tickets.length === 0;
    document.getElementById('ddJql').disabled = keys.length === 0;
    document.getElementById('ddJql').dataset.jql = keys.length ? 'key in (' + keys.join(', ') + ')' : '';
  }

  function feedback(btn, text) {
    var orig = btn.dataset.label || btn.textContent;
    btn.dataset.label = orig; btn.textContent = text;
    setTimeout(function () { btn.textContent = btn.dataset.label; }, 1400);
  }

  function toCSV(tickets) {
    var head = COLS.map(function (c) { return c.label; });
    var lines = [head.join(';')].concat(tickets.map(function (t) {
      return COLS.map(function (c) {
        var v = c.id === 'target' ? (t.targetDate ? C.fmtDate(t.targetDate) : t.targetRaw) : c.get(t);
        v = v == null ? '' : String(v);
        return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(';');
    }));
    return '﻿' + lines.join('\n');
  }

  function init() {
    document.getElementById('ddClose').addEventListener('click', close);
    document.getElementById('ddOverlay').addEventListener('click', function (e) { if (e.target.id === 'ddOverlay') close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('ddOverlay').classList.contains('is-open')) close(); });
    document.getElementById('ddTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) { state.active = +b.dataset.tab; render(); } });
    document.getElementById('ddThead').addEventListener('click', function (e) {
      var th = e.target.closest('[data-sort]'); if (!th) return;
      if (state.sort.col === th.dataset.sort) state.sort.dir = -state.sort.dir; else { state.sort.col = th.dataset.sort; state.sort.dir = 1; }
      render();
    });
    document.getElementById('ddCopy').addEventListener('click', async function () {
      var b = this; if (!b.dataset.keys) return;
      try { await navigator.clipboard.writeText(b.dataset.keys); feedback(b, 'Copié ✓'); } catch (e) { feedback(b, 'Copie impossible'); }
    });
    document.getElementById('ddJql').addEventListener('click', async function () {
      var b = this; if (!b.dataset.jql) return;
      try { await navigator.clipboard.writeText(b.dataset.jql); feedback(b, 'JQL copié ✓'); } catch (e) { feedback(b, 'Copie impossible'); }
    });
    document.getElementById('ddCsv').addEventListener('click', function () {
      var tickets = state.tabs[state.active].tickets;
      var blob = new Blob([toCSV(tickets)], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (state.title + ' - ' + state.tabs[state.active].label).replace(/[^\w\dàâäéèêëîïôöùûüç .-]+/gi, '_') + '.csv';
      a.click();
    });
  }

  root.BDV2Drill = { open: open, close: close, init: init, JIRA_BASE_URL: JIRA_BASE_URL };
})(window);
