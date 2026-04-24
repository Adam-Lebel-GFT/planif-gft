# Sprint Planning Tool

Outil web autonome pour calculer la capacité des équipes Scrum / SAFe pendant
un sprint planning. Pensé pour les Scrum Masters, RTE et coachs agiles qui
veulent quitter les feuilles Excel pénibles.

## Fonctionnalités

- Import du planning des ressources (fichier Excel) et du backlog (export Jira)
- Calcul automatique de la capacité par personne et par équipe
  (disponibilité théorique, raffinage, support, CAF brute, CAF nette)
- Dashboard interactif avec Gantt des présences et board d'assignation des stories
- Modification manuelle des présences dans le Gantt (R / A / S / etc.)
- Suivi de la confiance par dev, notes d'équipe, risques
- Export Excel enrichi avec synthèse, blocs par équipe et feuille Gantt
- Rapport HTML synthétique par équipe (confiance, stories engagées, risques)

## Utilisation

Ouvrir l'URL publique (ou `index.html` en local) dans un navigateur récent
(Chrome, Edge, Firefox). Charger les deux fichiers demandés, sélectionner le
sprint à analyser, et c'est parti.

## Technologie

Page HTML autonome, zéro installation. Utilise xlsx-js-style et pptxgenjs
via CDN jsdelivr pour la génération Excel/PowerPoint.

## Statut

Prototype. Version hébergée accessible publiquement pour démonstration et
validation terrain. Une version SaaS complète (comptes utilisateurs, sauvegarde,
facturation) est en cours de réflexion.

## Licence

Voir `LICENSE`.
