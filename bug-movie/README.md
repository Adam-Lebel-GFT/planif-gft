# Bug movie

Outil du toolkit (slug `bug-movie`) qui rejoue les photos du journal : chaque ticket est un point
(couleur d'équipe, ou de version au choix) qui avance de statut en statut, une ligne par version
(toutes les Target dates du journal par défaut). Un curseur avance et recule dans le temps ; sous le tableau,
les aires ouvert / terminé de chaque version se chevauchent sur l'axe des dates, sous la barre
« aujourd'hui », et les chiffres suivent le curseur. Un ticket qui n'est plus dans aucune des versions
affichées part dans le **nuage** ; un ticket dont la résolution est *Declined*, *Duplicate*,
*Not replicable*, *Incomplete* ou *Abandoned* va à la **poubelle** (liste dans `movie.js`).
Un ticket ne change de place qu'à la photo où on le voit ailleurs : le mouvement est connu à la photo près.
Toutes les versions du journal sont affichées par défaut (sélecteur pour ne garder que les dernières), à partir de la première photo ; une version vue sur une seule photo est écartée. Il faut au moins deux photos contenant une même version (3 tickets minimum).
Une version **terminée et officielle** (Target date atteinte, photo épinglée) reste figée sur sa photo officielle : les photos suivantes ne la modifient plus. Une photo qui ne couvre pas une version (moins de 5 tickets ou moins de la moitié du maximum vu, dans la limite de la taille de la version) ne la vide pas : ses chiffres et ses tickets restent ceux de la photo d'avant.


## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | page de l'outil : entête commune, session Supabase, lecture du journal `bdv2_analyses` (sinon journal local du navigateur) |
| `movie.js` | module du film (données, rendu canvas, contrôles) |
| `movie.css` | styles `.mv-*`, ajoutés à la feuille du Bug Dashboard |

Réutilise `core.js`, `palette.js` et `config.js` du Bug Dashboard (même configuration : équipes, fenêtre d'ouverture du burn-up).
**Accès** : outil `bug-movie` dans l'écran Rôles ; `supabase/bug-movie.sql` l'attribue aux rôles qui ont déjà le Bug Dashboard.
