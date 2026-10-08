-- ════════════════════════════════════════════════════════════════════
-- Versions enregistrées du fichier planning (Analyse de capacité et
-- Sprint planning). Prérequis : acces/schema.sql (profils) et
-- bug-dashboard-v2/schema.sql (fonction compte_actif()). Idempotent.
--
--   planning_versions   une ligne par version enregistrée ; `donnees` contient
--                       les onglets « Planning Build » et « Parameters » du
--                       classeur (JSON compressé gzip, encodé en base64).
--
-- Même règle d'accès que le plan de livraisons : tous les comptes actifs
-- lisent, écrivent et suppriment ; anon n'a aucun accès.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.planning_versions (
  id        bigint generated always as identity primary key,
  cree_le   timestamptz not null default now(),
  cree_par  uuid references public.profils(id) on delete set null,
  auteur    text,
  nom       text not null,
  fichier   text,
  taille_ko int  not null default 0,
  donnees   text not null
);
create index if not exists planning_versions_date_idx on public.planning_versions (cree_le desc);

alter table public.planning_versions enable row level security;

drop policy if exists "planning_versions_actifs" on public.planning_versions;
create policy "planning_versions_actifs" on public.planning_versions
  for all to authenticated using (public.compte_actif()) with check (public.compte_actif());
