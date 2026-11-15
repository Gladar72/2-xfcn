// Сгенерировано из components/brand/Creature.tsx — тот же шейдер Моси, что в мини-аппе.
export const CREATURE_FS = `precision highp float;uniform float t;uniform vec2 r;uniform float V;uniform float blink;uniform vec3 pk;uniform float hue;
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
 vec3 c=pow(s.rgb,vec3(.95));
 if(hue!=0.){float a=hue*.0174533,co=cos(a),si=sin(a);
  mat3 m=mat3(.213+.787*co-.213*si,.213-.213*co+.143*si,.213-.213*co-.787*si,
              .715-.715*co-.715*si,.715+.285*co+.140*si,.715-.715*co+.715*si,
              .072-.072*co+.928*si,.072-.072*co-.283*si,.072+.928*co+.072*si);
  c=clamp(m*c,0.,1.);}
 gl_FragColor=vec4(c*s.a,s.a);}`;
export const CREATURE_VS = `attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
