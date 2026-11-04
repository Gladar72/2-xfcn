// Вход в мини-приложение Telegram. На «/» теперь лендинг (public/site/index.html, см. middleware.ts);
// лендинг сам перекидывает сюда, если его открыли из Telegram (в адресе есть #tgWebAppData).
export { default } from "../page";
