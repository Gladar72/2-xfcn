import os
D = os.path.dirname(os.path.abspath(__file__))
C = dict(lp="#E9E0FF", b="#2F6BFF", v="#7A4DFF", p="#FF4F9A", o="#FF8A3D", y="#FFC93C", c="#2FD3FF", g="#2FD98A", l="#B58CFF", w="#FFFFFF", r="#FF4A4A")

gid = [0]
def grad(a, b, x1=0, y1=0, x2=1, y2=1):
    gid[0] += 1
    i = f"g{gid[0]}"
    return i, f'<linearGradient id="{i}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"><stop offset="0" stop-color="{C[a]}"/><stop offset="1" stop-color="{C[b]}"/></linearGradient>'

def icon(parts):
    defs, body = "", ""
    for tag, a, b, extra in parts:
        if b:
            i, d = grad(a, b, *extra.get("dir", (0, 0, 1, 1)))
            defs += d; fill = f"url(#{i})"
        else:
            fill = C[a]
        op = extra.get("op", 1)
        body += tag.replace("FILL", f'fill="{fill}" opacity="{op}"')
    return f'<svg viewBox="0 0 100 100"><defs>{defs}</defs>{body}</svg>'

E = {}
E["Кофе"] = icon([
 ('<path d="M18 38h52v18a26 26 0 0 1-26 26a26 26 0 0 1-26-26z" FILL/>', "o", "p", {}),
 ('<path d="M62 44a16 16 0 1 1 0 26v-10a6 6 0 1 0 0-6z" FILL/>', "b", "c", {"op": .9}),
 ('<rect x="30" y="12" width="9" height="20" rx="4.5" FILL/>', "l", "v", {"dir": (0, 0, 0, 1)}),
 ('<rect x="46" y="16" width="9" height="16" rx="4.5" FILL/>', "y", "o", {"dir": (0, 0, 0, 1)})])
E["Кино"] = icon([
 ('<rect x="10" y="26" width="58" height="52" rx="16" FILL/>', "b", "v", {}),
 ('<path d="M60 40l28-14v52l-28-14z" FILL/>', "p", "o", {"op": .92}),
 ('<path d="M32 40l20 12-20 12z" FILL/>', "w", None, {})])
E["Бег"] = icon([
 ('<path d="M10 66c0-6 4-10 10-10h14l10-22c3-6 12-6 15 1l6 14c2 5 6 8 12 9l9 2c5 1 8 5 8 10v4H18a8 8 0 0 1-8-8z" FILL/>', "v", "p", {"dir": (0, 0, 1, 0)}),
 ('<rect x="10" y="74" width="80" height="10" rx="5" FILL/>', "c", "b", {"dir": (0, 0, 1, 0), "op": .95}),
 ('<path d="M46 40l10 4M42 48l10 4" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".85"/>', "w", None, {})])
E["Йога"] = icon([
 ('<ellipse cx="50" cy="44" rx="14" ry="30" FILL/>', "p", "l", {"dir": (0, 0, 0, 1)}),
 ('<ellipse cx="50" cy="44" rx="14" ry="30" transform="rotate(-50 50 70)" FILL/>', "v", "b", {"op": .85}),
 ('<ellipse cx="50" cy="44" rx="14" ry="30" transform="rotate(50 50 70)" FILL/>', "o", "y", {"op": .85}),
 ('<rect x="16" y="76" width="68" height="9" rx="4.5" FILL/>', "c", "b", {"dir": (0, 0, 1, 0)})])
E["Зал"] = icon([
 ('<rect x="24" y="44" width="52" height="12" rx="6" FILL/>', "l", "v", {"dir": (0, 0, 1, 0)}),
 ('<rect x="10" y="26" width="20" height="48" rx="10" FILL/>', "b", "c", {}),
 ('<rect x="70" y="26" width="20" height="48" rx="10" FILL/>', "p", "o", {})])
E["Падел"] = icon([
 ('<circle cx="42" cy="40" r="28" FILL/>', "v", "p", {}),
 ('<rect x="14" y="62" width="14" height="32" rx="7" transform="rotate(45 21 78)" FILL/>', "b", "c", {"op": .92}),
 ('<circle cx="78" cy="76" r="12" FILL/>', "y", "g", {})])
E["Футбол"] = icon([
 ('<circle cx="50" cy="50" r="38" FILL/>', "g", "c", {}),
 ('<path d="M50 32l17 12-6.5 20h-21L33 44z" FILL/>', "w", None, {}),
 ('<path d="M50 12a38 38 0 0 1 30 15l-13 17-17-12z" FILL/>', "b", "v", {"op": .55})])
E["Вело"] = icon([
 ('<circle cx="26" cy="64" r="18" fill="none" stroke="url(#X1)" stroke-width="10"/>', "w", None, {}),
 ('<circle cx="74" cy="64" r="18" fill="none" stroke="url(#X2)" stroke-width="10" opacity=".92"/>', "w", None, {}),
 ('<path d="M26 64l16-30h22l10 30" fill="none" stroke="#7A4DFF" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>', "w", None, {})])
E["Вело"] = E["Вело"].replace("<defs>", '<defs><linearGradient id="X1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F6BFF"/><stop offset="1" stop-color="#2FD3FF"/></linearGradient><linearGradient id="X2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4F9A"/><stop offset="1" stop-color="#FF8A3D"/></linearGradient>')
E["Прогулка"] = icon([
 ('<ellipse cx="34" cy="58" rx="14" ry="22" transform="rotate(-12 34 58)" FILL/>', "v", "b", {}),
 ('<ellipse cx="66" cy="40" rx="14" ry="22" transform="rotate(12 66 40)" FILL/>', "p", "o", {"op": .92}),
 ('<circle cx="30" cy="86" r="7" FILL/>', "c", None, {}),
 ('<circle cx="70" cy="70" r="7" FILL/>', "y", None, {})])
E["Вечеринка"] = icon([
 ('<path d="M12 90l20-56 36 36z" FILL/>', "v", "p", {}),
 ('<circle cx="66" cy="22" r="8" FILL/>', "y", None, {}),
 ('<circle cx="84" cy="44" r="6" FILL/>', "c", None, {}),
 ('<rect x="46" y="8" width="8" height="18" rx="4" transform="rotate(20 50 17)" FILL/>', "o", None, {}),
 ('<rect x="76" y="58" width="8" height="18" rx="4" transform="rotate(-60 80 67)" FILL/>', "g", None, {}),
 ('<path d="M26 52l22 22" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".75"/>', "w", None, {})])
E["Бар"] = icon([
 ('<path d="M12 18h76L50 58z" FILL/>', "p", "v", {}),
 ('<rect x="45" y="54" width="10" height="30" rx="5" FILL/>', "l", "b", {"dir": (0, 0, 0, 1)}),
 ('<rect x="28" y="80" width="44" height="10" rx="5" FILL/>', "b", "c", {"dir": (0, 0, 1, 0)}),
 ('<circle cx="64" cy="28" r="10" FILL/>', "y", "g", {"op": .95})])
E["Ужин"] = icon([
 ('<circle cx="54" cy="52" r="34" FILL/>', "o", "p", {}),
 ('<circle cx="54" cy="52" r="18" FILL/>', "w", None, {"op": .9}),
 ('<rect x="8" y="12" width="12" height="76" rx="6" FILL/>', "b", "v", {"dir": (0, 0, 0, 1), "op": .95})])
E["Завтрак"] = icon([
 ('<path d="M20 34c8-20 34-26 52-12 16 12 20 32 10 46-9 13-8 24-28 22-17-2-22-10-36-18-12-8-6-24 2-38z" FILL/>', "w", "l", {"dir": (0, 0, 1, 1), "op": .95}),
 ('<circle cx="52" cy="50" r="17" FILL/>', "y", "o", {})])
E["Бизнес"] = icon([
 ('<path d="M36 26v-6a8 8 0 0 1 8-8h12a8 8 0 0 1 8 8v6" fill="none" stroke="#7A4DFF" stroke-width="8"/>', "w", None, {}),
 ('<rect x="8" y="26" width="84" height="60" rx="16" FILL/>', "b", "v", {}),
 ('<rect x="8" y="46" width="84" height="14" FILL/>', "c", "b", {"dir": (0, 0, 1, 0), "op": .6}),
 ('<rect x="42" y="44" width="16" height="18" rx="5" FILL/>', "y", "o", {})])
E["Музыка"] = icon([
 ('<path d="M34 20l52-10v14l-52 10z" FILL/>', "p", "o", {"dir": (0, 0, 1, 0)}),
 ('<rect x="30" y="22" width="9" height="56" rx="4.5" FILL/>', "v", "b", {"dir": (0, 0, 0, 1)}),
 ('<rect x="78" y="12" width="9" height="56" rx="4.5" FILL/>', "v", "b", {"dir": (0, 0, 0, 1)}),
 ('<circle cx="24" cy="78" r="14" FILL/>', "b", "c", {}),
 ('<circle cx="72" cy="68" r="14" FILL/>', "p", "l", {"op": .92})])
E["Книги"] = icon([
 ('<path d="M8 22c16-6 30-4 42 6v60c-12-10-26-12-42-6z" FILL/>', "b", "c", {}),
 ('<path d="M92 22c-16-6-30-4-42 6v60c12-10 26-12 42-6z" FILL/>', "p", "o", {"op": .9})])
E["Путешествия"] = icon([
 ('<circle cx="50" cy="50" r="28" FILL/>', "b", "c", {}),
 ('<ellipse cx="50" cy="52" rx="46" ry="13" transform="rotate(-18 50 52)" fill="none" stroke="url(#R)" stroke-width="7" opacity=".95"/>', "w", None, {}),
 ('<path d="M22 48a28 28 0 0 1 56 0z" FILL/>', "v", "l", {"op": .5})])
E["Путешествия"] = E["Путешествия"].replace("<defs>", '<defs><linearGradient id="R" x1="0" x2="1"><stop offset="0" stop-color="#FF4F9A"/><stop offset="1" stop-color="#FFC93C"/></linearGradient>')
E["Настолки"] = icon([
 ('<rect x="10" y="10" width="80" height="80" rx="22" FILL/>', "v", "p", {}),
 ('<path d="M10 54h80v14a22 22 0 0 1-22 22H32a22 22 0 0 1-22-22z" FILL/>', "o", "y", {"op": .55}),
 ('<g fill="#fff"><circle cx="32" cy="32" r="7"/><circle cx="68" cy="32" r="7"/><circle cx="50" cy="50" r="7"/><circle cx="32" cy="68" r="7"/><circle cx="68" cy="68" r="7"/></g>', "w", None, {})])
E["Природа"] = icon([
 ('<path d="M36 14L8 82h56z" FILL/>', "g", "c", {"dir": (0, 0, 0, 1)}),
 ('<path d="M66 28L38 86h56z" FILL/>', "b", "v", {"dir": (0, 0, 0, 1), "op": .88}),
 ('<circle cx="80" cy="18" r="9" FILL/>', "y", "o", {})])
E["Танцы"] = icon([
 ('<path d="M50 6c4 22 10 30 32 34-22 4-28 12-32 34-4-22-10-30-32-34 22-4 28-12 32-34z" FILL/>', "p", "v", {}),
 ('<circle cx="76" cy="76" r="14" FILL/>', "c", "b", {"op": .92}),
 ('<circle cx="22" cy="80" r="8" FILL/>', "y", "o", {})])

CSS = """
@font-face{font-family:ID;src:url(file:///usr/share/fonts/opentype/inter/InterDisplay-Medium.otf);font-weight:500}
@font-face{font-family:ID;src:url(file:///usr/share/fonts/opentype/inter/InterDisplay-Light.otf);font-weight:300}
*{margin:0;box-sizing:border-box}body{width:1400px;font-family:ID}
.half{padding:48px 56px}
.lt{background:linear-gradient(180deg,#F5F3F8,#ECE8F2);color:#17141F}.dk{background:#0C0B10;color:#fff}
h1{font:300 40px ID;letter-spacing:-1px;margin-bottom:28px}
.grid{display:grid;grid-template-columns:repeat(10,1fr);gap:22px 8px}
.it{display:flex;flex-direction:column;align-items:center;gap:10px;font:500 14px ID}
.it svg{width:76px;height:76px}
.chips{display:flex;gap:10px;margin-top:30px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px 0 10px;border-radius:22px;background:rgba(255,255,255,.7);border:1px solid #fff;font:500 16px ID}
.chip svg{width:26px;height:26px}
.chip.on{background:#17141F;color:#fff}
"""
items = "".join(f'<div class="it">{svg}{n}</div>' for n, svg in E.items())
chips = "".join(f'<span class="chip{" on" if i==0 else ""}">{E[n]}{n}</span>' for i, n in enumerate(["Кофе", "Кино", "Бег", "Бар", "Музыка", "Падел", "Йога"]))
html = (f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>"
        f"<div class='half lt'><h1>Иконки интересов · на светлом</h1><div class='grid'>{items}</div><div class='chips'>{chips}</div></div>"
        f"<div class='half dk'><h1>На тёмном</h1><div class='grid'>{items}</div></div></body></html>")
open(os.path.join(D, "icons2.html"), "w").write(html)
os.makedirs(os.path.join(D, "ico"), exist_ok=True)
for n, svg in E.items():
    open(os.path.join(D, "ico", n + ".svg"), "w").write(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '))
