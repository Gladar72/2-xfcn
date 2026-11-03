#!/usr/bin/env bash
# Снимки экранов входа и регистрации (тестовая сборка с EXPO_PUBLIC_AUTH_SMOKE=1).
# Анкета в этой сборке заполнена заранее, «Дальше» листает шаги без проверок.
D="$GITHUB_WORKSPACE/shots"
read -r W H < <(adb shell wm size | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)
BX=$((W / 2)); BY=$((H - H * 9 / 100))   # кнопка «Дальше» внизу экрана
sleep 4;  adb exec-out screencap -p > "$D/01-splash.png"
sleep 8;  adb exec-out screencap -p > "$D/02-login-a.png"
sleep 4;  adb exec-out screencap -p > "$D/03-login-b.png"
sleep 4;  adb exec-out screencap -p > "$D/04-login-c.png"
# вход держится 25 с, потом открывается анкета; ждём с запасом и снимаем каждый шаг
sleep 20; adb exec-out screencap -p > "$D/05-register-1.png"
sleep 3;  adb exec-out screencap -p > "$D/06-register-1b.png"
adb shell input tap "$BX" "$BY"; sleep 4; adb exec-out screencap -p > "$D/07-register-2.png"
adb shell input tap "$BX" "$BY"; sleep 4; adb exec-out screencap -p > "$D/08-register-3.png"
echo "screen ${W}x${H} tap ${BX},${BY}" > "$D/taps.txt"
