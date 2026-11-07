# Prompt — Construire « Gachapuff », jeu web de collection de puffs JNR

Le jeu s'appelle **Gachapuff**. Utilise ce nom partout : titre de l'app, manifest PWA, `package.json`, README, écran d'accueil (avec un logo / wordmark soigné dans l'esprit de la DA du §5).

Tu travailles à la racine du projet (dossier `gachapuff/`). Lis ce prompt en entier avant de commencer. Les sections sont dans l'ordre d'exécution : **range le projet d'abord**, puis construis le jeu par phases. À la fin de chaque phase, l'app doit tourner et je dois pouvoir la tester.

---

## 0. Contexte

Le dossier contient déjà un pipeline Python (`jnr_dataset.py`) qui a constitué une base d'images de toutes les puffs JNR :

- `dataset/<Modèle>/<Saveur>.png` : **833 images**, **73 modèles** (+ un dossier `Non classe` contenant 1 image), PNG RGBA **1024×1024**, puff détourée vue de face, cadrage et centrage identiques. ~297 Mo au total.
- `dataset/notes.csv` (séparateur `;`, UTF-8 avec BOM) : `modele;saveur;fichier;integrite_sur_5;resolution_sur_5;hauteur_source_px;source;remarque`. Intégrité : 4 ou 5 partout. Résolution : 2 à 5 (la plupart 3–4).
- Le nom du modèle contient souvent la capacité en bouffées (`Alien 10K`, `Big Mac 100K`, `Quads 4in1 120K`…). Certains modèles n'en ont pas (`Cruiser`, `Slim Bar`, `Glide Pen`).

Ces images sont la matière première du jeu : **une carte = une variante (modèle × saveur)**.

---

## 1. Ranger le projet (à faire en premier)

État actuel de la racine, en vrac :

```
__pycache__/            cache Python
_discover.log, _final.log, _process.log   logs des runs du pipeline
_travail/               ~876 Mo : cache des téléchargements (raw/), sources, corrections.json (revue manuelle, PRÉCIEUX), rapports, planche de contrôle
dataset/                les images finales + notes.csv
raw/                    vide
index.csv               seulement une ligne d'en-tête (reliquat)
planche.html            stub de 361 octets (reliquat ; la vraie planche est dans _travail/)
jnr_dataset.py          le pipeline (67 Ko)
requirements.txt        dépendances du pipeline
brainstorming.txt       le brief du jeu
PROMPT_BUILD.md         ce fichier
```

Cible :

```
gachapuff/
├─ pipeline/                 tout ce qui sert à produire le dataset
│  ├─ jnr_dataset.py
│  ├─ requirements.txt
│  ├─ _travail/              déplacé tel quel, rien supprimé dedans
│  └─ logs/                  les trois *.log
├─ dataset/                  reste à la racine : c'est la source des assets du jeu
├─ docs/
│  ├─ brainstorming.txt
│  └─ PROMPT_BUILD.md
├─ app/ (ou racine du projet web, à toi de choisir, mais sois cohérent)
├─ README.md                 comment lancer le jeu, comment relancer le pipeline
└─ .gitignore
```

Règles :

- **Ne supprime rien dans `_travail/`** (notamment `corrections.json`, fruit d'une revue manuelle). Déplace-le seulement.
- Avant de supprimer `raw/`, `index.csv`, `planche.html` à la racine et `__pycache__/`, vérifie qu'ils sont bien vides / reliquats comme décrit ci-dessus. Si l'un ne l'est pas, déplace-le dans `pipeline/` au lieu de le supprimer et signale-le-moi.
- `jnr_dataset.py` utilise des chemins relatifs au répertoire courant (`Path("dataset")`, `Path("_travail")`, `Path("a_verifier")`, lignes ~78-81). Après déplacement, ancre-les sur l'emplacement du script : `_travail` → `pipeline/_travail`, `dataset` → `../dataset` (racine du projet). Vérifie que `python pipeline/jnr_dataset.py --help` fonctionne depuis la racine **et** depuis `pipeline/`. Ne lance pas un vrai run du pipeline (réseau + modèles lourds).
- `git init`, puis un `.gitignore` qui exclut : `node_modules/`, builds, `__pycache__/`, `pipeline/_travail/`, `pipeline/logs/`, et les assets générés du jeu (voir §3). Demande-moi avant de décider si `dataset/` (297 Mo) va dans git ou en Git LFS ou est ignoré — par défaut, ignore-le et documente-le dans le README.
- Fais un premier commit « Rangement du projet » une fois que tout est en place.

---

## 2. Le jeu

### Concept

Jeu web de **collection pure** : on ouvre des boosters, chaque booster contient **une puff**. Pas de gameplay en dehors de la **contemplation** et de la **collection**. Pas de combat, pas de score, pas de quêtes.

Inspirations : **Pokémon TCG Pocket** (ouverture de booster, cartes holo qu'on fait pivoter au doigt, régénération du booster dans le temps), **Wiki Masters** (collection, album, raretés), **caisses CS:GO** (roulette de révélation, tension, couleurs de rareté), **Balatro** et l'esthétique **casino** pour l'UI/UX (« dopamine maxing ») : juicy, tactile, sonore, un peu kitsch, ludique.

Plateformes : **mobile d'abord** (portrait, tactile, gestes), parfaitement utilisable **sur PC** (souris, clavier, écran large).

### Pas d'argent réel

Aucun achat, aucune monnaie payante, aucun moyen de convertir quoi que ce soit en argent. L'esthétique casino est purement visuelle. Aucune pub.

### Boucle de jeu

1. Un booster se régénère avec le temps (stock de boosters plafonné).
2. J'ouvre un booster → animation de révélation → j'obtiens une puff, avec ses attributs de rareté.
3. Elle va dans ma collection (album par modèle, doublons comptés).
4. Je peux **recycler** : détruire 3 puffs de rareté N → obtenir 1 puff de rareté N+1.
5. *(plus tard, hors périmètre actuel)* **échanger** avec un autre joueur une puff contre une puff **de même rareté**. Voir §7.

Un seul type de booster au lancement. Prévois quand même dans le code la notion de « type de booster » (une table de drop par booster) pour pouvoir en ajouter plus tard.

---

## 3. Assets

Ne sers jamais les PNG 1024² bruts au navigateur. Écris un script de build d'assets (Node avec `sharp`, ou Python avec Pillow, au choix) qui :

- lit `dataset/notes.csv` et les PNG ;
- génère pour chaque puff un **WebP** (avec alpha) en ~512 px (vue détail) et ~256 px (grille album), plus éventuellement un AVIF ;
- produit un **manifeste JSON** : `id` stable (slug modèle + saveur), `model`, `flavor`, `puffs` (capacité extraite du nom, `null` si absente), chemins des images, notes de qualité, et une **couleur dominante** de la puff (utile pour les halos et la fumée) ;
- est idempotent et rapide à relancer (ne regénère que ce qui a changé) ;
- place la sortie dans un dossier ignoré par git, générée par `npm run assets`.

Exclus `Non classe` du jeu par défaut (paramètre de config).

---

## 4. Système de rareté

Le brief laisse la hiérarchie et les probabilités « à définir ». **Propose des valeurs par défaut cohérentes, mais mets TOUT dans un seul fichier de config typé** (`gameConfig.ts` ou équivalent) pour que je puisse les régler sans toucher au code. Ajoute un petit outil (page de debug ou script) qui simule 100 000 ouvertures et affiche la distribution obtenue, pour vérifier les réglages.

Une puff tirée est la combinaison de trois axes indépendants :

**a) La puff de base** (modèle × saveur). Propose un palier de base par modèle, par exemple dérivé de la capacité en bouffées (plus de bouffées = plus rare), surchargeable à la main dans la config.

**b) La finition**, qui change le rendu de la puff :
- Normale
- Brillante (shiny)
- Chromatique
- Cristal
(ajoute-en une ou deux si tu as une bonne idée, mais garde-les dans la config)

**c) La fumée** : blanche par défaut ; plus rare en **couleur unie aléatoire** ; encore plus rare en **dégradé** aléatoire (2–3 couleurs). Les couleurs sont tirées au moment de l'ouverture et stockées : deux exemplaires de la même puff peuvent donc avoir des fumées différentes.

**Rareté finale** : calcule une rareté globale à partir des trois axes (par exemple somme de points → palier). Propose 6 à 7 paliers nommés avec une couleur chacun, façon CS:GO (gris → bleu → violet → rose → rouge → or…). C'est **cette rareté globale** qui sert pour l'échange (même rareté) et le recyclage (3 × N → 1 × N+1). Le dernier palier ne se recycle pas.

Pour le recyclage, définis précisément ce qui est tiré pour le résultat (une puff au hasard du palier N+1, tirée avec les mêmes règles que les boosters mais conditionnée au palier). Documente-le dans la config.

**Régénération des boosters** : valeur par défaut proposée (ex. 1 booster toutes les 4 h, stock max 2), dans la config. Ajoute un mode dev (`?dev=1` ou variable d'env) qui donne des boosters illimités pour tester.

---

## 5. Direction artistique — la priorité n°1

Le jeu doit être **visuellement délicieux**. C'est l'essentiel du produit : la qualité se juge à l'effet produit quand on ouvre un booster et quand on manipule une puff rare. Passe du temps sur les effets.

**La puff en vue détail** :
- inclinaison 3D qui suit le doigt / la souris (et le gyroscope sur mobile si autorisé), avec reflet spéculaire qui glisse ;
- chaque finition a un rendu propre et reconnaissable au premier coup d'œil :
  - *Brillante* : éclats / étincelles, reflet balayant ;
  - *Chromatique* : irisation arc-en-ciel qui bouge avec l'angle (holo type carte Pokémon) ;
  - *Cristal* : réfraction, facettes, transparence, caustiques ;
- les effets s'appliquent **sur la silhouette de la puff** (utilise l'alpha du PNG comme masque), pas sur un rectangle autour ;
- la **fumée** s'échappe de l'embout, en continu, douce et vivante (particules ou shader de bruit), dans sa couleur ou son dégradé.

**L'ouverture de booster** (le moment clé) :
- anticipation : le booster tremble, se charge, on tire / déchire / glisse pour l'ouvrir ;
- **indice de rareté avant la révélation** (couleur de lueur, intensité des particules, son qui monte), façon CS:GO / TCG Pocket ;
- révélation proportionnelle à la rareté : une commune est rapide et propre, une rare a flash, ralenti, confettis, écran qui tremble, rayons ;
- possibilité de passer l'animation (tap) pour ne pas lasser.

**UI générale** : esprit Balatro / casino : typographie grasse, couleurs saturées, néons, chiffres qui comptent, boutons qui rebondissent, micro-animations partout, retours **haptiques** sur mobile (`navigator.vibrate` quand dispo) et **sons** (avec bouton couper le son, et son coupé par défaut tant que l'utilisateur n'a pas interagi). Fun et joueur, jamais austère.

**Performance** : 60 fps visé sur un téléphone milieu de gamme. Respecte `prefers-reduced-motion` (version calme des effets). Les effets lourds (WebGL) ne tournent que sur la puff à l'écran, pas sur les 800 vignettes de l'album.

---

## 6. Écrans

- **Accueil / Booster** : le booster du moment au centre, minuteur de régénération, stock, bouton d'ouverture énorme et irrésistible.
- **Révélation** : décrit en §5, puis « Ajouter à la collection » avec le compteur de doublons.
- **Collection / Album** : grille par modèle, emplacements vides en silhouette pour les puffs pas encore obtenues, progression par modèle et globale (%), filtres (modèle, rareté, finition, fumée, obtenues / manquantes), tri.
- **Détail d'une puff** : vue contemplative plein écran (§5), infos (modèle, saveur, bouffées, finition, fumée, rareté, date d'obtention), liste de mes exemplaires de cette puff.
- **Recyclage** : choisir 3 puffs de même rareté, animation de fusion satisfaisante (machine à sous, creuset, peu importe tant que c'est jouissif), révélation du résultat.
- **Échange** : pas d'écran pour l'instant (voir §7).
- Navigation par barre d'onglets en bas sur mobile, adaptée sur PC.

---

## 7. Pas de serveur : version de test locale

Pour l'instant c'est **une version de test, sans serveur ni comptes**. N'installe aucun backend (pas de Supabase, Firebase, API, base de données distante) et ne me propose pas d'en ajouter.

- Tout tourne dans le navigateur, hors ligne. L'état du joueur (collection, stock de boosters, horodatage de régénération) est sauvegardé dans **IndexedDB**.
- La logique (tirage, rareté, recyclage, régénération) vit dans un module pur et testé, séparé de l'UI. La persistance passe par une petite interface (`load` / `save`). Comme ça, on pourra brancher un serveur plus tard sans réécrire l'écran.
- **L'échange entre joueurs n'est pas implémenté** : il ne peut pas exister sans serveur. Ne fais ni écran ni bouton « bientôt disponible ». Garde seulement un modèle de données compatible : chaque exemplaire de puff a un identifiant unique et sa rareté globale stockée.
- Ajoute dans les réglages (ou en mode dev) **réinitialiser la collection**, ainsi qu'**exporter / importer la sauvegarde en JSON**, pour faciliter les tests.
- La triche locale (modifier IndexedDB) n'est pas un problème à ce stade : ne perds pas de temps dessus.

---

## 8. Technique

- Stack front proposée : **Vite + TypeScript + React** (ou Svelte si tu le juges plus adapté aux animations), animations avec CSS / Framer Motion (ou équivalent), effets de puff et de fumée en **WebGL** (PixiJS, three.js ou shaders maison) avec repli CSS si WebGL indisponible.
- **PWA** installable (manifest, icônes, service worker pour le cache des assets).
- Tests unitaires sur la logique pure : tirage et distribution, rareté finale, recyclage, régénération. Utilise un RNG injectable pour des tests déterministes.
- Code et commentaires en anglais ; UI du jeu en **français**.

---

## 9. Bonnes pratiques

Applique-les dès le premier fichier, pas en fin de projet.

### Développement

- **TypeScript strict** (`strict: true`, pas de `any` sauf justifié en commentaire). Types du domaine (`PuffDefinition`, `PuffInstance`, `Rarity`, `Finish`, `Smoke`, `BoosterType`, `SaveState`…) définis une seule fois et partagés.
- **Architecture en couches** : `domain/` (logique pure, sans React ni navigateur), `data/` (manifeste, persistance IndexedDB derrière une interface), `ui/` (composants), `effects/` (rendu WebGL / particules), `config/`. L'UI n'importe jamais directement IndexedDB ; le domaine n'importe jamais l'UI.
- **Composants petits et nommés clairement**, un rôle par fichier. Pas de fichier fourre-tout de 1 000 lignes. Pas de code mort, pas de code commenté laissé en place.
- **Pas de nombres magiques** : probabilités, durées, tailles et couleurs viennent de la config ou des tokens de design (voir plus bas).
- **ESLint + Prettier** configurés, scripts `npm run lint`, `npm run format`, `npm run typecheck`, `npm test`. Tout passe sans erreur à chaque fin d'étape.
- **Tests** : unitaires (Vitest) sur tout le domaine, avec RNG à graine. Un test de bout en bout (Playwright) sur le parcours principal : ouvrir un booster → voir la puff dans l'album → recycler 3 puffs.
- **Sauvegarde versionnée** : le `SaveState` porte un numéro de version et une fonction de migration, pour ne pas casser les sauvegardes de test quand le format évolue. Valide les données chargées (ex. Zod) et tombe sur un état propre si elles sont corrompues.
- **Gestion d'erreurs** : un écran d'erreur jouable plutôt qu'une page blanche (error boundary), repli si WebGL ou IndexedDB échouent.
- **Performance** : chargement paresseux des images (`loading="lazy"`, virtualisation de la grille de l'album), code splitting des écrans lourds, libération des contextes WebGL quand on quitte une vue. Vérifie avec Lighthouse sur profil mobile et vise ≥ 90 en performance et en accessibilité.
- **Dépendances** : le minimum, versions figées, pas de bibliothèque pour ce qui tient en 20 lignes.
- **Git** : un commit par étape terminée (ou plus petit), messages clairs. Ne commite jamais un état qui ne compile pas.
- **README** à jour : installer, lancer, générer les assets, tester, où régler les probabilités.

### Design

- **Design system d'abord** : avant les écrans, pose des **tokens** (variables CSS) pour les couleurs (dont une couleur par palier de rareté), la typographie, l'échelle d'espacement (base 4 ou 8 px), les rayons, les ombres, les durées et courbes d'animation. Tout le reste les utilise. Crée une page `/dev/design` qui affiche ces tokens et les composants de base (boutons, badges de rareté, vignette de puff, compteurs).
- **Hiérarchie visuelle** : sur chaque écran, une seule action principale évidente. Le spectaculaire est réservé aux moments forts (ouverture, puff rare, recyclage) ; le reste de l'UI reste lisible et calme pour que ces moments ressortent.
- **Cohérence du mouvement** : un petit vocabulaire d'animations réutilisé partout (entrée, sortie, rebond, récompense), avec des durées issues des tokens. Les animations ont un sens (elles guident ou récompensent), jamais gratuites au point de gêner.
- **Mobile d'abord** : cibles tactiles ≥ 44 × 44 px, actions principales atteignables au pouce (bas de l'écran), respect des safe areas iOS (`env(safe-area-inset-*)`), pas de survol indispensable. Puis adapte au desktop (raccourcis clavier, mise en page qui exploite la largeur) au lieu d'étirer la version mobile.
- **Accessibilité** : contraste WCAG AA pour le texte, rareté jamais signalée par la couleur seule (aussi un nom, une icône ou un motif), navigation complète au clavier avec focus visible, textes alternatifs sur les puffs, `prefers-reduced-motion` respecté, aucun flash de plus de 3 par seconde (attention aux révélations de rareté).
- **États** : prévois chaque état de chaque écran : chargement (squelettes, pas de spinner nu), vide (album sans puff, aucun booster dispo), erreur, succès.
- **Typographie et texte** : 2 polices maximum, chargées proprement (`font-display: swap`). Textes en français, courts, ludiques, cohérents dans le ton.
- **Validation visuelle** : à la fin de chaque étape qui touche l'UI, fais des captures à 390 px et à 1440 px de large, regarde-les vraiment et corrige ce qui est mal aligné, coupé, illisible ou incohérent avant de me rendre la main.

---

## 10. Plan de livraison

1. **Rangement** (§1) + commit.
2. **Squelette** : projet web avec outillage (lint, format, typecheck, tests), tokens de design et page `/dev/design`, script d'assets, manifeste, album qui affiche toutes les puffs.
3. **Moteur de rareté** : config, tirage, simulateur de distribution, tests.
4. **Rendu des puffs** : vue détail avec tilt, les 4 finitions, la fumée (blanche / unie / dégradé). Fais-moi une page « vitrine » qui montre une même puff dans toutes les combinaisons pour que je valide le rendu.
5. **Ouverture de booster** complète avec son, haptique, régénération.
6. **Collection** complète + **recyclage**.
7. **Polish** : transitions, sons, reduced-motion, perf mobile, PWA, réinitialisation et export / import de la sauvegarde.

L'échange et tout ce qui demande un serveur sont hors périmètre : arrête-toi après l'étape 7.

À chaque étape : lance l'app, vérifie sur une largeur mobile (≈390 px) et desktop, et dis-moi ce qui est fait, ce qui ne l'est pas, et les choix que tu as faits par défaut (surtout les probabilités et les paliers), pour que je puisse les corriger.
