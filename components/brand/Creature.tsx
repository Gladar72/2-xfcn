"use client";

import { useEffect, useRef } from "react";

/**
 * Мося-«капля» из брендбука 2026: живое переливающееся существо (WebGL).
 * Один общий WebGL-рендерер на всё приложение рисует кадр и копирует его во
 * все видимые <canvas> — так сколько бы капель ни было на экране, контекст
 * WebGL один. Без WebGL, при «уменьшении движения» или на слабом телефоне —
 * показываем готовую картинку (public/brand/creature/*.webp).
 *
 * variant: "p" — без глаз (кнопка «+» в меню), "e" — с глазками (подсказки).
 */
type Variant = "p" | "e";

const FS = `precision highp float;uniform float t;uniform vec2 r;uniform float V;uniform float blink;uniform vec3 pk;
float h(vec3 p){p=fract(p*.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
mat2 R(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
const float TAU=6.2831853;
float sdf(vec3 p){
 p.xz*=R(t*TAU/6.);p.xy*=R(sin(t*TAU/6.)*.22);
 float d=length(p)-1.0;
 d-=.19*sin(p.x*3.+t*TAU/6.)*sin(p.y*3.2+t*TAU/3.)*sin(p.z*2.8+t*TAU/3.);
 d-=.05*sin(p.y*5.+p.x*2.+t*TAU/2.);
 d-=.04*sin(t*TAU/2.);
 return d*.45;}
vec3 nor(vec3 p){vec2 e=vec2(.0015,0);return normalize(vec3(sdf(p+e.xyy)-sdf(p-e.xyy),sdf(p+e.yxy)-sdf(p-e.yxy),sdf(p+e.yyx)-sdf(p-e.yyx)));}
vec4 shade(vec2 uv){
 vec3 ro=vec3(0,0,4.4),rd=normalize(vec3(uv,-1.35));
 float d=0.;bool hit=false;vec3 p;
 for(int i=0;i<90;i++){p=ro+rd*d;float s=sdf(p);if(s<.0007){hit=true;break;}d+=s;if(d>8.)break;}
 if(!hit) return vec4(0.);
 vec3 N=nor(p);
 float cs=max(dot(N,-rd),0.);float fr=pow(1.-cs,2.);
 vec3 rr=refract(rd,N,1./1.33);vec3 q=p-N*.01;float th=0.;
 for(int i=0;i<18;i++){float s=sdf(q);if(s>0.)break;float st=max(-s,.02);q+=rr*st;th+=st;}
 float y=N.y*.5+.5;
 vec3 pink=pk,lil=vec3(.80,.62,1.),cy=vec3(.40,.98,1.);
 vec3 body=mix(pink,lil,smoothstep(.45,.9,y));
 body=mix(body,cy,smoothstep(.35,.05,y)*.8);
 body=mix(body,vec3(.62,.35,1.),.35*n(p*2.5+t*.4));
 float trans=exp(-th*1.1);
 vec3 ir=.5+.5*cos(TAU*(fr*1.2+n(p*1.7)*.45+vec3(0.,.33,.67)+t/6.));
 vec3 L=normalize(vec3(-.5,.8,.6));
 float dif=max(dot(N,L),0.)*.5+.5;
 vec3 col=body*dif*(1.-trans*.55);
 col+=ir*(fr*.7+.08);
 col+=cy*pow(fr,1.5)*smoothstep(.7,.1,y)*1.1;
 col+=vec3(1.,.85,1.)*pow(fr,3.)*.5;
 vec3 H=normalize(L-rd);col+=vec3(1)*pow(max(dot(N,H),0.),90.)*1.2;
 col+=vec3(1)*pow(max(dot(N,normalize(normalize(vec3(.7,.2,.8))-rd)),0.),40.)*.35;
 col+=pink*.25*pow(1.-trans,2.)*(1.-fr);
 float a=clamp(.42+.58*fr+(1.-trans)*.35,0.,1.);
 if(V==1.){
  vec2 o=vec2(0.,.035+.012*sin(t*TAU/2.));
  vec2 e1=uv-vec2(-.10,0.)-o,e2=uv-vec2(.10,0.)-o;
  float bh=mix(.05,.005,blink);
  float k=min(length(e1/vec2(.038,bh)),length(e2/vec2(.038,bh)));
  float aa=1.5/r.y/.04;
  float eye=1.-smoothstep(1.-aa,1.+aa,k);
  col=mix(col,vec3(.07,.02,.14),eye*.95);a=mix(a,1.,eye);
  vec2 g=vec2(.011,.018);
  float k2=min(length((e1-g)/vec2(.013,.013*bh/.05)),length((e2-g)/vec2(.013,.013*bh/.05)));
  col+=vec3(1)*(1.-smoothstep(.8,1.1,k2))*eye*(1.-blink);
  float ch=exp(-90.*(pow(abs(uv.x)-.19,2.)+pow(uv.y+.045,2.)));
  col+=vec3(1.,.35,.65)*ch*.3;
 }
 return vec4(col,a);}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;
 vec4 s=shade(uv);
 gl_FragColor=vec4(pow(s.rgb,vec3(.95))*s.a,s.a);}`;
const VS = `attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`;

const FALLBACK: Record<Variant, string> = { p: "/brand/creature/blobw.webp", e: "/brand/creature/blobe.webp" };

type Entry = { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; v: Variant };

const entries = new Set<Entry>();
let gl: WebGLRenderingContext | null = null;
let glCanvas: HTMLCanvasElement | null = null;
type Uniforms = { t: WebGLUniformLocation | null; r: WebGLUniformLocation | null; V: WebGLUniformLocation | null; blink: WebGLUniformLocation | null; pk: WebGLUniformLocation | null };
let U: Uniforms = { t: null, r: null, V: null, blink: null, pk: null };
let state: "idle" | "running" | "paused" | "static" = "idle";
let size = 0;
let raf = 0;
let last = 0;
let slow = 0;
const t0 = typeof performance !== "undefined" ? performance.now() : 0;
const images: Partial<Record<Variant, HTMLImageElement>> = {};

function drawStatic(e: Entry) {
  const src = FALLBACK[e.v];
  let im = images[e.v];
  if (!im) {
    im = new Image();
    im.src = src;
    images[e.v] = im;
  }
  const paint = () => {
    e.ctx.clearRect(0, 0, e.c.width, e.c.height);
    e.ctx.drawImage(im!, 0, 0, e.c.width, e.c.height);
  };
  if (im.complete && im.naturalWidth) paint();
  else im.addEventListener("load", paint, { once: true });
}

function goStatic() {
  state = "static";
  cancelAnimationFrame(raf);
  entries.forEach(drawStatic);
}

function initGL(): boolean {
  try {
    glCanvas = document.createElement("canvas");
    gl = glCanvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    const sh = (type: number, src: string) => {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const l = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    const loc = (k: string) => gl!.getUniformLocation(pr, k);
    U = { t: loc("t"), r: loc("r"), V: loc("V"), blink: loc("blink"), pk: loc("pk") };
    gl.uniform3f(U.pk, 0.62, 0.58, 1);
    return true;
  } catch {
    gl = null;
    return false;
  }
}

function resizeGL(px: number) {
  if (!gl || !glCanvas || px <= size) return;
  size = Math.min(px, 420);
  glCanvas.width = glCanvas.height = size;
  gl.viewport(0, 0, size, size);
  gl.uniform2f(U.r, size, size);
}

function visible(c: HTMLCanvasElement) {
  if (!c.isConnected) return false;
  const r = c.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return false;
  return !c.closest(".hide");
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (document.hidden || now - last < 40) return;
  last = now;
  const t = (now - t0) / 1000;
  const start = performance.now();
  for (const v of ["e", "p"] as Variant[]) {
    const vis = [...entries].filter((e) => e.v === v && visible(e.c));
    if (!vis.length || !gl) continue;
    const ph = t % 3;
    const bl = ph > 2.72 ? Math.sin(((ph - 2.72) / 0.28) * Math.PI) : 0;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.t, t + (v === "p" ? 1.7 : 0));
    gl.uniform1f(U.V, v === "e" ? 1 : 0);
    gl.uniform1f(U.blink, bl);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    vis.forEach((e) => {
      e.ctx.clearRect(0, 0, e.c.width, e.c.height);
      e.ctx.drawImage(glCanvas!, 0, 0, e.c.width, e.c.height);
    });
  }
  // Слабый телефон (кадр дольше ~35 мс несколько раз подряд) — переходим на картинку.
  slow = performance.now() - start > 35 ? slow + 1 : 0;
  if (slow >= 8) goStatic();
}

function register(e: Entry) {
  entries.add(e);
  if (state === "idle") {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !initGL()) {
      state = "static";
    } else {
      state = "running";
      raf = requestAnimationFrame(frame);
    }
  }
  if (state === "paused") {
    state = "running";
    raf = requestAnimationFrame(frame);
  }
  if (state === "static") drawStatic(e);
  else resizeGL(e.c.width);
}

function unregister(e: Entry) {
  entries.delete(e);
  // Капель на экране не осталось — останавливаем анимацию, контекст WebGL
  // оставляем: следующая капля подхватит его без повторной компиляции.
  if (!entries.size && state === "running") {
    cancelAnimationFrame(raf);
    state = "paused";
  }
}

export function Creature({ size: cssSize, variant = "p", className }: { size: number; variant?: Variant; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    c.width = c.height = Math.round(cssSize * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const e: Entry = { c, ctx, v: variant };
    register(e);
    return () => unregister(e);
  }, [cssSize, variant]);
  return <canvas ref={ref} className={className} style={{ width: cssSize, height: cssSize }} aria-hidden />;
}
