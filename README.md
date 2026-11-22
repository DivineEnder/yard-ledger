# Yard Ledger

A small, static planting list for the yard: 26 Pacific Northwest native species from
[Sparrowhawk Native Plants](https://sparrowhawknativeplants.com/collections/frontpage), with
photographs, light and moisture requirements, bloom times and companion plants.

Live site: **https://divineender.github.io/GardenPlanner/**

## What it does

- Every plant is shown as a specimen card with a photo, scientific name, light tolerance,
  quantity and pot size, bloom window and suggested companions.
- **Filter by light** — full sun, part sun / part shade, full shade. Filters combine as OR,
  so "full sun" plus "full shade" shows plants that will take either.
- Search by common or scientific name, filter to what is currently in stock, and sort by list
  order, name, light need or order size.
- Click a card for the full profile: photo gallery, moisture, size, growth rate, wildlife
  support, native range, gardening notes, the nursery's own companion note, and a link to the
  source product page.
- Tick **Planted** on a card once it is in the ground. Ticks are saved in the browser
  (`localStorage`), so they survive a reload but are per-device.

## Structure

```
index.html          the page
css/style.css       all styling
js/app.js           filtering, sorting, detail drawer, planted state
data/plants.json    every plant record used by the page
images/*.webp       plant photos (3 per species, ~980px wide)
tools/refresh.py    regenerates data + images from the nursery catalogue
```

There is no build step. GitHub Pages serves the files exactly as they are.

## Updating the list

`data/plants.json` is the single source of truth. Each record looks like this:

```json
{
  "id": "common-yarrow",
  "name": "Common Yarrow",
  "catalogName": "Western Yarrow",
  "qty": 25,
  "size": "3.5\"",
  "note": "",
  "available": true,
  "scientificName": "Achillea millefolium",
  "lights": ["full-sun"],
  "moistureTags": ["dry soil"],
  "fields": { "Light requirements": "full sun", "Bloom time": "..." },
  "companions": [{ "name": "Common Camas", "url": "...", "inList": true }],
  "productUrl": "https://sparrowhawknativeplants.com/products/western-yarrow"
}
```

Editing a quantity, a note or the `available` flag by hand is safe. For a larger refresh,
download the nursery catalogue and rerun the script:

```bash
curl "https://sparrowhawknativeplants.com/products.json?limit=250" -o tools/catalog.json
python3 tools/refresh.py            # rebuild data/plants.json and missing images
python3 tools/refresh.py --images   # also re-download every photo
```

The purchase list (names, quantities, pot sizes, availability notes) is the `WISHLIST` table at
the top of `tools/refresh.py`.

## Credits

Plant profiles, photographs and companion notes come from
[Sparrowhawk Native Plants](https://sparrowhawknativeplants.com/), a Portland nursery whose
sales benefit community partners. Photos remain the property of their photographers; most are
shared under CC BY 4.0 and are credited inside each plant's detail panel. This is a personal
shopping list, not a nursery publication.
