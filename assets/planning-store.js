/* =============================================================
   Agile Toolkit — Versions enregistrées du fichier planning
   Enregistre les onglets utiles du classeur (« Planning Build » et
   « Parameters ») dans la base partagée (table planning_versions,
   voir supabase/planning-versions.sql), puis les recharge comme si le
   fichier venait d'être déposé. Partagé par l'Analyse de capacité et le
   Sprint planning.

     TKPlanStore.mount(element, { getFile: () => File|null, onLoad: file => … })

   Dépend de XLSX (SheetJS) et de acces/auth.js (PlanifAuth) ; TKLoader est
   utilisé s'il est présent.
   ============================================================= */
(function (root) {
  'use strict';
  var TABLE = 'planning_versions';
  var SHEETS = ['Planning Build', 'Parameters'];
  var CSS =
    '.tk-ps{margin-top:12px;padding:12px 14px;background:#fff;border:1px solid #E8EAED;border-radius:10px;font-family:"Manrope",sans-serif}' +
    '.tk-ps-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}' +
    '.tk-ps-lbl{font-family:"DM Mono",monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#6B7A90;margin-right:4px}' +
    '.tk-ps select{flex:1;min-width:200px;max-width:420px;padding:7px 10px;border:1.5px solid #E8EAED;border-radius:6px;background:#F4F5F7;font-family:"Manrope",sans-serif;font-size:12px;color:#0C1A2E}' +
    '.tk-ps button{padding:7px 12px;border-radius:6px;border:1.5px solid #E8EAED;background:#fff;font-family:"Manrope",sans-serif;font-size:11px;font-weight:700;color:#0C1A2E;cursor:pointer}' +
    '.tk-ps button:hover:not(:disabled){border-color:#0C1A2E}' +
    '.tk-ps button.pri{background:#0C1A2E;border-color:#0C1A2E;color:#fff}' +
    '.tk-ps button:disabled,.tk-ps select:disabled{opacity:.45;cursor:not-allowed}' +
    '.tk-ps-msg{font-family:"DM Mono",monospace;font-size:10px;color:#6B7A90;margin-top:8px;min-height:13px}' +
    '.tk-ps-msg.err{color:#C0392B}.tk-ps-msg.ok{color:#1A7A42}';

  function auth() { return root.PlanifAuth || null; }
  async function getSession() { var A = auth(); if (!A) return null; try { return await A.getSession(); } catch (e) { return null; } }
  function db() { return auth().getClient(); }

  // ── Lecture / écriture des données ──────────────────────────────
  // Extrait les onglets utiles en matrices (lignes de cellules), sans les colonnes vides de fin.
  async function extract(file) {
    var ab = await file.arrayBuffer();
    var wb = XLSX.read(ab, { type: 'array', cellDates: false, sheets: SHEETS });
    var out = {};
    SHEETS.forEach(function (n) {
      var ws = wb.Sheets[n]; if (!ws) return;
      var m = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      m.forEach(function (r) { while (r && r.length && (r[r.length - 1] === null || r[r.length - 1] === '')) r.pop(); });
      while (m.length && (!m[m.length - 1] || !m[m.length - 1].length)) m.pop();
      out[n] = m;
    });
    if (!out['Planning Build']) throw new Error('Onglet « Planning Build » introuvable.');
    return out;
  }
  function toB64(bytes) { var s = '', i = 0; for (; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
  function fromB64(b64) { var s = atob(b64), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  async function pipe(bytes, stream) {
    var res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  async function encode(sheets) {
    var raw = new TextEncoder().encode(JSON.stringify(sheets));
    if (typeof CompressionStream === 'undefined') return 'j:' + toB64(raw);
    return 'z:' + toB64(await pipe(raw, new CompressionStream('gzip')));
  }
  async function decode(txt) {
    var kind = txt.slice(0, 2), bytes = fromB64(txt.slice(2));
    if (kind === 'z:') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  // Reconstruit un vrai fichier .xlsx : les outils le relisent par leur chemin habituel.
  function toFile(sheets, name, id) {
    var wb = XLSX.utils.book_new();
    SHEETS.forEach(function (n) {
      if (!sheets[n]) return;
      var ws = XLSX.utils.aoa_to_sheet(sheets[n]);
      // Les premières lignes/colonnes du planning sont vides : sans cela la plage démarre à la 1re cellule remplie et décale tout.
      var rg = XLSX.utils.decode_range(ws['!ref'] || 'A1'); rg.s = { r: 0, c: 0 }; ws['!ref'] = XLSX.utils.encode_range(rg);
      XLSX.utils.book_append_sheet(wb, ws, n);
    });
    var ab = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var f = new File([ab], name.replace(/[\\/:*?"<>|]+/g, '-') + '.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    f.tkStoreId = id;
    return f;
  }

  // ── Interface ───────────────────────────────────────────────────
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
  function mount(el, opts) {
    if (!document.getElementById('tk-ps-css')) { var st = document.createElement('style'); st.id = 'tk-ps-css'; st.textContent = CSS; document.head.appendChild(st); }
    el.innerHTML = '<div class="tk-ps"><div class="tk-ps-row"><span class="tk-ps-lbl">Versions enregistrées</span>' +
      '<select aria-label="Versions enregistrées"></select>' +
      '<button type="button" class="pri" data-a="load">Charger</button>' +
      '<button type="button" data-a="save" title="Enregistre le fichier planning actuellement chargé dans la base partagée">Enregistrer ce fichier</button>' +
      '<button type="button" data-a="del" title="Supprimer la version sélectionnée">🗑</button></div><div class="tk-ps-msg"></div></div>';
    var sel = el.querySelector('select'), msg = el.querySelector('.tk-ps-msg');
    var bLoad = el.querySelector('[data-a=load]'), bSave = el.querySelector('[data-a=save]'), bDel = el.querySelector('[data-a=del]');
    function say(t, kind) { msg.textContent = t || ''; msg.className = 'tk-ps-msg' + (kind ? ' ' + kind : ''); }
    var usable = false, hasRows = false;
    function lock(busy) {
      sel.disabled = busy || !usable || !hasRows; bSave.disabled = busy || !usable;
      bLoad.disabled = bDel.disabled = busy || !usable || !hasRows;
    }
    function guard(title, step, fn) {
      return async function () {
        if (root.TKLoader) { TKLoader.show(title, step); await TKLoader.paint(); }
        lock(true);
        try { await fn(); }
        catch (e) { console.error(e); say('Erreur : ' + (e && e.message || e), 'err'); }
        finally { lock(false); if (root.TKLoader) TKLoader.hide(); }
      };
    }
    async function refresh(selectId) {
      var s = await getSession();
      if (!s) {
        sel.innerHTML = '<option>Connexion requise</option>'; usable = false; hasRows = false; lock(false);
        say('Connectez-vous depuis le lanceur pour utiliser les versions enregistrées.');
        return;
      }
      usable = true;
      var r = await db().from(TABLE).select('id,nom,auteur,cree_le,taille_ko').order('cree_le', { ascending: false });
      if (r.error) { sel.innerHTML = '<option>Indisponible</option>'; usable = false; lock(false); say('Versions indisponibles : ' + r.error.message, 'err'); return; }
      var rows = r.data || [];
      sel.innerHTML = rows.length ? '' : '<option value="">Aucune version enregistrée</option>';
      rows.forEach(function (v) {
        var o = document.createElement('option'); o.value = v.id;
        o.textContent = v.nom + ' — ' + (v.auteur ? v.auteur + ' · ' : '') + fmtDate(v.cree_le);
        sel.appendChild(o);
      });
      if (selectId) sel.value = String(selectId);
      hasRows = rows.length > 0; lock(false);
      say(rows.length ? rows.length + ' version(s) enregistrée(s).' : '');
    }
    bLoad.onclick = guard('Chargement de la version…', 'Lecture de la base…', async function () {
      if (!sel.value) return;
      var r = await db().from(TABLE).select('nom,donnees').eq('id', sel.value).single();
      if (r.error) throw r.error;
      if (root.TKLoader) TKLoader.set(40, 'Décompression…');
      var sheets = await decode(r.data.donnees);
      if (root.TKLoader) { TKLoader.set(70, 'Reconstitution du fichier…'); await TKLoader.paint(); }
      var file = toFile(sheets, r.data.nom, Number(sel.value));
      say('Version « ' + r.data.nom + ' » chargée.', 'ok');
      // Le chargement du fichier reprend son propre écran de chargement.
      await opts.onLoad(file);
    });
    bSave.onclick = guard('Enregistrement…', 'Lecture du fichier…', async function () {
      var file = opts.getFile && opts.getFile();
      if (!file) { say('Chargez d\'abord un fichier planning.', 'err'); return; }
      if (file.tkStoreId) { say('Ce fichier provient déjà d\'une version enregistrée.'); return; }
      var s = await getSession(); if (!s) { say('Connectez-vous depuis le lanceur pour enregistrer.', 'err'); return; }
      var def = file.name.replace(/\.[^.]+$/, '') + ' — ' + new Date().toISOString().slice(0, 10);
      var nom = root.prompt('Nom de la version à enregistrer', def);
      if (!nom || !nom.trim()) { say(''); return; }
      var sheets = await extract(file);
      if (root.TKLoader) TKLoader.set(50, 'Compression…');
      var donnees = await encode(sheets);
      if (root.TKLoader) TKLoader.set(75, 'Envoi à la base partagée…');
      var A = auth();
      var ins = await db().from(TABLE).insert({
        nom: nom.trim(), fichier: file.name, taille_ko: Math.round(donnees.length / 1024), donnees: donnees,
        cree_par: s.user.id, auteur: A.nomAffichage ? A.nomAffichage(s.user.email) : (s.user.email || '')
      }).select('id').single();
      if (ins.error) throw ins.error;
      await refresh(ins.data.id);
      say('Version « ' + nom.trim() + ' » enregistrée (' + Math.round(donnees.length / 1024) + ' Ko).', 'ok');
    });
    bDel.onclick = guard('Suppression…', '', async function () {
      if (!sel.value) return;
      var label = sel.options[sel.selectedIndex].textContent;
      if (!root.confirm('Supprimer définitivement la version :\n' + label + ' ?')) return;
      var r = await db().from(TABLE).delete().eq('id', sel.value);
      if (r.error) throw r.error;
      await refresh();
      say('Version supprimée.', 'ok');
    });
    refresh().catch(function (e) { say('Versions indisponibles : ' + (e && e.message || e), 'err'); });
    return { refresh: refresh };
  }
  root.TKPlanStore = { mount: mount, _extract: extract, _encode: encode, _decode: decode, _toFile: toFile };
})(window);
