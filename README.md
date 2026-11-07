# Gachapuff

Jeu web de collection de puffs JNR : on ouvre des boosters, on contemple, on collectionne.

## Structure

```
gachapuff/
├─ app/        le jeu (Vite + TypeScript + React) — voir plus bas
├─ dataset/    images sources des puffs (PNG 1024², non versionné)
├─ pipeline/   le pipeline Python qui produit dataset/
└─ docs/       brief et prompt de construction
```

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
