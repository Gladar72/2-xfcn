import os, sys, io, contextlib
D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D); os.chdir(D)
with contextlib.redirect_stdout(io.StringIO()):
    import icons2
icon = icons2.icon
E = {}
E["Hyrox"] = icon([
 ('<path d="M14 70h40l14-26h18v12H74L60 82H14z" FILL/>', "v", "b", {}),
 ('<circle cx="26" cy="86" r="8" FILL/>', "c", None, {}), ('<circle cx="52" cy="86" r="8" FILL/>', "p", None, {}),
 ('<path d="M64 14h16a6 6 0 0 1 6 6v6a14 14 0 1 1-28 0v-6a6 6 0 0 1 6-6z" FILL/>', "o", "p", {"op": .92})])
E["Триатлон"] = icon([
 ('<circle cx="30" cy="40" r="18" fill="none" stroke="#2F6BFF" stroke-width="9"/>', "w", None, {}),
 ('<circle cx="70" cy="40" r="18" fill="none" stroke="#FF4F9A" stroke-width="9" opacity=".92"/>', "w", None, {}),
 ('<circle cx="50" cy="66" r="18" fill="none" stroke="#FF8A3D" stroke-width="9" opacity=".9"/>', "w", None, {})])
E["Плавание"] = icon([
 ('<circle cx="66" cy="26" r="10" FILL/>', "y", "o", {}),
 ('<path d="M14 50l26-14 14 12-12 8z" FILL/>', "v", "p", {}),
 ('<path d="M8 66c8-6 14-6 21 0s14 6 21 0 14-6 21 0 14 6 21 0v10c-8 6-14 6-21 0s-14-6-21 0-14 6-21 0-14-6-21 0z" FILL/>', "b", "c", {"dir": (0, 0, 1, 0)}),
 ('<path d="M8 84c8-6 14-6 21 0s14 6 21 0 14-6 21 0 14 6 21 0v8H8z" FILL/>', "c", "g", {"dir": (0, 0, 1, 0), "op": .8})])
E["Валяться дома"] = icon([
 ('<rect x="10" y="44" width="80" height="32" rx="14" FILL/>', "v", "p", {}),
 ('<rect x="20" y="26" width="60" height="26" rx="12" FILL/>', "b", "l", {"op": .9}),
 ('<rect x="14" y="76" width="8" height="12" rx="4" FILL/>', "v", None, {}), ('<rect x="78" y="76" width="8" height="12" rx="4" FILL/>', "v", None, {}),
 ('<path d="M66 8h14l-14 14h14" fill="none" stroke="#FFC93C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>', "w", None, {})])
E["Походы"] = icon([
 ('<path d="M8 86L40 30l18 30 10-14 24 40z" FILL/>', "g", "c", {"dir": (0, 0, 0, 1)}),
 ('<path d="M40 30l8 14-8 6-8-6z" FILL/>', "w", None, {}),
 ('<circle cx="78" cy="20" r="9" FILL/>', "y", "o", {})])
E["Кемпинг"] = icon([
 ('<path d="M50 12L8 86h84z" FILL/>', "o", "p", {"dir": (0, 0, 0, 1)}),
 ('<path d="M50 50L34 86h32z" FILL/>', "v", "b", {}),
 ('<path d="M50 12v74" stroke="#fff" stroke-width="4" opacity=".6"/>', "w", None, {})])
E["Лыжи"] = icon([
 ('<path d="M50 10l12 22H38z" FILL/>', "w", None, {}),
 ('<path d="M50 10L88 78H12z" FILL/>', "b", "c", {"dir": (0, 0, 0, 1), "op": .95}),
 ('<path d="M50 10l12 22-6 4-6-6-6 6-6-4z" FILL/>', "w", None, {}),
 ('<rect x="8" y="84" width="84" height="8" rx="4" transform="rotate(-8 50 88)" FILL/>', "p", "o", {"dir": (0, 0, 1, 0)})])
E["Теннис"] = icon([
 ('<circle cx="50" cy="50" r="36" FILL/>', "y", "g", {}),
 ('<path d="M22 24c14 10 18 24 14 40M78 76c-14-10-18-24-14-40" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>', "w", None, {})])
E["Единоборства"] = icon([
 ('<path d="M24 30a18 18 0 0 1 18-18h20a18 18 0 0 1 18 18v20a20 20 0 0 1-20 20H40a16 16 0 0 1-16-16z" FILL/>', "p", "o", {}),
 ('<rect x="30" y="70" width="40" height="20" rx="6" FILL/>', "b", "v", {}),
 ('<path d="M36 40h20" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".7"/>', "w", None, {})])
E["Ролики"] = icon([
 ('<path d="M26 12h24v34l26 10a10 10 0 0 1 6 9v7H26z" FILL/>', "v", "p", {}),
 ('<circle cx="34" cy="84" r="8" FILL/>', "c", None, {}), ('<circle cx="54" cy="84" r="8" FILL/>', "b", None, {}), ('<circle cx="74" cy="84" r="8" FILL/>', "o", None, {})])
E["Фотография"] = icon([
 ('<rect x="8" y="28" width="84" height="58" rx="16" FILL/>', "b", "v", {}),
 ('<rect x="32" y="16" width="30" height="16" rx="6" FILL/>', "l", "v", {}),
 ('<circle cx="50" cy="57" r="18" FILL/>', "p", "o", {"op": .95}), ('<circle cx="50" cy="57" r="8" FILL/>', "w", None, {"op": .9})])
E["Театр"] = icon([
 ('<path d="M10 16h46v26a23 23 0 0 1-46 0z" FILL/>', "v", "b", {}),
 ('<path d="M44 34h46v26a23 23 0 0 1-46 0z" FILL/>', "p", "o", {"op": .9}),
 ('<path d="M22 48q11 8 22 0M58 70q11-8 22 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>', "w", None, {})])
E["Караоке"] = icon([
 ('<circle cx="62" cy="34" r="22" FILL/>', "p", "v", {}),
 ('<path d="M46 50L14 86l-4-4 34-34z" FILL/>', "b", "c", {}),
 ('<path d="M52 24l20 20" stroke="#fff" stroke-width="5" opacity=".6" stroke-linecap="round"/>', "w", None, {})])
E["Джем‑сейшны"] = icon([
 ('<path d="M36 46a18 18 0 1 0 22 22l6-6a16 16 0 0 0-8-26z" FILL/>', "o", "p", {}),
 ('<rect x="56" y="10" width="10" height="46" rx="5" transform="rotate(40 61 33)" FILL/>', "v", "b", {}),
 ('<circle cx="42" cy="62" r="7" FILL/>', "w", None, {"op": .9})])
E["Выставки"] = icon([
 ('<rect x="10" y="10" width="80" height="80" rx="18" FILL/>', "l", "v", {}),
 ('<path d="M18 80l22-30 14 18 10-12 18 24z" FILL/>', "b", "c", {}),
 ('<circle cx="68" cy="32" r="9" FILL/>', "y", "o", {})])
E["Концерты"] = icon([
 ('<path d="M50 8l10 22 24 2-18 16 6 24-22-13-22 13 6-24-18-16 24-2z" FILL/>', "p", "o", {}),
 ('<rect x="10" y="80" width="80" height="10" rx="5" FILL/>', "b", "v", {"dir": (0, 0, 1, 0)})])
E["Стритфуд"] = icon([
 ('<path d="M50 8L92 86H8z" FILL/>', "y", "o", {"dir": (0, 0, 0, 1)}),
 ('<circle cx="42" cy="56" r="7" FILL/>', "p", None, {}), ('<circle cx="60" cy="68" r="7" FILL/>', "p", None, {}), ('<circle cx="52" cy="38" r="5" FILL/>', "g", None, {}),
 ('<path d="M8 86h84" stroke="#FF8A3D" stroke-width="8" stroke-linecap="round"/>', "w", None, {})])
E["Кулинария"] = icon([
 ('<path d="M24 44a14 14 0 0 1 6-26 18 18 0 0 1 34-2 14 14 0 0 1 12 28z" FILL/>', "w", "l", {}),
 ('<rect x="28" y="44" width="44" height="40" rx="8" FILL/>', "v", "b", {}),
 ('<path d="M40 56v18M60 56v18" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/>', "w", None, {})])
E["Собаки"] = icon([
 ('<ellipse cx="50" cy="62" rx="22" ry="20" FILL/>', "o", "p", {}),
 ('<ellipse cx="22" cy="40" rx="9" ry="12" FILL/>', "v", None, {}), ('<ellipse cx="40" cy="22" rx="9" ry="12" FILL/>', "b", None, {}),
 ('<ellipse cx="60" cy="22" rx="9" ry="12" FILL/>', "b", None, {}), ('<ellipse cx="78" cy="40" rx="9" ry="12" FILL/>', "v", None, {})])
E["Нетворкинг"] = icon([
 ('<circle cx="30" cy="34" r="14" FILL/>', "b", "c", {}), ('<circle cx="70" cy="34" r="14" FILL/>', "p", "o", {}),
 ('<path d="M8 84a22 22 0 0 1 44 0z" FILL/>', "b", "v", {}), ('<path d="M48 84a22 22 0 0 1 44 0z" FILL/>', "p", "v", {"op": .9})])
E["Баня"] = icon([
 ('<path d="M12 50L50 18l38 32v38H12z" FILL/>', "o", "p", {"dir": (0, 0, 0, 1)}),
 ('<path d="M38 66c-6-6 6-10 0-18M52 66c-6-6 6-10 0-18M66 66c-6-6 6-10 0-18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>', "w", None, {})])
E["Языки"] = icon([
 ('<path d="M10 18a10 10 0 0 1 10-10h40a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H32L18 66V54a10 10 0 0 1-8-10z" FILL/>', "b", "c", {}),
 ('<path d="M90 44a10 10 0 0 0-10-10H48a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24l12 12V78a10 10 0 0 0 6-10z" FILL/>', "p", "o", {"op": .9}),
 ('<text x="40" y="38" font-family="Inter,sans-serif" font-weight="700" font-size="22" fill="#fff" text-anchor="middle">A</text><text x="64" y="64" font-family="Inter,sans-serif" font-weight="700" font-size="20" fill="#fff" text-anchor="middle">Я</text>', "w", None, {})])
E["Квизы"] = icon([
 ('<circle cx="50" cy="50" r="38" FILL/>', "v", "p", {}),
 ('<text x="50" y="66" font-family="Inter,sans-serif" font-weight="700" font-size="46" fill="#fff" text-anchor="middle">?</text>', "w", None, {})])
for n, svg in E.items():
    open(os.path.join(D, "ico", n + ".svg"), "w").write(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1) if 'xmlns' not in svg else svg)
print(len(E))
