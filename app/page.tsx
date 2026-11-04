import MiniAppEntry from "@/components/MiniAppEntry";

// «/» обычно отдаёт лендинг (middleware.ts → public/site/index.html). Эта страница — запасной вход
// в мини-приложение, если запрос всё же дошёл сюда.
export default function Page() {
  return <MiniAppEntry />;
}
