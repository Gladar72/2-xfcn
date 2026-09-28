python3 << 'PYEOF'
path = "app/(app)/events/[id]/mesto-event.css"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

replacements = [
    # Убираем отдельный шрифт Inter — используем тот же Onest, что и везде
    # в приложении (var(--font-onest) уже подключена в tailwind.config.ts).
    (
        "@font-face{font-family:Inter;src:url('/mesto/assets/fonts/InterVariable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:swap}\n",
        "",
    ),
    (
        " --m-ink:#160631;--m-purple:#7430FF;--m-purple-dark:#340B83;--m-muted:#77757F;\n",
        " --m-ink:#111111;--m-purple:#6C3BFF;--m-purple-dark:#4B25B8;--m-muted:#686868;\n",
    ),
    (
        " font:400 14px/1.45 Inter,Arial,sans-serif;font-optical-sizing:auto;color:var(--m-ink);color-scheme:light;\n",
        " font:400 14px/1.45 var(--font-onest),Manrope,system-ui,sans-serif;font-optical-sizing:auto;color:var(--m-ink);color-scheme:light;\n",
    ),
    # Тот же фирменный градиент, что используется в остальном приложении
    # (brand-gradient в tailwind.config.ts), а не отдельный из кита.
    (
        ".mesto .m-requests{color:#fff;background:linear-gradient(128deg,#7735FF 0%,#9250EB 45%,#FF8A4E 100%)}",
        ".mesto .m-requests{color:#fff;background:linear-gradient(135deg,#6C3BFF 0%,#8A5CFF 45%,#FF8A2A 100%)}",
    ),
]

for old, new in replacements:
    if old not in content:
        raise SystemExit(f"ОШИБКА: не нашёл строку для замены:\n{old!r}")
    content = content.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Готово — шрифт и цвета обновлены")
PYEOF
