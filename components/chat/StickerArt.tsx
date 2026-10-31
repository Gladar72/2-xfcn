/** Union of non-transparent pixels across every frame of the 220×220 WebPs.
 * Keep the entire animation inside a common frame, with equal visible height.
 * Re-measure these bounds if the source artwork changes. Assets stay untouched.
 */
const MOSYA_BOUNDS: Record<string, readonly [number, number, number, number]> = {
  mosya_angry: [2, 3, 218, 217], mosya_bday: [13, 2, 207, 218],
  mosya_clap: [19, 2, 200, 218], mosya_coffee: [15, 3, 206, 218],
  mosya_cool: [23, 2, 198, 218], mosya_facepalm: [26, 3, 194, 218],
  mosya_gift: [13, 2, 207, 218], mosya_glasses: [8, 1, 213, 218],
  mosya_gold: [2, 15, 219, 205], mosya_gym: [2, 21, 219, 199],
  mosya_jump: [10, 1, 212, 216], mosya_late: [1, 11, 219, 209],
  mosya_lol: [1, 13, 219, 207], mosya_love: [24, 2, 196, 218],
  mosya_music: [2, 7, 219, 213], mosya_party: [1, 1, 219, 219],
  mosya_phone: [27, 1, 194, 219], mosya_pin: [2, 4, 218, 217],
  mosya_rich: [6, 2, 214, 218], mosya_run: [19, 1, 201, 219],
  mosya_sad: [0, 0, 220, 218], mosya_selfie: [2, 7, 219, 213],
  mosya_shy: [30, 2, 191, 218], mosya_sit: [19, 2, 201, 218],
  mosya_sleep: [36, 1, 185, 218], mosya_sport: [1, 27, 218, 194],
  mosya_stand: [25, 2, 195, 218], mosya_think: [23, 2, 197, 218],
  mosya_travel: [10, 3, 211, 218], mosya_wave: [5, 3, 215, 218],
  mosya_winter: [2, 12, 217, 208], mosya_wow: [2, 4, 218, 217],
};

export function stickerSrc(slug: string): string {
  return slug.startsWith("i_") ? `/brand/cat3d/${slug}.webp` : `/brand/stickers/${slug}.webp`;
}

export function StickerArt({ slug, alt = "", lazy = false }: { slug: string; alt?: string; lazy?: boolean }) {
  const [left, top, right, bottom] = MOSYA_BOUNDS[slug] ?? [0, 0, 220, 220];
  const width = right - left;
  const height = bottom - top;
  // 184×144 frame: 128px artwork height, 8px vertical breathing room.
  // Percentages also scale this same artwork into picker cells and reactions.
  const scale = Math.min(168 / width, 128 / height);
  return (
    <span className="sticker-art" data-sticker={slug}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={stickerSrc(slug)} alt={alt} draggable={false}
        loading={lazy ? "lazy" : undefined} decoding="async"
        style={{
          position: "absolute", maxWidth: "none", borderRadius: 0,
          width: `${220 * scale / 184 * 100}%`, height: `${220 * scale / 144 * 100}%`,
          left: `${((184 - width * scale) / 2 - left * scale) / 184 * 100}%`,
          top: `${((144 - height * scale) / 2 - top * scale) / 144 * 100}%`,
        }}
      />
    </span>
  );
}
