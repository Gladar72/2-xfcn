# «Место» photo style: motion feel, soft haze, lifted blacks, warm film tone, fine grain
import sys, numpy as np
from PIL import Image, ImageFilter
def motion(im, k=23):
    a = np.asarray(im).astype(np.float32); out = np.zeros_like(a)
    for s in range(-(k//2), k//2+1): out += np.roll(a, s, axis=1)
    return Image.fromarray((out/k).clip(0,255).astype(np.uint8))
def mesto(im, seed=1):
    im = im.convert('RGB'); w, h = im.size
    a = np.asarray(im).astype(np.float32)/255
    m = np.asarray(motion(im, max(9, w//40))).astype(np.float32)/255
    # keep the centre sharper, motion towards the edges
    yy, xx = np.mgrid[0:h, 0:w]; r = np.sqrt(((xx-w/2)/(w/2))**2 + ((yy-h/2)/(h/2))**2)
    wm = np.clip((r-.35)/.8, 0, 1)[..., None]*.75
    a = a*(1-wm) + m*wm
    # haze / bloom
    bl = np.asarray(Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(w/45))).astype(np.float32)/255
    a = 1-(1-a)*(1-bl*.22)
    # tone: lifted blacks, soft S, warm highlights, cool shadows
    a = .06 + a*.92
    a = a + .10*(a-.5)*(1-np.abs(a-.5)*2)
    lum = (a*[.299,.587,.114]).sum(2, keepdims=True)
    a = a + (lum-.5).clip(0)*np.array([.06,.02,-.04]) + (.5-lum).clip(0)*np.array([-.03,.0,.04])
    # gentle saturation boost
    a = lum + (a-lum)*1.12
    # grain
    rng = np.random.default_rng(seed); g = rng.normal(0, .045, (h, w, 1))
    g = np.asarray(Image.fromarray(((g+.5)*255).clip(0,255).astype(np.uint8)[...,0]).filter(ImageFilter.GaussianBlur(.6))).astype(np.float32)[...,None]/255-.5
    a = a + g*.9
    return Image.fromarray((a.clip(0,1)*255).astype(np.uint8))
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    mesto(Image.open(src)).save(dst, 'WEBP', quality=90, method=6)
