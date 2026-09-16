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

## Filtres

La barre collante filtre tout le tableau de bord : **État** (tous / ouverts / terminés, avec le
nombre de tickets de chaque choix), **Origine**, **Version**, **Équipes** et **Priorité**. Équipes
et Priorité sont des puces multi-sélection (plusieurs valeurs = une union) ; la priorité est celle
affichée par le radar, c'est-à-dire le regroupement défini dans Configurer → Priorités. Les filtres
sont conservés dans ce navigateur.

Une **alerte se transforme en filtre** : le clic ouvre la fiche des tickets comme avant, et son
en-tête porte « ⌖ Filtrer le radar » — le tableau de bord ne garde alors que ces tickets-là,
signalés par une puce bleue dans la barre. La liste est figée au moment du clic (les alertes se
recalculent ensuite sur le périmètre filtré) et ne survit pas à un nouveau collage, contrairement
aux autres filtres. Seules les fiches d'alerte proposent ce bouton.

Tant qu'un filtre est actif, les deltas du bandeau et les tuiles
« Ajoutés / Retirés » se retirent : les photos du journal, elles, ne sont pas filtrées, et la
comparaison serait fausse.

## Cube multidimensionnel

Tout se règle sur la carte : la poignée ⠿ de l'en-tête la déplace dans la grille (souris ou
doigt), le titre s'édite en place, les quatre sélecteurs changent lignes, colonnes, mesure et
largeur, les icônes changent le style, la corbeille la supprime. La carte « + » en fin de grille en ajoute une
avec des réglages par défaut, visible dans la vue courante, et place le curseur dans son titre.
L'ordre obtenu est celui de la liste du tiroir (Configurer → Cartes, elle aussi réordonnable au
glisser-déposer) : il est partagé, comme le reste de la configuration. Les cartes masquées ou
absentes de la vue gardent leur place dans la liste.

La **heatmap ouverts / terminés** (icône ◫, proposée seulement quand les colonnes de la carte
sont les statuts) sépare la grille en deux blocs — en cours à gauche, terminé à droite, filet
entre les deux — chacun avec sa colonne de sous-total, et colore les cellules par état : bleu en
cours, vert terminé, les couleurs que l'outil donne déjà à « Terminé / en cours ». L'échelle
d'intensité reste commune aux deux rampes, donc un 5 bleu et un 5 vert pèsent pareil. Le partage
suit la liste **« terminés »** de Configurer → Statuts, et la carte porte la distinction
elle-même : le filtre État de la barre n'est pas touché, et le détail par statut reste entier. Les
sous-totaux s'ouvrent au clic comme les cellules. Sur une carte dont les colonnes ne sont pas les
statuts — ou dont tous les statuts sont du même côté — l'affichage retombe sur la heatmap
ordinaire plutôt que d'inventer une séparation.

La **largeur** d'une carte vaut *1 colonne*, *2 colonnes*, *pleine largeur* ou *auto*. En auto,
les tableaux larges (heatmap de plus de 5 colonnes, tableau de plus de 4, empilé vertical de plus
de 7 lignes) prennent toute la largeur. Ce calcul porte sur l'**extrait complet**, jamais sur les
tickets filtrés : filtrer ne rétrécit donc plus une carte ni ne réorganise la grille. Sous 1000 px
de large, « 2 colonnes » retombe sur une colonne.

## Alertes

Déterministes, calculées à chaque rendu et cliquables (drill-down) : blockers sans équipe,
terminés sans Fix Version, Target date dépassée, sans Target date, blockers PRJ301, retard réel
(versions déjà déployées), au-delà du plan, et les **paliers de risque** — tickets ouverts
rattachés à une version à venir dont l'avancement pondéré est trop bas pour le temps qui reste
avant le jalon surveillé.

Un palier se lit « à tant de jours ouvrés du jalon, tout ce qui est sous tant de pour cent est en
risque ». Deux sont livrés (Configurer → Règles → Alertes, modifiables et extensibles) :

| Reste au plus | Ticket sous | Niveau | Alerte |
| --- | --- | --- | --- |
| 3 jours ouvrés | 50 % | Sérieux | « N tickets sous 50 % d'avancement » |
| 1 jour ouvré | 70 % — le niveau *Code review - completed* | Critique | « N tickets **en risque pour la version** » |

Les paliers sont parcourus **du plus serré au plus large** et chacun retire ses tickets des
suivants : un ticket à 60 % la veille du gel est « en risque », pas « peu avancé », et n'est
jamais compté deux fois. Quand un seuil tombe pile sur une pondération de statut, l'alerte le
nomme (« sous 70 % d'avancement (niveau « Code review - completed ») ») — c'est le langage de
l'équipe, pas un pourcentage abstrait. Une configuration enregistrée avant ce changement est
migrée (`schema` 3) : le seuil unique devient le premier palier, un réglage choisi à la main est
donc conservé, et le palier serré vient s'y ajouter.

Les deux listes de jalons (rattachement et alerte) sont celles du **plan de livraisons**,
avec leurs libellés réels — un jalon renommé (« Déploiement sur l'environnement IAT ») ou
supprimé s'y voit tel quel ; un jalon configuré mais absent du plan reste listé, marqué
« absent du plan », plutôt que de retomber silencieusement sur le déploiement. Le jalon surveillé
est indépendant du jalon de rattachement (Déploiement) : c'est le gel du code qui ferme la porte
à un ticket, pas la mise en production. Une configuration enregistrée avant ce changement est
migrée (`schema` 2) : le seuil passe de 7 à 3 jours s'il était resté au défaut, une valeur
choisie explicitement est conservée.

Le temps restant est compté en **demi-journées de travail** : `releases-planning` publie ses
jalons avec leur demi-journée (matin `T00:00`, après-midi `T12:00`), et la demi-journée en cours
se choisit à côté de la date de référence (pré-remplie sur l'heure courante). Ne comptent ni la
demi-journée en cours — à 11h30 le lundi, le matin est derrière nous — ni celle du jalon : un
Code freeze le jeudi vers 7h ferme déjà le jeudi matin, personne ne travaillant avant. Lundi
matin, gel le jeudi matin : lundi après-midi (0,5) + mardi (1) + mercredi (1) = **2,5 jours**.
Les seuils des paliers acceptent les demi-journées (2,5). Un plan publié avant cette évolution
(date nue) vaut « matin », comme avant.

## Journal des analyses

Chaque clic « Analyser » avec des données différentes (hash du collage + date de référence)
ajoute une entrée : agrégats + liste compacte des tickets (~50 Ko). Deltas et sparklines sur
le bandeau, courbes d'évolution (global, avancement, stock à livrer par version, par équipe,
origine), comparateur entre deux analyses (nouveaux, disparus, terminés, changements de
statut/équipe/version, stock par version). Sans session : journal local (30 dernières).

Le **Journal des versions** tient en une carte, **une ligne par version** (Target date), de la
plus récente à la plus ancienne : sa photo officielle (📌, la plus récente fait foi) au premier
plan, et en dessous, **dépliables**, les analyses de travail qui y ont mené — une version, c'est
la photo officielle plus le travail qui l'a produite. Chaque analyse est rangée sous sa Target
date **dominante**, donc n'apparaît qu'une fois. Une version sans photo épinglée est marquée
« pas encore officialisée » et montre quand même son travail ; les analyses sans Target date
finissent dans une ligne « Sans Target date » ; une ancienne officielle détrônée par une plus
récente réapparaît dans la sous-liste de sa version, son épingle rouge intacte, au lieu de
disparaître. La carte et chaque version arrivent **repliées** — on ouvre la section pour le
graphique, la liste se consulte à l'occasion — et chaque repli est conservé dans ce navigateur.
Le comparateur reste en bas de la carte : ses cases à cocher fonctionnent à travers les
sous-listes.

Deux tuiles du bandeau, **Ajoutés à la version** et **Retirés de la version**, comparent
l'extrait courant à la première photo de la version (même Target date) : le grand chiffre
compte depuis le début de la version, le delta depuis l'analyse précédente, et le clic ouvre
les deux listes. Un ticket dont la Target date a changé compte comme retiré. Les tuiles
disparaissent quand un filtre est actif — les photos du journal, elles, ne sont pas filtrées.

Les filtres **État**, **Équipes**, **Origine** et **Priorité** de la barre s'appliquent à ces
graphiques :
chaque photo est recalculée sur ce périmètre, ses tickets étant conservés un par un. La liste des
versions et de leurs photos, elle, reste complète. Deux exceptions volontaires : la prévision
disparaît sous un filtre d'état (les 100 % d'avancement ne sont plus atteignables si l'on exclut
les terminés), et les deltas du bandeau comme les tuiles « Ajoutés / Retirés » restent masqués
sous filtre — ceux-là comparent les agrégats enregistrés dans la photo, pas ses tickets.

La section s'ouvre sur l'**avancement pondéré de la version en cours** ; les puces et le
sélecteur de mesure restent libres ensuite. Chaque mesure a la forme qui lui va : courbe pour
l'avancement et la vue globale, **barres groupées** par statut et par équipe (comparer des
séries), **barres empilées** par priorité et pour la Fix Version (composition d'un total),
**bandes empilées à 100 %** pour l'origine (une part). Au-delà d'une douzaine de photos, le
graphique s'élargit et défile plutôt que d'aligner des barres illisibles.

Sur une version, **« Avancement pondéré » se lit en burn-up** : l'axe horizontal devient le
calendrier de la version (début → déploiement), chaque photo se place à sa date réelle, et une
rampe grise dit où l'on devrait être — **25 % au début de la version** (elle ne démarre pas à
zéro, ses tickets entrent déjà partiellement avancés ; réglable dans Configurer → Règles), **100 %
au jalon qui fait foi** — celui choisi pour les alertes, le Code freeze par défaut ; le trait et
son étiquette désignent ce même jalon — puis plateau. Elle ne monte que pendant les **heures ouvrées** (8 h – 19 h en
semaine, réglable) : plate la nuit, plate le week-end, elle reprend le matin, pour qu'un écart
constaté le lundi matin ne porte pas le faux retard de deux jours sans personne au travail.
L'axe suit la même idée : les heures fermées y sont **comprimées** — elles comptent pour un
sixième de leur durée — plutôt que supprimées, de sorte qu'une analyse saisie à 22 h reste
visible, dans un couloir étroit, sans que les nuits mangent les deux tiers de la largeur. Les week-ends sont grisés, la journée de référence surlignée, l'axe gradué par demi-journées ; le pointillé
prolonge le rythme observé — **dans le même temps ouvré que la rampe**, donc en escalier, plat la
nuit et le week-end — et **s'arrête au jalon** : au-delà, le temps ne compte plus pour cette
échéance, et sa hauteur au jalon est exactement le chiffre de la tuile de prévision. Le nombre
coloré donne l'écart à la rampe à la dernière photo.
Sans plan publié pour cette Target date — donc sans début ni gel à opposer aux photos — le
graphique reste la courbe photo par photo.

Sur une version, la **prévision** extrapole le rythme d'**avancement pondéré** (points gagnés
par **jour ouvré** entre la première et la dernière photo) jusqu'au **jalon qui fait foi** — celui
choisi pour les alertes, le Code freeze par défaut, celui-là même que vise la rampe du burn-up.
Le grand chiffre répond à « est-ce qu'on y arrive ? » : l'avancement atteint **au jalon** à ce
rythme, et ce qui manque pour les 100 % (« 95,1 % au Code freeze — il manque 4,9 pts, soit 0,4 j
ouvré »). Aucune date de 100 % n'est affichée au-delà du jalon : le gel tombe le jeudi matin, donc
le dernier moment ouvré est le mercredi à 19 h et le jeudi ne compte pas — une date obtenue en
créditant ce jeudi-là serait fausse. Sans plan publié, donc sans jalon, la tuile retombe sur
l'ancienne lecture : la date des 100 % face à la Target date. Elle ne se fonde pas sur le nombre de tickets terminés par jour : un ticket qui passe
de « In Progress » à « Code Review » avance sans être terminé, et le compte de terminés, aveugle à
ce travail, projetait bien trop loin.

Rythme et prolongement se comptent en **temps ouvré**, la même horloge que la rampe (`openHours`
et `addOpenHours` dans `js/core.js`) : une photo du vendredi et une du lundi sont séparées d'**un**
jour de travail, pas de trois, et la date des 100 % ne crédite jamais un samedi. Le graphique et la
case chiffrée partagent ce calcul, donc ils ne peuvent plus se contredire. Quand le rythme est si
lent que les 100 % sortent de l'horizon, la prévision affiche « indéterminé » plutôt qu'une date
inventée. Le dépassement de la Target date, lui, reste exprimé en jours calendaires : un retard se
vit dans le calendrier.
