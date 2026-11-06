(function(){
const FS=`precision highp float;uniform float t;uniform vec2 r;uniform float V;uniform float blink;uniform vec3 pk;uniform float sq;uniform float NG;
float h(vec3 p){p=fract(p*.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
mat2 R(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
const float TAU=6.2831853;
float sdf(vec3 p){
 p.y/=sq;p.xz*=sqrt(sq);
 p.xz*=R(t*TAU/6.);p.xy*=R(sin(t*TAU/6.)*.22);
 float d=length(p)-1.0;
 float amp=V==2.?.11:.19;
 d-=amp*sin(p.x*3.+t*TAU/6.)*sin(p.y*3.2+t*TAU/3.)*sin(p.z*2.8+t*TAU/3.);
 d-=.05*sin(p.y*5.+p.x*2.+t*TAU/2.);
 d-=.04*sin(t*TAU/2.);
 return d*.45;}
vec3 nor(vec3 p){vec2 e=vec2(.0015,0);return normalize(vec3(sdf(p+e.xyy)-sdf(p-e.xyy),sdf(p+e.yxy)-sdf(p-e.yxy),sdf(p+e.yyx)-sdf(p-e.yyx)));}
vec4 shade(vec2 uv){
 vec3 ro=vec3(0,0,4.4),rd=normalize(vec3(uv,-1.35));
 float d=0.;bool hit=false;vec3 p;
 for(int i=0;i<110;i++){p=ro+rd*d;float s=sdf(p);if(s<.0005){hit=true;break;}d+=s;if(d>8.)break;}
 float gl=exp(-4.*max(length(uv)-.30,0.));
 float ga=NG>0.?0.:V==2.?.7:.25;vec4 bg=vec4(vec3(.55,.3,1.)*gl*ga, gl*ga);
 if(!hit) return bg;
 vec3 N=nor(p);
 float cs=max(dot(N,-rd),0.);float fr=pow(1.-cs,2.);
 // thickness: march inside along refracted ray
 vec3 rr=refract(rd,N,1./1.33);vec3 q=p-N*.01;float th=0.;
 for(int i=0;i<22;i++){float s=sdf(q);if(s>0.)break;float st=max(-s,.02);q+=rr*st;th+=st;}
 float y=N.y*.5+.5;
 vec3 pink=pk,lil=vec3(.80,.62,1.),cy=vec3(.40,.98,1.);
 vec3 body=mix(pink,lil,smoothstep(.45,.9,y));
 body=mix(body,cy,smoothstep(.35,.05,y)*.8);
 body=mix(body,vec3(.62,.35,1.),.35*n(p*2.5+t*.4));
 float trans=exp(-th*1.1);
 // thin-film iridescence
 vec3 ir=.5+.5*cos(TAU*(fr*1.2+n(p*1.7)*.45+vec3(0.,.33,.67)+t/6.));
 vec3 L=normalize(vec3(-.5,.8,.6));
 float dif=max(dot(N,L),0.)*.5+.5;
 vec3 col=body*dif*(1.-trans*.55);
 col+=ir*(fr*.7+.08);
 col+=cy*pow(fr,1.5)*smoothstep(.7,.1,y)*1.1;
 col+=vec3(1.,.85,1.)*pow(fr,3.)*.5;
 vec3 H=normalize(L-rd);col+=vec3(1)*pow(max(dot(N,H),0.),90.)*1.2;
 col+=vec3(1)*pow(max(dot(N,normalize(normalize(vec3(.7,.2,.8))-rd)),0.),40.)*.35;
 // caustic glow inside
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
 col=mix(bg.rgb,col,a);
 return vec4(col,max(a,bg.a));}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;
 vec4 s=shade(uv);
 gl_FragColor=vec4(pow(s.rgb,vec3(.95))*s.a,s.a);}`;
const VS=`attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
const S=560;const gc=document.createElement('canvas');gc.width=gc.height=S;
let gl=null;try{gl=gc.getContext('webgl',{premultipliedAlpha:true,alpha:true,antialias:false,preserveDrawingBuffer:true});}catch(e){}
const cvs=[...document.querySelectorAll('canvas.cr')];
const fallback={e:'a/blobe.webp',p:'a/blobw.webp'};
function useFallback(){cvs.forEach(c=>{const im=new Image();im.src=fallback[c.dataset.v];im.onload=()=>{const x=c.getContext('2d');x.drawImage(im,0,0,c.width,c.height)};});}
if(!gl){useFallback();return;}
function sh(t,s){const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x));return x;}
let pr;try{pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);}catch(e){console.warn(e);useFallback();return;}
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const l=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,2,gl.FLOAT,false,0,0);
const U={};['t','r','V','blink','pk','sq','NG'].forEach(k=>U[k]=gl.getUniformLocation(pr,k));
gl.viewport(0,0,S,S);gl.uniform2f(U.r,S,S);gl.uniform3f(U.pk,.62,.58,1);gl.uniform1f(U.sq,1);gl.uniform1f(U.NG,1);
const DPR=Math.min(3,Math.max(2,devicePixelRatio||1));cvs.forEach(c=>{const w=c.getBoundingClientRect().width||parseFloat(getComputedStyle(c).width)||c.width/2;if(w>0){const px=Math.round(w*DPR);if(px>c.width){c.width=c.height=px}}});const ctx=new Map(cvs.map(c=>{const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';return[c,x]}));
function visible(c){if(!c.offsetParent&&c.closest('.nav')==null)return false;const s=c.closest('section.scr');if(s&&s.hidden)return false;const n=c.closest('.nav');if(n&&n.classList.contains('hide'))return false;const r=c.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0;}
let last=0;const t0=performance.now();
function frame(now){requestAnimationFrame(frame);if(document.hidden||now-last<33)return;last=now;
 const t=(now-t0)/1000;const vis={e:[],p:[]};cvs.forEach(c=>{if(visible(c))vis[c.dataset.v].push(c)});
 for(const v of ['e','p']){if(!vis[v].length)continue;
  const ph=t%3;const bl=ph>2.72?Math.sin((ph-2.72)/.28*Math.PI):0;
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(U.t,t+(v==='p'?1.7:0));gl.uniform1f(U.V,v==='e'?1:0);gl.uniform1f(U.blink,bl);gl.drawArrays(gl.TRIANGLES,0,3);
  vis[v].forEach(c=>{if(!c._sz){const w=c.offsetWidth;if(w){c._sz=1;const px=Math.round(w*DPR);if(px>c.width){c.width=c.height=px;const q=c.getContext('2d');q.imageSmoothingEnabled=true;q.imageSmoothingQuality='high'}}}const x=ctx.get(c);x.clearRect(0,0,c.width,c.height);x.drawImage(gc,0,0,c.width,c.height)});}
}
requestAnimationFrame(frame);
})();