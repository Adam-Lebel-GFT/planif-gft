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

  // Le nom d'utilisateur est tout ce que la personne voit et saisit.
  // En interne, Supabase Auth a besoin d'une adresse e-mail : on lui
  // en fabrique une, invisible, sur un domaine technique dédié.
  function normaliserNomUtilisateur(nom) {
    return String(nom || '').trim().toLowerCase();
  }
  function nomUtilisateurValide(nom) {
    return /^[a-z0-9._-]{3,32}$/.test(nom);
  }
  function emailInterne(nomUtilisateur) {
    var prefixe = CFG.emailPrefix || '';
    return prefixe + normaliserNomUtilisateur(nomUtilisateur) + '@' + (CFG.domaine || 'gft.com');
  }

  async function getSession() {
    var res = await getClient().auth.getSession();
    return res && res.data ? res.data.session : null;
  }

  async function seConnecter(nomUtilisateur, motDePasse) {
    var nom = normaliserNomUtilisateur(nomUtilisateur);
    return getClient().auth.signInWithPassword({
      email: emailInterne(nom),
      password: motDePasse
    });
  }

  async function seDeconnecter() {
    return getClient().auth.signOut();
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
    normaliserNomUtilisateur: normaliserNomUtilisateur,
    nomUtilisateurValide: nomUtilisateurValide,
    emailInterne: emailInterne,
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
