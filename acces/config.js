/* ════════════════════════════════════════════════════════════
   Agile Toolkit — Système d'accès (connexion / rôles / journal)
   Réutilise le même projet Supabase que poker-planning.
   ════════════════════════════════════════════════════════════ */
window.ACCES_CONFIG = {
  url: 'https://lyahaxyexgjxpezemwhv.supabase.co',
  key: 'sb_publishable_Ziv8IiMxMlTc7QpqpJOcwA_hif8DOSd',
  // Préfixe + domaine utilisés pour transformer un nom d'utilisateur en
  // adresse e-mail interne exigée par Supabase Auth. Invisible pour les
  // utilisateurs : ils ne voient et ne saisissent jamais que leur nom
  // d'utilisateur. Voir acces/README.md.
  //
  // IMPORTANT : l'endpoint /signup de Supabase Auth (utilisé pour créer
  // un compte depuis l'écran "Utilisateurs") rejette tout domaine
  // inventé, quel que soit le TLD (.local, .io, peu importe) — erreur
  // "Example and test domains are currently not supported". Il faut un
  // domaine avec un vrai serveur mail derrière. On utilise donc le
  // domaine réel de l'entreprise, avec un sous-adressage "+" qui crée
  // une adresse techniquement distincte de toute vraie boîte mail
  // (ex. planif-gft+mwalker@gft.com n'est l'adresse de personne, même
  // si un jour un vrai "mwalker" existe chez GFT) — jamais d'e-mail
  // réel envoyé (Confirm email désactivé), jamais consultée par qui
  // que ce soit.
  emailPrefix: 'planif-gft+',
  domaine: 'gft.com'
};
