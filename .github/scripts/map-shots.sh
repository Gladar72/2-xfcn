#!/usr/bin/env bash
# Снимки проверки карты (тестовая сборка с EXPO_PUBLIC_MAP_SMOKE=1).
D="$GITHUB_WORKSPACE/shots"
sleep 3;  adb exec-out screencap -p > "$D/splash-1.png"
sleep 3;  adb exec-out screencap -p > "$D/splash-2.png"
sleep 18; adb exec-out screencap -p > "$D/login.png"
sleep 21; adb exec-out screencap -p > "$D/map-1.png"
sleep 20; adb exec-out screencap -p > "$D/map-2.png"
