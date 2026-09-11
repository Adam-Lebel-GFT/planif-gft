/* ════════════════════════════════════════════════════════════
   Agile Toolkit — Système d'accès
   Module partagé entre index.html (login + lanceur) et
   acces/admin.html (rôles / utilisateurs / journal).
   Nécessite, chargés avant ce fichier :
     <script src="acces/config.js"></script>
     <script src="acces/supabase.js"></script>
   ════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var SB = (typeof supabase !== 'undefined' && supabase && supabase.createClient)
    ? supabase
    : (root.supabase || null);
  var CFG = root.ACCES_CONFIG || {};

  // Catalogue des outils du toolkit. Ajouter un outil = ajouter une
  // ligne ici (utilisée par le lanceur pour l'affichage et par
  // l'écran "Rôles" pour les cases à cocher) — aucune autre étape
  // de code n'est nécessaire, le reste est piloté par la base.
  var OUTILS = [
    { slug: 'sprint-planning',   label: 'Sprint Planning' },
    { slug: 'poker-planning',    label: 'Poker Planning' },
    { slug: 'analyse-capacite',  label: 'Analyse de capacité' },
    { slug: 'whiteboard',        label: 'Whiteboard' },
    { slug: 'releases-planning', label: 'Plan de livraisons' },
    { slug: 'bug-dashboard',     label: 'Bug Dashboard (lite)' },
    { slug: 'bug-dashboard-v2',  label: 'Bug Dashboard v2 (radar)' },
    { slug: 'admin',             label: 'Administration (accès dynamique)' }
  ];

  var client = null;
  function getClient() {
    if (!SB) throw new Error('Librairie Supabase introuvable (acces/supabase.js manquant).');
    if (!client) {
      client = SB.createClient(CFG.url, CFG.key, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    }
    return client;
  }

  // L'identifiant de connexion est l'adresse e-mail GFT de la personne
  // (@gft.com) — pas de domaine technique inventé, pas d'indirection :
  // ce que l'admin saisit à la création du compte est ce que la
  // personne retape pour se connecter.
  function normaliserEmail(email) {
    return String(email || '').trim().toLowerCase();
  }
  function emailValide(email) {
    return /^[a-z0-9._%+-]+@gft\.com$/.test(normaliserEmail(email));
  }
  // Nom court dérivé de l'adresse (partie avant @), utilisé uniquement
  // pour l'affichage (listes, journal) — jamais pour se connecter.
  function nomAffichage(email) {
    return normaliserEmail(email).split('@')[0];
  }

  async function getSession() {
    var res = await getClient().auth.getSession();
    return res && res.data ? res.data.session : null;
  }

  async function seConnecter(email, motDePasse) {
    var res = await getClient().auth.signInWithPassword({
      email: normaliserEmail(email),
      password: motDePasse
    });
    if (!res.error) marquerActivite();
    return res;
  }

  async function seDeconnecter() {
    oublierActivite();
    return getClient().auth.signOut();
  }

  /* ── Expiration de session sur inactivité ────────────────────
     Supabase sait le faire côté serveur ("Inactivity timeout"),
     mais uniquement à partir du plan Pro. On l'applique donc ici :
     l'horodatage de la dernière activité est partagé entre les
     onglets via localStorage, et vérifié à la fois pendant que la
     page est ouverte (toutes les 30 s) et à chaque chargement —
     fermer l'onglet et revenir deux heures plus tard déconnecte
     donc aussi. */
  var INACTIVITE_MS = 60 * 60 * 1000;          // 1 heure
  var CLE_ACTIVITE = 'planif_acces_derniere_activite';
  var PERIODE_VERIF_MS = 30 * 1000;
  var ECART_ECRITURE_MS = 30 * 1000;           // n'écrit pas à chaque geste

  function marquerActivite() {
    try { localStorage.setItem(CLE_ACTIVITE, String(Date.now())); } catch (e) { /* stockage indisponible */ }
  }
  function oublierActivite() {
    try { localStorage.removeItem(CLE_ACTIVITE); } catch (e) { /* idem */ }
  }
  function derniereActivite() {
    try {
      var v = parseInt(localStorage.getItem(CLE_ACTIVITE), 10);
      return isNaN(v) ? null : v;
    } catch (e) { return null; }
  }
  // Sans horodatage connu (premier chargement après la mise en place,
  // navigation privée, stockage bloqué), on ne déconnecte pas : on
  // repart de maintenant.
  function inactiviteDepassee() {
    var t = derniereActivite();
    if (t === null) { marquerActivite(); return false; }
    return (Date.now() - t) > INACTIVITE_MS;
  }

  // onExpire() est appelé après la déconnexion effective ; chaque page
  // décide quoi afficher (écran de login, redirection...).
  function demarrerSurveillanceInactivite(onExpire) {
    var dernierEcrit = 0;
    var termine = false;

    function activite() {
      var maintenant = Date.now();
      if (maintenant - dernierEcrit < ECART_ECRITURE_MS) return;
      dernierEcrit = maintenant;
      marquerActivite();
    }
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'focus'].forEach(function (ev) {
      root.addEventListener(ev, activite, { passive: true, capture: true });
    });

    async function verifier() {
      if (termine || !inactiviteDepassee()) return;
      termine = true;
      await seDeconnecter();
      if (typeof onExpire === 'function') onExpire();
    }
    setInterval(verifier, PERIODE_VERIF_MS);
    root.addEventListener('visibilitychange', function () {
      if (!document.hidden) verifier();
    });
  }

  // Version « page d'outil » : à appeler depuis un outil qui partage la
  // session (sprint, radar, plan de livraisons...). Indispensable pour
  // que le temps passé dans l'outil compte comme de l'activité — sinon
  // une heure de travail dans un outil déconnecterait du lanceur. À
  // l'expiration, la session est coupée et la page rechargée : l'outil
  // revient en mode local, son contenu local est conservé.
  async function surveillerInactiviteOutil() {
    var session = await getSession();
    if (!session) return;
    if (inactiviteDepassee()) {
      await seDeconnecter();
      root.location.reload();
      return;
    }
    marquerActivite();
    demarrerSurveillanceInactivite(function () { root.location.reload(); });
  }

  // Fiche du compte connecté (nom d'utilisateur, actif, doit changer
  // son mot de passe). Une seule ligne, la sienne (RLS).
  async function monProfil() {
    var session = await getSession();
    if (!session) return null;
    var res = await getClient()
      .from('profils')
      .select('id, nom_utilisateur, actif, doit_changer_mot_de_passe')
      .eq('id', session.user.id)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  }

  // Outils accessibles au compte connecté (fonction serveur : renvoie
  // un ensemble vide si le compte est désactivé, même si le mot de
  // passe est encore valide).
  async function mesOutils() {
    var res = await getClient().rpc('mes_outils');
    if (res.error) throw res.error;
    return (res.data || []).map(function (r) { return r.outil; });
  }

  async function marquerMotDePasseChange() {
    var res = await getClient().rpc('marquer_mot_de_passe_change');
    if (res.error) throw res.error;
  }

  async function changerMotDePasse(nouveauMotDePasse) {
    var res = await getClient().auth.updateUser({ password: nouveauMotDePasse });
    if (res.error) throw res.error;
  }

  // À appeler juste après une connexion réussie (mot de passe déjà
  // validé par Supabase Auth) : une ligne = une connexion.
  async function enregistrerConnexion() {
    var session = await getSession();
    if (!session) return;
    await getClient().from('connexions').insert({ utilisateur_id: session.user.id });
  }

  // Génère un mot de passe temporaire lisible (proposé par défaut à
  // la création d'un compte, modifiable avant validation). Il n'a pas
  // besoin d'être mémorisable : l'écran "Changer mon mot de passe" en
  // impose un nouveau dès la première connexion.
  function genererMotDePasseTemporaire() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var out = '';
    var rnd = new Uint32Array(12);
    (root.crypto || root.msCrypto).getRandomValues(rnd);
    for (var i = 0; i < 12; i++) out += alphabet[rnd[i] % alphabet.length];
    return out;
  }

  root.PlanifAuth = {
    OUTILS: OUTILS,
    getClient: getClient,
    normaliserEmail: normaliserEmail,
    emailValide: emailValide,
    nomAffichage: nomAffichage,
    INACTIVITE_MS: INACTIVITE_MS,
    marquerActivite: marquerActivite,
    inactiviteDepassee: inactiviteDepassee,
    demarrerSurveillanceInactivite: demarrerSurveillanceInactivite,
    surveillerInactiviteOutil: surveillerInactiviteOutil,
    getSession: getSession,
    seConnecter: seConnecter,
    seDeconnecter: seDeconnecter,
    monProfil: monProfil,
    mesOutils: mesOutils,
    marquerMotDePasseChange: marquerMotDePasseChange,
    changerMotDePasse: changerMotDePasse,
    enregistrerConnexion: enregistrerConnexion,
    genererMotDePasseTemporaire: genererMotDePasseTemporaire
  };
})(window);
