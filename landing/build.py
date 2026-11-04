import os
HERE=os.path.dirname(os.path.abspath(__file__))
import base64,re
src=open(os.path.join(HERE,'index.src.html'),encoding='utf-8').read()
M="m199.38,263.07c1.17,4.8,3.55,17.44,6.39,34.37l7.71-.89-6.13-33.34c-.14-.73-.28-1.47-.5-2.18-1.63-5.33-5.53-9.51-10.83-11.58-5.62-2.19-11.96-1.49-16.94,1.86-1.19.85-2.38,1.7-3.57,2.55-4.62-4.09-9.66-6.15-14.22-5.8-5.48.42-10.63,4.98-14.69,12.95l.4-15.75-7.77-.18-1.34,53.15,7.83.16c.8-12.08,3.1-23.08,6.52-31.13,2.92-6.88,6.62-11.3,9.64-11.53,2.2-.17,5.05,1.08,7.89,3.43-4.12,4.65-6.44,9.78-6.9,15.3-.67,8.02,1.43,14.39,5.9,17.92,3.2,2.52,7.71,3.2,11.49,1.74,1.03-.37,4.55-1.92,6.56-6.19,1.81-3.87,2.12-8.68.88-13.91-1.07-4.5-3.2-9.1-6.16-13.32-.26-.38-.53-.75-.8-1.11.48-.39,1.19-.92,2.1-1.49,1.69-1.06,3.54-2.21,5.73-2.51,3.52-.48,7.19,1.34,9.17,3.91,1.16,1.5,1.54,3.01,1.68,3.58Zm-19.62,21.62c-.77,1.64-2.1,2.17-2.14,2.19l-.16.06c-1.43.57-2.97.12-3.85-.58-2.35-1.86-3.45-5.97-3.01-11.28v-.06c.3-3.52,1.78-6.92,4.42-10.12,5,7.03,6.95,15.07,4.74,19.78Z"
rest='<path d="m222.52,274.41c.79,8.04,7.16,14.58,15.38,14.58,6.89,0,11.76-2.83,14.85-9.63l6.36,1.86c-3.01,9.72-10.43,14.41-21.21,14.41-12.64,0-22.54-10.34-22.54-22.98s9.28-22.98,21.92-22.98c14.32,0,22.72,11.67,22.36,24.75h-37.12Zm28.99-5.75c-1.95-7.78-7.43-12.38-14.23-12.38-7.51,0-12.91,5.39-14.41,12.38h28.64Z"/><path d="m301.6,278.13h7.07c-2.3,11.58-10.96,17.5-21.75,17.5-12.64,0-22.54-10.34-22.54-22.98s9.9-22.98,22.54-22.98c10.78,0,19.45,5.92,21.75,17.5h-7.07c-1.94-7.87-7.78-10.87-14.67-10.87-8.84,0-15.47,7.51-15.47,16.35s6.63,16.35,15.47,16.35c6.89,0,12.73-3.01,14.67-10.87Z"/><path d="m308.28,250.55h35.62v5.75h-15.2v23.6c0,6.1,3,9.1,9.1,9.1h2.39v5.75h-4.6c-9.37,0-13.97-4.6-13.97-13.97v-24.49h-13.35v-5.75Z"/><path d="m365.8,249.66c12.64,0,22.98,10.34,22.98,22.98s-10.34,22.98-22.98,22.98-22.98-10.34-22.98-22.98,10.34-22.98,22.98-22.98Zm0,39.34c8.84,0,15.91-7.51,15.91-16.35s-7.07-16.35-15.91-16.35-15.91,7.51-15.91,16.35,7.07,16.35,15.91,16.35Z"/>'
logo='<svg viewBox="137.89 245.08 250.89 53.31" role="img" aria-label="Место"><g fill="currentColor"><path d="'+M+'"/>'+rest+'</g></svg>'
src=src.replace('__LOGO__',logo).replace('__MPATH__',M).replace('viewBox="137.89 245.08 70 53.31"','viewBox="137.89 245.08 76 53.31"')
SHORT='в|во|и|с|со|к|ко|на|по|за|не|ни|но|от|до|из|у|о|об|а|я|ты|мы|вы|он|как|что|для|без|при|под|над|или|же|ли|то|это|все|уже|кто|где|так|чем|про|раз|бы'
reW=re.compile(r'(?<![А-Яа-яЁёA-Za-z0-9-])('+SHORT+r')\s+',re.I)
def typo(t):
    for _ in range(2): t=reW.sub(lambda m:m.group(1)+'\u00A0',t)
    t=re.sub(r'\s+([—–])\s',lambda m:' '+m.group(1)+' ',t)
    t=re.sub(r'\s([а-яёА-ЯЁ]{1,3})(?=[.,!?;:…»)]|$)',lambda m:'\u00A0'+m.group(1),t)
    t=re.sub(r'(\d)\s+(км|₽|из|мест)',lambda m:m.group(1)+' '+m.group(2),t)
    return t
parts=re.split(r'(<script[\s\S]*?</script>|<style[\s\S]*?</style>|<[^>]+>)',src)
src=''.join(p if p.startswith('<') else typo(p) for p in parts)
for n in ['run','wave']:
    src=src.replace(f'__MOSYA_{n}__','data:image/webp;base64,'+base64.b64encode(open(os.path.join(HERE,'assets','mascot',f'{n}.webp'),'rb').read()).decode())
for n in ['kofe','kino','run','gym','party','art','games','hike']:
    src=src.replace(f'__ICON_{n}__','data:image/webp;base64,'+base64.b64encode(open(os.path.join(HERE,'assets','icons',f'{n}.webp'),'rb').read()).decode())
assert not re.findall(r'__[A-Z]+_?[a-z]*__',src)
src=src.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','')
CSP=("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; "
     "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'")
HEAD=('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
      '<meta http-equiv="Content-Security-Policy" content="'+CSP+'">\n'
      '<meta name="referrer" content="strict-origin-when-cross-origin">\n'
      '<meta name="format-detection" content="telephone=no">\n'
      # Открыли из Telegram (мини-приложение) — сразу в приложение (/app), параметры запуска Telegram — в #hash.
      '<script>(function(){try{var h=location.hash||"",q=location.search||"";if(/tgWebApp/.test(h)||/tgWebApp/.test(q)||window.TelegramWebviewProxy){location.replace("/app"+q+h);}}catch(e){}})();</script>\n'
      '<link rel="canonical" href="https://mesto-go.ru/">\n<meta property="og:url" content="https://mesto-go.ru/">\n')
# head part = everything before first <style> ends; body = rest
i=src.index('</style>')+len('</style>')
src=HEAD+src[:i]+'\n</head>\n<body>\n'+src[i:]+'\n</body>\n</html>\n'
# Готовая страница — в public/site/index.html (её отдаёт «/», см. middleware.ts)
src=src.replace('href="#top">Политика конфиденциальности','href="/legal/privacy">Политика конфиденциальности').replace('href="#top">Пользовательское соглаше','href="/legal/offer">Пользовательское соглаше')
open(os.path.join(HERE,'..','public','site','index.html'),'w').write(src);print(len(src))
