-- ════════════════════════════════════════════════════════════════════
-- Agile Toolkit — Système d'accès dynamique
-- Schéma Supabase : rôles, utilisateurs, journal de connexion.
--
-- À exécuter une seule fois dans Supabase → SQL Editor (projet utilisé
-- par poker-planning, voir acces/config.js). Idempotent : peut être
-- relancé sans dupliquer les données.
--
-- Voir acces/README.md pour les étapes de configuration qui
-- accompagnent ce script (désactivation de la confirmation par e-mail,
-- création du tout premier compte admin).
-- ════════════════════════════════════════════════════════════════════

-- ── Rôles ──────────────────────────────────────────────────────────
-- Un rôle = un nom + la liste des outils qu'il débloque (table
-- role_outils). Créés et modifiés depuis l'écran admin "Rôles".
create table if not exists public.roles (
  id          bigint generated always as identity primary key,
  nom         text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

-- Catalogue des outils : sprint-planning, poker-planning,
-- analyse-capacite, whiteboard, releases-planning, bug-dashboard, bug-dashboard-v2,
-- + 'admin' (accès aux 3 écrans d'administration eux-mêmes).
-- Le slug est une chaîne libre (pas de table de référence séparée) :
-- ajouter un outil = ajouter son slug ici depuis l'écran "Rôles",
-- aucune migration nécessaire.
create table if not exists public.role_outils (
  role_id bigint not null references public.roles(id) on delete cascade,
  outil   text   not null,
  primary key (role_id, outil)
);

-- ── Utilisateurs ───────────────────────────────────────────────────
-- Un profil = un compte applicatif, lié 1-1 à un compte Supabase Auth
-- (auth.users). Le mot de passe lui-même est géré par Supabase Auth,
-- jamais stocké ici.
create table if not exists public.profils (
  id                          uuid primary key references auth.users(id) on delete cascade,
  nom_utilisateur             text not null unique,
  actif                       boolean not null default true,
  doit_changer_mot_de_passe   boolean not null default true,
  created_at                  timestamptz not null default now()
);

-- Un utilisateur peut cumuler plusieurs rôles.
create table if not exists public.utilisateur_roles (
  utilisateur_id uuid   not null references public.profils(id) on delete cascade,
  role_id        bigint not null references public.roles(id) on delete cascade,
  primary key (utilisateur_id, role_id)
);
create index if not exists utilisateur_roles_role_id_idx on public.utilisateur_roles (role_id);

-- ── Journal de connexion ──────────────────────────────────────────
create table if not exists public.connexions (
  id             bigint generated always as identity primary key,
  utilisateur_id uuid not null references public.profils(id) on delete cascade,
  date_heure     timestamptz not null default now()
);
create index if not exists connexions_date_idx on public.connexions (date_heure desc);
create index if not exists connexions_utilisateur_idx on public.connexions (utilisateur_id);

-- ════════════════════════════════════════════════════════════════════
-- Sécurité (Row Level Security)
--
-- Le site n'a pas de serveur : le navigateur parle directement à
-- Supabase avec une clé publique ("anon key"). Tout ce que peut faire
-- un utilisateur doit donc être explicitement autorisé ici — sans
-- policy, l'accès est refusé par défaut.
-- ════════════════════════════════════════════════════════════════════

alter table public.roles            enable row level security;
alter table public.role_outils      enable row level security;
alter table public.profils          enable row level security;
alter table public.utilisateur_roles enable row level security;
alter table public.connexions       enable row level security;

-- Fonction utilitaire : le compte connecté a-t-il, via un de ses rôles,
-- l'outil spécial 'admin' ? SECURITY DEFINER = elle lit les tables
-- sans repasser par ces mêmes policies (évite toute récursion).
create or replace function public.est_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.utilisateur_roles ur
    join public.role_outils ro on ro.role_id = ur.role_id
    where ur.utilisateur_id = auth.uid()
      and ro.outil = 'admin'
  );
$$;
-- Supabase accorde EXECUTE à anon + authenticated par défaut sur toute
-- nouvelle fonction (ALTER DEFAULT PRIVILEGES du projet) : cette
-- fonction n'a pas besoin d'être appelable sans être connecté.
revoke execute on function public.est_admin() from anon;
grant execute on function public.est_admin() to authenticated;

-- Rôles / outils des rôles : gestion réservée à l'admin (écran
-- "Rôles"). Un utilisateur standard n'a pas besoin de lire ces tables
-- directement : il passe par mes_outils() ci-dessous.
create policy "roles_admin_all" on public.roles
  for all using (public.est_admin()) with check (public.est_admin());

create policy "role_outils_admin_all" on public.role_outils
  for all using (public.est_admin()) with check (public.est_admin());

-- Profils : l'admin gère tout depuis l'écran "Utilisateurs" ; chacun
-- peut en plus lire (seulement lire) sa propre fiche.
create policy "profils_admin_all" on public.profils
  for all using (public.est_admin()) with check (public.est_admin());

create policy "profils_self_select" on public.profils
  for select using ((select auth.uid()) = id);

-- Rôles attribués aux utilisateurs : réservé à l'admin (écran
-- "Utilisateurs").
create policy "utilisateur_roles_admin_all" on public.utilisateur_roles
  for all using (public.est_admin()) with check (public.est_admin());

-- Journal de connexion : chacun peut ajouter SA propre ligne (login),
-- seul l'admin peut le consulter (écran "Journal de connexion").
create policy "connexions_self_insert" on public.connexions
  for insert with check ((select auth.uid()) = utilisateur_id);

create policy "connexions_admin_select" on public.connexions
  for select using (public.est_admin());

-- Fonction appelée après connexion : quels outils l'utilisateur
-- courant peut-il voir ? Un utilisateur désactivé (actif = false)
-- n'obtient plus rien, même s'il a techniquement encore un mot de
-- passe valide dans Supabase Auth.
create or replace function public.mes_outils()
returns table(outil text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct ro.outil
  from public.utilisateur_roles ur
  join public.role_outils ro on ro.role_id = ur.role_id
  join public.profils p on p.id = ur.utilisateur_id
  where ur.utilisateur_id = auth.uid()
    and p.actif = true;
$$;
revoke execute on function public.mes_outils() from anon;
grant execute on function public.mes_outils() to authenticated;

-- Fonction appelée une fois le nouveau mot de passe créé, à la
-- première connexion. Un utilisateur standard n'a par ailleurs aucun
-- droit d'écriture direct sur profils : ce champ précis est le seul
-- qu'il peut faire évoluer lui-même, et uniquement pour sa propre
-- fiche.
create or replace function public.marquer_mot_de_passe_change()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profils
  set doit_changer_mot_de_passe = false
  where id = auth.uid();
$$;
revoke execute on function public.marquer_mot_de_passe_change() from anon;
grant execute on function public.marquer_mot_de_passe_change() to authenticated;

-- ── Rôle "Admin" par défaut ────────────────────────────────────────
-- Créé automatiquement avec accès à tous les outils existants, pour
-- amorcer le tout premier compte (voir acces/README.md, "Créer le
-- premier administrateur"). Vous pouvez ensuite le renommer, changer
-- ses coches, ou créer d'autres rôles ("Chef de projet", "Directeur
-- de programme"...) depuis l'écran "Rôles" — rien d'autre n'est
-- codé en dur.
insert into public.roles (nom, description)
values ('Admin', 'Accès complet : gestion des rôles, des utilisateurs et du journal de connexion.')
on conflict (nom) do nothing;

insert into public.role_outils (role_id, outil)
select r.id, o.outil
from public.roles r
cross join (values
  ('sprint-planning'), ('poker-planning'), ('analyse-capacite'),
  ('whiteboard'), ('releases-planning'), ('bug-dashboard'), ('bug-dashboard-v2'), ('admin')
) as o(outil)
where r.nom = 'Admin'
on conflict do nothing;
