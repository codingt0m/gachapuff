# Gachapuff

Jeu web de collection de puffs JNR : on ouvre des boosters, on contemple, on collectionne.
Aucun achat, aucune pub, aucun serveur : tout tourne dans le navigateur (version de test locale).

## Structure

```text
gachapuff/
├─ app/        le jeu (Vite + TypeScript + React)
├─ dataset/    images sources des puffs (PNG 1024², non versionné)
├─ pipeline/   le pipeline Python qui produit dataset/
└─ docs/       brief et prompt de construction
```

## Lancer le jeu

Prérequis : Node 22+ (testé avec Node 24) et le dossier `dataset/` à la racine.

```sh
cd app
npm install
npm run assets     # génère public/puffs/ (WebP 512/256 + manifest.json) depuis ../dataset
npm run dev        # http://localhost:5173
```

`npm run assets` est idempotent : il ne réencode que les images modifiées (`-- --force` pour tout refaire).
Les assets générés ne sont pas versionnés.

Mode test : ajoute `?dev=1` à l'URL (boosters illimités + outils de dev dans les Réglages),
et `?seed=123` pour des tirages déterministes. Ex. `http://localhost:5173/?dev=1&seed=373#/`.
`VITE_DEV_UNLIMITED=1` dans `app/.env.local` donne aussi des boosters illimités.

Pages de dev : `#/dev/design` (design system), `#/dev/vitrine` (toutes les finitions, au choix de la fumée),
`#/dev/simulateur` (100 000 ouvertures avec la config actuelle).

## Scripts (dans `app/`)

| Commande                                                | Rôle                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`                                           | serveur de développement                                                               |
| `npm run build` / `npm run preview`                     | build de production (PWA installable) et prévisualisation                              |
| `npm run assets`                                        | génère les images et le manifeste depuis `dataset/`                                    |
| `npm run icons`                                         | régénère les icônes PWA (versionnées)                                                  |
| `npm run simulate`                                      | vérifie que les taux font 100 % et simule N tirages (`-- --draws 100000 --seed 1`)     |
| `npm test`                                              | tests unitaires (Vitest)                                                               |
| `npm run e2e`                                           | test de bout en bout (Playwright ; `npx playwright install chromium` la première fois) |
| `npm run lint` / `npm run format` / `npm run typecheck` | qualité                                                                                |

## Régler le jeu

**Tout est dans [`app/src/config/gameConfig.ts`](app/src/config/gameConfig.ts)** : taux de drop (`dropRates`, en %), paliers de base
par capacité (et surcharges par modèle), finitions, fumées, points, seuils des 7 raretés, mise en scène
des révélations, tables de drop des boosters, régénération, recyclage. Le haut du fichier explique
le calcul. Après modification, vérifie la distribution avec `npm run simulate` ou `#/dev/simulateur`.

Valeurs par défaut :

- **Rareté globale** = points du palier de base (0–4, selon la capacité) + finition (0–7) + fumée (0–4)
  + forme (0–2) + signature (6).
- **Paliers** : Commune 44,6 % · Peu commune 18,5 % · Rare 14,3 % · Épique 9,7 % · Légendaire 9,3 % ·
  Mythique 3,2 % · Divine 0,38 % (≈ 1 sur 260).
- **Finitions** (7 paliers, poids du palier partagé à parts égales, constantes `dropRates`) :
  Normale 50 % · Glitch 25 % · Cristal / Givre 10 % · Chrome liquide / Chromatique 7 % ·
  Dorée 5 % · Rubis 2,5 % · Galaxie 0,5 %.
- **Fumées** (tirage indépendant) : blanche 55 % · colorée 20 % · arc-en-ciel 12 % · duo 7 % ·
  pailletée 4,5 % · gachapuff 1,5 %. Couleurs tirées dans une palette nommée (`smokeColors`),
  affichées dans les specs de la puff ; la fumée gachapuff a toujours les couleurs de la marque.
- **Formes** (tirage indépendant) : nuage 70 % · anneaux 12 % · cœurs 12 % · spirale 6 %.
- **Puff signée** : 1 %, toujours au pseudo du joueur qui la tire (aucune sans pseudo).
- **Boosters** : 1 toutes les 4 h, stock max 2 (un nouveau joueur commence plein).
- **Recyclage** : 3 puffs de rareté N → 1 puff de rareté N+1, tirée avec les règles du booster
  conditionnées à ce palier. Divine ne se recycle pas.

Durées d'animation (dont `OPENING_SLOWDOWN`, le ralenti de l'ouverture) et réglages du rendu :
[`app/src/config/motion.ts`](app/src/config/motion.ts).
Couleurs, typo, espacements : [`app/src/ui/styles/tokens.css`](app/src/ui/styles/tokens.css).

## Architecture

```text
app/src/
├─ domain/    logique pure et testée (tirage, rareté, recyclage, régénération) — ni React ni navigateur
├─ data/      manifeste, sauvegarde versionnée (Zod + migrations), IndexedDB derrière une interface
├─ store/     GameStore : relie domaine, persistance et UI ; démarrage
├─ effects/   rendu WebGL (finitions, fumée en particules), son synthétisé, haptique, confettis, tilt
├─ ui/        écrans et composants
└─ config/    réglages du jeu, du mouvement, de la mise en page
```

La sauvegarde passe par l'interface `SaveStore` (`load` / `save`) : un backend serveur pourra la
remplacer sans toucher aux écrans. Chaque exemplaire a un identifiant unique et sa rareté globale
stockée, en prévision des échanges. ESLint interdit au domaine d'importer l'UI et à l'UI d'importer IndexedDB.

## Pipeline (dataset)

```sh
pip install -r pipeline/requirements.txt
python pipeline/jnr_dataset.py --help
python pipeline/jnr_dataset.py --only-normalize   # rejoue depuis le cache, sans réseau
```

Les chemins sont ancrés sur le script : il peut être lancé depuis la racine ou depuis `pipeline/`.
Il écrit dans `dataset/` (racine) et garde son cache dans `pipeline/_travail/`
(dont `corrections.json`, la revue manuelle : à ne pas supprimer).

`dataset/` (~300 Mo) et `pipeline/_travail/` (~900 Mo) ne sont **pas versionnés** (voir `.gitignore`).
Pour les partager, il faudra les copier à la main ou passer par Git LFS.
