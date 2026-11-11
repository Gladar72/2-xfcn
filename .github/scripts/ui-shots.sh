#!/usr/bin/env bash
# Снимки всех экранов нового дизайна (тестовая сборка EXPO_PUBLIC_UI_SMOKE=1):
# заставка 8 с, дальше экраны сменяются сами каждые 14 с (app/_layout.tsx), данные — lib/smoke.ts.
D="$GITHUB_WORKSPACE/shots"
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
shot() { adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1; adb exec-out screencap -p > "$D/$1.png"; }
sleep 5;  shot 00-splash
sleep 12; shot 01-login
for n in 02-home 03-event 04-map 05-chats 06-profile 07-create 08-people; do sleep 14; shot "$n"; done
# Главная ниже — прокрутка
