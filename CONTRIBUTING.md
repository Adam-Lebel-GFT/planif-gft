# CONTRIBUTING — Planif tool GFT

> Ces règles sont le résultat de bugs réels rencontrés en production.
> Les ignorer **reproduira exactement les mêmes bugs**.

---

## Les trois règles d'or

### 1. Ne jamais écrire `</script>` en clair dans une source qui génère du HTML

Toute source qui construit du HTML contenant des balises `<script>` doit splitter la balise fermante :

```js
// ❌ JAMAIS
html += '</script>';

// ✓ TOUJOURS
html += '<' + '/script>';
// ou dans un template literal Python :
html += String.fromCharCode(60) + '/script>';
```

**Pourquoi :** Le parseur HTML voit `</script>` et ferme le bloc courant, cassant tout ce qui suit.

---

### 2. Tester en local `file://` avant de considérer un ticket fermé

Chrome applique des restrictions strictes en `file://` :
- `window.open` d'un autre fichier `.html` → téléchargement au lieu d'ouverture
- `window.opener` entre deux fenêtres `file://` → bloqué par CORS
- Appels `fetch()` vers SharePoint → bloqués (CORS + credentials)
- `Blob URL` ouverts depuis `file://` → bloqués

**Conséquence :** Tout ce qui utilise `window.open` ou `window.opener` pour communiquer entre pages ne fonctionnera **pas** en local. Le rapport sprint a été refactorisé pour rendre directement dans la fenêtre du dashboard (`document.documentElement.innerHTML`) pour cette raison.

---

### 3. Valider la syntaxe JS avec `node --check` sur les 3 contextes

L'outil contient **trois contextes JS distincts** dans un seul fichier `.html` :

| Contexte | Description | Comment valider |
|----------|-------------|-----------------|
| **Main JS** | `<script>` principal de la page | `node --check main.js` |
| **Dashboard JS** | Template literal `const JS = \`...\`` injecté via `document.write` dans une nouvelle fenêtre | Simuler avec `eval_tl()` (voir ci-dessous) |
| **Rapport JS** | Second `<script>` (inline rapport overlay) | `node --check rapport.js` |

#### Script de validation complet

```python
import subprocess, tempfile, os

with open('Planif_tool_GFT_v2.html', 'r', encoding='utf-8') as f:
    content = f.read()

def node_check(js, label):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(js); n = f.name
    r = subprocess.run(['node','--check',n], capture_output=True, text=True)
    os.unlink(n)
    print(f"{label}: {'✓ VALID' if r.returncode==0 else 'ERR: '+r.stderr[:150]}")
    return r.returncode == 0

# Contexte 1 : Main JS
s = content.find('<script>') + 8
e = content.find('</script>')
node_check(content[s:e], 'Main JS')

# Contexte 2 : Dashboard JS (template literal)
def eval_tl(s):
    out=[]; i=0
    while i<len(s):
        if s[i]=='\\' and i+1<len(s): out.append(s[i+1]); i+=2
        else: out.append(s[i]); i+=1
    return ''.join(out)

js_s = content.find('const JS = `\n') + 12
js_e = content.find('\nrender();`;', js_s) + len('\nrender();')
rendered = eval_tl(content[js_s:js_e])
lines_r = rendered.split('\n')
func_start = next(i for i,l in enumerate(lines_r) if l.startswith('function openRapport') or l.startswith('function togTeam'))
stub = 'var curI=0,OV={},SCOL={},SD=[],STORIES_ALL=[],AT=[],PR={vc:2,vi:2,vt:2},IT=new Set(),TT=new Set(),actT=new Set(),MN=[],DN=[],pkState=null,multiSel=[],ganttCollapsed=false,panelState={},WK=new Set();\nvar window={opener:null,CONFIRMED:{},ASSIGN:{},CONF:{},NOTES:{},RISKS:{}};\nvar sessionStorage={getItem:function(){return null;},setItem:function(){},removeItem:function(){}};\nfunction render(){}\n'
node_check(stub + '\n'.join(lines_r[func_start:]), 'Dashboard JS')
```

---

## Architecture — fichier unique

Tout l'outil tient dans **un seul fichier** `Planif_tool_GFT_v2.html`. Pas de fichier sibling, pas de serveur.

```
Planif_tool_GFT_v2.html
├── <style>          CSS page principale
├── <script>         JS page principale (Main JS)
│   ├── parsePlanning()
│   ├── computeSprint()
│   ├── buildWorkbook()        ← export Excel normal + enrichi
│   ├── openDashboard()        ← construit le dashboard dans window.open
│   ├── openRapport()          ← modale sélection équipes
│   ├── doOpenRapport()        ← rendu rapport dans fenêtre dashboard
│   ├── exportPptx()           ← export PowerPoint
│   └── saveToSharePoint()     ← sauvegarde historique (skip si file://)
├── const JS = `...`   Template literal → injecté dans la fenêtre dashboard
│   ├── render()               ← rendu Gantt/Board/Finalisation
│   ├── buildP3Html()          ← panneau Finalisation
│   ├── openRapport()          ← version dashboard (lit window.CONFIRMED)
│   └── doOpenRapport()        ← rendu rapport via innerHTML
├── <div id="rapport-overlay"> HTML du rapport (caché par défaut)
└── <script>         JS du rapport overlay
    └── window.addEventListener('message', ...)
```

---

## Patterns critiques

### Template literal escaping (Dashboard JS)

Le Dashboard JS vit dans `` const JS = `...` ``. Les backslashes sont consommés par le template literal :

```js
// ❌ Cassé — \n devient newline, \' devient '
const JS = `var re = /foo\nbar/;`;

// ✓ Correct — utiliser String.fromCharCode
const JS = `var re = /foo${String.fromCharCode(10)}bar/;`;
// Pour les apostrophes dans du HTML généré :
const JS = `html += '&#x27;';  // pas de \'`
```

### Équipes dynamiques

Les sets d'équipes sont reconstruits dynamiquement depuis la sidebar :

```js
refreshTeamSets(); // → rebuild INCLUDED_TEAMS, INTEG_TEAMS, TRANS_TEAMS
```

**Ne jamais hardcoder** `['CONF-1','CONF-2',...]` dans le code — utiliser `_teamSets.all`.

### Personnes Vaudoise (hardcodées volontairement)

```js
const VAUDOISE = ['Dinesh Salhotra', 'Maria Madalena Marques', 'Fardjana David'];
```

Ces trois personnes sont isolées dans leur propre série dans le graphique PowerPoint et soustraites des totaux CONF/INTEG/TRANS.

### PostMessage — canal `dashboard_export`

Le seul mécanisme fiable pour communiquer entre le dashboard (nouvelle fenêtre) et la page principale :

```js
// Dans le dashboard
window.opener.postMessage({ type: 'dashboard_export', overrides: OV, enrichment: {...} }, '*');

// Dans la page principale
window.addEventListener('message', function(e) {
  if (e.data.type === 'dashboard_export') { ... }
});
```

---

## Versionnage

Format : `v[majeure].[ticket principal].[ticket board]`

- **v2** = version majeure courante
- **ticket principal** = dernier T-XX complété
- **ticket board** = dernier T-B-XX complété

Exemples : `v2.29.17`, `v2.4.0` (version Opus)

La version est affichée dans les deux topbars (page principale + dashboard). Chercher/remplacer `v2.X.Y` pour mettre à jour.

---

## Hébergement

| Environnement | URL | Notes |
|---------------|-----|-------|
| **GitHub Pages** | `https://adam-lebel-gft.github.io/planif-gft/Planif_tool_GFT_v2.html` | Hébergement principal |
| **Local** | `file:///...` | Développement — restrictions Chrome actives |
| **SharePoint** | `https://gft365.sharepoint.com/sites/Leadership-Community-FR/OutilsScrum/` | Télécharge au lieu d'ouvrir — ne pas utiliser |

### Mise à jour GitHub Pages

1. Modifier `Planif_tool_GFT_v2.html`
2. Uploader dans le repo `Adam-Lebel-GFT/planif-gft`
3. GitHub Pages se met à jour en ~1 minute

---

## SharePoint List — Historique

La liste `Historique-Sprint-Planning` sur `https://gft365.sharepoint.com/sites/Leadership-Community-FR` reçoit une entrée automatique à chaque génération de rapport.

Colonnes : `Title`, `Sprint`, `Equipes`, `CAF_Totale`, `SP_engagés`, `Confirmé_par`, `Date_planning`, `Notes`

La sauvegarde est **silencieusement ignorée** si l'outil est ouvert en `file://` ou hors SharePoint.
