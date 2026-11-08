"""
Remplacement des embouts transparents mal detoures.

Sur les visuels marketing, l'embout en plastique transparent de certains modeles
laisse voir le fond : le detourage n'en garde que des morceaux (deux "cornes",
des debris colores). Pour ces modeles, on remplace l'embout par un embout de
reference :
  * silhouette = consensus des puffs saines du modele (masques alignes sur
    l'epaule et la largeur du corps, moyennes, symetrises) -> pas de bosse
    heritee d'une image source particuliere ;
  * rendu verre neutre (remplissage leger, double liseré, reflets), lisible sur
    la carte ivoire comme sur le tapis vert de l'app.

Les embouts de reference sont versionnes dans pipeline/embouts/<modele>.png.
Convention : l'image fait REF_W px de large = largeur du corps de la puff, et sa
derniere ligne correspond a la ligne d'epaule (+ OVERLAP lignes de recouvrement).

Usage :
  python embouts.py --templates   reconstruit les embouts de reference depuis dataset/
  python embouts.py --apply       corrige dataset/ en place (originaux sauvegardes
                                  dans _travail/embouts_originaux/, reutilises a
                                  chaque passage : la commande est idempotente)
  python embouts.py --preview     planches avant/apres dans _travail/embouts_apercu/
"""
from __future__ import annotations

import argparse
import csv
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = Path(__file__).resolve().parent
DATASET = HERE.parent / "dataset"
TEMPLATES = HERE / "embouts"
WORK = HERE / "_travail"
BACKUP = WORK / "embouts_originaux"
PREVIEW = WORK / "embouts_apercu"

# modeles a embout carre transparent, verifies visuellement
MODELS = ["Falcon 16K", "Falcon X 18K", "Falcon Gem+ 30K", "Falcon Pro 28K", "Rage Gorilla 55K"]

CANVAS, MARGIN = 1024, 0.08     # comme jnr_dataset.frame()
REF_W = 600                     # largeur du corps dans l'embout de reference
OVERLAP = 6                     # lignes sous l'epaule incluses (fondues) pour la jonction
FADE = 18                       # hauteur du fondu bas de l'embout
SHOULDER = 0.6                  # epaule = 1re ligne >= 60 % de la largeur du corps


def slug(model: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in model).strip("_").lower()


# ------------------------------------------------------------ mesures -------

def measure(alpha: np.ndarray):
    """(ligne d'epaule, largeur du corps, centre x du corps) d'un masque de puff."""
    ys = np.nonzero(alpha.any(1))[0]
    if not len(ys):
        return None
    y0, y1 = ys.min(), ys.max()
    h = y1 - y0
    w = alpha.sum(1)
    body = float(np.median(w[y0 + int(.3 * h): y0 + int(.7 * h)]))
    if body <= 0:
        return None
    sh = y0 + int(np.argmax(w[y0:] >= SHOULDER * body))
    row = np.nonzero(alpha[min(sh + 40, alpha.shape[0] - 1)])[0]
    cx = (row.min() + row.max()) / 2 if len(row) else alpha.shape[1] / 2
    return sh, body, cx, y0


def is_defective(alpha: np.ndarray) -> bool:
    """Embout creux (forme en U : lignes coupees en deux segments) ou fragmente
    (zone de l'embout peu remplie)."""
    m = measure(alpha)
    if m is None:
        return False
    _, body, _, y0 = m
    w = alpha.sum(1)
    h = np.nonzero(alpha.any(1))[0].max() - y0
    yb = y0 + int(np.argmax(w[y0:] >= .85 * body))
    zone = alpha[y0:yb]
    if len(zone) <= 3:
        return False
    xs = np.nonzero(zone.any(0))[0]
    sub = zone[:, xs.min():xs.max() + 1]
    runs = (np.diff(sub.astype(np.int8), axis=1) == 1).sum(1) + sub[:, 0]
    hollow = (runs >= 2).mean()
    return bool(hollow > .3 or ((yb - y0) / h > .03 and sub.mean() < .45))


def load_alpha(path: Path, thr: int = 60) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[..., 3] > thr


# --------------------------------------------------- embout de reference ----

def consensus_silhouette(pngs: list[Path]) -> np.ndarray:
    """Silhouette moyenne de l'embout sur les puffs saines, normalisee a REF_W."""
    acc, n, height = None, 0, 0
    crops = []
    for p in pngs:
        a = load_alpha(p)
        m = measure(a)
        if m is None:
            continue
        sh, body, cx, y0 = m
        top = a[y0: sh + OVERLAP].copy()
        # embout plein : on comble le creux eventuel ligne par ligne
        for y in range(len(top)):
            xs = np.nonzero(top[y])[0]
            if len(xs):
                top[y, xs.min(): xs.max() + 1] = True
        s = REF_W / body
        x0 = int(round(cx - body / 2))
        pad = np.zeros((top.shape[0], int(body) + 2), bool)
        lo, hi = max(0, x0), min(a.shape[1], x0 + pad.shape[1])
        pad[:, lo - x0: hi - x0] = top[:, lo:hi]
        im = Image.fromarray(pad.astype(np.uint8) * 255).resize(
            (REF_W, max(1, round(pad.shape[0] * s))), Image.BILINEAR)
        crops.append(np.asarray(im).astype(np.float32) / 255)
        height = max(height, crops[-1].shape[0])
    for c in crops:   # alignement par le bas (ligne d'epaule)
        full = np.zeros((height, REF_W), np.float32)
        full[height - c.shape[0]:] = c
        acc = full if acc is None else acc + full
        n += 1
    if not n:
        raise ValueError("aucune puff saine pour construire l'embout")
    prob = acc / n
    prob = (prob + prob[:, ::-1]) / 2                       # symetrie gauche/droite
    mask = prob > .5
    mask = ndimage.binary_opening(mask, iterations=2)
    mask = ndimage.binary_fill_holes(mask)
    lab, k = ndimage.label(mask)
    if k > 1:
        sizes = ndimage.sum(mask, lab, range(1, k + 1))
        mask = lab == 1 + int(np.argmax(sizes))
    # profil de largeur regularise : l'embout s'evase vers le bas sans onduler,
    # puis on reconstruit une silhouette centree (bords nets, haut droit)
    ys = np.nonzero(mask.any(1))[0]
    mask = mask[ys.min():]
    w = mask.sum(1).astype(np.float32)
    w = np.maximum.accumulate(w)
    w = ndimage.gaussian_filter1d(w, 3, mode="nearest")
    H = len(w)
    x = np.arange(REF_W)[None, :] + .5
    half = (w / 2)[:, None]
    cover = np.clip(half - np.abs(x - REF_W / 2) + .5, 0, 1)   # bord anti-aliase
    m = cover > .5
    # coins du haut arrondis
    r = max(4, int(.06 * w[min(H - 1, 10)]))
    sm = Image.fromarray(m.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(r / 2))
    return np.asarray(sm) > 127


def render_glass(mask: np.ndarray) -> Image.Image:
    """Embout en verre neutre a partir d'une silhouette."""
    H, W = mask.shape
    m = mask.astype(np.float32)
    yy, xx = np.nonzero(mask)
    inner = ndimage.binary_erosion(mask, iterations=7)
    rim_out = mask & ~ndimage.binary_erosion(mask, iterations=3)
    rim_in = ndimage.binary_erosion(mask, iterations=3) & ~inner
    xn = (np.arange(W) - xx.min()) / max(1, xx.max() - xx.min())
    yn = (np.arange(H) - yy.min()) / max(1, H - 1 - yy.min())
    gx = lambda c, s: np.exp(-((xn - c) / s) ** 2)[None, :] * np.ones((H, 1))
    # couleur : gris bleute clair, plus sombre sur le liseré exterieur
    rgb = np.empty((H, W, 3), np.float32)
    rgb[:] = (214, 222, 230)
    rgb[rim_out] = (96, 108, 122)
    rgb[rim_in] = (250, 252, 255)
    hl = np.clip(gx(.26, .07) * .9 + gx(.80, .035) * .55, 0, 1) * inner   # reflets
    rgb = rgb * (1 - hl[..., None]) + np.array([255, 255, 255]) * hl[..., None]
    alpha = (np.where(inner, .30, 0) + np.where(rim_out, .85, 0) + np.where(rim_in, .70, 0)
             + hl * .55)
    alpha = alpha * (1.0 - .25 * yn)[:, None]               # un peu plus dense en haut
    # ombre interne en bas de l'embout (assise sur le capuchon)
    alpha = alpha + inner * np.clip((yn - .75) / .25, 0, 1)[:, None] * .12
    alpha = np.clip(alpha, 0, 1) * m
    fade = np.clip((H - 1 - np.arange(H)) / FADE, 0, 1)
    alpha = alpha * fade[:, None]
    a8 = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    out.putalpha(a8)
    return out


def build_templates(models=MODELS) -> dict[str, int]:
    TEMPLATES.mkdir(exist_ok=True)
    used = {}
    for model in models:
        files = sorted((DATASET / model).glob("*.png"))
        healthy = [p for p in files if not is_defective(load_alpha(original(p)))]
        tpl = render_glass(consensus_silhouette([original(p) for p in healthy]))
        tpl.save(TEMPLATES / f"{slug(model)}.png", optimize=True)
        used[model] = len(healthy)
    return used


def template_for(model: str) -> Image.Image | None:
    p = TEMPLATES / f"{slug(model)}.png"
    return Image.open(p).convert("RGBA") if p.exists() else None


# ------------------------------------------------------------ greffe --------

def frame(rgba: Image.Image) -> Image.Image:
    a = np.asarray(rgba)[..., 3]
    ys, xs = np.nonzero(a > 10)
    crop = rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    box = int(CANVAS * (1 - 2 * MARGIN))
    s = min(box / crop.width, box / crop.height)
    crop = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.LANCZOS)
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.alpha_composite(crop, ((CANVAS - crop.width) // 2, (CANVAS - crop.height) // 2))
    return out


def replace_nozzle(rgba: Image.Image, tpl: Image.Image) -> Image.Image:
    arr = np.asarray(rgba.convert("RGBA")).copy()
    m = measure(arr[..., 3] > 60)
    sh, body, cx, _ = m
    arr[: max(0, sh - 2), :, 3] = 0                  # on efface l'embout rate
    s = body / REF_W
    t = tpl.resize((max(1, round(tpl.width * s)), max(1, round(tpl.height * s))), Image.LANCZOS)
    pad = t.height + 8
    big = Image.new("RGBA", (arr.shape[1], arr.shape[0] + pad), (0, 0, 0, 0))
    big.alpha_composite(t, (int(round(cx - t.width / 2)), pad + sh + round(OVERLAP * s) - t.height))
    big.alpha_composite(Image.fromarray(arr, "RGBA"), (0, pad))   # capuchon devant la jonction
    return frame(big)


def fix_image(path: Path, model: str, src: Path | None = None) -> bool:
    """Corrige l'image `path` (lue depuis `src` si donne). True si l'embout a ete remplace."""
    if model not in MODELS:
        return False
    src = src or path
    if not is_defective(load_alpha(src)):
        if src != path:
            shutil.copyfile(src, path)
        return False
    tpl = template_for(model)
    if tpl is None:
        return False
    replace_nozzle(Image.open(src), tpl).save(path, optimize=True)
    return True


# ------------------------------------------------- dataset existant ---------

def original(p: Path) -> Path:
    """Version d'origine d'une image du dataset (sauvegarde si elle existe)."""
    b = BACKUP / p.relative_to(DATASET)
    return b if b.exists() else p


def apply_dataset() -> list[tuple[str, str]]:
    fixed = []
    for model in MODELS:
        for p in sorted((DATASET / model).glob("*.png")):
            b = BACKUP / p.relative_to(DATASET)
            if not b.exists():
                if not is_defective(load_alpha(p)):
                    continue
                b.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(p, b)
            if fix_image(p, model, src=b):
                fixed.append((model, p.stem))
    mark_notes(fixed)
    return fixed


def mark_notes(fixed):
    """Ajoute 'embout remplace' dans la colonne remarque de dataset/notes.csv."""
    path = DATASET / "notes.csv"
    if not path.exists():
        return
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    head, body = rows[0], rows[1:]
    im, iflav, irem = head.index("modele"), head.index("saveur"), head.index("remarque")
    keys = set(fixed)
    for r in body:
        rem = [s for s in r[irem].split(", ") if s and s != "embout remplace"]
        if (r[im], r[iflav]) in keys:
            rem.append("embout remplace")
        r[irem] = ", ".join(rem)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f, delimiter=";").writerows([head] + body)


def preview(fixed):
    PREVIEW.mkdir(parents=True, exist_ok=True)
    # par puff : haut de la puff, ligne 1 avant / ligne 2 apres, carte ivoire | tapis vert
    tw, th, cols = 150, 150, 4
    cell_w, cell_h = 2 * tw + 10, 2 * th + 22
    for model in MODELS:
        items = [f for m, f in fixed if m == model]
        if not items:
            continue
        rows = (len(items) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (40, 40, 40))
        d = ImageDraw.Draw(sheet)
        for i, fl in enumerate(items):
            x, y = (i % cols) * cell_w, (i // cols) * cell_h
            d.text((x + 3, y + 4), fl[:40], fill=(255, 230, 120))
            pair = [Image.open(BACKUP / model / f"{fl}.png"), Image.open(DATASET / model / f"{fl}.png")]
            for j, im in enumerate(pair):
                c = im.convert("RGBA").crop((262, 30, 762, 530))
                for k, bg in enumerate([(242, 232, 213), (15, 74, 55)]):
                    b = Image.new("RGBA", c.size, bg + (255,))
                    b.alpha_composite(c)
                    sheet.paste(b.convert("RGB").resize((tw - 2, th - 2)),
                                (x + k * tw, y + 20 + j * th))
        sheet.save(PREVIEW / f"{slug(model)}.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--templates", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()
    if a.templates:
        for m, n in build_templates().items():
            print(f"{m}: embout construit sur {n} puffs saines")
    if a.apply:
        fixed = apply_dataset()
        print(f"{len(fixed)} embouts remplaces")
        if a.preview:
            preview(fixed)
    elif a.preview:
        preview([(m, p.stem) for m in MODELS for p in sorted((BACKUP / m).glob("*.png"))])
