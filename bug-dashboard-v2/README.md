# Bug Dashboard v2 — « Radar »

Cockpit de stabilisation : colle un extrait Jira, projette chaque ticket sur le train de
livraison, croise équipes × statuts × priorités × origine, journalise chaque analyse et
lève les alertes de stabilisation. Le Bug Dashboard v1 reste disponible comme outil « lite ».

Tout est compté en **nombre de tickets** (les bugs n'ont pas de points) ; l'avancement
pondéré (poids par statut, configurables) est un indicateur secondaire.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `css/app.css` | page et styles (thème partagé `assets/theme.css`) |
| `js/core.js` | détection des colonnes, parsing TSV, modèle ticket, dimensions, pivot |
| `js/palette.js` | palettes validées (catégoriel, rampe priorités, heatmap) |
| `js/config.js` | configuration (locale + partagée Supabase) et tiroir de configuration |
| `js/charts.js` | rendu des graphiques (empilé h/v, heatmap, barres, donut, tableau, courbes) |
| `js/drill.js` | fenêtre de détail des tickets (onglets réalisé/reste, CSV, JQL, Jira) |
| `js/app.js` | orchestration, filtres, bandeau, alertes, cube, vues, session |
| `js/plan.js` | lot 2 — plan de livraisons, rattachement Target date → version, train |
| `js/history.js` | lot 3 — journal des analyses, deltas, évolution, comparateur |
| `js/ai.js` | lot 4 — synthèse IA et « Demander au Radar » — **non chargé** (voir « Synthèse IA masquée ») |
| `schema.sql` | tables Supabase (déjà appliquées) |
| `../supabase/functions/bug-radar-ai/index.ts` | fonction serveur IA (déjà déployée) |

## Mise en service

1. **Plan de livraisons** : ouvrir `releases-planning/`, vérifier versions et jalons, cliquer
   « Publier le plan → Bug Dashboard v2 » (connecté). Sans publication, le v2 lit le plan
   local du même navigateur.
2. **Règle de rattachement** (Configurer → Règles) : première version dont le jalon
   « Déploiement sur la branche » tombe à la Target date du ticket ou après. Les Target dates
   sont des vendredis ; la version déployée le mardi suivant l'emporte. La Fix Version reste
   informative (option pour la rendre prioritaire).
3. **Synthèse IA masquée** : la section « Synthèse IA » et « Demander au Radar » ne sont plus
   affichées. Le module reste livré : pour le réactiver, décommenter
   `<script src="js/ai.js"></script>` à la fin de `index.html` (l'onglet « IA » du tiroir de
   configuration et la case de section « ai » des vues réapparaissent alors, la section restant
   pilotée par vue). Côté serveur, une fois par l'administrateur : tableau de bord Supabase →
   Edge Functions → `bug-radar-ai` → Secrets → `ANTHROPIC_API_KEY`. Modèle par défaut :
   Claude Haiku 4.5 (le moins coûteux), modifiable dans Configurer → IA. La clé n'est jamais
   dans la page.
4. **Accès** : outil `bug-dashboard-v2` dans l'écran Rôles (attribué automatiquement aux rôles
   qui avaient le v1). Tous les rôles connectés partagent configuration et journal.

## Alertes

Déterministes, calculées à chaque rendu et cliquables (drill-down) : blockers sans équipe,
terminés sans Fix Version, Target date dépassée, sans Target date, blockers PRJ301, retard réel
(versions déjà déployées), au-delà du plan, et **« Version imminente, ticket peu avancé »** —
tickets ouverts rattachés à une version à venir dont l'avancement pondéré est sous le seuil
alors que le déploiement est proche. Seuils dans Configurer → Règles → Alertes : **3 jours ou
moins** et **moins de 50 %** d'avancement (le seuil de jours sert aussi à marquer « urgente » la
prochaine version dans le bandeau et le train). Une configuration enregistrée avant ce
changement est migrée (`schema` 2) : le seuil passe de 7 à 3 jours s'il était resté au défaut,
une valeur choisie explicitement est conservée.

## Journal des analyses

Chaque clic « Analyser » avec des données différentes (hash du collage + date de référence)
ajoute une entrée : agrégats + liste compacte des tickets (~50 Ko). Deltas et sparklines sur
le bandeau, courbes d'évolution (global, avancement, stock à livrer par version, par équipe,
origine), comparateur entre deux analyses (nouveaux, disparus, terminés, changements de
statut/équipe/version, stock par version). Sans session : journal local (30 dernières).
