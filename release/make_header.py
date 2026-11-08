# Builds the 1300x372 mod page header from the in-game map art and real marker positions.
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1300, 372
F = lambda name, size: ImageFont.truetype(os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", name), size)

art = Image.open(os.path.join(ROOT, "data", "maps", "tenement.jpg")).convert("RGB")
PPM = art.width / 200.0                       # pixels per metre on the tenement map
X0, Z1 = -71.2, 94.8                          # world coords of the map's top-left
scale = 0.95
cx_u, cy_v = 1120, 960                       # map pixel at the header's visual centre-right
crop_w, crop_h = W / scale, H / scale
left = cx_u - crop_w * 0.62; top = cy_v - crop_h / 2
bg = art.crop((int(left), int(top), int(left + crop_w), int(top + crop_h))).resize((W, H), Image.LANCZOS)

def to_px(x, z):
    u = (x - X0) * PPM; v = (Z1 - z) * PPM
    return ((u - left) * scale, (v - top) * scale)

db = json.load(open(os.path.join(ROOT, "mod", "ObenseuerLootMap", "lootmap-data.json"), encoding="utf-8"))
marks = ImageDraw.Draw(bg, "RGBA")
random.seed(7)
pts = []
for scene in ("Open Sewer Tenement", "Open Sewer Bazaar", "Interior Tenement Deekula A", "Interior Tenement Kolhola"):
    s = db["scenes"].get(scene)
    if not s: continue
    for p in s["points"]:
        X, Y = to_px(p["x"], p["z"])
        if 520 < X < W - 10 and 10 < Y < H - 10: pts.append((X, Y, p))
    for st in s["stations"]:
        X, Y = to_px(st["x"], st["z"])
        if 520 < X < W - 10 and 10 < Y < H - 10: pts.append((X, Y, {"k": "w"}))
    for v in s["vendors"]:
        X, Y = to_px(v["x"], v["z"])
        if 520 < X < W - 10 and 10 < Y < H - 10: pts.append((X, Y, {"k": "v"}))

ORANGE, TEAL, GREEN, WORK = (217, 142, 4), (31, 122, 140), (61, 220, 90), (47, 93, 58)
SELLS, BUYS, BOTH, RED, PAPER, INK = (61, 139, 255), (255, 122, 47), (180, 92, 255), (200, 30, 24), (240, 234, 220), (36, 29, 20)
def square(x, y, r, fill, edge, w=2):
    marks.rectangle((x - r - w, y - r - w, x + r + w, y + r + w), fill=edge); marks.rectangle((x - r, y - r, x + r, y + r), fill=fill)
def circle(x, y, r, fill, edge, w=2):
    marks.ellipse((x - r - w, y - r - w, x + r + w, y + r + w), fill=edge); marks.ellipse((x - r, y - r, x + r, y + r), fill=fill)

green_spots = []; placed = []
random.shuffle(pts)
pts.sort(key=lambda t: t[2].get("k") != "v")          # shops first so they always show
for i, (x, y, p) in enumerate(pts):
    k = p.get("k")
    if any((x - a) ** 2 + (y - b) ** 2 < 15 ** 2 for a, b in placed): continue
    placed.append((x, y))
    if k == "v":
        circle(x, y, 8, random.choice([SELLS, BUYS, BOTH]), (60, 40, 10))
    elif k == "w":
        square(x, y, 6, WORK, PAPER)
    elif k == "p":
        circle(x, y, 5, TEAL, (255, 255, 255))
    else:
        edge = RED if p.get("s") else PAPER
        if random.random() < 0.07:
            square(x, y, 8, GREEN, edge); green_spots.append((x, y))
        else:
            square(x, y, 5, ORANGE, edge)

# left fade so the title reads well
fade = Image.new("L", (W, H), 0); fd = ImageDraw.Draw(fade)
for x in range(W):
    a = 250 if x < 430 else max(0, int(250 - (x - 430) * 1.25))
    fd.line([(x, 0), (x, H)], fill=a)
dark = Image.new("RGB", (W, H), (20, 18, 16))
img = Image.composite(dark, bg, fade)
d = ImageDraw.Draw(img, "RGBA")

# guide arrow + path to a green container, and a paper tooltip
if green_spots:
    cand = [q for q in green_spots if 700 < q[0] < 960 and 60 < q[1] < H - 60] or green_spots
    gx, gy = cand[0]
    d.ellipse((gx - 16, gy - 16, gx + 16, gy + 16), outline=(242, 165, 31, 255), width=3)
    tx, ty = min(gx + 26, W - 300), max(18, min(gy - 70, H - 150))
    card = (tx, ty, tx + 282, ty + 128)
    d.rectangle((card[0] + 4, card[1] + 5, card[2] + 4, card[3] + 5), fill=(0, 0, 0, 110))
    d.rectangle(card, fill=PAPER + (248,), outline=INK, width=2)
    d.text((tx + 12, ty + 9), "Locker", font=F("courbd.ttf", 21), fill=INK)
    d.line((tx + 13, ty + 47, tx + 17, ty + 52, tx + 25, ty + 41), fill=(31, 138, 58), width=3)
    d.text((tx + 31, ty + 36), "Has it now: Duct Tape", font=F("segoeuib.ttf", 15), fill=(31, 138, 58))
    d.text((tx + 12, ty + 58), "Free to take", font=F("segoeuib.ttf", 14), fill=(63, 107, 47))
    d.text((tx + 12, ty + 79), "Rare: Duct Tape, Lock Pick, Glue\u2026", font=F("segoeui.ttf", 13), fill=INK)
    d.text((tx + 12, ty + 100), "Click to go there \u2192", font=F("segoeui.ttf", 13), fill=(122, 111, 92))

# title block
d.text((44, 52), "O B E N S E U E R", font=F("courbd.ttf", 22), fill=(201, 154, 59))
d.text((40, 82), "LOOT MAP", font=F("courbd.ttf", 84), fill=(240, 228, 205))
d.line((46, 182, 400, 182), fill=(201, 154, 59), width=3)
d.text((46, 196), "Every container, shop & workstation", font=F("segoeuib.ttf", 21), fill=(236, 228, 212))
d.text((46, 224), "on your in-game map.", font=F("segoeuib.ttf", 21), fill=(236, 228, 212))
chips = ["Live contents", "Search", "Guide me there", "Sells / Buys"]
x = 46; y = 278; cf = F("segoeuib.ttf", 14)
for c in chips:
    w = d.textlength(c, font=cf) + 22
    d.rounded_rectangle((x, y, x + w, y + 30), radius=4, fill=(154, 106, 28), outline=(201, 154, 59))
    d.text((x + 11, y + 6), c, font=cf, fill=(255, 246, 225)); x += w + 8
d.text((46, 324), "BepInEx 6 mod  \u00b7  Works on the Map tab", font=F("segoeui.ttf", 14), fill=(163, 152, 131))

# subtle frame like the in-game map window
d.rectangle((0, 0, W - 1, H - 1), outline=(12, 11, 10), width=6)
d.rectangle((6, 6, W - 7, H - 7), outline=(61, 56, 47), width=1)

out = os.path.join(ROOT, "release", "header.jpg")
img.save(out, quality=92, optimize=True)
img.save(os.path.join(ROOT, "release", "header.png"), optimize=True)
print(out, img.size, os.path.getsize(out) // 1024, "KB")
