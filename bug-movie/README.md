# Bug movie

Outil du toolkit (slug `bug-movie`) qui rejoue les photos du journal : chaque ticket est un point
(couleur d'équipe, ou de version au choix) qui avance de statut en statut, une ligne par version
(toutes les Target dates du journal par défaut). Un curseur avance et recule dans le temps, avec au-dessus un calendrier à la même échelle (une bande par semaine ISO, « S38 » et ses dates, puis le numéro de chaque jour ouvré) ; sous le tableau,
les aires ouvert / terminé de chaque version se chevauchent sur l'axe des dates, sous la barre
« aujourd'hui », et les chiffres suivent le curseur. Le pourcentage de chaque carte de version est **pondéré par statut** (Σ poids du statut / nb tickets, mêmes poids que le Dashboard Stabilisation), pas le seul ratio de tickets terminés. Un ticket qui n'est plus dans aucune des versions
affichées part dans le **nuage** ; un ticket dont la résolution est *Declined*, *Duplicate*,
*Not replicable*, *Incomplete* ou *Abandoned* va à la **poubelle** (liste dans `movie.js`).
Un ticket ne change de place qu'à la photo où on le voit ailleurs : le mouvement est connu à la photo près.
Toutes les versions du journal sont affichées par défaut (sélecteur pour ne garder que les dernières), à partir de la première photo ; une version vue sur une seule photo est écartée. Il faut au moins deux photos contenant une même version (3 tickets minimum).
Une version **terminée et officielle** (Target date atteinte, photo épinglée) reste figée sur sa photo officielle : les photos suivantes ne la modifient plus. Une photo qui ne couvre pas une version (moins de 5 tickets ou moins de la moitié du maximum vu, dans la limite de la taille de la version) ne la vide pas : ses chiffres et ses tickets restent ceux de la photo d'avant.


**Lecture** : le film s'arrête sur chaque photo (1,5 s par défaut, réglable : aucun, 0,3 s, 0,5 s, 0,8 s, 1,5 s, 3 s ; plus court quand la vitesse augmente) pour laisser le temps de lire l'état de la photo.
**Rendu** (sélecteur sous le graphique, mémorisé dans le navigateur) : *Points* (par défaut) ou *Gouttes d'eau*. En mode Points, chaque ticket qui change de case laisse une traînée d'étoile filante (le flash reste réservé aux reculs de statut). En mode Gouttes d'eau (`water.js`, WebGL2), chaque ticket est une particule d'un petit fluide : les gouttes d'une case forment une flaque, une goutte qui change de case vole et éclabousse, une sortie de version s'évapore vers le nuage, un rejet tombe dans la poubelle. Sans WebGL2, le bouton est grisé.
**Graphique du bas** : chaque version s'arrête à son Code freeze, lu dans le plan de livraisons publié (`plan_versions`, sinon le plan local du navigateur), avec la même règle de rattachement que le Dashboard (Target date → première version dont le jalon de référence tombe ce jour-là ou après). Sans plan, la courbe va jusqu'au curseur.

**Noms et versions gelées** : chaque ligne, tuile et courbe porte le nom de la version du plan (3.9.x), à défaut sa Target date. Dès que le curseur passe le Code freeze d'une version, sa ligne, sa tuile et sa courbe passent en sous-brillance (« ❄ gelée »).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | page de l'outil : entête commune, session Supabase, lecture du journal `bdv2_analyses` (sinon journal local du navigateur) |
| `movie.js` | module du film (données, rendu canvas, contrôles) |
| `water.js` | rendu « Gouttes d'eau » : fluide particulaire et éclairage WebGL2 |
| `movie.css` | styles `.mv-*`, ajoutés à la feuille du Bug Dashboard |

Réutilise `core.js`, `palette.js` et `config.js` du Bug Dashboard (même configuration : équipes, fenêtre d'ouverture du burn-up).
**Accès** : outil `bug-movie` dans l'écran Rôles ; `supabase/bug-movie.sql` l'attribue aux rôles qui ont déjà le Bug Dashboard.
