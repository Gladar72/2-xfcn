#!/usr/bin/env bash
# Снимки экранов входа и регистрации (тестовая сборка с EXPO_PUBLIC_AUTH_SMOKE=1).
# Анкета в этой сборке заполнена заранее, «Дальше» листает шаги без проверок.
D="$GITHUB_WORKSPACE/shots"
# Системные окна эмулятора («Pixel Launcher не отвечает») закрываем, чтобы не перекрывали снимки.
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
shot() { adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1; sleep 1; adb exec-out screencap -p > "$D/$1.png"; }
read -r W H < <(adb shell wm size | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)
BX=$((W / 2)); BY=$((H - H * 9 / 100))   # кнопка «Дальше» внизу экрана
sleep 4;  shot 01-splash
sleep 8;  shot 02-login-a
sleep 4;  shot 03-login-b
sleep 4;  shot 04-login-c
# вход держится 25 с, потом открывается анкета; ждём с запасом и снимаем каждый шаг
sleep 20; shot 05-register-1
sleep 3;  shot 06-register-1b
adb shell input tap "$BX" "$BY"; sleep 4; shot 07-register-2
adb shell input tap "$BX" "$BY"; sleep 4; shot 08-register-3
adb shell input tap "$BX" "$BY"; sleep 4; shot 09-register-4
adb shell input tap "$BX" "$BY"; sleep 4; shot 10-register-5
echo "screen ${W}x${H} tap ${BX},${BY}" > "$D/taps.txt"
