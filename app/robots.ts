import type { MetadataRoute } from "next";

/**
 * Поисковикам открыта только главная (лендинг) и документы, само приложение закрыто; отдельно перечисляем ИИ-краулеры
 * (их ещё и отсекает middleware.ts по User-Agent).
 */
export default function robots(): MetadataRoute.Robots {
  const aiBots = [
    "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot",
    "CCBot", "Bytespider", "Amazonbot", "Applebot-Extended", "Google-Extended", "meta-externalagent",
    "FacebookBot", "Diffbot", "cohere-ai", "YouBot",
  ];
  return {
    rules: [
      ...aiBots.map((userAgent) => ({ userAgent, disallow: "/" })),
      // Поисковикам открыта только главная (лендинг) и документы; само приложение — нет.
      { userAgent: "*", allow: ["/$", "/legal/"], disallow: "/" },
    ],
  };
}
