// Линейные иконки редизайна 2026 (те же, что в мини-приложении, components/brand/Icon.tsx).
import Svg, { Circle, Path, Rect } from "react-native-svg";

const IC = {
  home: (
    <>
      <Path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z" />
    </>
  ),
  map: (
    <>
      <Path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z" />
      <Path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  plus: (
    <>
      <Path d="M12 5v14M5 12h14" />
    </>
  ),
  cal: (
    <>
      <Rect x="4" y="5.5" width="16" height="14.5" rx="3.5" />
      <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8.5" r="3.8" />
      <Path d="M4.8 20c1.2-3.8 4-5.7 7.2-5.7s6 1.9 7.2 5.7" />
    </>
  ),
  chat: (
    <>
      <Path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </>
  ),
  bell: (
    <>
      <Path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z" />
      <Path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="M20 20l-4.3-4.3" />
    </>
  ),
  filter: (
    <>
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx="16" cy="7" r="2.2" />
      <Circle cx="10" cy="17" r="2.2" />
    </>
  ),
  back: (
    <>
      <Path d="M15 5l-7 7 7 7" />
    </>
  ),
  close: (
    <>
      <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </>
  ),
  share: (
    <>
      <Path d="M12 4v11M7.5 8.5 12 4l4.5 4.5" />
      <Path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  save: (
    <>
      <Path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
    </>
  ),
  heart: (
    <>
      <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="8" />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <Circle cx="12" cy="10" r="2.3" />
    </>
  ),
  people: (
    <>
      <Circle cx="9" cy="9" r="3" />
      <Path d="M3.5 19c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5" />
      <Circle cx="16.5" cy="8" r="2.4" />
      <Path d="M16 13.8c2.2 0 3.9 1.3 4.5 3.7" />
    </>
  ),
  chev: (
    <>
      <Path d="M9 5l7 7-7 7" />
    </>
  ),
  down: (
    <>
      <Path d="M7 10l5 5 5-5" />
    </>
  ),
  check: (
    <>
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </>
  ),
  send: (
    <>
      <Path d="M5 12h13M13 6l6 6-6 6" />
    </>
  ),
  star: (
    <>
      <Path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />
    </>
  ),
  camera: (
    <>
      <Rect x="3.5" y="7" width="17" height="12.5" rx="3" />
      <Path d="M8.5 7l1.3-2.5h4.4L15.5 7" />
      <Circle cx="12" cy="13.2" r="3.2" />
    </>
  ),
  route: (
    <>
      <Circle cx="6" cy="18" r="2" />
      <Circle cx="18" cy="6" r="2" />
      <Path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
    </>
  ),
  gear: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
    </>
  ),
  shield: (
    <>
      <Path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6z" />
      <Path d="M9 12l2 2 4-4" />
    </>
  ),
  help: (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.7M12 17h.01" />
    </>
  ),
  gift: (
    <>
      <Rect x="4" y="8.5" width="16" height="11.5" rx="2" />
      <Path d="M4 12.5h16M12 8.5V20M12 8.5S10.5 4 8 4.8 9 8.5 12 8.5zM12 8.5S13.5 4 16 4.8 15 8.5 12 8.5z" />
    </>
  ),
  tg: (
    <>
      <Path d="M21 4 3 11.2l5.8 2 2 6 3.2-3.8 5 3.6z" />
      <Path d="M8.8 13.2 21 4" />
    </>
  ),
  mail: (
    <>
      <Rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <Path d="m4 7 8 6 8-6" />
    </>
  ),
  nav: (
    <>
      <Path d="M20 4 4 11l7 2 2 7z" />
    </>
  ),
  lock: (
    <>
      <Rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  mask: (
    <>
      <Path d="M3 8c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0 0 5-2 9-6 9-2 0-3-2-3-2s-1 2-3 2c-4 0-6-4-6-9z" />
    </>
  ),
  edit: (
    <>
      <Path d="M4 20h4L19 9l-4-4L4 16z" />
      <Path d="M13.5 6.5l4 4" />
    </>
  ),
  flag: (
    <>
      <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </>
  ),
  copy: (
    <>
      <Rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <Path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  wallet: (
    <>
      <Rect x="3.5" y="6" width="17" height="13" rx="3" />
      <Path d="M3.5 10h17M16 14.5h1.5" />
    </>
  ),
  up: (
    <>
      <Path d="M12 19V5M6 11l6-6 6 6" />
    </>
  ),
  sun: (
    <>
      <Circle cx="12" cy="12" r="4" />
      <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  doc: (
    <>
      <Path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
      <Path d="M13.5 3.5V8h4.5M9 12.5h6M9 16h6" />
    </>
  ),
} as const;

export type IconName = keyof typeof IC;

export function Icon({ name, size = 22, color = "#16121F", strokeWidth = 1.75 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {IC[name]}
    </Svg>
  );
}
