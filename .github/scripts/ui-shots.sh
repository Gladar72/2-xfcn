#!/usr/bin/env bash
# Снимки всех экранов нового дизайна (тестовая сборка EXPO_PUBLIC_UI_SMOKE=1):
# заставка 8 с, дальше экраны сменяются сами каждые 14 с (app/_layout.tsx), данные — lib/smoke.ts.
D="$GITHUB_WORKSPACE/shots"
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
shot() { adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1; adb exec-out screencap -p > "$D/$1.png"; }
# Снимаем каждые 6 с всю прогулку по экранам (~2,5 мин) — лучшие кадры выбираются потом.
for i in $(seq -w 0 30); do shot "t$i"; sleep 6; done
