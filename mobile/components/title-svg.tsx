import { useState } from "react";
import { Dimensions, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient as SvgLinear, Stop, Text as SvgText } from "react-native-svg";
import { brandGradient, colors, fonts } from "@/lib/theme";
import { textWidth } from "@/lib/textWidth";

// В SVG межбуквенный интервал на Android работает не везде — рисуем без него и меряем так же.
const tw = (t: string, size: number) => textWidth(t, size, 0);

/**
 * Заголовок с акцентом фирменным градиентом, нарисованный одним SVG:
 * обычные слова — чернилами, акцент — градиентом, одним шрифтом (Golos Medium)
 * на одной базовой линии. Переносы считаем сами по ширинам букв шрифта,
 * поэтому ничего не обрезается и не «прыгает». «\n» в тексте — принудительный перенос.
 */
export function SvgTitle({ plain, em, after, size, style }: { plain: string; em: string; after?: string; size: number; style?: StyleProp<TextStyle> }) {
  const [w, setW] = useState(0);
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { textAlign, color, ...box } = flat;
  const ink = typeof color === "string" ? color : colors.ink;
  const width = w || Dimensions.get("window").width - 40;
  const lineH = Math.ceil(size * 1.12);
  const space = tw(" ", size);

  type Word = { t: string; em: boolean; br?: boolean };
  const words: Word[] = [];
  const push = (text: string, isEm: boolean) =>
    text.split("\n").forEach((part, i) => {
      if (i > 0) words.push({ t: "", em: false, br: true });
      part
        .split(" ")
        .filter(Boolean)
        .forEach((t) => words.push({ t, em: isEm }));
    });
  push(plain, false);
  push(em, true);
  if (after) push(after, false);

  // Жадная раскладка по строкам.
  const lines: Word[][] = [[]];
  let cur = 0;
  for (const wd of words) {
    if (wd.br) {
      lines.push([]);
      cur = 0;
      continue;
    }
    const ww = tw(wd.t, size);
    const line = lines[lines.length - 1];
    if (line.length && cur + space + ww > width) {
      lines.push([wd]);
      cur = ww;
    } else {
      cur += (line.length ? space : 0) + ww;
      line.push(wd);
    }
  }
  const real = lines.filter((l) => l.length);
  // Golos: восходящая часть 980/1000, нисходящая 220/1000 — центрируем как обычный текст.
  const baseY = (lineH - size * 1.2) / 2 + size * 0.98;
  const label = `${plain}${em}${after ?? ""}`.replace(/\n/g, " ");

  return (
    <View style={box as ViewStyle} onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} accessible accessibilityRole="header" accessibilityLabel={label}>
      <Svg width={width} height={real.length * lineH}>
        <Defs>
          <SvgLinear id="tg" x1="0" y1="0" x2="1" y2="0.6">
            <Stop offset="0" stopColor={brandGradient[0]} />
            <Stop offset="0.48" stopColor={brandGradient[1]} />
            <Stop offset="1" stopColor={brandGradient[2]} />
          </SvgLinear>
        </Defs>
        {real.flatMap((line, i) => {
          // Соседние слова одного стиля — одним куском, чтобы градиент шёл по всему акценту.
          const segs: { t: string; em: boolean }[] = [];
          for (const wd of line) {
            const last = segs[segs.length - 1];
            if (last && last.em === wd.em) last.t += ` ${wd.t}`;
            else segs.push({ t: wd.t, em: wd.em });
          }
          const lw = segs.reduce((sum, sg, k) => sum + tw(sg.t, size) + (k ? space : 0), 0);
          let x = textAlign === "center" ? Math.max(0, (width - lw) / 2) : textAlign === "right" ? Math.max(0, width - lw) : 0;
          return segs.map((sg, k) => {
            const at = x;
            x += tw(sg.t, size) + space;
            return (
              <SvgText key={`${i}-${k}`} x={at} y={i * lineH + baseY} fill={sg.em ? "url(#tg)" : ink} fontFamily={fonts["500"]} fontSize={size}>
                {sg.t}
              </SvgText>
            );
          });
        })}
      </Svg>
    </View>
  );
}
