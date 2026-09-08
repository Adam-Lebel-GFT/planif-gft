# Analyse fonctionnelle — Système d'accès dynamique

Agile Toolkit (`planif-gft`) — accès pour un chef de projet et un
directeur de programme, avec gestion des rôles et journal de connexion.

## 1. Contexte et objectifs

Les outils du toolkit (sprint-planning, releases-planning,
analyse-capacite, bug-dashboard, whiteboard, poker-planning) sont des
pages web autonomes, sans authentification. On ouvre maintenant l'accès
à des personnes externes à l'équipe technique — un chef de projet et un
directeur de programme — avec :

- un compte que chacun utilise (nom d'utilisateur + mot de passe),
- des droits pilotés par des **rôles créés dynamiquement**, pas codés en
  dur par personne,
- une traçabilité des connexions.

## 2. Acteurs et rôles

Les rôles ne sont **pas figés** : ils sont créés, renommés et supprimés
par l'administrateur depuis l'écran "Rôles". Chaque rôle donne accès à
un sous-ensemble des outils du toolkit, au choix (cases à cocher). Un
utilisateur peut cumuler plusieurs rôles.

Exemples de rôles à créer au démarrage : *Chef de projet*, *Directeur de
programme*, *Admin* (ce dernier est créé automatiquement à l'installation
avec accès à tous les outils, voir §6).

## 3. Modèle de droits

```
Utilisateur ──▶ un ou plusieurs Rôles ──▶ chaque Rôle débloque des Outils
```

Deux listes, deux écrans d'administration :

- **Écran "Rôles"** : créer/modifier/supprimer un rôle, cocher les
  outils qu'il donne.
- **Écran "Utilisateurs"** : créer un compte, cocher le(s) rôle(s)
  attribué(s), activer/désactiver.

## 4. Comptes utilisateurs

- Pas d'auto-inscription : l'administrateur crée chaque compte
  (gestion manuelle, pour démarrer).
- **Pas d'adresse e-mail** : l'identifiant est un nom d'utilisateur
  choisi par l'administrateur.
- À la création, un **mot de passe temporaire est proposé
  automatiquement** (généré aléatoirement, différent à chaque compte —
  pas de mot de passe par défaut partagé, pour éviter qu'un compte non
  encore utilisé soit accessible à n'importe qui connaissant le
  pattern). L'administrateur peut le remplacer avant de valider.
- **Première connexion** : l'utilisateur saisit son nom d'utilisateur +
  le mot de passe temporaire → redirection automatique et obligatoire
  vers un écran "Créer votre mot de passe" avant tout accès à l'outil.
- **Mot de passe oublié / compte bloqué** : pas de flux automatique par
  e-mail (puisqu'il n'y en a pas). L'administrateur régénère l'accès
  manuellement (voir §7, limite technique).
- Un compte peut être **désactivé** sans être supprimé : l'accès est
  coupé immédiatement, sans toucher au mot de passe.

## 5. Accès au site et journal de connexion

- L'URL du site amène directement à un écran de connexion — aucun
  contenu visible avant authentification.
- Une fois connecté, seuls les outils autorisés par le(s) rôle(s) de la
  personne apparaissent.
- Chaque connexion réussie ajoute une ligne au **journal de connexion**
  (utilisateur, date/heure), consultable par l'administrateur depuis
  l'écran "Journal de connexion" (filtrable par utilisateur).

## 6. Écrans

1. **Connexion** — nom d'utilisateur + mot de passe (porte d'entrée
   unique du site).
2. **Créer votre mot de passe** — forcé à la première connexion.
3. **Rôles** *(admin)* — liste des rôles, création/édition avec cases à
   cocher des outils.
4. **Utilisateurs** *(admin)* — liste des comptes, création (nom +
   mot de passe proposé + rôles cochés), activer/désactiver, forcer un
   nouveau mot de passe à la prochaine connexion.
5. **Journal de connexion** *(admin)* — utilisateur + date, filtrable.

L'accès aux écrans 3 à 5 est lui-même piloté par un rôle : "Admin" donne
accès à l'outil spécial `admin`, au même titre qu'un rôle "Chef de
projet" donne accès à `sprint-planning`. Rien n'est codé en dur.

## 7. Choix techniques et limites

**Authentification : Supabase**, réutilise le projet déjà en place pour
`poker-planning`. Comme il n'y a pas d'e-mail réel, chaque nom
d'utilisateur est associé en interne (invisible pour la personne) à une
adresse technique `nom.utilisateur@planif-gft.local`, uniquement pour
satisfaire l'exigence technique de Supabase Auth.

**Sécurité des données** : le site n'a pas de serveur — le navigateur
parle directement à Supabase avec une clé publique. Toute la logique de
droits (qui peut lire/écrire quoi) est donc appliquée côté base de
données (Row Level Security), pas seulement dans l'interface.

**Deux opérations restent manuelles**, faute de pouvoir utiliser la clé
secrète Supabase dans une page web publique :
- **Réinitialiser le mot de passe** d'un compte existant (mot de passe
  oublié, compte bloqué) : à faire depuis le tableau de bord Supabase,
  pas depuis l'écran "Utilisateurs". L'écran peut en revanche forcer la
  demande d'un nouveau mot de passe à la prochaine connexion.
- **Supprimer** définitivement un compte : idem, tableau de bord
  Supabase (l'écran "Utilisateurs" propose la désactivation, qui coupe
  l'accès immédiatement sans supprimer le compte).

Voir `acces/README.md` pour la mise en service (schéma SQL à exécuter,
réglage à changer dans Supabase, création du tout premier compte
administrateur) et le détail de ces limites.

## 8. Suite possible

- Édition Edge Function Supabase pour automatiser entièrement la
  réinitialisation de mot de passe depuis l'écran admin (nécessite un
  déploiement supplémentaire, volontairement écarté de cette première
  version).
- Accès plus fin qu'un simple rôle → outil, si le besoin apparaît
  (ex. un chef de projet limité à certaines équipes plutôt qu'à tout
  l'outil).
