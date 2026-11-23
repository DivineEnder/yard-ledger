#!/usr/bin/env python3
"""Rebuild data/plants.json (and missing photos) from a Sparrowhawk catalogue dump.

Usage:
    curl "https://sparrowhawknativeplants.com/products.json?limit=250" -o tools/catalog.json
    python3 tools/refresh.py             # data + any missing images
    python3 tools/refresh.py --images    # data + re-download every image

The purchase list lives in WISHLIST below: display name, catalogue title, quantity,
pot size, availability note and a scientific-name fallback.
"""
import argparse
import html
import json
import os
import re
import urllib.request

from PIL import Image
from ecosystem import COMPANION_METHOD, COMPANION_SOURCES, ECOSYSTEM_TAGS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "tools", "catalog.json")
OUT = os.path.join(ROOT, "data", "plants.json")
IMG_DIR = os.path.join(ROOT, "images")
BASE = "https://sparrowhawknativeplants.com"

WISHLIST = [
    ("Common Yarrow", "Western Yarrow", 25, '3.5"', "", "Achillea millefolium"),
    ("Western Columbine", "Red Columbine", 5, "1 gal", "", "Aquilegia formosa"),
    ("Chokecherry", "Common Chokecherry", 3, "1 gal", "", "Prunus virginiana"),
    ("Oxalis", "Oregon Oxalis", None, "", "None exist", "Oxalis oregana"),
    ("False Lily of the Valley", "False Lily-of-the-Valley", 25, '3.5"', 'Only 3.5" available', "Maianthemum dilatatum"),
    ("False Solomon's Seal", "Starry False Solomon's Seal", 3, "1 gal", "", "Maianthemum stellatum"),
    ("Pacific Bleeding Heart", "Pacific Bleeding Heart", 25, '3.5"', "", "Dicentra formosa"),
    ("Bearberry Kinnikinnick", "Kinnikinnick", 5, "1 gal", "", "Arctostaphylos uva-ursi"),
    ("Common Camas", "Common Camas", 5, "1 gal", "", "Camassia quamash"),
    ("Black Twinberry", "Black Twinberry", 3, "2 gal", "", "Lonicera involucrata"),
    ("Nootka Rose", "Nootka Rose", 5, "1 gal", "", "Rosa nutkana"),
    ("Serviceberry", "Western Serviceberry", 2, "5 gal", "", "Amelanchier alnifolia"),
    ("Blue Elderberry", "Blue Elderberry", 3, "1 gal", "", "Sambucus cerulea"),
    ("Yellow Monkeyflower", "Yellow Monkeyflower", None, "", "None carried", "Erythranthe guttata"),
    ("Purple Monkeyflower", "Purple Monkeyflower", None, "", "None exist", "Erythranthe lewisii"),
    ("Grand Collomia", "Grand Collomia (Seeds)", None, "", "None exist", "Collomia grandiflora"),
    ("Early-blue Violet", "Early Blue Violet", None, "", "None exist", "Viola adunca"),
    ("Streambank Violet", "Streambank Violet", None, "", "None exist", "Viola glabella"),
    ("Mahala Mat", "Mahala Mat", None, "", "None exist", "Ceanothus prostratus"),
    ("Spreading Wood Fern", "Spreading Wood Fern", 6, "1 gal", "", "Dryopteris expansa"),
    ("Evergreen Huckleberry", "Evergreen Huckleberry", None, "", "None available", "Vaccinium ovatum"),
    ("Salal", "Salal", None, "", "None available", "Gaultheria shallon"),
    ("Vine Maple", "Vine Maple", 3, "1 gal", "", "Acer circinatum"),
    ("Red Elderberry", "Red Elderberry", 2, "2 gal", "", "Sambucus racemosa"),
    ("Vanilla Leaf", "Vanilla Leaf", None, "", "None available", "Achlys triphylla"),
    ("Candyflower", "Candyflower", None, "", "None available", "Claytonia sibirica"),
]

LABELS = [
    "Plant type/canopy layer", "Size at maturity", "Light requirements",
    "Moisture requirements", "Bloom time", "Growth rate/ease", "Wildlife support",
    "Native habitat/range", "Special features & uses",
]
LIGHT_ORDER = ["full-sun", "part-shade", "full-shade"]


def strip_tags(s):
    s = re.sub(r"<br\s*/?>", "\n", s or "")
    s = re.sub(r"</(p|li|div|ul|ol|h\d)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\u200b", "").replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n", s).strip()


def slugify(s):
    s = s.lower().replace("'", "").replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def sci_from_html(raw):
    for block in re.findall(r"<p[^>]*>(.*?)</p>", raw, re.S)[:3]:
        t = strip_tags(block)
        if not t or len(t) > 70 or re.search(r"[0-9:;]", t):
            continue
        if t[0].isupper():
            return re.sub(r"\s*\((?:formerly|syn)[^)]*\)", "", t).strip()
    return ""


def parse_product(p):
    raw = p.get("body_html") or ""
    text = strip_tags(raw)
    fields = {}
    for line in text.split("\n"):
        mm = re.match(r"^([A-Z][A-Za-z/&' ]{2,40}):\s*(.+)$", line.strip())
        if not mm:
            continue
        key = mm.group(1).strip().lower()
        for lab in LABELS:
            if key.startswith(lab.lower()[:14]):
                fields.setdefault(lab, mm.group(2).strip())
                break

    cut = text.find("Plant type/canopy layer")
    head = text[: cut if cut > 0 else 1500]
    desc = re.sub(r"\s+", " ", " ".join(x.strip() for x in head.split("\n") if len(x.strip()) > 70)).strip()

    gm = re.search(r"Gardening with[^:]*:\s*(.*?)(?:\nPhoto Credits?|$)", text, re.S)
    gardening = re.split(r"Photo Credit", re.sub(r"\s+", " ", gm.group(1)))[0].strip() if gm else ""

    cm = re.search(r"Companion Plants?:\s*(.*?)(?:\n|Photo Credit|$)", text, re.I | re.S)
    companion = re.sub(r"\s+", " ", cm.group(1)).strip() if cm else ""

    pc = re.search(r"(Photo Credits?.*)$", text, re.S)
    credit = ""
    if pc:
        credit = re.sub(r"\s+", " ", re.sub(r"https?://\S+", "", pc.group(1))).strip()
        credit = re.split(r"(?<=\.)\s(?=Photo Credit)", credit)[0][:180]

    tags = p.get("tags") or []
    pick = lambda pre: sorted({t.split(":", 1)[1].strip() for t in tags if t.startswith(pre)})
    lights = set()
    for lt in pick("light:"):
        low = lt.lower()
        if "full sun" in low:
            lights.add("full-sun")
        if "part" in low or "shade" in low:
            lights.add("part-shade")
        if "full shade" in low:
            lights.add("full-shade")

    return {
        "scientificName": sci_from_html(raw),
        "description": desc,
        "gardening": gardening,
        "companionText": companion,
        "fields": fields,
        "lightTags": pick("light:"),
        "lights": [x for x in LIGHT_ORDER if x in lights],
        "moistureTags": pick("moisture:"),
        "canopy": pick("canopy:"),
        "collections": pick("collection:"),
        "special": pick("special:"),
        "evergreen": pick("evergreen/deciduous:"),
        "growth": pick("growth rate:"),
        "photoCredit": credit,
        "productUrl": f"{BASE}/products/{p['handle']}",
        "handle": p["handle"],
    }


def download(url, dest):
    req = urllib.request.Request(f"{url}{'&' if '?' in url else '?'}width=1200", headers={"User-Agent": "Mozilla/5.0"})
    tmp = dest + ".src"
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
        f.write(r.read())
    im = Image.open(tmp)
    if im.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    if im.width > 980:
        im = im.resize((980, int(im.height * 980 / im.width)), Image.LANCZOS)
    im.save(dest, "WEBP", quality=80, method=6)
    os.remove(tmp)
    return im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", action="store_true", help="re-download every photo")
    args = ap.parse_args()

    if not os.path.exists(CATALOG):
        raise SystemExit(f"Missing {CATALOG}. Download it first:\n"
                         '  curl "https://sparrowhawknativeplants.com/products.json?limit=250" -o tools/catalog.json')

    data = json.load(open(CATALOG))
    by = {p["title"]: p for p in data["products"]}
    parsed = {p["title"]: parse_product(p) for p in data["products"]}
    os.makedirs(IMG_DIR, exist_ok=True)

    skip = re.compile(r"seed|mix|gift|pickup", re.I)
    candidates = [(p, parsed[p["title"]]) for p in data["products"]
                  if not skip.search(p["title"]) and p["images"]
                  and parsed[p["title"]]["lights"] and parsed[p["title"]]["moistureTags"]]

    list_titles = {w[1] for w in WISHLIST}
    plants = []

    for display, title, qty, size, note, fallback in WISHLIST:
        p, info = by[title], parsed[title]
        slug = slugify(display)
        if not info["scientificName"]:
            info["scientificName"] = fallback
        images = []
        for i, img in enumerate(p["images"][:3]):
            fn = f"{slug}-{i + 1}.webp"
            path = os.path.join(IMG_DIR, fn)
            if args.images or not os.path.exists(path):
                try:
                    download(img["src"], path)
                except Exception as exc:  # keep going, report at the end
                    print(f"  image failed: {display} #{i + 1}: {exc}")
            if os.path.exists(path):
                w, h = Image.open(path).size
                images.append({"src": f"images/{fn}", "w": w, "h": h})
        plants.append({
            "id": slug, "name": display, "catalogName": title, "qty": qty, "size": size,
            "note": note, "available": qty is not None, "images": images, **info,
        })

    for pl in plants:
        scored = []
        for p, info in candidates:
            if p["title"] == pl["catalogName"]:
                continue
            shared_light = set(pl["lights"]) & set(info["lights"])
            shared_moist = set(pl["moistureTags"]) & set(info["moistureTags"])
            if not shared_light or not shared_moist:
                continue
            shared_col = set(pl["collections"]) & set(info["collections"])
            shared_eco = ECOSYSTEM_TAGS.get(pl["catalogName"], set()) & ECOSYSTEM_TAGS.get(p["title"], set())
            score = 2.0 * len(shared_light) + 2.0 * len(shared_moist)
            score += 2.4 * min(len(shared_eco), 2)
            score += 1.2 * min(len(shared_col), 2)
            if set(pl["canopy"]) != set(info["canopy"]):
                score += 1.0
            if p["title"] in list_titles:
                score += 2.5
            scored.append((score, p["title"], info, shared_col, shared_eco))
        scored.sort(key=lambda x: (-x[0], x[1]))

        comps, layers = [], set()
        for _, name, info, shared_col, shared_eco in scored:
            layer = info["canopy"][0] if info["canopy"] else ""
            if layer in layers and len(comps) >= 2:
                continue
            layers.add(layer)
            comps.append({
                "name": name,
                "lights": info["lights"],
                "moisture": info["moistureTags"],
                "url": info["productUrl"],
                "inList": name in list_titles,
                "why": "also on your list" if name in list_titles else (
                    "same native habitat" if shared_eco else (
                        "shares " + sorted(shared_col)[0] if shared_col else "same light and moisture")),
            })
            if len(comps) == 6:
                break
        pl["companions"] = comps

    payload = {"source": BASE, "updated": "2026-11-23",
               "companionMethod": COMPANION_METHOD,
               "companionSources": COMPANION_SOURCES,
               "lightLabels": {"full-sun": "Full sun", "part-shade": "Part sun / part shade", "full-shade": "Full shade"},
               "plants": plants}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    print(f"wrote {OUT} — {len(plants)} plants")


if __name__ == "__main__":
    main()
