#!/usr/bin/env python3
"""
Validation manuelle du dataset (outil de dev).

Ouvre une page locale qui presente les puffs une par une :
  swipe a droite / fleche droite   -> valider
  swipe a gauche / fleche gauche   -> desactiver (retirer du dataset)
  bouton Retour / fleche bas / Retour arriere -> annuler la derniere decision

Une puff desactivee est retiree de dataset/notes.csv (sa ligne est conservee pour
pouvoir la restaurer), son PNG est deplace dans _travail/desactivees/ et elle est
ajoutee a "exclude" dans _travail/corrections.json, pour qu'une prochaine
execution de la pipeline ne la reintroduise pas. Annuler remet tout en place.

Les decisions sont enregistrees au fil de l'eau dans _travail/validation.json :
on peut fermer et reprendre plus tard.

Usage :
  python pipeline/valider.py            # http://localhost:8765
  python pipeline/valider.py --port 9000
Puis, pour mettre le jeu a jour : cd app && npm run assets
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
DATASET = HERE.parent / "dataset"
NOTES = DATASET / "notes.csv"
WORK = HERE / "_travail"
STATE = WORK / "validation.json"
CORRECTIONS = WORK / "corrections.json"
DISABLED = WORK / "desactivees"
ORIGINALS = WORK / "embouts_originaux"   # avant remplacement d'embout (embouts.py)
PAGE = HERE / "valider.html"

LOCK = threading.Lock()


# ------------------------------------------------------------ fichiers ------

def read_notes():
    with open(NOTES, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    return rows[0], rows[1:]


def write_notes(head, body):
    tmp = NOTES.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f, delimiter=";").writerows([head] + body)
    tmp.replace(NOTES)


def load_state():
    try:
        s = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        s = {}
    s.setdefault("decisions", {})      # "Modele / Saveur" -> "ok" | "ko"
    s.setdefault("history", [])        # [{"key", "prev"}], pour annuler
    s.setdefault("disabled_rows", {})  # "Modele / Saveur" -> ligne de notes.csv
    return s


def save_state(s):
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(STATE)


def set_excluded(key: str, excluded: bool):
    try:
        c = json.loads(CORRECTIONS.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        c = {}
    ex = c.setdefault("exclude", [])
    if excluded and key not in ex:
        ex.append(key)
    elif not excluded and key in ex:
        ex.remove(key)
    else:
        return
    CORRECTIONS.write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------ decisions -----

def key_of(row, head):
    return f"{row[head.index('modele')]} / {row[head.index('saveur')]}"


def apply(s, key: str, decision: str | None):
    """Met le dataset en accord avec la decision (idempotent)."""
    head, body = read_notes()
    fi = head.index("fichier")
    rows = {key_of(r, head): r for r in body}
    if decision == "ko":
        row = rows.get(key) or (s["disabled_rows"].get(key) or {}).get("row")
        if row is None:
            raise KeyError(key)
        src, dst = DATASET / row[fi], DISABLED / row[fi]
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(src, dst)
        if key in rows:
            pos = next(i for i, r in enumerate(body) if key_of(r, head) == key)
            s["disabled_rows"][key] = {"row": rows[key], "pos": pos}
            write_notes(head, [r for r in body if key_of(r, head) != key])
        set_excluded(key, True)
        s["decisions"][key] = "ko"
    else:
        saved = s["disabled_rows"].pop(key, None)
        if saved is not None:
            row = saved["row"]
            src, dst = DISABLED / row[fi], DATASET / row[fi]
            if src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(src, dst)
            if key not in rows:   # la ligne reprend sa place d'origine dans notes.csv
                body.insert(min(saved["pos"], len(body)), row)
                write_notes(head, body)
            set_excluded(key, False)
        if decision is None:
            s["decisions"].pop(key, None)
        else:
            s["decisions"][key] = decision


def items(s):
    head, body = read_notes()
    col = {n: head.index(n) for n in ("modele", "saveur", "fichier", "integrite_sur_5",
                                      "resolution_sur_5", "remarque")}
    rows = [(r, True) for r in body] + [(d["row"], False) for d in s["disabled_rows"].values()]
    out = []
    for r, active in rows:
        key = key_of(r, head)
        f = r[col["fichier"]]
        out.append({
            "key": key, "model": r[col["modele"]], "flavor": r[col["saveur"]], "file": f,
            "integ": r[col["integrite_sur_5"]], "resol": r[col["resolution_sur_5"]],
            "remark": r[col["remarque"]], "active": active,
            "decision": s["decisions"].get(key),
            "original": (ORIGINALS / f).exists(),
        })
    # les puffs corrigees (embout remplace) d'abord, puis par modele / saveur
    out.sort(key=lambda x: (not x["original"], x["model"].lower(), x["flavor"].lower()))
    return out


# ------------------------------------------------------------ serveur -------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body: bytes, ctype="application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def json(self, obj, code=200):
        self.send(code, json.dumps(obj, ensure_ascii=False).encode())

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/":
            return self.send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
        if u.path == "/api/state":
            with LOCK:
                s = load_state()
                return self.json({"items": items(s), "canUndo": bool(s["history"])})
        if u.path == "/img":
            q = parse_qs(u.query)
            f = q.get("f", [""])[0]
            roots = {"orig": [ORIGINALS], "cur": [DATASET, DISABLED]}[q.get("src", ["cur"])[0]]
            for root in roots:
                p = (root / f).resolve()
                if root.resolve() in p.parents and p.is_file():
                    return self.send(200, p.read_bytes(), "image/png")
            return self.send(404, b"")
        self.send(404, b"")

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        u = urlparse(self.path)
        with LOCK:
            s = load_state()
            try:
                if u.path == "/api/decide":
                    key, d = body["key"], body["decision"]
                    if d not in ("ok", "ko"):
                        return self.json({"error": "decision invalide"}, 400)
                    s["history"].append({"key": key, "prev": s["decisions"].get(key), "t": time.time()})
                    apply(s, key, d)
                    save_state(s)
                    return self.json({"ok": True})
                if u.path == "/api/undo":
                    if not s["history"]:
                        return self.json({"key": None})
                    h = s["history"].pop()
                    apply(s, h["key"], h["prev"])
                    save_state(s)
                    return self.json({"key": h["key"]})
            except KeyError as e:
                return self.json({"error": f"inconnu : {e}"}, 404)
        self.send(404, b"")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    url = f"http://localhost:{a.port}"
    print(f"Validation du dataset : {url}  (Ctrl+C pour arreter)")
    if not a.no_browser:
        threading.Timer(.5, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
