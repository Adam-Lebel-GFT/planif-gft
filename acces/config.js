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
  domaine: 'planif-gft.local'
};
