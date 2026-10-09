-- Bug movie : outil à part du Bug Dashboard.
-- Tout rôle qui a accès au Bug Dashboard v2 reçoit aussi Bug movie (l'admin
-- peut ensuite décocher depuis l'écran Rôles). Idempotent.
insert into public.role_outils (role_id, outil)
select distinct ro.role_id, 'bug-movie'
from public.role_outils ro
where ro.outil = 'bug-dashboard-v2'
on conflict do nothing;
