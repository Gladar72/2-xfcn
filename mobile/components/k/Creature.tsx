import { useEffect, useRef, useState } from "react";
import { AppState, PixelRatio, View, type StyleProp, type ViewStyle } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { Image } from "expo-image";
import { CREATURE_FS, CREATURE_VS } from "./creature-shader";
import { API_URL as SITE } from "@/lib/config";

// Тестовая сборка для снимков на виртуальном iPhone (без видеочипа) — картинка вместо живого шейдера.
const NO_GL = process.env.EXPO_PUBLIC_UI_SMOKE === "1";

/**
 * Мося-«капля» из брендбука 2026 — тот же шейдер, что в мини-аппе (components/brand/Creature.tsx),
 * но в приложении он считается живьём на видеочипе телефона, 60 кадров в секунду —
 * без покадровых картинок, поэтому двигается плавно.
 * variant: "p" — без глаз (кнопка «+»), "e" — с глазками.
 */
type Variant = "p" | "e";
const t0 = Date.now();
const FALLBACK: Record<Variant, string> = { p: `${SITE}/brand/creature/blobw.webp`, e: `${SITE}/brand/creature/blobe.webp` };

export function Creature({ size = 58, variant = "e", style }: { size?: number; variant?: Variant; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState(NO_GL);
  const raf = useRef(0);
  const active = useRef(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { active.current = s === "active"; });
    return () => { sub.remove(); cancelAnimationFrame(raf.current); };
  }, []);

  if (failed) {
    return <Image source={{ uri: FALLBACK[variant] }} style={[{ width: size, height: size }, style as object]} contentFit="contain" cachePolicy="disk" />;
  }

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    try {
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
        return s;
      };
      const pr = gl.createProgram()!;
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, CREATURE_VS));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, CREATURE_FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link");
      gl.useProgram(pr);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(pr, "p");
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
      const U = (k: string) => gl.getUniformLocation(pr, k);
      const uT = U("t"), uR = U("r"), uV = U("V"), uB = U("blink");
      gl.uniform3f(U("pk"), 0.62, 0.58, 1);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uV, variant === "e" ? 1 : 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const frame = () => {
        raf.current = requestAnimationFrame(frame);
        if (!active.current) return;
        const t = (Date.now() - t0) / 1000 + (variant === "p" ? 1.7 : 0);
        const ph = t % 3;
        gl.uniform1f(uT, t);
        gl.uniform1f(uB, ph > 2.72 ? Math.sin(((ph - 2.72) / 0.28) * Math.PI) : 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
        gl.endFrameEXP();
      };
      frame();
    } catch {
      setFailed(true);
    }
  };

  // Буфер — не больше 1.5× пикселей экрана: капля мягкая, разницы не видно, а видеочипу в 2 раза легче.
  const scale = Math.min(PixelRatio.get(), 1.5);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <GLView
        style={{ width: size, height: size, backgroundColor: "transparent" }}
        onContextCreate={onContextCreate}
        msaaSamples={0}
        // @ts-expect-error — iOS: прозрачный слой поверх фона
        isOpaque={false}
        contentScaleFactor={scale}
      />
    </View>
  );
}
