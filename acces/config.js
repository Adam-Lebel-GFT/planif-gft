/* ════════════════════════════════════════════════════════════
   Agile Toolkit — Système d'accès (connexion / rôles / journal)
   Réutilise le même projet Supabase que poker-planning.
   ════════════════════════════════════════════════════════════ */
window.ACCES_CONFIG = {
  url: 'https://lyahaxyexgjxpezemwhv.supabase.co',
  key: 'sb_publishable_Ziv8IiMxMlTc7QpqpJOcwA_hif8DOSd',
  // Domaine technique utilisé pour transformer un nom d'utilisateur en
  // adresse e-mail interne exigée par Supabase Auth. Invisible pour les
  // utilisateurs : ils ne voient et ne saisissent jamais que leur nom
  // d'utilisateur. Voir acces/README.md.
  //
  // IMPORTANT : ne pas utiliser un TLD réservé (.local, .test, .invalid,
  // .example, .localhost...) — l'API Supabase Auth (endpoint /signup)
  // les rejette comme adresses invalides à la création d'un compte,
  // même si la connexion avec un compte déjà existant sur un tel domaine
  // continue de fonctionner.
  domaine: 'planif-gft.io'
};
