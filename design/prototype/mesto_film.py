# «Место» film look, tuned to the running set: edge motion, haze, lifted blacks, warm film tone, grain
import numpy as np
from PIL import Image, ImageFilter
from mesto_filter import motion
def film(im, seed=5, mot=.8, haze=.30, grain=.075):
    im = im.convert('RGB'); w, h = im.size; a = np.asarray(im).astype(np.float32)/255
    m = np.asarray(motion(im, max(13, w//20))).astype(np.float32)/255
    yy, xx = np.mgrid[0:h, 0:w]; r = np.sqrt(((xx-w*.5)/(w*.5))**2 + ((yy-h*.5)/(h*.55))**2)
    wm = np.clip((r-.30)/.7, 0, 1)[..., None]*mot
    a = a*(1-wm) + m*wm
    bl = np.asarray(Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(w/32))).astype(np.float32)/255
    a = 1-(1-a)*(1-bl*haze)
    a = .065 + a*.91
    a = a + .14*(a-.5)*(1-np.abs(a-.5)*2)
    lum = (a*[.299, .587, .114]).sum(2, keepdims=True)
    a = a + (lum-.5).clip(0)*np.array([.07, .03, -.04]) + (.5-lum).clip(0)*np.array([-.02, .0, .05])
    a = lum + (a-lum)*1.12
    rng = np.random.default_rng(seed); g = rng.normal(0, 1, (h, w, 1))
    g = np.asarray(Image.fromarray(((g*40)+128).clip(0, 255).astype(np.uint8)[..., 0]).filter(ImageFilter.GaussianBlur(.55))).astype(np.float32)[..., None]/255-.5
    a = a + g*grain*2.2
    return Image.fromarray((a.clip(0, 1)*255).astype(np.uint8))
def to34(im, maxw=900):
    w, h = im.size; tw = min(w, int(h*.75)); th = int(tw/.75)
    if th > h: th = h; tw = int(h*.75)
    l = (w-tw)//2; t = (h-th)//2; im = im.crop((l, t, l+tw, t+th))
    if im.width > maxw: im = im.resize((maxw, int(maxw/.75)), Image.LANCZOS)
    return im
