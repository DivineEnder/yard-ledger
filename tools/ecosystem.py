"""Regional ecosystem affinities used to rank native companion suggestions.

These are habitat-fit groupings, not strict horticultural prescriptions. They are
based on the habitat and wildlife framing in the cited regional resources and on
the catalogue's own light, moisture, canopy, and native-range fields.
"""

ECOSYSTEM_TAGS = {
    "Western Yarrow": {"dry-meadow", "pollinator-opening"},
    "Red Columbine": {"woodland-edge", "open-forest"},
    "Common Chokecherry": {"forest-edge", "shrub-layer", "dry-meadow"},
    "Oregon Oxalis": {"woodland-floor", "moist-forest"},
    "False Lily-of-the-Valley": {"woodland-floor", "moist-forest"},
    "Starry False Solomon's Seal": {"woodland-floor", "moist-forest", "forest-edge"},
    "Pacific Bleeding Heart": {"woodland-floor", "moist-forest", "streambank"},
    "Kinnikinnick": {"dry-meadow", "open-forest", "pollinator-opening"},
    "Common Camas": {"dry-meadow", "wet-meadow", "pollinator-opening"},
    "Black Twinberry": {"streambank", "forest-edge", "shrub-layer"},
    "Nootka Rose": {"streambank", "forest-edge", "shrub-layer", "wet-meadow"},
    "Western Serviceberry": {"forest-edge", "shrub-layer", "dry-meadow"},
    "Blue Elderberry": {"forest-edge", "shrub-layer", "streambank", "pollinator-opening"},
    "Yellow Monkeyflower": {"streambank", "wet-meadow", "pollinator-opening"},
    "Purple Monkeyflower": {"streambank", "wet-meadow", "pollinator-opening"},
    "Grand Collomia (Seeds)": {"dry-meadow", "pollinator-opening"},
    "Early Blue Violet": {"woodland-edge", "woodland-floor", "moist-forest"},
    "Streambank Violet": {"streambank", "woodland-floor", "moist-forest"},
    "Mahala Mat": {"dry-meadow", "open-forest", "pollinator-opening"},
    "Spreading Wood Fern": {"woodland-floor", "moist-forest"},
    "Evergreen Huckleberry": {"moist-forest", "forest-edge", "shrub-layer"},
    "Salal": {"moist-forest", "forest-edge", "shrub-layer"},
    "Vine Maple": {"woodland-edge", "moist-forest", "forest-edge"},
    "Red Elderberry": {"streambank", "forest-edge", "shrub-layer", "moist-forest"},
    "Vanilla Leaf": {"woodland-floor", "moist-forest"},
    "Candyflower": {"woodland-floor", "moist-forest", "streambank"},
}

COMPANION_SOURCES = [
    {
        "label": "Xerces Maritime Northwest native plant list",
        "url": "https://xerces.org/publications/plant-lists/native-plants-for-pollinators-and-beneficial-insects-maritime-northwest",
    },
    {
        "label": "OSU Extension native plant gardening",
        "url": "https://extension.oregonstate.edu/collection/native-plant-gardening",
    },
    {
        "label": "US Forest Service: Pacific bleeding-heart habitat profile",
        "url": "https://www.fs.usda.gov/managing-land/wildflowers/plant-of-the-week/dicentra-formosa",
    },
    {
        "label": "Washington Native Plant Society directory",
        "url": "https://www.wnps.org/native-plant-directory",
    },
]

COMPANION_METHOD = (
    "Habitat-fit suggestions: shared light and moisture first, then native ecosystem "
    "affinity, canopy layering, and nursery collection overlap. These are regional "
    "plant-community matches—not strict horticultural prescriptions."
)
