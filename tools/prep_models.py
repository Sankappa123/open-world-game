"""Copies the CC0 Quaternius character + animation files into public/models,
shrinks textures and repaints the painted-on underwear as fur clothing."""
import json, os, shutil, random
from PIL import Image
SRC = '_assets_src/chars/Universal Base Characters[Standard]'
BODY = f'{SRC}/Base Characters/Godot - UE'
TEX = f'{SRC}/Base Characters/Textures'
GLN = f'{TEX}/Normals Unity - Godot'
HAIR = f'{SRC}/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)'
OUT = 'public/models'
os.makedirs(OUT, exist_ok=True)
random.seed(4)

def fur(img):
    img = img.convert('RGB'); px = img.load(); w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) < 165 and max(r, g, b) - min(r, g, b) < 24:
                n = random.random() * 0.5 + (0.25 if (x * 3 + y // 5) % 7 < 3 else 0)
                k = 0.62 + n * 0.5 + min(60, max(r, g, b) - 50) / 300
                px[x, y] = (int(70 * k), int(54 * k), int(40 * k)) if n > 0.2 else (int(150 * k), int(128 * k), int(98 * k))
    return img

def tex(src, name, size, repaint=False):
    dst = f'{OUT}/{name}'
    if os.path.exists(dst): return name
    im = Image.open(src)
    im = im.resize((size, size), Image.LANCZOS)
    if repaint: im = fur(im)
    if name.endswith('.jpg'): im.convert('RGB').save(dst, quality=88)
    else: im.save(dst)
    return name

def find(uri):
    base = uri.replace('_png.png', '.png')
    for d in ([GLN] if 'Normal' in base else []) + [BODY, TEX, HAIR]:
        if os.path.exists(f'{d}/{base}'): return f'{d}/{base}', base
    raise SystemExit('missing ' + uri)

def gltf(src_dir, name, out):
    j = json.load(open(f'{src_dir}/{name}.gltf'))
    for im in j['images']:
        src, base = find(im['uri'])
        skin = 'Superhero' in base and 'Normal' not in base and 'Roughness' not in base
        size = 256 if 'Eye' in base else 512 if 'Hair' in base else 1024
        ext = '.png' if 'Eye' in base else '.jpg'
        im['uri'] = tex(src, base.replace('.png', ext).lower(), size, skin)
    for b in j['buffers']:
        shutil.copy(f"{src_dir}/{b['uri']}", f'{OUT}/{out}.bin'); b['uri'] = f'{out}.bin'
    json.dump(j, open(f'{OUT}/{out}.gltf', 'w'))

gltf(BODY, 'Superhero_Male_FullBody', 'male')
gltf(BODY, 'Superhero_Female_FullBody', 'female')
for n in ['Hair_SimpleParted', 'Hair_Beard', 'Hair_Long', 'Hair_Buns', 'Hair_Buzzed']:
    gltf(HAIR, n, n.lower())
tex(f'{TEX}/T_Superhero_Male_Ligh.png', 'male_light.jpg', 1024, True)
tex(f'{TEX}/T_Superhero_Female_Light_BaseColor.png', 'female_light.jpg', 1024, True)
shutil.copy('_assets_src/anim/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb', f'{OUT}/anims.glb')
open(f'{OUT}/CREDITS.txt', 'w').write('Character models, hair and animations by Quaternius (quaternius.com), CC0 1.0 Public Domain.\nUniversal Base Characters + Universal Animation Library.\n')

# ---------- nature (Quaternius Stylized Nature MegaKit, CC0) and animals (Ultimate Animated Animals, CC0) ----------
NAT = '_assets_src/nature/glTF'
os.makedirs(f'{OUT}/nature', exist_ok=True)
os.makedirs(f'{OUT}/animals', exist_ok=True)
NATURE = ['CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_2', 'Pine_4', 'Pine_5', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
          'Pebble_Round_1', 'Pebble_Round_3', 'Bush_Common', 'Grass_Common_Short', 'Grass_Wispy_Short', 'Flower_3_Single', 'Flower_4_Single',
          'Fern_1', 'Clover_1', 'Plant_1', 'Plant_7_Big', 'Mushroom_Common']
for n in NATURE:
    j = json.load(open(f'{NAT}/{n}.gltf'))
    for im in j.get('images', []):
        base = im['uri']; opaque = base.startswith('Bark') or base.startswith('Rocks') or base.startswith('PathRocks')
        name = base.replace('.png', '.jpg' if opaque else '.png').lower()
        dst = f'{OUT}/nature/{name}'
        if not os.path.exists(dst):
            img = Image.open(f'{NAT}/{base}')
            if max(img.size) > 1024: img = img.resize((1024, 1024), Image.LANCZOS)
            img.convert('RGB').save(dst, quality=88) if opaque else img.save(dst)
        im['uri'] = name
        if 'mimeType' in im: im['mimeType'] = 'image/jpeg' if opaque else 'image/png'
    for b in j['buffers']:
        shutil.copy(f"{NAT}/{b['uri']}", f'{OUT}/nature/{n.lower()}.bin'); b['uri'] = f'{n.lower()}.bin'
    json.dump(j, open(f'{OUT}/nature/{n.lower()}.gltf', 'w'))
for a in ['Deer', 'Stag', 'Wolf', 'Fox', 'Cow']:
    shutil.copy(f'_assets_src/animals/{a}.gltf', f'{OUT}/animals/{a.lower()}.gltf')
open(f'{OUT}/CREDITS.txt', 'w').write('All models by Quaternius (quaternius.com), CC0 1.0 Public Domain:\nUniversal Base Characters, Universal Animation Library, Stylized Nature MegaKit, Ultimate Animated Animals.\n')
