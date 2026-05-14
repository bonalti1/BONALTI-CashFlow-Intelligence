const fallbackAppUrl = "https://bonalti-cashflow-intelligence.onrender.com";

export function getPublicAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (
    configuredUrl &&
    !configuredUrl.includes("YOUR-RENDER-URL") &&
    !configuredUrl.includes("localhost")
  ) {
    return configuredUrl.replace(/\/$/, "");
  }

  return fallbackAppUrl;
}

