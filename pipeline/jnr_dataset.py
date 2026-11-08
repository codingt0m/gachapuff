#!/usr/bin/env python3
"""
JNR dataset builder
-------------------
Constitue une base d'images de toutes les puffs JNR, tous marches confondus :
une image par variante (modele x saveur/coloris), en PNG transparent,
puff vue de face, cadrage/taille/centrage identiques.

Resultat :
    dataset/<Modele>/<Saveur>.png   une image par variante
    dataset/notes.csv               note d'integrite et de resolution (sur 5) par image,
                                    pour ne garder que les meilleures

Fichiers de travail (cache, rapport, corrections manuelles) : pipeline/_travail/
    _travail/corrections.json : exclusions, images bannies/imposees, renommages,
                                notes issues de la revue visuelle

Deux chaines de detourage :
  * photo produit sur fond uni      -> rembg (isnet) + recuperation du plastique
                                       transparent de l'embout
  * visuel marketing (fond, boite)  -> Grounding DINO localise la puff (les
                                       emballages sont reconnus a leur panneau
                                       d'avertissement et ecartes), SAM la detoure

Embouts transparents (Falcon, Rage Gorilla...) : sur visuel marketing, le detourage
n'en garde souvent que des morceaux ; ils sont remplaces par l'embout de reference
du modele (pipeline/embouts/, voir embouts.py).

Usage :
    pip install -r pipeline/requirements.txt
    python pipeline/jnr_dataset.py                  # decouverte + telechargement + detourage
    python pipeline/jnr_dataset.py --only-normalize # rejoue depuis le cache, sans reseau
    python pipeline/jnr_dataset.py --only-discover  # met a jour la liste des fiches seulement

Les chemins sont ancres sur l'emplacement du script : dataset/ a la racine du
projet, _travail/ et a_verifier/ dans pipeline/.

Le crawler respecte le robots.txt de chaque site et espace ses requetes.
Le traitement est reprenable : chaque detourage est mis en cache.
"""

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse, unquote

import numpy as np
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageFilter

import embouts

Image.MAX_IMAGE_PIXELS = 60_000_000

try:
    from rembg import remove as rembg_remove, new_session
except ImportError:
    rembg_remove = None

try:
    from scipy import ndimage
except ImportError:
    ndimage = None

# ---------------------------------------------------------------- CONFIG ---

USER_AGENT = "Mozilla/5.0 (JNR-dataset research crawler)"
REQUEST_DELAY = 1.0      # secondes entre deux requetes vers un meme hote
MAX_CANDIDATES = 4       # images testees au maximum par fiche produit

CANVAS = 1024            # taille finale (carre)
MARGIN = 0.08            # marge autour de la puff

DETECTOR = "IDEA-Research/grounding-dino-base"
SEGMENTER = "facebook/sam-vit-base"
DETECT_PROMPT = "electronic cigarette. packaging box. bottle. warning label."
CACHE_VERSION = 2       # a incrementer quand la chaine de detourage change

# Paths are anchored on this script, so it can be run from any directory:
# the dataset lives at the project root, working files next to the script.
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "dataset"
REVIEW = HERE / "a_verifier"
WORK = HERE / "_travail"
RAW = WORK / "raw"
CUT = WORK / "cut"
INDEX = WORK / "index.json"
CONTROL = WORK / "control.txt"   # "pause" : suspend le traitement, "run" : reprend
DISCARDED = WORK / "ecartees"    # images sous les seuils de qualite (hors dataset)
MIN_RESOLUTION = 2      # resolution 1/5 (puff < 300 px dans la source) ecartee
MIN_INTEGRITE = 4       # integrite 1 a 3/5 (puff abimee, penchee, debris...) ecartee

FABRICANT = "Visuel fabricant"   # saveur utilisee pour l'image unique d'un modele

# Sources, par ordre de priorite : pour une meme variante, la premiere image
# propre gagne. Photos sur fond uni d'abord, visuels marketing ensuite.
SOURCES = [
    # --- photos produit sur fond blanc (marche FR/UE)
    {"name": "levapoteur-discount", "kind": "sitemap",
     "sitemap": "https://www.levapoteur-discount.fr/en/sitemap.xml",
     "include": r"/en/[^/]+/\d+-.*jnr",
     "exclude": r"/en/(jnr-e-liquids|pre-filled-pod-cartridges|empty-cartridges-for-pods)/"},
    {"name": "aromes-et-liquides", "kind": "sitemap",
     "sitemap": "https://www.aromes-et-liquides.fr/1_index_sitemap.xml",
     "include": r"/en/puffs/.*jnr"},
    {"name": "jnrofficial.fr", "kind": "skus",
     "sitemap": "https://jnrofficial.fr/sitemap.xml",
     "include": r"jnrofficial\.fr/jnr-(?!e-liquid)"},
    {"name": "freevap.ch", "kind": "sitemap", "fetch_page": True,
     "sitemap": "https://www.freevap.ch/sitemap-en-1-index.xml",
     "include": r"/en/[^/]*puff[^/]*/.*jnr"},
    # --- visuels marketing (marches mondiaux), detoures par DINO + SAM
    {"name": "vapeseurope.com", "kind": "shopify",
     "base": "https://vapeseurope.com", "collection": "jnr"},
    {"name": "jnrvapestore.com", "kind": "skus",
     "sitemap": "https://www.jnrvapestore.com/sitemap.xml",
     "include": r"jnrvapestore\.com/[a-z0-9-]+-\d+k-puffs"},
    {"name": "starsvape.com", "kind": "sitemap", "fetch_page": True,
     "sitemap": "https://starsvape.com/sitemap_index.xml",
     "include": r"^https://starsvape\.com/product/.*jnr"},
    {"name": "jnrpuff.com", "kind": "sitemap", "fetch_page": True,
     "sitemap": "https://jnrpuff.com/sitemap_index.xml",
     "include": r"^https://jnrpuff\.com/en/product/"},
    {"name": "jnrvape.us", "kind": "sitemap", "fetch_page": True,
     "sitemap": "https://jnrvape.us/app-resources/sitemaps/sitemap.xml",
     "include": r"/products/[^/]*jnr",
     "exclude": r"/products/-|combo|\d+pcs|buy-\d"},
    {"name": "spacexvape.com", "kind": "sitemap", "fetch_page": True,
     "sitemap": "https://www.spacexvape.com/sitemap_index.xml",
     "include": r"^https://www\.spacexvape\.com/product/.*jnr"},
    {"name": "sleekvape.com", "kind": "sitemap", "fetch_page": True,
     "sitemap": "https://sleekvape.com/sitemaps.xml",
     "include": r"/product/.*jnr"},
    {"name": "zugevape.com", "kind": "sitemap", "fetch_page": True,
     "sitemap": "https://zugevape.com/sitemap_index.xml",
     "include": r"^https://zugevape\.com/product/.*jnr"},
    # --- catalogue fabricant : un visuel par modele (filet de securite)
    {"name": "jnrvapor.com", "kind": "manufacturer",
     "sitemap": "https://www.jnrvapor.com/sitemap.xml",
     "include": r"^https://www\.jnrvapor\.com/product/[^/]+/$"},
]

# Fiches a ignorer (packs, accessoires, liquides...), testees sur titre + chemin.
EXCLUDE = re.compile(
    r"puff attack|x lvd|cartridge|cartouche|e-?liquid|\bliquids?\b|\bpack\b|\bbundle\b|"
    r"\bcombo\b|\bpcs\b|\bempty\b|\bcoils?\b|\bresistance|\bbattery\b|batterie|"
    r"\d+\s?ml\b|\bbox of \d+|\bpack of \d+|\bboxes\)|\bpouch|buy \d|random flavou?r|"
    r"\bwholesale\b.*\bbox\b|\bcharger\b|\bcable\b|\bcase\b",
    re.I,
)

# Familles de modeles : (regex, nom, nombre de bouffees par defaut en milliers).
# Le nombre de bouffees lu dans le titre prime sur la valeur par defaut.
# L'ordre compte : motifs les plus specifiques d'abord.
FAMILIES = [
    (r"fal?c?on[\s-]*gem", "Falcon Gem+", 30),
    (r"fal?c?on[\s-]*mini", "Falcon Mini", 20),
    (r"fal?c?on[\s-]*nexus", "Falcon Nexus", 40),
    (r"fal?c?on[\s-]*crest", "Falcon Crest", 58),
    (r"fal?c?on[\s-]*infinity", "Falcon Infinity", 55),
    (r"fal?c?on[\s-]*bar", "Falcon Bar", 48),
    (r"fal?c?on[\s-]*pro", "Falcon Pro", 28),
    (r"fal?c?on[\s-]*x", "Falcon X", 28),
    (r"\bfal?c?on\b", "Falcon", 16),
    (r"a[er]{2}o[\s-]*x", "AeroX", 32),
    (r"alien[\s-]*x", "Alien X", 36),
    (r"alien[\s-]*max", "Alien Max", 18),
    (r"alien[\s-]*mega", "Alien Mega", 62),
    (r"alien[\s-]*box", "Alien Box", 52),
    (r"alien[\s-]*pulse", "Alien Pulse", 60),
    (r"alien[\s-]*pro", "Alien Pro Shisha", None),
    (r"alien", "Alien", 10),
    (r"chicspire", "Chicspire", 26.5),
    (r"crystal[\s-]*glow", "Crystal Glow", 33),
    (r"crystal[\s-]*pro[\s-]*max", "Crystal Pro Max", 5),
    (r"rage[\s-]*g[io]r\w*", "Rage Gorilla", 55),
    (r"gorilla[\s-]*x", "Gorilla X", 43),
    (r"j[\s-]?puff", "JPuff", 47),
    (r"joker", "Joker", 24),
    (r"lila[\s-]*kiss", "Lila Kiss+", 46),
    (r"lira[\s-]*glow", "Lira Glow", 45),
    (r"lucky[\s-]*vibes?", "Lucky Vibes", 77),
    (r"meteorite", "Meteorite", 100),
    (r"\bl?'?\s*ovni\b", "OVNI", 60),
    (r"shisha[\s-]*pro", "Shisha Pro", 39),
    (r"shisha[\s-]*sip", "Shishasip", 35),
    (r"mega[\s-]*shisha", "Mega Shisha Hookah", 100),
    (r"shisha[\s-]*hookah[\s-]*box", "Shisha Hookah Box", 30),
    (r"shisha[\s-]*hookah[\s-]*max|shisha[\s-]*max", "Shisha Max", 22),
    (r"shisha[\s-]*classic", "Shisha Classic", 46),
    (r"shisha[\s-]*plus|fighter[\s-]*fuel", "Shisha Plus Fighter Fuel", 28),
    (r"shisha[\s-]*(lightning|storm|ultra)", None, None),   # nom repris tel quel
    (r"crown[\s-]*shisha", "Crown Shisha", None),
    (r"big[\s-]*mac[\s-]*shisha", "Big Mac Shisha", None),
    (r"big[\s-]*mac", "Big Mac", None),
    (r"lion[\s-]*king[\s-]*shisha", "Lion King Shisha", 65),
    (r"lion[\s-]*king|lionking", "Lion King", 50),
    (r"shisha[\s-]*hookah", "Shisha Hookah", 12),
    (r"stellarc", "Stellarc", 50),
    (r"whale", "Whale", 38),
    (r"z[\s-]*pluse", "ZPluse", 42),
    (r"cruiser[\s-]*plus", "Cruiser Plus", 37),
    (r"cruiser", "Cruiser", None),
    (r"phone[\s-]*vape", "PhoneVape", 30),
    (r"mega[\s-]*box[\s-]*pro", "Mega Box Pro", 50),
    (r"mega[\s-]*box", "Mega Box", 25),
    (r"flux[\s-]*pro", "Flux Pro", 32),
    (r"power[\s-]*mate[\s-]*pro", "Power Mate Pro", 70),
    (r"power[\s-]*mate", "Power Mate", 30),
    (r"media[\s-]*max", "Media Max", 40),
    (r"tank[\s-]*pro", "Tank Pro", 33),
    (r"rocket[\s-]*x", "Rocket X", 12.4),
    (r"wolf", "Wolf Niplo", 10),
    (r"niplo", "Niplo", 5),
    (r"digital[\s-]*box", "Digital Box", 15),
    (r"plus[\s-]*x", "Plus X", 26),
    (r"l[eé]?[\s'-]*opard", "Leopard", 40),
    (r"bar[\s-]*pro", "Bar Pro", 10),
    (r"skywalker", "Skywalker", None),
    (r"vape[\s-]*watch", "Vape Watch", 30),
    (r"radiance", "Radiance", 31),
    (r"eagle", "Eagle", 23),
    (r"\bfox\b", "Fox", 10),
    (r"panda", "Panda", 25.5),
    (r"flex[\s-]*ice", "Flex Ice", 21),
    (r"butterfly", "Butterfly", 8.5),
    (r"\bgold\b", "Gold", 6),
    (r"blazt", "Blazt", 44),
    (r"glassrock", "Glassrock", 10),
    (r"glide", "Glide Pen", None),
    (r"hexafuse", "Hexafuse 6in1", 120),
    (r"quads", "Quads 4in1", None),
    (r"triple", "Triple 3in1", None),
    (r"slim[\s-]*bar", "Slim Bar", None),
    (r"bykux", "Bykux", 59),
]
FAMILIES = [(re.compile(p, re.I), name, k) for p, name, k in FAMILIES]

# Bruit a retirer du titre pour garder la saveur.
NOISE = re.compile(
    r"\(\s*\d+\s*[-+]?\s*boxe?s?\s*\)|\bjnr\b|\bpuffs?\b|\bbouff[ée]es\b|\bjust no reason\b|"
    r"\bdisposable\b|\bvapes?\b|\bkit\b|\brefillable\b|\brechargeable\b|\breplaceable\b|"
    r"\bpod\b|\bsystem\b|\bwith\b|\be-?cig\w*\b|\bx\s+fighter\s+fuel\b|\bfighter\s+fuel\b|"
    r"\bnicotine[\s-]*free\b|\b\d+\s?%\s*(nic(otine)?)?\b|\bbuilt in usa\b|\bauthentic\b|"
    r"\b\d{4,6}\s*(puffs?)?\b|\b\d+(?:[.,]\d)?\s?k\b\+?|\bplus\b|\bedition\b|\bpro\b|"
    r"\bbox\b|\bhookah\b|\bsmart\b|\btpd\b|\bpastèque glacée\b|\bmega\b|\bshop\b|"
    r"\bbuy\b|\bonline\b|\bwholesale\b|\belectronic\b|\bnew arrival\b|\bhot sale\b|"
    r"\bled display\b|\bdual mesh\b|\bscreen\b|\boriginal\b|\bbar\b|\bstore\b|\bsingle piece\b|"
    r"\bnic salts?\b|\b\d+\s?mg\b|\bmah\b|\|.*$|\s[–—]\s.*\bstars\b.*$|\bstars\b|\breview\b|"
    r"\bremplissable\b|\brechargeable\b|\bgenuine\b|\bzugevape\b|\bavailable individually\b.*$|"
    r"\bwegwerp\w*\b|\bpod\s+kit\b|\bdisposable\b|\bniplo\b|\bprefilled\b",
    re.I,
)

FLAVOR_ALIASES = [
    (r"\b(luv|love)\s*66\b", "Love 66"),
    (r"\bmix(ed)? berr(y|ies)\b", "Mixed Berries"),
    (r"\bbubble\s+gum\b", "Bubblegum"),
    (r"\blce\b", "Ice"),
    (r"\bkiwilce\b", "Kiwi Ice"),
    (r"\blimonade\b", "Lemonade"),
    (r"\bpomm?egran?a?te\b", "Pomegranate"),
    (r"\bpassion\s*fruits\b", "Passion Fruit"),
    (r"\bpina\s*colada\b|\bpinacolada\b", "Pina Colada"),
    (r"\bblue\s*razz\b", "Blue Razz"),
    (r"\s*/\s*", " & "),
    (r",\s*|\s+and\s+", " "),
]

# ------------------------------------------------------------- HTTP --------

session = requests.Session()
session.headers["User-Agent"] = USER_AGENT
_last_hit = {}
_robots = {}


def _robots_rules(host: str):
    """Regles robots.txt applicables (groupe '*'), semantique Google (* et $)."""
    if host in _robots:
        return _robots[host]
    try:
        r = session.get(host + "/robots.txt", timeout=30)
        text = r.text if r.status_code == 200 else ""
    except Exception:
        text = ""
    groups, agents, current, in_rules = [], [], [], False
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, val = (s.strip() for s in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if in_rules:
                groups.append((agents, current))
                agents, current, in_rules = [], [], False
            agents.append(val.lower())
        elif key in ("allow", "disallow"):
            in_rules = True
            if val:
                current.append((key == "allow", val))
    if agents:
        groups.append((agents, current))
    mine = [g for a, g in groups if any(x != "*" and x in USER_AGENT.lower() for x in a)]
    star = [g for a, g in groups if "*" in a]
    compiled = []
    for g in (mine or star):
        for allow, pat in g:
            rx = re.escape(pat).replace(r"\*", ".*")
            if rx.endswith(r"\$"):
                rx = rx[:-2] + "$"
            compiled.append((allow, len(pat), re.compile(rx)))
    _robots[host] = compiled
    return compiled


def allowed(url: str) -> bool:
    p = urlparse(url)
    rules = _robots_rules(f"{p.scheme}://{p.netloc}")
    path = (p.path or "/") + (("?" + p.query) if p.query else "")
    best = None
    for allow, length, rx in rules:
        if rx.match(path) and (best is None or length > best[1] or (length == best[1] and allow)):
            best = (allow, length)
    return True if best is None else best[0]


def get(url: str, quiet=False):
    if not allowed(url):
        if not quiet:
            print(f"  robots.txt interdit : {url}")
        return None
    host = urlparse(url).netloc
    wait = REQUEST_DELAY - (time.time() - _last_hit.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last_hit[host] = time.time()
    for attempt in range(2):
        try:
            r = session.get(url, timeout=60)
        except Exception as e:
            if attempt:
                print(f"  erreur {type(e).__name__} sur {url}")
                return None
            time.sleep(3)
            continue
        if r.status_code == 200 and "<title>Just a moment" not in r.text[:2000]:
            return r
        if not quiet:
            print(f"  HTTP {r.status_code} sur {url}")
        return None


# ------------------------------------------------------------- DECOUVERTE --

def _cdata(s: str) -> str:
    return re.sub(r"^<!\[CDATA\[|\]\]>$", "", s.strip())


def sitemap_entries(url: str, seen=None):
    """Toutes les <url> d'un sitemap (index recursif, .gz gere)."""
    seen = seen if seen is not None else set()
    if url in seen:
        return []
    seen.add(url)
    r = get(url)
    if not r:
        return []
    text = r.text
    if r.content[:2] == b"\x1f\x8b":
        text = gzip.decompress(r.content).decode("utf-8", "replace")
    out = []
    if "<sitemapindex" in text:
        for loc in re.findall(r"<sitemap>.*?<loc>(.*?)</loc>", text, re.S):
            loc = _cdata(loc)
            # inutile de parcourir articles de blog, categories, pages...
            if re.search(r"post-sitemap|page-sitemap|category|tag-sitemap|blog|cms|"
                         r"author|manufacturer|supplier|/(da|de|el|es|fi|fr|it|ja|nl|pl|pt|sv)[_/-]", loc):
                if "product" not in loc:
                    continue
            out += sitemap_entries(loc, seen)
        return out
    for blk in re.findall(r"<url>(.*?)</url>", text, re.S):
        m = re.search(r"<loc>(.*?)</loc>", blk, re.S)
        if not m:
            continue
        loc = _cdata(m.group(1))
        imgs = [_cdata(x) for x in re.findall(r"<image:loc>(.*?)</image:loc>", blk, re.S)]
        titles = [_cdata(x) for x in re.findall(r"<image:title>(.*?)</image:title>", blk, re.S)]
        out.append({"url": loc, "images": imgs, "title": titles[0] if titles else ""})
    return out


def _ld_products(soup):
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "", strict=False)
        except Exception:
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data])
        for d in items:
            if isinstance(d, dict) and d.get("@type") in ("Product", "ProductGroup", ["Product"]):
                yield d


def _as_urls(img):
    img = [img] if isinstance(img, (str, dict)) else (img or [])
    out = []
    for i in img:
        u = i.get("url") or i.get("contentUrl") if isinstance(i, dict) else i
        if isinstance(u, str) and u.startswith("http"):
            out.append(u)
    return out


def page_variants(url: str):
    """Variantes d'une fiche : [(titre, [images])]. JSON-LD, Woo, og:image."""
    r = get(url)
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    name, images = None, []
    for d in _ld_products(soup):
        name = name or d.get("name")
        images += _as_urls(d.get("image"))
    h1 = soup.find("h1")
    name = name or (h1.get_text(" ", strip=True) if h1 else None)
    # produit variable WooCommerce : une image par saveur
    var = soup.find(attrs={"data-product_variations": True})
    if var and name:
        try:
            vs = json.loads(var["data-product_variations"])
        except Exception:
            vs = []
        out = []
        for v in vs if isinstance(vs, list) else []:
            img = (v.get("image") or {}).get("full_src") or (v.get("image") or {}).get("url")
            flav = " ".join(str(x) for k, x in (v.get("attributes") or {}).items()
                            if x and not re.search(r"nicotine|strength|mg|pack|quantity", k, re.I))
            if img and flav:
                out.append((f"{name} {flav}", [img]))
        if out:
            return out
    for a in soup.select(".woocommerce-product-gallery__image a[href]"):
        images.append(a["href"])
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        images.append(og["content"])
    images = [urlparse_fix(u, url) for u in dict.fromkeys(images)]
    return [(name, images)] if name and images else []


def urlparse_fix(u: str, base: str) -> str:
    if u.startswith("//"):
        u = "https:" + u
    elif u.startswith("/"):
        p = urlparse(base)
        u = f"{p.scheme}://{p.netloc}{u}"
    return best_res(u)


def best_res(u: str) -> str:
    """Demande la plus grande declinaison d'une image (PrestaShop, WordPress)."""
    u = re.sub(r"/(\d+)-(home|small|medium|cart|pdt_\d+)_default/", r"/\1-large_default/", u)
    if "/wp-content/uploads/" in u:
        u = re.sub(r"-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp))$", r"\1", u)
    return u


def skus_variants(url: str):
    """Plateforme jnrofficial.fr / jnrvapestore.com : une image par SKU."""
    r = get(url)
    if not r:
        return []
    t = r.text
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
    name = re.sub(r"<[^>]+>|\s+", " ", h1.group(1)).strip() if h1 else ""
    name = re.sub(r"&amp;", "&", name)
    m = re.search(r"skus:\s*(\[.*?\])\s*,\s*\n", t, re.S)
    v = re.search(r"variables:\s*(\[.*?\])\s*,?\s*\n", t, re.S)
    try:
        skus = json.loads(m.group(1)) if m else []
        variables = json.loads(v.group(1)) if v else []
    except Exception:
        skus, variables = [], []
    out = []
    for s in skus:
        parts = []
        for k, idx in enumerate(s.get("variants") or []):
            try:
                val = variables[k]["values"][int(idx)]["name"]
            except Exception:
                continue
            if not re.search(r"\bpcs?\b|pack|nicotine|\bmg\b|\d+\s?%", val, re.I):
                parts.append(val)
        imgs = [i.get("popup") for i in (s.get("images") or []) if i.get("popup")]
        if imgs:
            out.append((f"{name} {' '.join(parts)}".strip(), imgs))
    if not out:   # pas de SKU exploitable : images globales de la fiche
        pops = list(dict.fromkeys(json.loads(f'"{p}"') for p in re.findall(r'"popup":"(.*?)"', t)))
        if pops and name:
            out.append((name, pops))
    # dedoublonne les SKU qui ne different que par le conditionnement
    uniq = {}
    for title, imgs in out:
        uniq.setdefault(title, imgs)
    return list(uniq.items())


def shopify_variants(base: str, collection: str):
    out, page = [], 1
    while page < 20:
        r = get(f"{base}/collections/{collection}/products.json?limit=250&page={page}")
        if not r:
            break
        prods = r.json().get("products", [])
        if not prods:
            break
        for p in prods:
            url = f"{base}/products/{p['handle']}"
            seen = set()
            for v in p.get("variants", []):
                img = (v.get("featured_image") or {}).get("src")
                if not img or img in seen:
                    continue
                seen.add(img)
                out.append((url, f"{p['title']} {v.get('title', '')}", [img]))
        page += 1
    return out


def manufacturer_variants(url: str):
    """Catalogue fabricant : premier visuel du JSON-LD = rendu propre du modele."""
    r = get(url)
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    for d in _ld_products(soup):
        imgs = _as_urls(d.get("image"))
        if imgs:
            return [(f"{d.get('name', '')} {title}", imgs[:1])]
    imgs = re.findall(r'"image"\s*:\s*\[\s*"(https?://[^"]+)"', r.text)
    return [(title, imgs[:1])] if imgs else []


def discover(refresh=False):
    """Inventaire de toutes les sources (cache par source dans _travail/sources/)."""
    cache_dir = WORK / "sources"
    cache_dir.mkdir(parents=True, exist_ok=True)
    products = []
    for prio, src in enumerate(SOURCES):
        cache = cache_dir / f"{src['name']}.json"
        if cache.exists() and not refresh:
            items = json.loads(cache.read_text(encoding="utf-8"))
            for it in items:
                it["priority"] = prio
            products += items
            print(f"Source : {src['name']} (cache) {len(items)} variantes")
            continue
        items = discover_source(src, prio)
        cache.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
        products += items
    return products


def discover_source(src, prio):
    products = []
    if True:
        print(f"Source : {src['name']}")
        found = []
        if src["kind"] == "shopify":
            for url, title, imgs in shopify_variants(src["base"], src["collection"]):
                found.append((url, title, imgs))
        else:
            entries = {}
            for e in sitemap_entries(src["sitemap"]):
                u = unquote(e["url"])
                if not re.search(src["include"], u, re.I):
                    continue
                if src.get("exclude") and re.search(src["exclude"], u, re.I):
                    continue
                if EXCLUDE.search(urlparse(u).path.replace("-", " ")):
                    continue
                entries[u] = e
            print(f"  {len(entries)} fiches candidates")
            for u, e in entries.items():
                if src["kind"] == "skus":
                    vs = skus_variants(u)
                elif src["kind"] == "manufacturer":
                    vs = manufacturer_variants(u)
                elif src.get("fetch_page") or not e["title"] or not e["images"]:
                    vs = page_variants(u)
                else:
                    vs = [(e["title"], e["images"])]
                found += [(u, t, i) for t, i in vs]
        n = 0
        for url, title, imgs in found:
            title = re.sub(r"&amp;", "&", title or "")
            if not title or not imgs or EXCLUDE.search(title):
                continue
            products.append({"source": src["name"], "priority": prio, "url": url,
                             "title": title, "images": imgs,
                             "manufacturer": src["kind"] == "manufacturer"})
            n += 1
        print(f"  {n} variantes retenues")
    return products


# ------------------------------------------------------------- NOMMAGE -----

def clean_name(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    # caracteres invisibles (joiner U+2060, espaces de largeur nulle, BOM...)
    s = "".join(c for c in s if unicodedata.category(c) not in ("Cf", "Cc"))
    s = re.sub(r'[<>:"/\\|?*]', " ", s)
    s = re.sub(r"\s+", " ", s).strip(" .-")
    return s[:100] or "Inconnu"


def _fmt_k(x: float) -> str:
    return f"{x:g}K"


def puff_count(t: str):
    m = re.search(r"(\d{1,3}(?:[.,]\d)?)\s?k\b", t, re.I)
    if m:
        return float(m.group(1).replace(",", "."))
    m = re.search(r"\b(\d{4,6})\s*(?:puffs?|bouff|hits|$|\s)", t, re.I)
    if m and not re.search(m.group(1) + r"\s*(mah|ml)", t, re.I):
        return int(m.group(1)) / 1000
    return None


def parse_title(title: str, manufacturer=False):
    """(modele, saveur) a partir d'un titre de fiche produit."""
    t = "".join(c for c in re.sub(r"&amp;", "&", title) if unicodedata.category(c) != "Cf")
    t = re.sub(r"\s+[-–]\s+JNR(\s+x\s+[\w ]{1,20})?\s*$", "", t, flags=re.I)
    t = re.sub(r"\bJNR\s+x\b", " ", t, flags=re.I)
    count = puff_count(t)
    model = None
    for rx, name, default in FAMILIES:
        m = rx.search(t)
        if m:
            name = name or " ".join(w.capitalize() for w in m.group(0).split())
            k = count or default
            model = f"{name} {_fmt_k(k)}" if k else name
            t = t[: m.start()] + " " + t[m.end():]
            break
    if model is None:
        m = re.search(r"JNR\s+([A-Z][\w-]+(?:\s[A-Z][\w-]+)?)", t)
        model = (m.group(1) + (f" {_fmt_k(count)}" if count else "")) if m else "Non classe"
        if m:
            t = t[: m.start()] + " " + t[m.end():]
    if manufacturer:
        return clean_name(model), FABRICANT
    flavor = NOISE.sub(" ", t)
    flavor = re.sub(r"\s*\+\s*|\s+[-–—]\s+|^\s*[-–—]|[-–—]\s*$|\s+et\s*$|^\s*et\s+", " ", flavor)
    flavor = re.sub(r"(?<=[a-z])-(?=[a-z])", " ", flavor)          # slugs : blue-razz-ice
    flavor = re.sub(r"\bmr\.\s*", "Mr ", flavor, flags=re.I)
    for pat, rep in FLAVOR_ALIASES:
        flavor = re.sub(pat, rep, flavor, flags=re.I)
    flavor = re.sub(r"\s+", " ", flavor).strip(" -|&,.()")
    flavor = " ".join(w if w in ("&",) else w[:1].upper() + w[1:].lower() for w in flavor.split())
    return clean_name(model), clean_name(flavor or "Original")


def canonicalize_flavors(products):
    """Corrige les saveurs polluees par du texte SEO propre a une seule boutique.

    Une saveur vue dans une seule source est remplacee par la plus longue saveur
    'confirmee' (vue dans au moins deux sources) dont elle contient les mots,
    ex. 'Blue Razz Cherry Constant Flavour' -> 'Blue Razz Cherry'."""
    norm = lambda f: re.sub(r"[^a-z0-9 ]", "", f.lower()).split()
    srcs = defaultdict(set)              # (modele, saveur) -> sources
    glob = defaultdict(set)              # saveur -> sources, tous modeles
    for p in products:
        if p["flavor"] == FABRICANT:
            continue
        k = tuple(norm(p["flavor"]))
        srcs[(p["model"], k)].add(p["source"])
        glob[k].add(p["source"])
    confirmed_model = defaultdict(set)
    for (m, k), s in srcs.items():
        if len(s) >= 2:
            confirmed_model[m].add(k)
    confirmed_glob = {k for k, s in glob.items() if len(s) >= 2}

    def contains(big, small):
        n = len(small)
        return 0 < n < len(big) and any(big[i:i + n] == small for i in range(len(big) - n + 1))

    for p in products:
        k = tuple(norm(p["flavor"]))
        if p["flavor"] == FABRICANT or len(srcs[(p["model"], k)]) >= 2 or k in confirmed_glob:
            continue
        cands = [c for c in confirmed_model[p["model"]] if contains(list(k), list(c))]
        cands = cands or [c for c in confirmed_glob if len(c) >= 2 and contains(list(k), list(c))]
        if cands:
            best = max(cands, key=len)
            p["flavor"] = clean_name(" ".join(w.capitalize() for w in best))
        elif re.search(r"\bflavou?rs?\b|\bintensity\b|\benjoy\b|\blights?\b|\bcombined\b|"
                       r"\bhot sale\b|\binfinity\b|\blatest\b|\bnewest\b|\bultimate\b|"
                       r"\bintelligent\b|\bsmoke\b|\bpower bank\b|\bdisplay\b|\bcustomi[sz]e\b|"
                       r"\bcapa(city)?\b|\bfast char|\bcigarette\b|\bselling\b|\bdtl pen\b",
                       p["flavor"], re.I):
            p["flavor"] = "Original"     # slogan de page generique, pas une saveur


def variant_key(model: str, flavor: str) -> str:
    f = unicodedata.normalize("NFKD", flavor).encode("ascii", "ignore").decode().lower()
    f = re.sub(r"\bnew\b", "", f)
    return model + "|" + re.sub(r"[^a-z0-9]", "", f)


# ------------------------------------------------------------- IMAGE -------

def fetch_image(url: str):
    """Telecharge (cache disque) et ouvre une image."""
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".img")
    if not path.exists():
        r = get(url, quiet=True)
        if not r:
            return None
        path.write_bytes(r.content)
    try:
        img = Image.open(path)
        img.load()
        if img.mode == "P":
            img = img.convert("RGBA")
        return img
    except Exception:
        return None


def object_runs(mask: np.ndarray) -> int:
    """Nombre d'objets cote a cote (blocs de colonnes occupees).
    Un bloc tres etroit (dragonne, reflet) ne compte pas comme un objet."""
    h, w = mask.shape
    cols = mask.sum(axis=0) > h * 0.03
    gap_tol = max(2, int(w * 0.015))
    runs, start, gap = [], None, 0
    for x, c in enumerate(list(cols) + [False] * (gap_tol + 1)):
        if c:
            if start is None:
                start = x
            gap, last = 0, x
        elif start is not None:
            gap += 1
            if gap > gap_tol:
                runs.append(last - start + 1)
                start = None
    return sum(1 for r in runs if r >= 0.08 * w) or (1 if runs else 0)


def quick_mask(img: Image.Image):
    """Masque premier plan rapide + fond uni ?"""
    im = img.convert("RGBA")
    im.thumbnail((320, 320))
    a = np.asarray(im).astype(int)
    if a[..., 3].min() < 250:
        return a[..., 3] > 30, True
    rgb = a[..., :3]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    uniform = (np.abs(border - bg).max(axis=1) < 30).mean() > 0.92 and bg.min() > 200
    mask = np.abs(rgb - bg).max(axis=2) > 30
    if ndimage is not None:
        mask = ndimage.binary_opening(mask, iterations=1)
    return mask, uniform


def shape_issues(mask: np.ndarray, img_h=None):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return ["image vide"]
    w, h = np.ptp(xs) + 1, np.ptp(ys) + 1
    issues = []
    n = object_runs(mask[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1])
    if n > 1:
        issues.append(f"{n} objets")
    if w > h * 1.15:
        issues.append("plus large que haute")
    if w < h * 0.18:
        issues.append("vue de profil ?")
    if img_h and h < img_h * 0.2:
        issues.append("objet trop petit")
    return issues


def compact(mask: np.ndarray) -> bool:
    """Silhouette d'une puff seule : remplit bien son cadre, pas trop large.
    Une puff entouree de fruits, flacons ou boite collee echoue a ce test."""
    if ndimage is not None:
        mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=2))
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return False
    w, h = np.ptp(xs) + 1, np.ptp(ys) + 1
    return mask.sum() / (w * h) >= 0.72 and w <= h * 0.9


# --- detourage fond uni (rembg)
_rembg_session = None


def cutout_plain(img: Image.Image) -> Image.Image:
    global _rembg_session
    if rembg_remove is None:
        return img.convert("RGBA")
    if _rembg_session is None:
        _rembg_session = new_session("isnet-general-use")
    return rembg_remove(img.convert("RGB"), session=_rembg_session).convert("RGBA")


# --- detourage visuel marketing (Grounding DINO + SAM)
_models = {}


def _load_models():
    if not _models:
        import torch
        from transformers import (AutoProcessor, AutoModelForZeroShotObjectDetection,
                                  SamModel, SamProcessor)
        torch.set_num_threads(min(8, __import__("os").cpu_count() or 4))
        _models["torch"] = torch
        _models["dp"] = AutoProcessor.from_pretrained(DETECTOR)
        _models["det"] = AutoModelForZeroShotObjectDetection.from_pretrained(DETECTOR).eval()
        _models["sp"] = SamProcessor.from_pretrained(SEGMENTER)
        _models["sam"] = SamModel.from_pretrained(SEGMENTER).eval()
    return _models


def _iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    return inter / (area(a) + area(b) - inter + 1e-9)


def detect_puff(img: Image.Image, trusted: bool = False):
    """Boite englobante de la puff (ou None) + score."""
    M = _load_models()
    im = img.convert("RGB")
    scale = 800 / max(im.size)
    small = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))))
    inp = M["dp"](images=small, text=DETECT_PROMPT, return_tensors="pt")
    with M["torch"].no_grad():
        out = M["det"](**inp)
    res = M["dp"].post_process_grounded_object_detection(
        out, inp.input_ids, threshold=0.2, text_threshold=0.2,
        target_sizes=[small.size[::-1]])[0]
    labels = res.get("text_labels", res.get("labels"))
    objs = find_objects(res["boxes"].tolist(), res["scores"].tolist(), labels,
                        np.asarray(small))
    cands = [o for o in objs if o["candidate"]]
    if trusted:
        # image recadree a la main sur une puff : l'objet principal est la puff
        main = [o for o in objs if not o["frame"]]
        if main:
            best = max(main, key=lambda o: max(o["cig"], o["bottle"], o["pack_score"])
                       * o["area"])
            return [v / scale for v in best["box"]], max(best["cig"], best["bottle"],
                                                         best["pack_score"], 0.3), False
    if not cands:
        # puff en forme de boite (Alien Mega, Mega Box...) prise pour un emballage :
        # on garde l'objet "boite" sans panneau d'avertissement ni puff imprimee dedans,
        # avec un doute signale (verifie a la revue)
        doubt = [o for o in objs if o["pack"] and not o["panel"] and not o["frame"]
                 and not o["group"] and not o["inside_pack"] and not o["banner"]
                 and not o["holds"] and max(o["cig"], o["bottle"], o["pack_score"]) >= 0.25]
        if doubt:
            best = max(doubt, key=lambda o: max(o["cig"], o["bottle"], o["pack_score"])
                       * o["area"] ** 0.5)
            return [v / scale for v in best["box"]], max(best["cig"], best["bottle"],
                                                         best["pack_score"]), "doute"
        return None, 0, any(o["pack"] for o in objs)
    best = max(cands, key=lambda o: o["puff"] * o["area"] ** 0.5)
    return [v / scale for v in best["box"]], best["puff"], False


def _area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _inter(a, b):
    return _area([max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])])


def is_warning_panel(pix, b) -> bool:
    """Un panneau d'avertissement nicotine : rectangle blanc couvert de texte noir."""
    if pix is None:
        return True
    x0, y0, x1, y1 = (int(round(v)) for v in b)
    zone = pix[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]
    if zone.size == 0:
        return False
    z = zone.astype(np.int16)
    white = (z.min(axis=2) > 200).mean()
    dark = (z.max(axis=2) < 90).mean()
    return white > 0.45 and 0.03 < dark < 0.45


def find_objects(boxes, scores, labels, pix=None):
    """Regroupe les detections par objet et decide lequel est la puff.

    Les etiquettes du detecteur sont peu fiables (une puff peut etre vue comme
    "bottle", une vraie puff comme "packaging box"). Les signaux fiables sont :
      - un emballage contient le panneau d'avertissement nicotine ("warning label") ;
      - la puff imprimee sur un emballage est contenue dans celui-ci ;
      - un bandeau de texte est tres large et peu haut.
    """
    raw, panels = [], []
    for b, s, lab in zip(boxes, scores, labels):
        lab = lab.lower()
        kinds = {k for k, words in (("cig", ("cigarette", "electronic")), ("bottle", ("bottle",)),
                                    ("pack", ("packaging", "box"))) if any(w in lab for w in words)}
        if not kinds:
            if ("label" in lab or "warning" in lab) and is_warning_panel(pix, b):
                panels.append(b)
            continue
        raw.append((b, s, kinds))
    objs = []
    for b, s, kinds in sorted(raw, key=lambda d: -d[1]):
        for o in objs:
            if _iou(b, o["box"]) > 0.85:
                break
        else:
            o = {"box": b, "cig": 0.0, "bottle": 0.0, "pack": 0.0}
            objs.append(o)
        for k in kinds:
            o[k] = max(o[k], s * (0.8 if len(kinds) > 1 else 1.0))   # etiquette fusionnee
    img_area = (pix.shape[0] * pix.shape[1]) if pix is not None else 800 * 800
    for o in objs:
        b = o["box"]
        o["area"] = _area(b)
        # cadre couvrant presque toute l'image : c'est le fond du visuel, pas un objet
        o["frame"] = o["area"] > 0.8 * img_area
        # le panneau n'occupe qu'une partie de la face (un "panneau" grand comme
        # l'objet est en fait une puff blanche couverte de motifs)
        o["panel"] = any(_inter(p, b) > 0.85 * _area(p)
                         and 0.05 * o["area"] < _area(p) < 0.5 * o["area"] for p in panels)
        o["is_pack"] = o["panel"] or (not o["frame"]
                                      and o["pack"] > max(o["cig"], o["bottle"]) + 0.1)
        o["puff"] = max(o["cig"], 0.9 * o["bottle"], 0.0 if o["is_pack"] else 0.5 * o["pack"])
    contains = lambda big, small: (big is not small and big["area"] > small["area"]
                                   and _inter(small["box"], big["box"]) > 0.9 * small["area"])
    for o in objs:
        # cadre de groupe : englobe la puff ET la boite (il herite du panneau de la boite)
        o["group"] = any(contains(o, q) and q["is_pack"] and q["area"] > 0.1 * o["area"]
                         for q in objs)
        o["holds"] = any(contains(o, q) and max(q["cig"], q["bottle"]) >= 0.2 for q in objs)
    for o in objs:
        b = o["box"]
        # contenu dans un emballage (puff imprimee sur la boite) : seulement si cet
        # emballage est avere (panneau d'avertissement) ou franchement reconnu comme tel
        inside_pack = any(contains(p, o) and p["is_pack"] and not p["group"]
                          and (p["panel"] or (p["pack"] >= 0.35 and p["area"] < 0.6 * img_area))
                          for p in objs)
        o["inside_pack"] = inside_pack
        banner = (b[2] - b[0]) > 2.5 * (b[3] - b[1])
        o["banner"] = banner
        o["candidate"] = (not o["is_pack"] and not o["frame"] and not o["group"]
                          and not inside_pack and not banner and o["puff"] >= 0.2)
    for o in objs:
        o["pack_score"], o["pack"] = o["pack"], o["is_pack"]
    return objs


def _sam_masks(M, im, emb, box, points=None):
    """Masques SAM (3 propositions) pour une boite, avec points positifs optionnels."""
    kw = {"input_boxes": [[box]]}
    if points:
        kw["input_points"] = [[points]]
        kw["input_labels"] = [[[1] * len(points)]]
    si = M["sp"](im, return_tensors="pt", **kw)
    si.pop("pixel_values", None)
    with M["torch"].no_grad():
        so = M["sam"](image_embeddings=emb, multimask_output=True, **si)
    masks = M["sp"].image_processor.post_process_masks(
        so.pred_masks, si["original_sizes"], si["reshaped_input_sizes"])[0][0].numpy()
    return list(zip(masks, so.iou_scores[0, 0].numpy()))


def _pick_mask(cands, box):
    """Masque le plus fiable dont l'emprise colle a la boite detectee."""
    best, best_rank = None, -1
    for m, q in cands:
        ys, xs = np.nonzero(m)
        if len(xs) == 0:
            continue
        rank = q * _iou([xs.min(), ys.min(), xs.max(), ys.max()], box)
        if rank > best_rank:
            best, best_rank = m, rank
    return best


def cutout_composite(img: Image.Image, trusted: bool = False):
    """Detoure la puff d'un visuel marketing. Retourne (rgba, problemes, mesures)."""
    box, score, pack_only = detect_puff(img, trusted)
    if box is None:
        return None, ["emballage seul" if pack_only else "puff non detectee"], {}
    M = _load_models()
    im = img.convert("RGB")
    if max(im.size) > 1600:
        im.thumbnail((1600, 1600))
        f = 1600 / max(img.size)
        box = [v * f for v in box]
    si = M["sp"](im, return_tensors="pt")
    with M["torch"].no_grad():
        emb = M["sam"].get_image_embeddings(si["pixel_values"])
    m = _pick_mask(_sam_masks(M, im, emb, box), box)
    if m is None:
        return None, ["detourage vide"], {}
    bh = box[3] - box[1]
    # haut transparent (embout) souvent oublie par SAM : si le masque s'arrete
    # nettement sous le haut de la boite, on relance avec un point sur l'embout
    ys = np.nonzero(m)[0]
    if ys.min() - box[1] > 0.04 * bh:
        cx = (box[0] + box[2]) / 2
        pts = [[cx, box[1] + 0.03 * bh], [cx, box[1] + 0.5 * bh]]
        m2 = _pick_mask(_sam_masks(M, im, emb, box, pts), box)
        if m2 is not None:
            y2 = np.nonzero(m2)[0].min()
            grow = m2.sum() / max(1, m.sum())
            if y2 < ys.min() and grow < 1.35:
                m = m2
    m = clean_mask(m)
    ys, xs = np.nonzero(m)
    if len(xs) == 0:
        return None, ["detourage vide"], {}
    issues = ["emballage ?"] if pack_only == "doute" else []
    mb = [xs.min(), ys.min(), xs.max(), ys.max()]
    fill = m.sum() / ((mb[2] - mb[0] + 1) * (mb[3] - mb[1] + 1))
    top_gap = max(0.0, (mb[1] - box[1]) / max(1.0, bh))
    if score < 0.28:
        issues.append(f"detection faible ({score:.2f})")
    if (mb[2] - mb[0]) > 0.95 * m.shape[1] and (mb[3] - mb[1]) > 0.95 * m.shape[0]:
        issues.append("fond conserve")
    if _iou(mb, box) < 0.7:
        issues.append("detourage partiel ?")
    if fill < 0.6:
        issues.append("contour irregulier")
    if top_gap > 0.06:
        issues.append("haut tronque ?")
    alpha = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    scale_back = max(img.size) / max(im.size)
    metrics = {"det": round(score, 3), "fill": round(float(fill), 3),
               "top_gap": round(float(top_gap), 3),
               "src_h": int((mb[3] - mb[1]) * scale_back)}
    return rgba, issues, metrics


def _largest(m: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(m)
    if n <= 1:
        return m
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return lab == (1 + int(np.argmax(sizes)))


def clean_mask(m: np.ndarray) -> np.ndarray:
    """Garde la puff seule : coupe les debris (fruit, glacon, coin de boite)
    rattaches par un pont fin, puis bouche les trous."""
    if ndimage is None:
        return m
    m = _largest(m)
    r = max(2, int(0.012 * max(m.shape)))          # ~1 % de l'image
    core = _largest(ndimage.binary_opening(m, iterations=r))
    if core.sum() > 0.6 * m.sum():                 # sinon l'ouverture a trop mange
        kept = m & ndimage.binary_dilation(core, iterations=r + 1)
        # ce que l'ouverture a detache au-dessus du corps, dans son axe, est
        # l'embout (souvent fin et transparent) : on le garde
        ys, xs = np.nonzero(core)
        top, x0, x1 = ys.min(), xs.min(), xs.max()
        lab, n = ndimage.label(m & ~kept)
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            if sl is None:
                continue
            cy0, cy1 = sl[0].start, sl[0].stop
            cxm = (sl[1].start + sl[1].stop) / 2
            if cy0 < top and cy1 >= top - r and x0 + 0.15 * (x1 - x0) <= cxm <= x1 - 0.15 * (x1 - x0):
                kept |= lab == i
        m = _largest(kept)
    return ndimage.binary_fill_holes(m)


def keep_main_objects(rgba: Image.Image) -> Image.Image:
    """Supprime poussieres et reflets isoles (petites composantes)."""
    a = np.array(rgba.split()[-1])
    a[a < 20] = 0
    if ndimage is not None:
        lab, n = ndimage.label(a > 0)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
            keep = np.isin(lab, 1 + np.nonzero(sizes >= sizes.max() * 0.04)[0])
            a[~keep] = 0
    rgba.putalpha(Image.fromarray(a))
    return rgba


def frame(rgba: Image.Image):
    """Recadre l'objet et le centre sur la toile finale."""
    a = np.array(rgba.split()[-1])
    ys, xs = np.nonzero(a > 10)
    if len(xs) == 0:
        return None
    crop = rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    w, h = crop.size
    box = int(CANVAS * (1 - 2 * MARGIN))
    s = min(box / w, box / h)
    crop = crop.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(crop, ((CANVAS - crop.width) // 2, (CANVAS - crop.height) // 2), crop)
    return canvas


def requalify(issues, png: Path):
    """Reapplique les regles de controle actuelles a un resultat en cache."""
    kept = []
    for s in issues:
        m = re.match(r"detection faible \(([\d.]+)\)", s)
        if m and float(m.group(1)) >= 0.28:
            continue
        if re.search(r"objets|plus large|profil", s):
            continue                         # recalcule ci-dessous sur l'image finale
        kept.append(s)
    try:
        a = np.array(Image.open(png).split()[-1]) > 30
        kept += [s for s in shape_issues(a) if s not in kept]
    except Exception:
        pass
    return kept


CROPS = []   # [{"match": regex d'URL, "box": [x0, y0, x1, y1] en fractions}], via corrections


def cut_key(url: str) -> str:
    """Cle du cache de detourage (l'URL, plus le recadrage manuel s'il y en a un)."""
    crop = next((c["box"] for c in CROPS if re.search(c["match"], url)), None)
    return hashlib.sha1((url + (f"#crop={crop}" if crop else "")).encode()).hexdigest()[:16]


def process_image(url: str, force: bool = False):
    """Detoure une image (avec cache). Retourne (png_path, problemes, methode)."""
    CUT.mkdir(parents=True, exist_ok=True)
    crop = next((c["box"] for c in CROPS if re.search(c["match"], url)), None)
    h = cut_key(url)
    png, meta = CUT / f"{h}.png", CUT / f"{h}.json"
    if meta.exists() and not force:
        d = json.loads(meta.read_text(encoding="utf-8"))
        if d.get("v") == CACHE_VERSION:
            if not d["ok"]:
                return None, d["issues"], d["method"]
            return png, requalify(d["issues"], png), d["method"]
    img = fetch_image(url)
    if img is None:
        return None, ["telechargement impossible"], "-"
    if crop:   # recadrage manuel (corrections.json) : la bonne puff d'un visuel a plusieurs
        W, H = img.size
        img = img.crop((round(crop[0] * W), round(crop[1] * H),
                        round(crop[2] * W), round(crop[3] * H)))
    mask, uniform = quick_mask(img)
    plain = uniform and not shape_issues(mask) and compact(mask)
    metrics = {}
    if plain:
        method = "fond uni"
        # meme sur fond blanc, on verifie que l'objet n'est pas un emballage seul
        box, score, pack_only = detect_puff(img, bool(crop))
        if box is None and pack_only:
            rgba, issues = None, ["emballage seul"]
        else:
            rgba = keep_main_objects(keep_transparent_parts(img, cutout_plain(img)))
            a = np.array(rgba.split()[-1]) > 30
            issues = shape_issues(a) + (["emballage ?"] if pack_only == "doute" else [])
            ys = np.nonzero(a)[0]
            metrics = {"det": round(score, 3), "top_gap": 0.0,
                       "src_h": int(np.ptp(ys)) if len(ys) else 0}
    else:
        method = "visuel marketing"
        rgba, issues, metrics = cutout_composite(img, bool(crop))
        if rgba is not None:
            issues += shape_issues(np.array(rgba.split()[-1]) > 30, rgba.height)
    if rgba is not None and metrics.get("src_h", 999) < 300:
        issues.append("basse resolution")
    canvas = frame(rgba) if rgba is not None else None
    if canvas is not None:
        canvas.save(png, optimize=True)
    meta.write_text(json.dumps({"ok": canvas is not None, "issues": issues, "method": method,
                                "url": url, "v": CACHE_VERSION, **metrics},
                               ensure_ascii=False), encoding="utf-8")
    return (png if canvas is not None else None), issues, method


def keep_transparent_parts(img: Image.Image, rgba: Image.Image) -> Image.Image:
    """Sur fond blanc, rembg efface volontiers le plastique transparent de l'embout.
    On recupere, au-dessus du milieu de l'objet, ce qui se distingue du fond
    (meme faiblement), en alpha progressif pour garder l'effet transparent."""
    if ndimage is None:
        return rgba
    a = np.array(rgba.split()[-1]).astype(np.float32)
    ys, xs = np.nonzero(a > 30)
    if len(xs) == 0:
        return rgba
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    diff = np.abs(rgb - bg).max(axis=2).astype(np.float32)
    soft = np.clip((diff - 6) / 24, 0, 1) * 255
    zone = np.zeros_like(a, dtype=bool)
    h = ys.max() - ys.min()
    y0 = max(0, int(ys.min() - 0.08 * h))
    y1 = int(ys.min() + 0.5 * h)
    x0, x1 = xs.min(), xs.max()
    zone[y0:y1, x0:x1 + 1] = True
    # seulement ce qui touche l'objet (pas les ombres ou objets voisins)
    touching = ndimage.binary_dilation(a > 30, iterations=3)
    lab, n = ndimage.label((soft > 40) & zone)
    keep = np.zeros_like(zone)
    for i in range(1, n + 1):
        comp = lab == i
        if (comp & touching).any():
            keep |= comp
    a = np.where(keep, np.maximum(a, soft), a)
    rgba.putalpha(Image.fromarray(a.astype(np.uint8)))
    return rgba


# ------------------------------------------------------------- MAIN --------

def write_preview(png_path: Path, label: str, size: int = 120):
    """Miniature de la derniere puff traitee, pour la barre de progression du mod
    Claude Code : _travail/derniere.png (terminal) et derniere.svg (VS Code)."""
    import base64
    import io
    try:
        im = Image.open(png_path).convert("RGBA")
        im.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        (WORK / "derniere.png").write_bytes(data)
        b64 = base64.b64encode(data).decode()
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{im.width}" height="{im.height}" '
               f'viewBox="0 0 {im.width} {im.height}"><image width="{im.width}" '
               f'height="{im.height}" href="data:image/png;base64,{b64}"/></svg>')
        (WORK / "derniere.svg").write_text(svg, encoding="utf-8")
        (WORK / "derniere.txt").write_text(label, encoding="utf-8")
    except Exception:
        pass   # l'apercu est un confort, jamais une cause d'arret


def is_paused() -> bool:
    try:
        return CONTROL.read_text(encoding="utf-8-sig").strip().lower() == "pause"
    except OSError:
        return False


def wait_if_paused():
    """Pause entre deux variantes tant que _travail/control.txt contient 'pause'."""
    if not is_paused():
        return
    print("[pause] traitement en pause", flush=True)
    while is_paused():
        time.sleep(2)
    print("[reprise] traitement repris", flush=True)


def rank(result):
    """Plus petit = meilleur : sans probleme, puis fond uni, puis moins de soucis."""
    _, issues, method = result
    return (len(issues) > 0, method != "fond uni", len(issues))


# Problemes qui disqualifient un detourage (image rejetee, jamais conservee),
# et ceux qu'on tolere dans dataset/ (la puff est la, juste en petite resolution).
SEVERE = re.compile(r"detection faible|fond conserve|objet trop petit|non detectee|vide|erreur")
TOLERATED = {"basse resolution"}


def triage(res):
    """(png, problemes, methode) -> meme chose, ou None si le detourage est a rejeter."""
    png, issues, method = res
    if png is None:
        return None
    if any(SEVERE.search(s) for s in issues):
        return None
    if method == "visuel marketing" and "plus large que haute" in issues:
        return None                              # fond ou boite garde avec la puff
    return png, [s for s in issues if s not in TOLERATED], method


CORRECTIONS = WORK / "corrections.json"
GENERIC = "Visuel generique"


def load_corrections():
    """Corrections manuelles issues de la revue visuelle (_travail/corrections.json) :
      exclude_models : modeles a ignorer (ex. gamme d'e-liquides)
      exclude        : variantes a ignorer, "Modele / Saveur"
      ban_images     : URLs d'images a ne jamais utiliser (mauvais objet...)
      force_image    : {"Modele / Saveur": url} image imposee
      redo           : variantes a recalculer au prochain --retry, "Modele / Saveur"
      rename         : {"Modele / Saveur": "Nouveau nom"} (noms par defaut, ex. Visuel fabricant)
      notes          : {"Modele / Saveur": {"integrite": n, "resolution": n, "remarque": "..."}}
                       notes de la revue visuelle, prioritaires sur les notes automatiques
      crop           : [{"match": regex d'URL, "box": [x0, y0, x1, y1]}] recadrage (fractions)
                       de l'image source avant detourage, pour viser la bonne puff
    """
    base = {"exclude_models": [], "exclude": [], "ban_images": [], "force_image": {}, "redo": [],
            "rename": {}, "notes": {}, "crop": []}
    try:
        base.update(json.loads(CORRECTIONS.read_text(encoding="utf-8-sig")))
    except (OSError, ValueError):
        pass
    return base


def image_identity(url: str) -> str:
    """Identite d'une image : empreinte du fichier telecharge, sinon URL sans parametres."""
    path = RAW / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".img")
    if path.exists():
        return hashlib.sha1(path.read_bytes()).hexdigest()
    return url.split("?")[0]


def drop_generic_images(products):
    """Une meme image servie pour plusieurs saveurs d'un modele n'est pas une image de
    saveur (photo generique de la gamme) : on la retire de ces saveurs. Si un modele
    n'a plus aucune image, la photo generique devient sa variante 'Visuel generique'."""
    # La 1re image d'une fiche est celle de la saveur, sauf si elle est aussi la 1re
    # d'une autre saveur (meme photo pour toute la gamme). Les suivantes (galerie)
    # sont ecartees des qu'elles apparaissent sur plusieurs saveurs.
    flavors_of = defaultdict(set)        # images de galerie
    firsts_of = defaultdict(set)         # premieres images
    for p in products:
        if p["flavor"] in (FABRICANT, "Original"):
            continue
        for i, u in enumerate(p["images"]):
            p.setdefault("_ids", {})[u] = image_identity(u)
            flavors_of[(p["model"], p["_ids"][u])].add(p["flavor"])
            if i == 0:
                firsts_of[(p["model"], p["_ids"][u])].add(p["flavor"])
    shared = {k for k, v in flavors_of.items() if len(v) >= 2}
    shared_first = {k for k, v in firsts_of.items() if len(v) >= 2}
    fallback = {}
    for p in products:
        ids = p.pop("_ids", {})
        keep = [u for i, u in enumerate(p["images"])
                if (p["model"], ids.get(u)) not in (shared_first if i == 0 else shared)]
        if len(keep) < len(p["images"]):
            fallback.setdefault(p["model"], (p, [u for u in p["images"] if u not in keep]))
        p["images"] = keep
    extra = []
    for model, (p, urls) in fallback.items():
        if not any(q["images"] for q in products if q["model"] == model
                   and q["flavor"] not in (FABRICANT, "Original")):
            extra.append({**p, "flavor": GENERIC, "images": urls[:2]})
    return products + extra


def run(only_normalize: bool, only_discover: bool, refresh: bool = False, retry: bool = False):
    WORK.mkdir(exist_ok=True)
    if only_normalize and INDEX.exists():
        products = json.loads(INDEX.read_text(encoding="utf-8"))
    else:
        products = discover(refresh)
        INDEX.write_text(json.dumps(products, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(products)} fiches/variantes trouvees")
    if only_discover:
        return

    fix = load_corrections()
    CROPS[:] = fix["crop"]
    banned = set(fix["ban_images"])
    for p in products:
        p["images"] = [u for u in dict.fromkeys(best_res(u) for u in p["images"])
                       if u not in banned]
        p["model"], p["flavor"] = parse_title(p["title"], p.get("manufacturer"))
    canonicalize_flavors(products)
    products = [p for p in products if p["model"] not in fix["exclude_models"]
                and f"{p['model']} / {p['flavor']}" not in fix["exclude"]]
    products = drop_generic_images(products)
    for label, url in fix["force_image"].items():
        model, _, flavor = label.partition(" / ")
        products.append({"source": "correction", "priority": -1, "url": url, "title": label,
                         "images": [url], "model": model, "flavor": flavor})
    groups = defaultdict(list)
    for p in products:
        groups[variant_key(p["model"], p["flavor"])].append(p)
    # visuel fabricant / page generique : seulement si le modele n'a aucune vraie saveur
    generic = lambda k: k.split("|")[1] in ("visuelfabricant", "original", "visuelgenerique")
    # mis de cote : traites a la fin, pour les modeles restes sans aucune image de saveur
    deferred = {k: groups.pop(k) for k in [k for k in groups if generic(k)]}
    models_with_flavors = {k.split("|")[0] for k in groups}
    for k in list(deferred):
        if k.split("|")[0] not in models_with_flavors:
            groups[k] = deferred.pop(k)
    # un seul visuel generique par modele (le fabricant d'abord)
    seen_models = set()
    for k in sorted([k for k in groups if generic(k)], key=lambda k: not k.endswith("visuelfabricant")):
        m = k.split("|")[0]
        if m in seen_models:
            del groups[k]
        seen_models.add(m)
    print(f"{len(groups)} variantes distinctes (modele x saveur)")

    # --retry : on recalcule (sans cache, regles actuelles, plus de candidates)
    # les variantes qui etaient douteuses ou sans image, et celles marquees 'redo'
    previous_ok = set()
    if retry and (WORK / "rapport.json").exists():
        for r in json.loads((WORK / "rapport.json").read_text(encoding="utf-8")):
            if not r["issues"]:
                previous_ok.add(variant_key(r["model"], r["flavor"]))
    redo = {variant_key(*lbl.split(" / ", 1)) for lbl in fix["redo"] if " / " in lbl}

    for d in (OUT, REVIEW, DISCARDED):
        if d.exists():
            shutil.rmtree(d)

    report = []
    # les Falcon d'abord (prioritaires), puis le reste par ordre alphabetique
    order = sorted(groups.items(), key=lambda kv: (not kv[0].startswith("Falcon"), kv[0]))
    # puis les visuels generiques mis de cote (fabricant d'abord), pour les seuls
    # modeles qui n'auront obtenu aucune image de saveur
    order += sorted(deferred.items(),
                    key=lambda kv: (kv[0].split("|")[0], not kv[0].endswith("visuelfabricant")))
    for i, (key, plist) in enumerate(order, 1):
        wait_if_paused()
        if key in deferred and key.split("|")[0] in {r["model"] for r in report}:
            continue
        plist.sort(key=lambda p: p["priority"])
        force = (retry and key not in previous_ok) or key in redo
        limit = MAX_CANDIDATES * 2 if force else MAX_CANDIDATES
        best = None
        tried = 0
        for p in plist:
            if tried >= limit:
                break
            for url in p["images"][:limit]:
                if tried >= limit:
                    break
                tried += 1
                try:
                    res = process_image(url, force=force)
                except Exception as e:  # une image corrompue ne doit pas tout arreter
                    res = (None, [f"erreur {type(e).__name__}"], "-")
                res = triage(res)
                if res is None:
                    continue
                if best is None or rank(res) < rank(best[0]):
                    best = (res, p, url)
                if not res[1]:
                    break
            if best and not best[0][1]:
                break
        if best is None:
            print(f"[{i}/{len(order)}] {key} : aucune image exploitable")
            continue
        (png, issues, method), p, url = best
        label = f"{p['model']} / {p['flavor']}"
        flavor = clean_name(fix["rename"].get(label, p["flavor"]))
        metrics = cut_metrics(url)
        # embout transparent rate (cornes, debris) : remplace par l'embout de reference
        # du modele (voir embouts.py) ; sans reference, la puff est penalisee
        nozzle = None
        if p["model"] in embouts.MODELS and embouts.is_defective(embouts.load_alpha(png)):
            nozzle = "embout remplace" if embouts.template_for(p["model"]) else "embout incomplet"
        integ, resol = scores(issues, metrics, nozzle_replaced=nozzle == "embout remplace")
        if nozzle == "embout incomplet":
            integ = max(1, integ - 2)
        override = fix["notes"].get(label) or fix["notes"].get(f"{p['model']} / {flavor}") or {}
        integ = override.get("integrite", integ)
        resol = override.get("resolution", resol)
        remark = override.get("remarque", ", ".join(issues + ([nozzle] if nozzle else [])))
        # seuils de qualite : en dessous, l'image va dans _travail/ecartees/ (pas dans dataset/)
        kept = integ >= MIN_INTEGRITE and resol >= MIN_RESOLUTION
        folder = (OUT if kept else DISCARDED) / p["model"]
        folder.mkdir(parents=True, exist_ok=True)
        dest = folder / f"{flavor}.png"
        shutil.copyfile(png, dest)
        if nozzle == "embout remplace":
            embouts.fix_image(dest, p["model"])
        write_preview(dest, f"{p['model']} / {flavor}")
        print(f"[{i}/{len(order)}] {p['model']} / {flavor} ({p['source']}, {method}) "
              f"integrite {integ}/5, resolution {resol}/5"
              + (f"  ({remark})" if remark else "") + ("" if kept else "  -> ecartee"),
              flush=True)
        report.append({"model": p["model"], "flavor": flavor, "png": str(dest),
                       "source": p["source"], "method": method, "page": p["url"],
                       "image": url, "title": p["title"], "issues": issues,
                       "integrite": integ, "resolution": resol, "remarque": remark,
                       "src_h": metrics.get("src_h"), "ecartee": not kept})

    (WORK / "rapport.json").write_text(json.dumps(report, ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    dropped = [r for r in report if r["ecartee"]]
    report = [r for r in report if not r["ecartee"]]
    write_notes(report)
    write_contact_sheet(report)
    print(f"{len(dropped)} images ecartees (integrite < {MIN_INTEGRITE}/5 ou resolution "
          f"< {MIN_RESOLUTION}/5) -> {DISCARDED}/")
    good = sum(1 for r in report if r["integrite"] >= 4)
    print(f"Termine : {len(report)} images dans {OUT}/ ({good} avec integrite >= 4/5), "
          f"{len({r['model'] for r in report})} modeles, notes dans {OUT}/notes.csv")


def cut_metrics(url: str) -> dict:
    meta = CUT / (cut_key(url) + ".json")
    try:
        return json.loads(meta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def scores(issues, metrics, nozzle_replaced=False):
    """Notes automatiques sur 5 (affinees ensuite par la revue visuelle).
    Integrite : la puff est-elle entiere et seule ? Resolution : taille de la puff
    dans l'image source, avant mise a l'echelle.
    nozzle_replaced : l'embout a ete remplace (embouts.py), un haut manquant n'est
    donc plus un defaut."""
    integ = 5
    for s in issues:
        if "partiel" in s or "objets" in s or "emballage" in s:
            integ -= 2
        elif "irregulier" in s or "profil" in s or "large" in s:
            integ -= 1
        elif "tronque" in s and not nozzle_replaced:
            integ -= 1
    if metrics.get("top_gap", 0) > 0.03 and not nozzle_replaced:
        integ -= 1
    if 0 < metrics.get("det", 1) < 0.35:
        integ -= 1
    h = metrics.get("src_h") or 0
    resol = 5 if h >= 900 else 4 if h >= 650 else 3 if h >= 450 else 2 if h >= 300 else 1
    return max(1, integ), resol


def write_notes(rows):
    """dataset/notes.csv : une ligne par image, pour filtrer sur les notes.
    Separateur ';' et BOM UTF-8 pour une ouverture directe dans Excel."""
    import csv
    with (OUT / "notes.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["modele", "saveur", "fichier", "integrite_sur_5", "resolution_sur_5",
                    "hauteur_source_px", "source", "remarque"])
        for r in sorted(rows, key=lambda r: (r["model"], r["flavor"])):
            w.writerow([r["model"], r["flavor"], Path(r["png"]).relative_to(OUT).as_posix(),
                        r["integrite"], r["resolution"], r.get("src_h") or "", r["source"],
                        r["remarque"]])


def write_contact_sheet(rows):
    """Planche de controle visuel (outil interne, dans _travail/)."""
    cards = "\n".join(
        f'<figure class="{"rev" if r["issues"] else ""}">'
        f'<img src="{Path(os.path.relpath(r["png"], WORK)).as_posix()}" loading="lazy"><figcaption>{r["model"]}<br>'
        f'<b>{r["flavor"]}</b><br><small>{r["source"]} {", ".join(r["issues"])}</small>'
        f"</figcaption></figure>"
        for r in sorted(rows, key=lambda r: (r["model"], r["flavor"]))
    )
    (WORK / "planche.html").write_text(f"""<!doctype html><meta charset="utf-8">
<title>JNR planche</title><style>
body{{font:13px sans-serif;background:#ddd;display:flex;flex-wrap:wrap;gap:8px;padding:8px}}
figure{{margin:0;width:160px;background:
repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px;padding:6px;text-align:center}}
figure.rev{{outline:3px solid #e33}} img{{width:100%}}
</style>{cards}""", encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-normalize", action="store_true",
                    help="rejoue depuis _travail/ sans re-decouvrir les fiches")
    ap.add_argument("--only-discover", action="store_true",
                    help="met a jour la liste des fiches sans traiter les images")
    ap.add_argument("--refresh", action="store_true",
                    help="ignore le cache des sources et re-parcourt tous les sites")
    ap.add_argument("--retry", action="store_true",
                    help="recalcule les variantes douteuses ou sans image (et 'redo')")
    a = ap.parse_args()
    run(a.only_normalize or a.retry, a.only_discover, a.refresh, a.retry)
