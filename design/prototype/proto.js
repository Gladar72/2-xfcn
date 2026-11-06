(function(){
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const wrap=$('#wrap'),nav=$('#nav'),sbar=$('#sbar'),hbar=$('#hbar');
const scr=id=>$(`section.scr[data-id="${id}"]`);
let stack=['intro'],busy=false;

/* ---------- screens ---------- */
function decorate(id){
  const dark=DARK.includes(id);sbar.classList.toggle('w',dark);hbar.classList.toggle('w',id==='event');
  const tab=id in TABS;nav.classList.toggle('hide',!tab);
  $$('.nav .it').forEach(b=>b.classList.toggle('on',b.dataset.tab===id));
  $$('#flow button').forEach(b=>b.classList.toggle('cur',b.dataset.jump===id));
  if(id==='deck')buildDeck();
  if(id==='intro')startIntro();else stopIntro();
}
function anim(el,cls){return new Promise(res=>{el.classList.add(cls);const f=()=>{el.classList.remove(cls);el.removeEventListener('animationend',f);res()};el.addEventListener('animationend',f);setTimeout(f,700)});}
async function show(id,mode,cur){
  if(busy)return;if(cur===id)return;
  const a=scr(cur),b=scr(id);if(!b)return;busy=true;b.hidden=false;b.style.zIndex=4;a.style.zIndex=3;
  const sc=b.querySelector('.scroll');if(sc&&mode!=='back')sc.scrollTop=0;
  decorate(id);
  let p=[];
  if(mode==='push'){p=[anim(b,'enter-r'),anim(a,'leave-l')];}
  else if(mode==='back'){b.style.zIndex=3;a.style.zIndex=4;p=[anim(b,'enter-l'),anim(a,'leave-r')];}
  else if(mode==='sheet'){p=[anim(b,'enter-up'),anim(a,'under')];}
  else if(mode==='unsheet'){b.style.zIndex=3;a.style.zIndex=4;p=[anim(b,'over'),anim(a,'leave-down')];}
  else{p=[anim(b,'enter-f')];}
  await Promise.all(p);if(a!==b)a.hidden=true;a.style.zIndex='';b.style.zIndex='';busy=false;if(pend){const n=pend;pend=null;go(n)}
}
const SHEETS=['create'];
let pend=null;function go(id){if(busy){pend=id;return}if(id==='create'&&window.__createReset&&!window.__keepKind)window.__createReset();window.__keepKind=false;const cur=stack[stack.length-1];if(cur===id)return;const mode=SHEETS.includes(id)?'sheet':'push';stack.push(id);show(id,mode,cur)}
function back(){if(busy||stack.length<2)return;const cur=stack.pop();const prev=stack[stack.length-1];show(prev,SHEETS.includes(cur)?'unsheet':'back',cur)}
function tab(id){stack=[id];const cur=$$('section.scr').find(s=>!s.hidden);if(cur&&cur.dataset.id===id)return;
  if(!cur){scr(id).hidden=false;decorate(id);return}
  busy=false;const a=cur,b=scr(id);b.hidden=false;b.style.zIndex=4;decorate(id);const sc=b.querySelector('.scroll');if(sc)sc.scrollTop=0;
  anim(b,'enter-f').then(()=>{a.hidden=true;b.style.zIndex=''});}
function jump(id){$$('section.scr').forEach(s=>s.hidden=true);stack=id in TABS?[id]:['home',id];if(['intro','auth','reg1','reg2','reg3'].includes(id))stack=[id];scr(id).hidden=false;decorate(id);closeOv();}
window.__jump=jump;

/* ---------- press effects ---------- */
document.addEventListener('pointerdown',e=>{const el=e.target.closest('.pr');if(!el)return;el.classList.add('down');
  const r=el.getBoundingClientRect(),s=el.offsetWidth/r.width||1;const g=document.createElement('span');g.className='glow';g.style.left=(e.clientX-r.left)*s+'px';g.style.top=(e.clientY-r.top)*s+'px';el.appendChild(g);setTimeout(()=>g.remove(),650);});
const up=()=>$$('.pr.down').forEach(x=>x.classList.remove('down'));
document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);document.addEventListener('pointerleave',up);

/* ---------- toast / overlays ---------- */
let tt;function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('show'),1900)}
function openOv(id){const o=$('#'+id);o.classList.add('show')}
function closeOv(){$$('.ov.show').forEach(o=>o.classList.remove('show'))}

/* ---------- hearts ---------- */
const HP='M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z';const HC=['#FF7FB0','#B58CFF','#FF4F9A','#8CAAFF','#FFB3CF'];
function burst(x,y,n=14,host=wrap){const hr=host.getBoundingClientRect(),s=host.offsetWidth/hr.width||1;
  for(let i=0;i<n;i++){const h=document.createElementNS('http://www.w3.org/2000/svg','svg');h.setAttribute('viewBox','0 0 24 24');h.classList.add('heart');h.innerHTML=`<path d="${HP}" fill="${HC[i%5]}"/>`;
    h.style.left=((x-hr.left)*s-12)+'px';h.style.top=((y-hr.top)*s-12)+'px';h.style.position='absolute';(host===wrap?wrap:host).appendChild(h);
    const a=Math.random()*Math.PI*2,d=50+Math.random()*90,sc=.5+Math.random();
    h.animate([{transform:'translate(0,0) scale(.2)',opacity:1},{transform:`translate(${Math.cos(a)*d}px,${Math.sin(a)*d-40}px) scale(${sc}) rotate(${(Math.random()-.5)*60}deg)`,opacity:0}],{duration:900+Math.random()*500,easing:'cubic-bezier(.2,.8,.3,1)'}).onfinish=()=>h.remove();}}
function confetti(){const cols=['#2F56E8','#FF6FB0','#FF7A3A','#AAA0FF','#8CAAFF','#FFC3A8'];for(let i=0;i<40;i++){const c=document.createElement('i');c.className='confetti';c.style.background=cols[i%6];c.style.left=(20+Math.random()*350)+'px';c.style.top='-20px';wrap.appendChild(c);
  c.animate([{transform:'translateY(0) rotate(0)'},{transform:`translateY(${700+Math.random()*200}px) translateX(${(Math.random()-.5)*120}px) rotate(${Math.random()*720}deg)`}],{duration:1800+Math.random()*900,easing:'cubic-bezier(.25,.6,.4,1)'}).onfinish=()=>c.remove();}}

/* ---------- intro ---------- */
const SL=[
 {s:'Добро пожаловать в Место',h:'Есть куда пойти.<br><b>Найдём, <em>с кем</em></b>',p:'Встречи с людьми рядом: кофе, спорт, кино, прогулки. Нажми «Я иду» — организатор примет заявку.'},
 {s:'Профили с фото и отзывами',h:'Смотри, <em>кто идёт</em>,<br><b>ещё до заявки</b>',p:'У каждого профиль с фото, интересами и отзывами. Сразу видно, с кем будет интересно.'},
 {s:'Создать — за минуту',h:'Своя встреча<br><b><em>за одну минуту</em></b>',p:'Можно анонимно. Выбери место и время — компания соберётся сама.'}];
let si=0,itimer=null;
function renderSlide(){const t=$('#introTxt');t.classList.remove('swin');void t.offsetWidth;t.classList.add('swin');t.innerHTML=`<small>${SL[si].s}</small><h1>${SL[si].h}</h1><p>${SL[si].p}</p>`;
  $$('#bars i').forEach((b,i)=>{b.className=i<si?'dn':i===si?'run':'';const x=b.querySelector('b');x.style.animation='none';void x.offsetWidth;x.style.animation='';});
  $('#slbl').textContent=si<SL.length-1?'Далее':'Начать';}
function startIntro(){stopIntro();renderSlide();itimer=setInterval(()=>{if(si<SL.length-1){si++;renderSlide()}else stopIntro()},4200)}
function stopIntro(){clearInterval(itimer)}
$('#introBack').onclick=()=>{if(si>0){si--;renderSlide();startIntro()}};
// draggable slider
(function(){const tr=$('#slider'),kn=$('#knob'),fill=$('#sfill');let sx=0,dx=0,drag=false,max=0;
  const set=x=>{kn.style.transform=`translateX(${x}px)`;fill.style.width=(68+x)+'px';$('#slbl').style.opacity=1-x/max};
  const done=()=>{if(si<SL.length-1){si++;renderSlide();startIntro()}else{stopIntro();go('auth')}};
  kn.addEventListener('pointerdown',e=>{drag=true;sx=e.clientX;max=tr.offsetWidth-68;kn.setPointerCapture(e.pointerId);kn.style.transition='none';fill.style.transition='none'});
  kn.addEventListener('pointermove',e=>{if(!drag)return;const s=$('#phone').offsetWidth/$('#phone').getBoundingClientRect().width||1;dx=Math.max(0,Math.min(max,(e.clientX-sx)*s));set(dx)});
  kn.addEventListener('pointerup',()=>{if(!drag)return;drag=false;kn.style.transition='transform .5s var(--spring)';fill.style.transition='width .5s var(--spring)';if(dx>max*.6){set(max);setTimeout(()=>{set(0);done()},260)}else{if(dx<6)done();set(0)}dx=0});
  tr.addEventListener('click',e=>{if(e.target===tr||e.target.classList.contains('lb')||e.target.classList.contains('ar'))done()});
})();

/* ---------- registration ---------- */
const addPh=['background-image:url(a/people.webp);background-size:620px auto;background-position:-262px -88px','background-image:url(a/cycling.webp);background-size:cover;background-position:center'];let phn=0;
document.addEventListener('click',e=>{const t=e.target;
  const ap=t.closest('[data-addph]');if(ap&&!ap.dataset.done){ap.setAttribute('style',addPh[phn++%2]);ap.textContent='';ap.dataset.done=1;ap.classList.remove('g');return}
  const sg=t.closest('[data-seg]');if(sg){$$('[data-seg]',sg.parentElement).forEach(x=>x.classList.toggle('on',x===sg));return}
  const it=t.closest('[data-int]');if(it){it.classList.toggle('on');return}
  const ci=t.closest('[data-city]');if(ci){$$('[data-city]').forEach(x=>{x.classList.toggle('on',x===ci);x.querySelector('span').innerHTML=x===ci?'✓':''});$('#cityName').textContent=ci.dataset.city;setTimeout(()=>{closeOv();if(stack[stack.length-1]==='reg3')finishReg()},350);return}
});
$('#intNext').addEventListener('click',e=>{if($$('[data-int].on').length<3){e.stopImmediatePropagation();toast('Выбери хотя бы 3 интереса')}},true);
function finishReg(){toast('Город: '+$('#cityName').textContent);setTimeout(()=>{tab('home');setTimeout(()=>openOv('quick'),900)},500)}
$('#geoOk').onclick=()=>{toast('Определяем город…');setTimeout(finishReg,900)};

/* ---------- deck: full-screen profile like the app ---------- */
let di=0,likes=0;
const PIN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';
function dcard(p){const ph=p.ph||[p.s];return `<div class="dcard"><div class="gal" style="${ph[0]}"></div><div class="gb">${ph.map((_,i)=>`<i class="${i===0?'on':''}"></i>`).join('')}</div>
<button class="tapL" aria-label="Предыдущее фото"></button><button class="tapR" aria-label="Следующее фото"></button>
<div class="body"><div class="nm2"><h1>${p.n}, <em>${p.a}</em></h1><div class="pills"><span class="gw">${PIN}${p.d}</span><span class="gw">Тюмень</span><span class="gw">★ ${p.r}</span><span class="gw">${p.mc} встреч</span><span class="gw">${p.i.length} общих интереса</span></div></div>
<div class="more"><div class="blk gd"><b class="bh">О себе</b><p>${p.ab}</p></div><div class="blk gd"><b class="bh">Общие интересы</b><div class="itags">${p.i.map(x=>`<span class="chip gw">${DICO[x]||''}${x}</span>`).join('')}</div></div>
<div class="blk gd"><b class="bh">Ближайшие события</b><p>Пробежка на рассвете · Сб, 08:00</p></div></div></div></div>`}
function buildDeck(){const w=$('#dkwrap');w.innerHTML=dcard(DECK[(di+1)%DECK.length])+dcard(DECK[di%DECK.length]);const back=w.children[0];back.style.transform='scale(.96)';back.style.opacity='.6';bindDeck(w.children[1],DECK[di%DECK.length]);$('#dYes').classList.remove('on')}
function fly(dir){const top=$('#dkwrap .dcard:last-child');if(!top)return;top.style.transform=`translateX(${dir*130}%) rotate(${dir*14}deg)`;top.style.opacity=0;const nx=$('#dkwrap .dcard:first-child');nx.style.transform='';nx.style.opacity=1;setTimeout(()=>{di++;buildDeck()},380)}
function bindDeck(el,p){let gi=0;const ph=p.ph||[p.s];const setPh=()=>{el.querySelector('.gal').setAttribute('style',ph[gi]);el.querySelectorAll('.gb i').forEach((x,k)=>x.classList.toggle('on',k<=gi))};
 el.querySelector('.tapL').onclick=()=>{gi=(gi-1+ph.length)%ph.length;setPh()};el.querySelector('.tapR').onclick=()=>{gi=(gi+1)%ph.length;setPh()};
 let sx=0,sy=0,dx=0,ax=null,dn=false;const body=el.querySelector('.body');
 body.addEventListener('pointerdown',e=>{dn=true;sx=e.clientX;sy=e.clientY;ax=null;dx=0;el.style.transition='none'});
 body.addEventListener('pointermove',e=>{if(!dn)return;const x=e.clientX-sx,y=e.clientY-sy;if(!ax&&(Math.abs(x)>10||Math.abs(y)>10))ax=Math.abs(x)>Math.abs(y)*1.2?'x':'y';if(ax==='x'){dx=x;el.style.transform=`translateX(${dx}px) rotate(${dx/26}deg)`}});
 const end=()=>{if(!dn)return;dn=false;el.style.transition='';if(ax==='x'&&Math.abs(dx)>90)fly(dx<0?1:-1);else el.style.transform=''};
 body.addEventListener('pointerup',end);body.addEventListener('pointercancel',end);body.addEventListener('pointerleave',end);}
$('#dYes').onclick=e=>{const b=$('#dYes');if(b.classList.contains('on'))return;b.classList.add('on');burst(e.clientX,e.clientY,16);likes++;
 if(likes%2===1){setTimeout(()=>{openOv('matchOv');const m=$('#matchOv');m.querySelectorAll('.ph,.mid,.t,.bt').forEach(x=>{x.style.animation='none';void x.offsetWidth;x.style.animation=''});setTimeout(()=>{const r=$('#matchOv .mid').getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,26)},700)},600)}else heartPop()};
/* ---------- map ---------- */
$$('[data-mk]').forEach(m=>m.addEventListener('click',()=>{$$('#wrap .map [data-mk]').forEach(x=>x.classList.toggle('on',x===m));const c=$('#mapcar').children[+m.dataset.mk];$('#mapcar').scrollTo({left:c.offsetLeft-20,behavior:'smooth'})}));
$('#mapcar').addEventListener('scroll',()=>{const i=Math.round($('#mapcar').scrollLeft/290);$$('[data-mk]').forEach((x,k)=>x.classList.toggle('on',k===i))},{passive:true});

/* ---------- meetings tabs ---------- */
$$('[data-mt]').forEach(b=>b.addEventListener('click',()=>{$$('[data-mt]').forEach(x=>x.classList.toggle('on',x===b));$$('[data-ml]').forEach(l=>{l.hidden=l.dataset.ml!==b.dataset.mt;if(!l.hidden)l.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:350,easing:'ease-out'})})}));

/* ---------- chat ---------- */
const msgs=$('#msgs'),cs=$('#chatScroll');
function scrollChat(){cs.scrollTo({top:cs.scrollHeight,behavior:'smooth'})}
function addMsg(html){msgs.insertAdjacentHTML('beforeend',html);scrollChat()}
const now=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const REPLY=['love','lol','ok','party','wow'];let rn=0;
function reply(){setTimeout(()=>addMsg(`<img class="stkm in" src="a/stk_${REPLY[rn++%REPLY.length]}.webp" alt="">`),1100)}
function send(){const i=$('#msgIn');const v=i.value.trim();if(!v)return;const rb=$('#replybar');const qt=rb?`<span class="quote">${rb.querySelector('span').textContent}</span>`:'';if(rb)rb.remove();addMsg(`<div class="m out">${qt}${v.replace(/</g,'&lt;')}<small>${now()} <i class="tk s">✓</i></small></div>`);const tk=msgs.lastElementChild.querySelector('.tk');setTimeout(()=>{tk.className='tk d';tk.textContent='✓✓'},700);setTimeout(()=>{tk.className='tk r';tk.textContent='✓✓'},1500);i.value='';reply()}
$('#sendBtn').onclick=send;$('#msgIn').addEventListener('keydown',e=>{if(e.key==='Enter')send()});
$('#stkBtn').onclick=()=>$('#stkpick').classList.toggle('show');
$$('[data-stk]').forEach(b=>b.addEventListener('click',()=>{addMsg(`<img class="stkm out" src="a/stk_${b.dataset.stk}.webp" alt="">`);$('#stkpick').classList.remove('show');reply()}));

/* ---------- create: step 0 + 4 steps like CreateMeetingFlow ---------- */
let kind='open',ws=0,seats=3,maxSeats=4;
const flowSteps=()=>['s0',kind==='biz'?'s1b':'s1p','s2','s3','s4'];
function showStep(i,dir){const st=flowSteps();ws=Math.max(0,Math.min(st.length-1,i));$$('#cScroll .wst').forEach(w=>{const on=w.dataset.w===st[ws];w.hidden=!on;if(on){w.classList.remove('back');void w.offsetWidth;if(dir<0)w.classList.add('back')}});
 $$('#wprog i').forEach((x,k)=>x.classList.toggle('on',k<ws));requestAnimationFrame(()=>$$('#cScroll .wst:not([hidden]) .wheel .wl').forEach(w=>{if(w.dataset.done)return;w.dataset.done=1;w.scrollTop=(+w.dataset.sel||0)*40}));$('#cNext').textContent=ws===st.length-1?'Опубликовать':'Далее';$('#cScroll').scrollTop=0;
 $('#pubBox').hidden=kind==='biz';$('#costP').hidden=kind==='biz';$('#costB').hidden=kind!=='biz';$('#costLbl').textContent=kind==='biz'?'Стоимость':'Как насчёт расходов?';
 maxSeats=kind==='biz'?500:4;$('#mapNote').textContent=kind==='anon'?'На карте вместо фото — персонаж, точный адрес скрыт':'На карте — твоё фото на метке';}
window.__editStep=()=>{showStep(2,1);$('#cNext').textContent='Далее'};window.__createReset=()=>{kind='open';seats=3;$('#seats').textContent=3;$$('[data-kind]').forEach((x,k)=>x.classList.toggle('on',k===0));showStep(0,1)};
$('#cNext').onclick=()=>{const st=flowSteps();if(ws<st.length-1){showStep(ws+1,1);return}const cur=stack[stack.length-1];stack=['home','done'];show('done','push',cur).then(()=>confetti())};
$('#cBack').onclick=()=>{if(ws>0)showStep(ws-1,-1);else back()};
$$('[data-kind]').forEach(b=>b.addEventListener('click',()=>{$$('[data-kind]').forEach(x=>x.classList.toggle('on',x===b));kind=b.dataset.kind;if(kind==='anon'){$$('[data-opt="anon"]').forEach((x,k)=>x.classList.toggle('on',k===1))}else $$('[data-opt="anon"]').forEach((x,k)=>x.classList.toggle('on',k===0));seats=kind==='biz'?150:3;$('#seats').textContent=seats;setTimeout(()=>showStep(1,1),280)}));
document.addEventListener('click',e=>{const t=e.target;
 const ct=t.closest('[data-ct]');if(ct){$$('[data-ct]',ct.parentElement).forEach(x=>x.classList.toggle('on',x===ct));if(ct.closest('#cats'))$('#trainBox').hidden=ct.dataset.ct!=='Тренировка';const ic=ct.dataset.ct.toLowerCase();$('#prevCard .chip').textContent=`0 из ${seats} · ${ic}`;return}
 const tt=t.closest('[data-tt]');if(tt){$$('[data-tt]').forEach(x=>x.classList.toggle('on',x===tt));return}
 if(t.closest('[data-own]')){$('#ownIn').hidden=false;$('#ownIn input').focus();return}
 const op=t.closest('[data-opt]');if(op){$$(`[data-opt="${op.dataset.opt}"]`,op.parentElement).forEach(x=>x.classList.toggle('on',x===op));if(op.dataset.opt==='anon'){kind=op===op.parentElement.children[1]?'anon':'open';showStep(ws,0)}return}
 const st=t.closest('[data-st]');if(st){const step=kind==='biz'?10:1;const nv=seats+ +st.dataset.st*step;if(nv>maxSeats){toast(kind==='biz'?'Максимум 500 гостей':'Твой тариф — группа до 4. Больше — в Медиум');if(kind!=='biz')openOv('subSheet');return}seats=Math.max(1,nv);$('#seats').textContent=seats;$('#seatsSub').textContent=kind==='biz'?`Гостей: ${seats}${seats>20?' · без общего чата':''}`:`Не считая тебя · на встрече будет ${seats+1} чел.`;$('#seats').animate([{transform:'scale(1.25)'},{transform:'scale(1)'}],{duration:350,easing:'cubic-bezier(.34,1.56,.64,1)'});$('#prevCard .chip').textContent=`0 из ${seats}`;return}
 const bg=t.closest('[data-bg]');if(bg){$$('[data-bg]').forEach(x=>x.classList.toggle('on',x===bg));$('#prevCard').style.backgroundImage=`url(a/${bg.dataset.bg}.webp)`;return}
 const cs=t.closest('[data-cost]');if(cs){$$('[data-cost]',cs.parentElement).forEach(x=>x.classList.toggle('on',x===cs));const m=$('#prevMeta').textContent.split(' · ');m[2]=cs.textContent;$('#prevMeta').textContent=m.join(' · ');return}
 const du=t.closest('[data-dur]');if(du){$$('[data-dur]').forEach(x=>x.classList.toggle('on',x===du));return}
 const pl=t.closest('[data-place]');if(pl){const [n,a]=pl.dataset.place.split('|');$('#placeIn').value=n;$('#addrN').textContent=n;$('#addrA').textContent=a+', Тюмень';$('#sugg').hidden=true;const m=$('#prevMeta').textContent.split(' · ');m[1]=n;$('#prevMeta').textContent=m.join(' · ');return}
 if(t.closest('[data-copy]')){const a=$('#addrA').textContent;try{navigator.clipboard.writeText(a).catch(()=>{})}catch(_){}toast('Адрес скопирован');return}
});
$('#placeIn').addEventListener('input',e=>{$('#sugg').hidden=!e.target.value.trim()});
$('#placeIn').addEventListener('focus',e=>{$('#sugg').hidden=false});
$$('.wheel .wl').forEach(w=>{const upd=()=>{const i=Math.round(w.scrollTop/40);[...w.children].forEach((s,k)=>s.classList.toggle('on',k===i))};w.addEventListener('scroll',upd,{passive:true});requestAnimationFrame(()=>{const on=[...w.children].findIndex(s=>s.classList.contains('on'));w.scrollTop=on*40})});
$('#cTitle').addEventListener('input',e=>{const w=e.target.value.trim().split(' ');const last=w.length>1?w.pop():'';$('#prevTitle').innerHTML=w.join(' ')+(last?` <em>${last}</em>`:'')});
/* ---------- event / follow / like ---------- */
let going=false;$('#goBtn').onclick=e=>{going=!going;const b=$('#goBtn');if(going){b.innerHTML='Заявка отправлена ✓';b.classList.add('sent');toast('Олег получил заявку');burst(e.clientX,e.clientY,18)}else{b.innerHTML='Я иду '+b.dataset.ck;toast('Заявка отменена')}};
$('#goBtn').dataset.ck=$('#goBtn').innerHTML.replace('Я иду ','');
document.addEventListener('click',e=>{const t=e.target;
  const lk=t.closest('[data-like]');if(lk){lk.classList.toggle('on');lk.style.color=lk.classList.contains('on')?'#FF6FB0':'';if(lk.classList.contains('on'))burst(e.clientX,e.clientY,10);return}
  const ht=t.closest('[data-heart]');if(ht){burst(e.clientX,e.clientY,16);return}
  const fo=t.closest('[data-follow]');if(fo){fo.classList.toggle('on');toast(fo.classList.contains('on')?'Подписка: узнаешь о новых событиях Даши':'Подписка отменена');return}
  const f2=t.closest('[data-follow2]');if(f2){const on=f2.classList.toggle('l');f2.classList.toggle('d',!on);f2.lastChild.textContent=on?'Вы подписаны':'Подписаться';toast(on?'Подписка на FORMA lounge':'Подписка отменена');return}
  const tg=t.closest('[data-tog]');if(tg){tg.classList.toggle('on');return}
  const bs=t.closest('[data-burst]');if(bs){burst(e.clientX,e.clientY,16,document.body.querySelector('.wrap'));return}
  const ct=t.closest('[data-cat]');if(ct){$$('[data-cat]').forEach(x=>x.classList.toggle('on',x===ct));return}
});

/* ---------- misc round 2 ---------- */
document.addEventListener('click',e=>{const b=e.target.closest('[data-bizcreate]');if(b){window.__createReset();window.__keepKind=true;const o=$('[data-kind="biz"]');setTimeout(()=>o&&o.click(),520)}},true);
document.addEventListener('click',e=>{const af=e.target.closest('[data-af]');if(af){$$('[data-af]',af.parentElement).forEach(x=>x.classList.toggle('on',x===af))}});
const bio=$('#f_bio');if(bio)bio.addEventListener('input',()=>$('#bioCnt').textContent=bio.value.length+' / 300');
const NEAR=['3 человека','5 человек','4 человека','7 человек','2 человека'];let ni=0;setInterval(()=>{const el=$('#nearN');if(!el)return;ni=(ni+1)%NEAR.length;el.animate([{opacity:1},{opacity:0}],{duration:200,fill:'forwards'}).onfinish=()=>{el.textContent=NEAR[ni];el.getAnimations().forEach(a=>a.cancel());el.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:300})}},4500);
const cq=$('#cityQ');if(cq)cq.addEventListener('input',()=>{const q=cq.value.trim().toLowerCase();$$('[data-city]').forEach(b=>b.hidden=q&&!b.dataset.city.toLowerCase().includes(q))});
/* ---------- round 3 ---------- */
document.addEventListener('click',e=>{const t=e.target;
 const ac=t.closest('[data-acc]');if(ac){ac.parentElement.classList.toggle('open');return}
 const pk=t.closest('[data-peek]');if(pk){pk.classList.add('gone');return}
 const dp=t.closest('[data-dp]');if(dp){$$('[data-dp]').forEach(x=>x.classList.toggle('on',x===dp));return}
 const tm=t.closest('[data-tm]');if(tm){$$('[data-tm]').forEach(x=>x.classList.toggle('on',x===tm));return}
 const cd=t.closest('[data-cd]');if(cd){$$('[data-cd]').forEach(x=>x.classList.toggle('on',x===cd));return}
 const rp=t.closest('.rp');if(rp){$$('.rp').forEach(x=>x.classList.toggle('on',x===rp))}
});
function intCount(){const n=$$('[data-int].on').length;const h=$('#intHint');if(h){h.textContent=n>=3?`Выбрано: ${n}`:`Выбрано ${n} из 3`;$('#intNext').style.opacity=n>=3?1:.4}
 $$('.acc').forEach(a=>{const k=a.querySelectorAll('[data-int].on').length;a.querySelector('.k').textContent=k||''})}
document.addEventListener('click',e=>{if(e.target.closest('[data-int]'))setTimeout(intCount,0)});intCount();
$$('.sheet input[type=range]:not(.arange input)').forEach(r=>{const lb=r.previousElementSibling;const upd=()=>{r.style.setProperty('--v',((r.value-r.min)/(r.max-r.min)*100)+'%');if(lb)lb.innerHTML='Расстояние <span class="distv">до '+r.value+' км</span>'};r.addEventListener('input',upd);upd()});
/* ---------- round 4 ---------- */
document.addEventListener('click',e=>{const t=e.target;
 const ag=t.closest('[data-agree]');if(ag&&!t.closest('a')){ag.classList.toggle('on');return}
 const cl=t.closest('[data-clu]');if(cl){$('#mapL').classList.remove('far');return}
 const zm=t.closest('[data-zoom]');if(zm){$('#mapL').classList.toggle('far',zm.dataset.zoom==='-1');return}
},true);
document.addEventListener('click',e=>{const n=e.target.closest('section[data-id="reg1"] .foot .btn');if(n&&$$('[data-agree].on').length<2){e.stopImmediatePropagation();e.preventDefault();toast('Отметь обе галочки — оферта и согласие')}},true);
/* ---------- round 5 ---------- */
document.addEventListener('click',e=>{const t=e.target;
 if(t.closest('[data-catopen]')){$('#afCats').hidden=!$('#afCats').hidden;return}
 const afc=t.closest('[data-afc]');if(afc){$$('[data-afc]').forEach(x=>x.classList.toggle('on',x===afc));$('#afCat').textContent=afc.dataset.afc==='Все'?'Все разделы':afc.dataset.afc;setTimeout(()=>$('#afCats').hidden=true,250);return}
 const rq=t.closest('[data-rq]');if(rq){const r=rq.closest('.rq');r.classList.add('gone');toast(rq.dataset.rq==='ok'?'Заявка принята — открыт чат встречи':'Заявка отклонена');setTimeout(()=>r.remove(),350);return}
 if(t.closest('[data-copyaddr]')){try{navigator.clipboard.writeText('Набережная Туры, Тюмень').catch(()=>{})}catch(_){}toast('Адрес скопирован');return}
 if(t.closest('[data-bizmap]')){setTimeout(()=>{const c=[...$$('section[data-id=map] [data-af]')].find(x=>x.textContent.includes('бизнеса'));if(c)c.click()},300)}
 if(t.closest('[data-edit]')){window.__keepKind=true;setTimeout(()=>{window.__createReset();window.__editStep&&window.__editStep()},20)}
},true);
const oi=$('#ownIn input');if(oi)oi.addEventListener('input',()=>$('#ownIn .cnt2').textContent=oi.value.length+'/30');
// chat: reactions + reply
let rxFor=null,replyTo=null;
document.addEventListener('click',e=>{const m=e.target.closest('#msgs .m');const bar=$('#rxbar');
 if(e.target.closest('#rxbar')){const b=e.target.closest('button');if(!b)return;if(b.classList.contains('rep')){replyTo=rxFor;const q=rxFor.childNodes[0].textContent.trim();let rb=$('#replybar');if(!rb){rb=document.createElement('div');rb.id='replybar';rb.className='replybar g';$('section[data-id=chat]').appendChild(rb)}rb.innerHTML=`<b>Ответ:</b><span>${q}</span><button class="pr" onclick="this.parentElement.remove()">✕</button>`;$('#msgIn').focus()}else{let r=rxFor.querySelector('.rx');if(!r){r=document.createElement('span');r.className='rx';rxFor.appendChild(r);rxFor.classList.add('hasrx')}r.textContent=b.textContent+' 1'}bar.remove();return}
 if(bar)bar.remove();
 if(m){rxFor=m;const s=$('section[data-id=chat]');const rb=s.getBoundingClientRect(),mr=m.getBoundingClientRect(),k=s.offsetWidth/rb.width||1;const x=document.createElement('div');x.id='rxbar';x.className='rxbar';x.innerHTML=['❤️','👍','😂','🔥','😮'].map(r=>`<button class="pr">${r}</button>`).join('')+'<button class="pr rep">Ответить</button>';x.style.top=Math.max(120,(mr.top-rb.top)*k-54)+'px';x.style.left=m.classList.contains('out')?'auto':'16px';x.style.right=m.classList.contains('out')?'16px':'auto';s.appendChild(x)}
});
const _send=send;
// heart sent messaging
document.addEventListener('click',e=>{if(e.target.closest('[data-heart]')){setTimeout(()=>heartPop(),10)}},true);
document.addEventListener('click',e=>{const b=e.target.closest('.goAnon');if(b){b.innerHTML='Заявка отправлена ✓';toast('Организатор увидит твой профиль и решит');burst(e.clientX,e.clientY,14)}});
$$('.ev .scroll,.pp .scroll').forEach(s=>s.addEventListener('scroll',()=>s.classList.toggle('scrolled',s.scrollTop>40),{passive:true}));
document.addEventListener('click',e=>{const c=e.target.closest('[data-came]');if(c){const g=c.closest('.gst');if(g&&g.parentElement.id==='gList'){if(!c.classList.contains('on')){dMark(g);toast('Вход отмечен');}else{c.classList.remove('on');delete g.dataset.in;g.querySelector('small').textContent='Ещё не пришёл';dIn--;$('#dIn').textContent=dIn;$$('.dInC').forEach(x=>x.textContent=dIn);$$('.dWC').forEach(x=>x.textContent=200-dIn);$('#dBar').style.width=(dIn/2)+'%';toast('Отметка снята')}return}c.classList.toggle('on');const s=c.parentElement.querySelector('small');s.textContent=c.classList.contains('on')?'Пришёл':'Ещё не пришёл';toast(c.classList.contains('on')?'Отмечен на входе':'Отметка снята');return}
 if(e.target.closest('[data-kick]')){const r=[...$$('section[data-id=requests] .rq')].pop();if(r){r.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateX(-40px)'}],{duration:320,easing:'ease-in'}).onfinish=()=>{const p=r.parentElement;r.remove();if(p&&!p.querySelector('.rq'))p.insertAdjacentHTML('beforeend','<p class="sub2" style="padding:6px 4px">Место освободилось — прими новую заявку</p>')}}toast('Олег убран из встречи и чата')}});
const gq=$('#gq'),dRes=$('#dRes');let dIn=87;
function dMark(g){const t='23:'+String(10+Math.floor(Math.random()*40));g.dataset.in=t;g.querySelector('.gchk').classList.add('on');g.querySelector('small').textContent='Прошёл в '+t;g.classList.remove('flash');void g.offsetWidth;g.classList.add('flash');dIn++;$('#dIn').textContent=dIn;$$('.dInC').forEach(x=>x.textContent=dIn);$$('.dWC').forEach(x=>x.textContent=200-dIn);$('#dBar').style.width=(dIn/2)+'%';if(navigator.vibrate)try{navigator.vibrate(30)}catch(e){}}
function dShow(){if(!gq)return;const raw=gq.value.trim().toLowerCase().replace(/^frm[-‑]?/,'');const list=$$('#gList .gst');if(!raw){dRes.innerHTML='';list.forEach(g=>g.hidden=false);return}
 const num=/^\d+$/.test(raw);const m=list.filter(g=>num?g.dataset.code===String(+raw):g.dataset.name.toLowerCase().startsWith(raw));list.forEach(g=>g.hidden=!m.includes(g));
 const okI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
 if(!m.length){dRes.innerHTML=num&&raw.length>=1&&+raw>200?`<div class="drc bad"><span class="ico">!</span><span class="x"><b>FRM‑${raw.padStart(3,'0')}</b><small>Такого билета нет на этом событии</small></span></div>`:'';return}
 if(m.length===1){const g=m[0],n=g.dataset.name,code=g.querySelector('.gc').textContent,av=g.querySelector('.a').getAttribute('style');
  dRes.innerHTML=g.dataset.in?`<div class="drc warn"><span class="a" style="${av}"></span><span class="x"><b>${n} · ${code}</b><small>Уже прошёл в ${g.dataset.in}</small></span></div>`:`<div class="drc g"><span class="a" style="${av}"></span><span class="x"><b>${n}</b><small>${code}</small></span><button class="btn d pr" id="dGo">Отметить вход</button></div>`;
  const go=$('#dGo');if(go)go.onclick=()=>{dMark(g);dRes.innerHTML=`<div class="drc ok"><span class="ico">${okI}</span><span class="x"><b>${n} · ${code}</b><small>Вход отмечен · ${dIn} из 200</small></span></div>`;gq.value='';setTimeout(()=>{if(!gq.value){dRes.innerHTML='';list.forEach(x=>x.hidden=false)}},1800);gq.focus()}}else dRes.innerHTML=''}
if(gq){gq.addEventListener('input',dShow);gq.addEventListener('keydown',e=>{if(e.key==='Enter'){const go=$('#dGo');if(go)go.click()}})}
document.addEventListener('click',e=>{if(e.target.closest('[data-ov=scanOv]')){const r=$('#sRes');r.classList.remove('on');setTimeout(()=>{r.classList.add('on');const g=$('#gList .gst[data-code="6"]');if(g&&!g.dataset.in)dMark(g);if(navigator.vibrate)try{navigator.vibrate(30)}catch(e){}},1600)}});
/* ---------- global routing clicks ---------- */
document.addEventListener('click',e=>{const t=e.target;
  const ov=t.closest('[data-ov]');if(ov){openOv(ov.dataset.ov);return}
  const cl=t.closest('[data-close]');if(cl){closeOv()}
  const ts=t.closest('[data-toast]');if(ts){toast(ts.dataset.toast)}
  const g=t.closest('[data-go]');if(g){if(cl){setTimeout(()=>go(g.dataset.go),250)}else go(g.dataset.go);return}
  const bk=t.closest('[data-back]');if(bk){back();return}
  const tb=t.closest('[data-tab]');if(tb){tab(tb.dataset.tab);return}
  const j=t.closest('[data-jump]');if(j){jump(j.dataset.jump);if(innerWidth<980)$('#phone').scrollIntoView({behavior:'smooth',block:'start'});return}
});
$('#restart').onclick=()=>{si=0;jump('intro')};

/* ---------- creature: tap jelly + chaotic drift in its cutout ---------- */
const plus=$('#plus');plus.addEventListener('click',()=>{plus.classList.remove('jelly');void plus.offsetWidth;plus.classList.add('jelly');setTimeout(()=>go('create'),260)});
const jd=$('#jellyDemo');if(jd)jd.addEventListener('click',()=>{const c=jd.querySelector('canvas');c.animate([{transform:'scale(1)'},{transform:'scale(1.22,.8)'},{transform:'scale(.88,1.14)'},{transform:'scale(1.06,.96)'},{transform:'scale(1)'}],{duration:700,easing:'cubic-bezier(.34,1.56,.64,1)'})});
const pc=plus.querySelector('canvas'),pl=plus.querySelector('.pl');const t0=performance.now();
(function drift(now){const t=(now-t0)/1000;{const x=Math.sin(t*1.3)*1.6+Math.sin(t*2.9)*.9,y=Math.cos(t*1.1)*1.4+Math.sin(t*3.7)*.7,r=Math.sin(t*.8)*5;pc.style.translate=`${x}px ${y}px`;pc.style.rotate=r+'deg';if(pl){pl.style.translate=`${x*1.15}px ${y*1.15}px`;pl.style.rotate=(r*.6)+'deg'}}requestAnimationFrame(drift)})(t0);
plus.addEventListener('animationend',()=>plus.classList.remove('jelly'));

/* start */
scr('intro').hidden=false;decorate('intro');
/* ===== round 8 ===== */
(function(){
let SK='';const sq=$('#sq');
const CITY_EV={'Тюмень':'all','Москва':'some','Екатеринбург':'some','Санкт‑Петербург':'some'};
const IN={'Тюмень':'в Тюмени','Екатеринбург':'в Екатеринбурге','Москва':'в Москве','Санкт‑Петербург':'в Петербурге','Казань':'в Казани','Новосибирск':'в Новосибирске','Челябинск':'в Челябинске','Омск':'в Омске','Сургут':'в Сургуте','Тобольск':'в Тобольске','Курган':'в Кургане','Пермь':'в Перми','Уфа':'в Уфе','Самара':'в Самаре','Сочи':'в Сочи'};
const KEEP=/Кофе|Кино/;
function applyCity(c){const mode=CITY_EV[c]||'none';const ok=el=>mode==='all'||(mode==='some'&&KEEP.test(el.textContent));
 const sets=[['section[data-id=home] .hs .hc',null],['section[data-id=home] .mz .mt',null],['section[data-id=allev] .evl .evx',null],['section[data-id=afisha] .afr',null],['#mapL .pin',null],['#mapL .clu',null],['#mapcar .mc',null],['#sList .evx',null]];
 sets.forEach(([s])=>$$(s).forEach(el=>{const v=s.includes('.afr')||s.includes('.mz')||s.includes('.clu')?mode==='all':ok(el);el.dataset.cityOff=v?'':'1';el.hidden=!v}));
 const home=$('section[data-id=home]');if(home){const pers=home.querySelector('.hs:has(.hc)');const any=[...home.querySelectorAll('.hs .hc')].slice(0,4).some(x=>!x.hidden);
  const secs=[...home.querySelectorAll('.sec')];const e=home.querySelector('[data-cityempty]');if(e)e.hidden=any;if(pers)pers.hidden=!any;
  const biz=home.querySelector('.biz');if(biz){const b=[...biz.querySelectorAll('.hc')].some(x=>!x.hidden);biz.hidden=!b}
  const mz=home.querySelector('.mz');if(mz){const has=[...mz.children].some(x=>!x.hidden);mz.hidden=!has;if(secs[1])secs[1].hidden=!has}}
 const af=$('section[data-id=afisha]');if(af){const any=[...af.querySelectorAll('.afr')].some(x=>!x.hidden);const e=af.querySelector('[data-cityempty]');if(e)e.hidden=any}
 const me=$('[data-mapempty]');if(me){const any=[...$$('#mapL .pin')].some(x=>!x.hidden);me.hidden=any;$('#mapcar').hidden=!any}
 const mp=$('#mapL>svg');if(mp){const i=Object.keys(IN).indexOf(c);mp.style.transform=i>0?`translate(${-(i*37)%120}px,${-(i*53)%160}px) rotate(${(i*23)%40-20}deg) scale(1.25)`:''}
 $$('.cityIn').forEach(x=>x.textContent=IN[c]||('в '+c));if(typeof afFilter==='function')setTimeout(afFilter,0);$$('.cityIn2').forEach(x=>x.textContent=(IN[c]||c).replace(/^в /,''));
 $$('[data-ov=citySheet]').forEach(b=>{const w=[...b.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(w)w.textContent=c});
 evFilter()}
document.addEventListener('click',e=>{const ci=e.target.closest('[data-city]');if(ci)setTimeout(()=>applyCity(ci.dataset.city),360)},true);
/* dates multi-select */
document.addEventListener('click',e=>{const d=e.target.closest('[data-day],[data-dall]');if(!d)return;const row=d.closest('[data-days]');
 if(d.dataset.dall!==undefined){$$('[data-day]',row).forEach(x=>x.classList.remove('on'));d.classList.add('on')}else{d.classList.toggle('on');const on=$$('[data-day].on',row);row.querySelector('[data-dall]').classList.toggle('on',!on.length)}
 const on=$$('[data-day].on',row);const s=$('#dsum_'+row.dataset.days);if(s)s.textContent=on.length?('Выбрано: '+on.map(x=>x.querySelector('small').textContent+(/\d/.test(x.querySelector('small').textContent)?'':' '+x.querySelector('b').textContent)).join(', ')):'Все дни · можно выбрать несколько';evFilter()});
/* filter: gender + age */
let FG='',A1=18,A2=45;
function ageUI(){const a=$('#ageA'),b=$('#ageB');if(!a)return;let x=+a.value,y=+b.value;if(x>y-2){if(document.activeElement===a)x=y-2;else y=x+2;a.value=x;b.value=y}
 const L=$('#ageL');if(L)L.textContent=x+'–'+(y>=60?'60+':y);const f=$('#ageFill');if(f){const px=v=>`calc(13px + (100% - 26px) * ${v})`;f.style.left=px((x-18)/42);f.style.right=`calc(100% - (13px + (100% - 26px) * ${(y-18)/42}))`}}
['#ageA','#ageB'].forEach(s=>{const el=$(s);if(el)el.addEventListener('input',ageUI)});setTimeout(ageUI,0);document.addEventListener('click',e=>{if(e.target.closest('[data-ov=filterSheet]'))setTimeout(ageUI,30)});
document.addEventListener('click',e=>{const g=e.target.closest('[data-fgv]');if(g){$$('[data-fgv]').forEach(x=>x.classList.toggle('on',x===g))}
 if(e.target.closest('[data-freset]')){$$('[data-fgv]').forEach((x,i)=>x.classList.toggle('on',i===0));$('#ageA').value=18;$('#ageB').value=45;ageUI();FG='';A1=18;A2=60;evFilter();toast('Фильтры сброшены')}
 if(e.target.closest('[data-fapply]')){FG=($('[data-fgv].on')||{}).dataset?.fgv||'';A1=+$('#ageA').value;A2=+$('#ageB').value;if(A2>=60)A2=99;evFilter();const n=$$('section[data-id=allev] .evx').filter(x=>!x.hidden).length;toast(n?('Нашли '+n+' '+(n===1?'встречу':n<5?'встречи':'встреч')):'Ничего не нашли')}});
A2=99;
function evFilter(){const days=(DAYSEL.allev||[]);
 const L=$$('section[data-id=allev] .evx');L.forEach(el=>{const v=!el.dataset.cityOff&&(!days.length||days.includes(el.dataset.d))&&(!FG||el.dataset.g===FG)&&(+el.dataset.age>=A1&&+el.dataset.age<=A2);el.hidden=!v});
 const em=$('section[data-id=allev] [data-empty]');if(em)em.hidden=L.some(x=>!x.hidden);sFilter()}

const dA=$('#distA');function distUI(){if(!dA)return;const v=(dA.value-1)/29;$('#distFill').style.right=`calc(100% - (13px + (100% - 26px) * ${v}))`;$('#distL').textContent='до '+dA.value+' км'}if(dA){dA.addEventListener('input',distUI);distUI()}
/* quick dates + calendar */
const DAYSEL={};let calScope='allev';const MN=['','янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','нояб','дек'];
function setDays(scope,arr,fromCal){DAYSEL[scope]=arr;const row=$(`[data-qd=${scope}]`);if(!row)return;const qv=arr.join(',');
 $$('[data-qdv]',row).forEach(b=>b.classList.toggle('on',!fromCal&&b.dataset.qdv===qv));const qc=row.querySelector('.qcal');qc.classList.toggle('on',!!fromCal&&arr.length>0);
 qc.querySelector('span').textContent=fromCal&&arr.length?(arr.length>3?arr.length+' дн.':arr.join(', ')+' нояб'):'';
 if(scope==='afisha')afFilter();
 evFilter()}
document.addEventListener('click',e=>{const q=e.target.closest('[data-qdv]');if(q){const sc=q.closest('[data-qd]').dataset.qd;const was=q.classList.contains('on');setDays(sc,was?[]:q.dataset.qdv.split(','),false);return}
 const qc=e.target.closest('[data-qcal]');if(qc){calScope=qc.dataset.qcal;const sel=DAYSEL[calScope]||[];$$('[data-md]').forEach(b=>b.classList.toggle('on',sel.includes(b.dataset.md)));mdSum()}
 const md=e.target.closest('[data-md]');if(md&&!md.disabled){md.classList.toggle('on');mdSum();return}
 if(e.target.closest('[data-mdreset]')){$$('[data-md]').forEach(b=>b.classList.remove('on'));mdSum()}
 if(e.target.closest('[data-mdok]')){const a=$$('[data-md].on').map(b=>b.dataset.md);setDays(calScope,a,true)}});
function mdSum(){const a=$$('[data-md].on').map(b=>b.dataset.md);$('#mdSum').textContent=a.length?('Выбрано: '+a.join(', ')+' ноября'):'Можно выбрать несколько дней'}
function heartPop(){let h=$('#hpop');if(!h){h=document.createElement('div');h.id='hpop';h.className='hpop g';h.innerHTML='<span class="hh"><svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg></span><b>Сердечко отправлено</b><span>Будет взаимно — подберём вам встречу</span>';($('.toast')&&$('.toast').parentElement||$('#wrap')).appendChild(h)}
 h.classList.remove('show');void h.offsetWidth;h.classList.add('show');clearTimeout(h._t);h._t=setTimeout(()=>h.classList.remove('show'),2200)}
window.heartPop=heartPop;
/* cover picker: 10 covers per category */
let cvFor=null;
document.addEventListener('click',e=>{const o=e.target.closest('[data-cvfor]');if(o){cvFor=o.dataset.cvfor;const want=cvFor==='editbiz'?'Бары':'Кофе';setTimeout(()=>{const b=$(`#coverSheet [data-cvc="${want}"]`);if(b)b.click()},20)}
 const c=e.target.closest('[data-cvc]');if(c){const box=c.closest('.sheet,.wst,.scroll')||document;$$('[data-cvc]',box).forEach(x=>x.classList.toggle('on',x===c));const L=(window.COVERS||{})[c.dataset.cvc]||[];const g=box.querySelector('[data-cvg]');
  g.querySelectorAll('[data-cv]').forEach(x=>x.remove());const own=g.querySelector('.cvown');L.forEach((b,i)=>{const el=document.createElement('button');el.className='pr'+(i===0?' on':'');el.dataset.cv=b;el.style.cssText=`background-image:url(a/${b}.webp);background-size:cover;background-position:center`;g.insertBefore(el,own);el.animate([{opacity:0,transform:'scale(.94)'},{opacity:1,transform:'none'}],{duration:260,delay:i*25,fill:'backwards'})});
  box.querySelector('[data-cvn]').textContent=L.length?(L.length+' фирменных обложек · выбери одну'):'Загрузи своё фото — обрежем в 3:4';return}
 const v=e.target.closest('[data-cv]');if(v){const g=v.closest('[data-cvg]');$$('[data-cv]',g).forEach(x=>x.classList.toggle('on',x===v));const url=`url(a/${v.dataset.cv}.webp)`;
  const t=g.dataset.prev==='prevCard'?$('#prevCard'):$(`section[data-id=${cvFor||'editev'}] .ecov`);if(t){t.style.backgroundImage=url;t.style.backgroundSize='cover';t.style.backgroundPosition='center';t._crop=null}}});
/* crop editor: vertical 3:4, drag + zoom */
const CR={t:null,img:null,nw:0,nh:0,s0:1,z:1,x:0,y:0};
function crFr(){const f=$('#cropFr'),st=$('#cropSt');const a=st.getBoundingClientRect(),b=f.getBoundingClientRect();return{l:b.left-a.left,t:b.top-a.top,w:b.width,h:b.height}}
function crClamp(){const F=crFr(),w=CR.nw*CR.s0*CR.z,h=CR.nh*CR.s0*CR.z;CR.x=Math.min(F.l,Math.max(F.l+F.w-w,CR.x));CR.y=Math.min(F.t,Math.max(F.t+F.h-h,CR.y))}
function crDraw(){crClamp();const im=$('#cropImg');im.style.width=(CR.nw*CR.s0*CR.z)+'px';im.style.height=(CR.nh*CR.s0*CR.z)+'px';im.style.transform=`translate(${CR.x}px,${CR.y}px)`;
 const v=(CR.z-1)/2;$('#czFill').style.right=`calc(100% - (13px + (100% - 26px) * ${v}))`}
function crOpen(sel){let t=sel==='@cvtarget'?$(`section[data-id=${cvFor||'editev'}] .ecov`):$(sel);if(!t)return;CR.t=t;
 const m=(t.style.backgroundImage||'').match(/url\(["']?([^"')]+)/);const src=m?m[1]:'a/run05.webp';const im=$('#cropImg');
 im.onload=()=>{CR.nw=im.naturalWidth;CR.nh=im.naturalHeight;const F=crFr();CR.s0=Math.max(F.w/CR.nw,F.h/CR.nh);
  if(t._crop&&t._crop.src===src){Object.assign(CR,{z:t._crop.z});const w=CR.nw*CR.s0*CR.z,h=CR.nh*CR.s0*CR.z;CR.x=F.l-t._crop.u*w;CR.y=F.t-t._crop.v*h}else{CR.z=1;const w=CR.nw*CR.s0,h=CR.nh*CR.s0;CR.x=F.l+(F.w-w)/2;CR.y=F.t+(F.h-h)/2}
  $('#cropZ').value=Math.round(CR.z*100);crDraw()};im.src=src;openOv('cropOv')}
function crApply(){const t=CR.t;if(!t)return;const F=crFr(),w=CR.nw*CR.s0*CR.z,h=CR.nh*CR.s0*CR.z;const u=(F.l-CR.x)/w,v=(F.t-CR.y)/h;
 const src=$('#cropImg').getAttribute('src');t._crop={src,z:CR.z,u,v};const W=t.getBoundingClientRect().width||250;const k=W/F.w;
 t.style.backgroundSize=`${w*k}px auto`;t.style.backgroundPosition=`${-u*w*k}px ${-v*h*k}px`;t.style.backgroundRepeat='no-repeat';toast('Обложка обрезана')}
(function(){const st=$('#cropSt');if(!st)return;let d=null;st.addEventListener('pointerdown',e=>{d={x:e.clientX,y:e.clientY,ox:CR.x,oy:CR.y};st.setPointerCapture(e.pointerId);st.style.cursor='grabbing'});
 st.addEventListener('pointermove',e=>{if(!d)return;CR.x=d.ox+(e.clientX-d.x);CR.y=d.oy+(e.clientY-d.y);crDraw()});
 const up=()=>{d=null;st.style.cursor=''};st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
 st.addEventListener('wheel',e=>{e.preventDefault();zoomTo(CR.z*(e.deltaY<0?1.06:.94))},{passive:false});
 function zoomTo(z){const F=crFr();const cx=F.l+F.w/2,cy=F.t+F.h/2;z=Math.min(3,Math.max(1,z));const r=z/CR.z;CR.x=cx-(cx-CR.x)*r;CR.y=cy-(cy-CR.y)*r;CR.z=z;$('#cropZ').value=Math.round(z*100);crDraw()}
 $('#cropZ').addEventListener('input',e=>zoomTo(e.target.value/100));window.__crZoom=zoomTo})();
document.addEventListener('click',e=>{const c=e.target.closest('[data-crop]');if(c){e.stopPropagation();const sel=c.dataset.crop;if(c.closest('#coverSheet'))closeOv();setTimeout(()=>crOpen(sel),c.closest('#coverSheet')?320:0);return}
 if(e.target.closest('[data-cropx]')){closeOv();return}
 if(e.target.closest('[data-cropok]')){crApply();closeOv();return}
 if(e.target.closest('[data-cropreset]')){const F=crFr();CR.z=1;const w=CR.nw*CR.s0,h=CR.nh*CR.s0;CR.x=F.l+(F.w-w)/2;CR.y=F.t+(F.h-h)/2;$('#cropZ').value=100;crDraw()}},true);
/* share: fill previews from the open event */
function shFill(){const sec=$$('section.scr').find(s=>!s.hidden&&s.classList.contains('ev'))||$('section[data-id=event]');
 const ph=sec&&sec.querySelector('.evph');const bg=ph&&ph.style.backgroundImage||'url(a/run05.webp)';
 const tt=sec&&sec.querySelector('.title');const title=tt?tt.innerHTML:'Пробежка<br><em>на рассвете</em>';const plain=tt?tt.innerHTML.replace(/<br\s*\/?>/g,' ').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim():'Пробежка на рассвете';
 const chip=sec&&[...sec.querySelectorAll('.card>.chip')].map(x=>x.textContent.trim()).find(Boolean)||'Встреча';
 const when=sec&&sec.querySelector('.tiles .tile b');const w=when?when.childNodes[0].textContent.trim():'';
 const tiles=sec?[...sec.querySelectorAll('.tiles .tile b')].map(b=>b.childNodes[0].textContent.trim()):[];
 const pb=sec&&[...sec.querySelectorAll('.blk')].find(b=>{const h=b.querySelector('.bh');return h&&/Место/.test(h.textContent)});const pp=pb&&pb.querySelector('p');const pl=(pp&&pp.textContent.split('·')[0].split(',')[0].trim())||'';
 const meta=[pl,tiles[1],tiles[2]&&(/₽/.test(tiles[2])?tiles[2]:tiles[2].toLowerCase())].filter(Boolean).join(' · ');
 $$('[data-sh=title]').forEach(x=>x.innerHTML=title);$$('[data-sh=titleplain]').forEach(x=>x.textContent=plain);
 $$('[data-sh=chip]').forEach(x=>x.textContent=chip.split('·')[0].trim()+(w?' · '+w:''));$$('[data-sh=meta]').forEach(x=>x.textContent=meta);
 ['#storyCard','#s9','.ogimg'].forEach(s=>$$(s).forEach(el=>el.style.backgroundImage=bg))}
document.addEventListener('click',e=>{if(e.target.closest('[data-ov=shareSheet]'))shFill();
 const t=e.target.closest('[data-shto]');if(!t)return;e.stopPropagation();const o=t.dataset.shto,n=t.dataset.shnet;
 if(!o){closeOv();try{navigator.clipboard.writeText('https://mesto-go.ru/e/7Kq2').catch(()=>{})}catch(_){}toast('Ссылка скопирована');return}
 const L={tg:'Так увидят в Telegram',wa:'Так увидят в WhatsApp',vk:'Так увидят во ВКонтакте'};const ln=$('[data-lnet]');if(ln&&L[n])ln.textContent=L[n];
 closeOv();setTimeout(()=>openOv(o),300)},true);
/* afisha: category + days */
let AFC='Все';
function afFilter(){const days=DAYSEL.afisha||[];let n=0;$$('section[data-id=afisha] .dgrp').forEach(g=>{let k=0;g.querySelectorAll('.afr').forEach(el=>{const v=!el.dataset.cityOff&&(!days.length||days.includes(el.dataset.d))&&(AFC==='Все'||el.dataset.cat.split('|').includes(AFC));el.hidden=!v;if(v)k++});g.hidden=!k;n+=k});
 const ce=$('section[data-id=afisha] [data-cityempty]'),cityNone=ce&&!ce.hidden;const e=$('[data-afempty]');if(e)e.hidden=n>0||cityNone}
document.addEventListener('click',e=>{const c=e.target.closest('[data-afcv]');if(c){$$('[data-afcv]').forEach(x=>x.classList.toggle('on',x===c));AFC=c.dataset.afcv;afFilter();return}
 if(e.target.closest('[data-afreset]')){AFC='Все';$$('[data-afcv]').forEach((x,i)=>x.classList.toggle('on',i===0));setDays('afisha',[],false)}
 const sd=e.target.closest('[data-sd]');if(sd){const s=sd.closest('[data-stp]'),b=s.querySelector('b');const v=Math.min(+s.dataset.max,Math.max(+s.dataset.min,+b.textContent+ +sd.dataset.sd*+s.dataset.step));if(v==+b.textContent)toast(sd.dataset.sd>0?'Максимум по тарифу — '+s.dataset.max:'Минимум — '+s.dataset.min);b.textContent=v}});
/* search */
function sFilter(){if(!sq)return;const q=sq.value.trim().toLowerCase();const L=$$('#sList .evx');let n=0;L.forEach(el=>{const v=!el.dataset.cityOff&&(!SK||el.dataset.k===SK)&&(!q||el.textContent.toLowerCase().includes(q));el.hidden=!v;if(v)n++});
 $('#sEmpty').hidden=n>0;$('#sHints').hidden=!!q;$('[data-sx]').hidden=!q;$('#sCnt').textContent=q?(n?('Нашли: '+n):'По запросу «'+sq.value.trim()+'»'):(SK==='Афиша'?'События заведений':SK?'Личные встречи':'Все встречи и события')}
if(sq){sq.addEventListener('input',sFilter)}
document.addEventListener('click',e=>{const k=e.target.closest('[data-skv]');if(k){$$('[data-skv]').forEach(x=>x.classList.toggle('on',x===k));SK=k.dataset.skv;sFilter()}
 const h=e.target.closest('[data-sq]');if(h&&sq){sq.value=h.dataset.sq;sFilter()}
 if(e.target.closest('[data-sx]')&&sq){sq.value='';sFilter();sq.focus()}
 if(e.target.closest('[data-go=search]'))setTimeout(()=>{if(sq)sq.focus()},450)});
/* boost */
document.addEventListener('click',e=>{const o=e.target.closest('[data-bopt] .bo');if(o){$$('.bo',o.parentElement).forEach(x=>x.classList.toggle('on',x===o))}
 const b=e.target.closest('[data-boost]');if(b){const free=$('#'+b.dataset.boost+' .bo.on')===$('#'+b.dataset.boost+' .bo');
  toast(free?'Готово — ты в топе на 24 часа':'Оплата 149 ₽ · ты в топе на 24 часа');
  const sec=b.dataset.boost==='boostBiz'?'mybiz':'myevent';const t=$(`section[data-id=${sec}] [data-topb]`);if(t){t.classList.add('on');t.querySelector('b').textContent='В топе · ещё 24 ч';t.querySelector('small').textContent='Посмотрели 0 · обновим через час';t.querySelector('.tp').textContent='';t.removeAttribute('data-ov')}}});
/* plans */
document.addEventListener('click',e=>{const p=e.target.closest('[data-plan]');if(!p)return;$$('[data-plan]').forEach(x=>x.classList.toggle('on',x===p));const g=$('#planGo');const cur=p.classList.contains('cur');
 const n=p.querySelector('.ph b').textContent,pr=p.querySelector('.ph span').textContent;g.textContent=cur?'Текущий тариф':(p.dataset.plan==='free'?'Перейти на бесплатный':'Подключить '+n+' · '+pr);g.dataset.toast=cur?'Тариф уже подключён':(p.dataset.plan==='free'?'Тариф сменится после окончания периода':'Оплата картой или Telegram Stars')});
})();
})();
