-- ════════════════════════════════════════════════════════════════════
-- Bug Dashboard v2 — schéma Supabase (déjà appliqué au projet
-- lyahaxyexgjxpezemwhv via le connecteur ; conservé ici comme référence,
-- idempotent). Prérequis : acces/schema.sql (table profils).
--
--   bdv2_config     configuration partagée (une ligne, cle = 'bug-dashboard-v2')
--   plan_versions   plan de livraisons publié depuis releases-planning
--   bdv2_analyses   journal des analyses (snapshot par clic « Analyser »)
--
-- Décision fonctionnelle : tous les rôles connectés (compte actif) lisent
-- et écrivent ; anon n'a aucun accès.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.bdv2_config (
  cle     text primary key,
  valeur  jsonb not null default '{}'::jsonb,
  maj_par uuid references public.profils(id) on delete set null,
  maj_le  timestamptz not null default now()
);

create table if not exists public.plan_versions (
  id         text primary key,
  label      text not null,
  debut      date not null,
  fin        date not null,
  jalons     jsonb not null default '{}'::jsonb,   -- { freeze:'YYYY-MM-DD', gonogo:…, deploy:…, revert:…, nextbr:… }
  ordre      int  not null default 0,
  publie_par uuid references public.profils(id) on delete set null,
  publie_le  timestamptz not null default now()
);
create index if not exists plan_versions_ordre_idx on public.plan_versions (ordre);

create table if not exists public.bdv2_analyses (
  id         bigint generated always as identity primary key,
  cree_le    timestamptz not null default now(),
  cree_par   uuid references public.profils(id) on delete set null,
  nom        text,
  hash       text not null,
  nb_tickets int  not null default 0,
  resume     jsonb not null default '{}'::jsonb,   -- agrégats (KPI, par équipe, par version…)
  tickets    jsonb not null default '[]'::jsonb,   -- liste compacte des tickets (comparateur, stock par version)
  synthese   text,                                 -- synthèse IA
  epingle    boolean not null default false
);
create index if not exists bdv2_analyses_date_idx on public.bdv2_analyses (cree_le desc);
create index if not exists bdv2_analyses_hash_idx on public.bdv2_analyses (hash);

alter table public.bdv2_config    enable row level security;
alter table public.plan_versions  enable row level security;
alter table public.bdv2_analyses  enable row level security;

create or replace function public.compte_actif()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profils p
    where p.id = (select auth.uid()) and p.actif = true
  );
$$;
revoke execute on function public.compte_actif() from anon;
grant execute on function public.compte_actif() to authenticated;

drop policy if exists "bdv2_config_actifs" on public.bdv2_config;
create policy "bdv2_config_actifs" on public.bdv2_config
  for all to authenticated using (public.compte_actif()) with check (public.compte_actif());

drop policy if exists "plan_versions_actifs" on public.plan_versions;
create policy "plan_versions_actifs" on public.plan_versions
  for all to authenticated using (public.compte_actif()) with check (public.compte_actif());

drop policy if exists "bdv2_analyses_actifs" on public.bdv2_analyses;
create policy "bdv2_analyses_actifs" on public.bdv2_analyses
  for all to authenticated using (public.compte_actif()) with check (public.compte_actif());

-- Enregistrement de l'outil : tout rôle qui a accès au Bug Dashboard v1
-- reçoit aussi le v2 (l'admin peut ensuite décocher depuis l'écran Rôles).
insert into public.role_outils (role_id, outil)
select distinct ro.role_id, 'bug-dashboard-v2'
from public.role_outils ro
where ro.outil = 'bug-dashboard'
on conflict do nothing;
