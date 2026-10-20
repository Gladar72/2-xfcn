import json,glob,sys
D='/tmp/claude-0/-home-claude/abede204-acfd-581c-a1c4-e82f2bf9148e/scratchpad/picks'
city=sys.argv[1] if len(sys.argv)>1 else 'Тюмень'
rows=[]
for f in sorted(glob.glob(D+'/*.json')):
    try: rows+=json.load(open(f))
    except Exception as e: print('bad',f,e,file=sys.stderr)
def q(v):
    if v is None or v=='': return 'null'
    if isinstance(v,(int,float)): return str(v)
    return "'"+str(v).replace("'","''")+"'"
out=['-- Подборка «Мося рекомендует» (сгенерировано). Идемпотентно: on conflict обновляет данные.']
n=0;seen=set()
for i,r in enumerate(rows):
    try:
        lat,lon=float(r['lat']),float(r['lon'])
    except: continue
    if not (56.9<lat<57.4 and 65.2<lon<65.9) and city=='Тюмень': print('skip coords',r['name'],file=sys.stderr);continue
    cat=r['category']; tt=r.get('type') or None
    if cat!='training': tt=None
    k=(cat,tt,r['name'].lower())
    if k in seen: continue
    seen.add(k)
    rating=r.get('rating'); rating=round(float(rating),1) if rating not in (None,'') else None
    rev=r.get('reviews'); rev=int(rev) if rev not in (None,'') else None
    out.append(f"insert into public.place_picks (city,category,training_type,name,address,latitude,longitude,rating,reviews,note,source,sort) values ({q(city)},{q(cat)},{q(tt)},{q(r['name'])},{q(r.get('address') or '')},{lat},{lon},{q(rating)},{q(rev)},{q(r.get('note'))},{q(r.get('source'))},0) on conflict (city, category, coalesce(training_type, ''), lower(name)) do update set address=excluded.address, latitude=excluded.latitude, longitude=excluded.longitude, rating=excluded.rating, reviews=excluded.reviews, note=excluded.note, source=excluded.source, updated_at=now();")
    n+=1
open('/home/claude/2-xfcn/deploy/yandex/place-picks.sql','w').write('\n'.join(out)+'\n')
print(n,'rows')
