# -*- coding: utf-8 -*-
"""Rapports de contraste WCAG des paires de couleurs du système NIVEX."""

def lum(hexstr):
    h = hexstr.lstrip("#")
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)

def blend(fg, bg, alpha):
    """Couleur effective d'un texte semi-transparent sur son fond."""
    f = lambda s: [int(s.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)]
    a, b = f(fg), f(bg)
    return "#%02X%02X%02X" % tuple(round(alpha * x + (1 - alpha) * y) for x, y in zip(a, b))

LINEN_50, LINEN_100, LINEN_200 = "#FEFDFB", "#FBF8F2", "#F5F0E6"
INK_400, INK_500, INK_600, INK_700, INK_800, INK_900 = "#8A8378", "#6B6459", "#4A443B", "#2F2A23", "#1F1B16", "#14110D"
GOLD_400, GOLD_500, GOLD_600, GOLD_700 = "#C4A76A", "#A7864B", "#866836", "#7A5E31"
LINEN_300 = "#ECE4D5"
CONTROL = "#9E7F47"   # bordure des champs de formulaire

pairs = [
    ("corps de texte (ink-500 / linen-100)",        INK_500,  LINEN_100, 4.5),
    ("corps de texte (ink-500 / linen-50)",         INK_500,  LINEN_50,  4.5),
    ("titres (ink-800 / linen-100)",                INK_800,  LINEN_100, 4.5),
    ("surtitre or (gold-600 / linen-100)",          GOLD_600, LINEN_100, 4.5),
    ("surtitre or (gold-600 / linen-50)",           GOLD_600, LINEN_50,  4.5),
    ("détail or (gold-600 / linen-50)",             GOLD_600, LINEN_50,  4.5),
    ("encadré offre (gold-700 / linen-100)",        GOLD_700, LINEN_100, 4.5),
    ("texte secondaire (ink-400 / linen-100)",      INK_400,  LINEN_100, 3.0),
    ("bouton sombre (linen-100 / ink-800)",         LINEN_100, INK_800,  4.5),
    ("section sombre : titre (linen-100 / ink-900)", LINEN_100, INK_900, 4.5),
    ("section sombre : corps 65 % (linen-300 / ink-900)",
        blend(LINEN_300, INK_900, 0.65), INK_900, 4.5),
    ("section sombre : lede 70 % (linen-300 / ink-900)",
        blend(LINEN_300, INK_900, 0.70), INK_900, 4.5),
    ("pied de page : liens (gold-400 / ink-900)",   GOLD_400, INK_900,  4.5),
    ("pied de page : corps 85 % (linen-300 / ink-900)",
        blend(LINEN_300, INK_900, 0.85), INK_900, 4.5),
    ("pied de page : mentions 45 % (linen-300 / ink-900)",
        blend(LINEN_300, INK_900, 0.45), INK_900, 3.0),
    ("protocole : surtitre (gold-400 / ink-900)",   GOLD_400, INK_900,  4.5),
    ("surtitre or sur lin-200 (gold-600 / linen-200)", GOLD_600, LINEN_200, 4.5),
    ("corps sur lin-200 (ink-500 / linen-200)",     INK_500,  LINEN_200, 4.5),
    ("pages légales : corps (ink-600 / linen-100)", INK_600,  LINEN_100, 4.5),
    ("pages légales : sommaire (ink-600 / linen-200)", INK_600, LINEN_200, 4.5),
    # Éléments graphiques : seuil non textuel de 3:1
    ("icônes (gold-500 / linen-50)",                GOLD_500, LINEN_50,  3.0),
    ("icônes (gold-500 / linen-100)",               GOLD_500, LINEN_100, 3.0),
    ("bordure de champ (control / linen-50)",       CONTROL,  LINEN_50,  3.0),
    ("bordure de champ (control / linen-100)",      CONTROL,  LINEN_100, 3.0),
    ("bouton doré : texte (blanc / gold-600)",      "#FFFFFF", GOLD_600, 4.5),
    ("bouton doré survolé (blanc / gold-700)",      "#FFFFFF", GOLD_700, 4.5),
    ("case à cocher / radio (gold-500 / linen-50)", GOLD_500, LINEN_50,  3.0),
]

fails = 0
for name, fg, bg, need in pairs:
    r = ratio(fg, bg)
    ok = r >= need
    fails += 0 if ok else 1
    print(f"  {'✓' if ok else '✗'} {r:5.2f}:1  (min {need})  {name}")

print(f"\n{len(pairs)-fails}/{len(pairs)} paires conformes AA")
raise SystemExit(1 if fails else 0)
