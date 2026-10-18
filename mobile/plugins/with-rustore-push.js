// Expo config plugin: подключает RuStore Push SDK (react-native-rustore-push) к Android-сборке.
//  - репозиторий Maven RuStore в android/build.gradle;
//  - ID проекта пушей в AndroidManifest (ru.rustore.sdk.pushclient.project_id);
//  - канал уведомлений "default" — тот же, что у expo-notifications.
// ID проекта: RuStore Консоль → приложение → Push-уведомления → Проекты.
// Берётся из EXPO_PUBLIC_RUSTORE_PUSH_PROJECT_ID (eas.json / .env) или из параметра плагина.
const { withProjectBuildGradle, withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const MAVEN = "https://artifactory-external.vkpartner.ru/artifactory/maven";

function withRuStoreMaven(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy" || cfg.modResults.contents.includes(MAVEN)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      (m) => `${m}\n        maven { url "${MAVEN}" }`
    );
    return cfg;
  });
}

function withRuStoreManifest(config, projectId) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    if (projectId) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, "ru.rustore.sdk.pushclient.project_id", projectId);
    }
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      "ru.rustore.sdk.pushclient.default_notification_channel_id",
      "default"
    );
    return cfg;
  });
}

module.exports = function withRuStorePush(config, props = {}) {
  const projectId = props.projectId || process.env.EXPO_PUBLIC_RUSTORE_PUSH_PROJECT_ID || "";
  config = withRuStoreMaven(config);
  config = withRuStoreManifest(config, projectId);
  return config;
};
