import OAuthClient from "intuit-oauth";

import { requireEnv } from "@/lib/env";

export function createQboOAuthClient() {
  return new OAuthClient({
    clientId: requireEnv("QBO_CLIENT_ID"),
    clientSecret: requireEnv("QBO_CLIENT_SECRET"),
    environment: requireEnv("QBO_ENVIRONMENT") as "sandbox" | "production",
    redirectUri: requireEnv("QBO_REDIRECT_URI"),
  });
}

export function getQboAuthorizationUrl() {
  const oauthClient = createQboOAuthClient();

  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: crypto.randomUUID(),
  });
}
