"""Draws the installer window background (desktop/dmg/background.png). Run: python3 scripts/make-dmg-background.py"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H, S = 660, 440, 2  # window size in points, drawn at 2x for sharp text on retina
img = Image.new('RGB', (W * S, H * S), '#ffffff')
d = ImageDraw.Draw(img)
FONT = '/System/Library/Fonts/Helvetica.ttc'
def font(size, bold=False):
    return ImageFont.truetype(FONT, size * S, index=1 if bold else 0)

def text_c(y, s, f, fill):
    w = d.textlength(s, font=f)
    d.text(((W * S - w) / 2, y * S), s, font=f, fill=fill)

# soft header tint
d.rectangle([0, 0, W * S, 96 * S], fill='#eff6ff')
text_c(30, 'Drag SendSafe into Applications', font(22, True), '#0f172a')
text_c(62, 'Then open it from your Applications folder', font(13), '#64748b')

# arrow between the two icons (the icons themselves are placed by the installer at y=190)
ax0, ax1, ay = 262 * S, 398 * S, 190 * S
d.line([ax0, ay, ax1 - 14 * S, ay], fill='#2563eb', width=4 * S)
d.polygon([(ax1, ay), (ax1 - 18 * S, ay - 11 * S), (ax1 - 18 * S, ay + 11 * S)], fill='#2563eb')

# help panel
px0, py0, px1, py1 = 40 * S, 318 * S, (W - 40) * S, 412 * S
d.rounded_rectangle([px0, py0, px1, py1], radius=14 * S, fill='#f1f5f9')
d.text((px0 + 20 * S, py0 + 14 * S), 'If macOS says it cannot verify SendSafe', font=font(13, True), fill='#0f172a')
lines = ['1. Click Done (not Move to Trash).',
         '2. Open System Settings, then Privacy & Security.',
         '3. Scroll down and click Open Anyway next to SendSafe.']
for i, ln in enumerate(lines):
    d.text((px0 + 20 * S, py0 + (38 + i * 18) * S), ln, font=font(12), fill='#475569')

os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'dmg'), exist_ok=True)
img.save(os.path.join(os.path.dirname(__file__), '..', 'dmg', 'background.png'))
print('ok')
