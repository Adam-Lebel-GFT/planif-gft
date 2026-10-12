-- Vélocité des sprints : nouvel outil (velocite-sprints/).
-- Tout rôle qui a accès à l'Analyse de capacité reçoit aussi la Vélocité des
-- sprints : les deux lisent le même fichier des ressources. L'admin peut
-- ensuite décocher depuis l'écran Rôles. Idempotent.
insert into public.role_outils (role_id, outil)
select distinct ro.role_id, 'velocite-sprints'
from public.role_outils ro
where ro.outil = 'analyse-capacite'
on conflict do nothing;
