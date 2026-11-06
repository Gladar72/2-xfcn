/**
 * Мгновенный отклик при переходе между экранами: пока сервер отдаёт данные
 * нового экрана, сразу показываем лёгкую заглушку — нажатие видно с первого раза.
 */
export default function Loading() {
  return (
    <section className="scr aurora" data-id="loading" aria-busy="true">
      <div className="scroll" style={{ paddingTop: "calc(var(--top) + 60px)" }}>
        <div className="sk" style={{ height: 34, width: "60%", borderRadius: 14 }} />
        <div className="sk" style={{ height: 120, marginTop: 18, borderRadius: 26 }} />
        <div className="sk" style={{ height: 120, marginTop: 12, borderRadius: 26 }} />
      </div>
    </section>
  );
}
