#!/usr/bin/env bash
# Снимки экранов входа и регистрации (тестовая сборка с EXPO_PUBLIC_AUTH_SMOKE=1).
D="$GITHUB_WORKSPACE/shots"
sleep 4;  adb exec-out screencap -p > "$D/01-splash.png"
sleep 8;  adb exec-out screencap -p > "$D/02-login-a.png"
sleep 4;  adb exec-out screencap -p > "$D/03-login-b.png"
sleep 4;  adb exec-out screencap -p > "$D/04-login-c.png"
sleep 16; adb exec-out screencap -p > "$D/05-register-1.png"
for i in 2 3 4 5; do
  adb shell input swipe 540 1700 540 700 600
  sleep 2
  adb exec-out screencap -p > "$D/0$((i+4))-register-$i.png"
done
