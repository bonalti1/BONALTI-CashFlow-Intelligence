import OAuthClient from "intuit-oauth";

import { requireEnv } from "@/lib/env";

const renderHost = "bonalti-cashflow-intelligence.onrender.com";
const expectedProductionRedirectUri = `https://${renderHost}/api/qbo/callback`;
const placeholderFragments = ["PASTE_", "YOUR-RENDER-URL", "localhost", "loca.lt"];

export function getQboOAuthConfig() {
  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  const environment = requireEnv("QBO_ENVIRONMENT") as "sandbox" | "production";
  const redirectUri = requireEnv("QBO_REDIRECT_URI");

  return {
    clientId,
    clientSecret,
    environment,
    redirectUri,
  };
}

export function getQboSetupDiagnostics() {
  const config = getQboOAuthConfig();
  const problems: string[] = [];

  if (config.environment !== "production") {
    problems.push("QBO_ENVIRONMENT must be production for the live QuickBooks company.");
  }

  if (placeholderFragments.some((fragment) => config.clientId.includes(fragment))) {
    problems.push("QBO_CLIENT_ID still looks like a placeholder or local development value.");
  }

  if (placeholderFragments.some((fragment) => config.redirectUri.includes(fragment))) {
    problems.push("QBO_REDIRECT_URI still contains a placeholder/local URL.");
  }

  if (config.redirectUri !== expectedProductionRedirectUri) {
    problems.push(`QBO_REDIRECT_URI must exactly equal ${expectedProductionRedirectUri}.`);
  }

  return {
    ready: problems.length === 0,
    problems,
    expectedProductionRedirectUri,
    actualRedirectUri: config.redirectUri,
    environment: config.environment,
    clientIdPreview: `${config.clientId.slice(0, 6)}...${config.clientId.slice(-4)}`,
  };
}

export function createQboOAuthClient() {
  const config = getQboOAuthConfig();

  return new OAuthClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    environment: config.environment,
    redirectUri: config.redirectUri,
  });
}

export function getQboAuthorizationUrl() {
  const diagnostics = getQboSetupDiagnostics();

  if (!diagnostics.ready) {
    throw new Error(`QuickBooks production setup is not ready: ${diagnostics.problems.join(" ")}`);
  }

  const oauthClient = createQboOAuthClient();

  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: crypto.randomUUID(),
  });
}
