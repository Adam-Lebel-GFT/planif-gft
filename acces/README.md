# Système d'accès — mise en service

Ce dossier contient le système d'accès dynamique du toolkit : connexion,
rôles, comptes utilisateurs et journal de connexion. Voir
`docs/analyse-acces-dynamique.md` pour l'analyse fonctionnelle complète.

Il s'appuie sur le projet Supabase déjà utilisé par `poker-planning`
(même URL/clé, voir `acces/config.js`).

## 1. Exécuter le schéma SQL

Dans le tableau de bord Supabase du projet → **SQL Editor** → coller le
contenu de `acces/schema.sql` → **Run**.

Le script est idempotent (peut être relancé sans dupliquer les données).
Il crée les tables (`roles`, `role_outils`, `profils`, `utilisateur_roles`,
`connexions`), la sécurité (Row Level Security) et un rôle **Admin** par
défaut avec accès à tous les outils.

## 2. Désactiver la confirmation par e-mail

Comme il n'y a pas d'adresse e-mail réelle (voir l'analyse fonctionnelle,
§7), les comptes utilisent en interne une adresse technique invisible
(`nom.utilisateur@planif-gft.local`). Il faut donc désactiver la
confirmation par e-mail, sans quoi un compte fraîchement créé resterait
bloqué en attente d'un e-mail qui n'arrivera jamais :

Tableau de bord Supabase → **Authentication** → **Sign In / Providers** →
**Email** → désactiver **Confirm email**.

## 3. Créer le tout premier compte administrateur

Le premier compte ne peut pas être créé depuis l'écran "Utilisateurs" de
l'application, puisque cet écran est lui-même réservé aux administrateurs
(en créer un nécessite déjà d'en être un). Il se crée donc une seule fois,
à la main :

1. Tableau de bord Supabase → **Authentication** → **Users** → **Add
   user** :
   - Email : `votrenom@planif-gft.local` (remplacez `votrenom` par le nom
     d'utilisateur souhaité)
   - Password : le mot de passe que vous voulez utiliser
   - Cochez **Auto Confirm User**
   - Notez l'**UUID** du compte créé (colonne `UID`, visible dans la liste
     après création).
2. Toujours dans le **SQL Editor**, exécutez (en remplaçant `<uuid>` et
   `votrenom`) :
   ```sql
   insert into public.profils (id, nom_utilisateur, actif, doit_changer_mot_de_passe)
   values ('<uuid>', 'votrenom', true, false);

   insert into public.utilisateur_roles (utilisateur_id, role_id)
   select '<uuid>', id from public.roles where nom = 'Admin';
   ```
3. Ouvrez le site, connectez-vous avec `votrenom` / le mot de passe choisi
   à l'étape 1. Vous avez maintenant accès à **Administration** et pouvez
   créer les comptes du chef de projet et du directeur de programme
   directement depuis l'écran "Utilisateurs".

## Ce que l'écran admin peut faire — et ses limites

Le site n'a pas de serveur : le navigateur parle directement à Supabase
avec une clé publique ("anon key"), jamais avec la clé secrète
("service role"). Deux conséquences à connaître :

- **Créer un compte** fonctionne entièrement depuis l'écran
  "Utilisateurs" (nom d'utilisateur + mot de passe temporaire proposé
  automatiquement + rôles).
- **Réinitialiser le mot de passe d'un compte existant** (mot de passe
  oublié, compte bloqué) n'est **pas** possible depuis l'écran admin —
  changer le mot de passe d'un tiers exige la clé secrète, qu'on ne met
  jamais dans une page web publique. La réinitialisation se fait
  manuellement : Authentication → Users → sélectionner le compte →
  **Reset password**, dans le tableau de bord Supabase. L'écran
  "Utilisateurs" peut en revanche forcer, en un clic, la demande d'un
  nouveau mot de passe à la prochaine connexion (utile juste après une
  réinitialisation faite côté tableau de bord).
- **Supprimer** définitivement un compte (plutôt que le désactiver) se
  fait au même endroit (Authentication → Users → supprimer).

Si l'automatisation complète de la réinitialisation devient nécessaire,
la solution propre est une **Supabase Edge Function** (petite fonction
serveur qui, elle, peut détenir la clé secrète en toute sécurité) —
non incluse dans cette première version pour rester sans build ni
déploiement supplémentaire.
