# Système d'accès — mise en service

Ce dossier contient le système d'accès dynamique du toolkit : connexion,
rôles, comptes utilisateurs et journal de connexion. Voir
`docs/analyse-acces-dynamique.md` pour l'analyse fonctionnelle complète.

Il s'appuie sur le projet Supabase déjà utilisé par `poker-planning`
(même URL/clé, voir `acces/config.js`).

**Connexion = adresse e-mail GFT (`@gft.com`) + mot de passe.** Pas de
nom d'utilisateur ni de domaine technique inventé : l'admin saisit la
vraie adresse de la personne à la création du compte, et c'est ce
qu'elle retape pour se connecter.

## 1. Exécuter le schéma SQL — ✅ déjà fait

Le schéma a été appliqué directement au projet Supabase (`lyahaxyexgjxpezemwhv`)
via le connecteur Supabase de Claude. Les tables (`roles`, `role_outils`,
`profils`, `utilisateur_roles`, `connexions`), la sécurité (Row Level
Security, durcie suite aux advisors : fonctions non appelables par
`anon`) et le rôle **Admin** par défaut sont en place. `acces/schema.sql`
reflète exactement cet état — il reste utile si vous deviez un jour
recréer ce schéma sur un autre projet Supabase (il est idempotent, on
peut le relancer sans dupliquer les données).

## 2. Désactiver la confirmation par e-mail — à faire à la main

Même si l'adresse e-mail utilisée est réelle, aucun e-mail de
confirmation ne doit partir (pas de vraie boîte suivie derrière). C'est
un réglage d'authentification, pas un réglage de base de données : le
connecteur Supabase de Claude ne l'expose pas, il se fait uniquement
depuis le tableau de bord :

Tableau de bord Supabase → **Authentication** → **Sign In / Providers** →
**Email** → désactiver **Confirm email**.

### Pièges déjà rencontrés sur ce projet

- **"Email logins are disabled"** à la connexion → le fournisseur
  **Email** lui-même était désactivé (interrupteur séparé de "Confirm
  email", tout en haut du même panneau). Vérifiez qu'il est activé.
- **"Example and test domains are currently not supported"** → on est
  passé par une adresse technique inventée au tout début (nom
  d'utilisateur + domaine fictif) ; Supabase Auth la refusait
  systématiquement à la création (endpoint `/signup`), quel que soit le
  domaine choisi. D'où le choix final : la vraie adresse `@gft.com` de
  la personne, plus simple et qui ne pose plus ce problème.
- **"email rate limit exceeded"** à la création d'un compte → le
  service d'e-mail intégré par défaut de Supabase a un quota très bas
  (souvent 2/heure), même quand aucun e-mail n'est réellement envoyé.
  En cas de blocage : attendre que le quota se réinitialise, créer le
  compte depuis le tableau de bord (Authentication → Users → Add user,
  voir étape 3, qui n'est pas soumis à ce quota), ou configurer un SMTP
  personnalisé (Authentication → Settings → SMTP Settings) pour lever
  la limite définitivement.

## 3. Créer le tout premier compte administrateur

Le premier compte ne peut pas être créé depuis l'écran "Utilisateurs" de
l'application, puisque cet écran est lui-même réservé aux administrateurs
(en créer un nécessite déjà d'en être un). Il se crée donc une seule fois,
à la main :

1. Tableau de bord Supabase → **Authentication** → **Users** → **Add
   user** :
   - Email : votre adresse `@gft.com`
   - Password : le mot de passe que vous voulez utiliser
   - Cochez **Auto Confirm User**
2. Dites à Claude l'adresse choisie — il retrouve le compte et
   exécute pour vous :
   ```sql
   insert into public.profils (id, nom_utilisateur, actif, doit_changer_mot_de_passe)
   values ('<uuid trouvé via auth.users>', '<partie avant @, ex. jdupont>', true, false);

   insert into public.utilisateur_roles (utilisateur_id, role_id)
   select '<uuid>', id from public.roles where nom = 'Admin';
   ```
3. Ouvrez le site, connectez-vous avec votre adresse `@gft.com` / le mot
   de passe choisi à l'étape 1. Vous avez maintenant accès à
   **Administration** et pouvez créer les comptes du chef de projet et
   du directeur de programme directement depuis l'écran "Utilisateurs".

## Ce que l'écran admin peut faire — et ses limites

Le site n'a pas de serveur : le navigateur parle directement à Supabase
avec une clé publique ("anon key"), jamais avec la clé secrète
("service role"). Deux conséquences à connaître :

- **Créer un compte** fonctionne entièrement depuis l'écran
  "Utilisateurs" (adresse e-mail GFT + mot de passe temporaire proposé
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
