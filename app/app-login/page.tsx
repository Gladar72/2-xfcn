/** Запасная страница кнопки «Вернуться в «Место»», если ссылка открылась в браузере, а не в приложении. */
export default function AppLoginPage() {
  return (
    <main className="m-aurora flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mosya/mosya_wave.webp" alt="" className="h-32 w-32 object-contain" />
      <h1 className="m-title text-[26px] font-bold text-ink-900">Вход подтверждён</h1>
      <p className="text-sm text-ink-600">Вернись в приложение «Место» — ты уже вошёл.</p>
    </main>
  );
}
