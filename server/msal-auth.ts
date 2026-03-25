import { ConfidentialClientApplication, type Configuration, type AuthorizationUrlRequest, type AuthorizationCodeRequest } from "@azure/msal-node";
import type { Express, Request, Response } from "express";
import { logAction } from "./services/audit";

const TENANT_ID = process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = process.env.AZURE_AD_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET;

const SCOPES = ["openid", "profile", "email", "User.Read"];

function getRedirectUri(_req: Request): string {
  const replitDomains = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
  if (replitDomains) {
    const domain = replitDomains.split(",")[0].trim();
    return `https://${domain}/api/auth/microsoft/callback`;
  }
  return `https://localhost:5000/api/auth/microsoft/callback`;
}

function isConfigured(): boolean {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

let msalInstance: ConfidentialClientApplication | null = null;

function getMsalInstance(): ConfidentialClientApplication {
  if (!msalInstance) {
    if (!isConfigured()) {
      throw new Error("Microsoft SSO is not configured. Set AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET.");
    }
    const config: Configuration = {
      auth: {
        clientId: CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientSecret: CLIENT_SECRET!,
      },
    };
    msalInstance = new ConfidentialClientApplication(config);
  }
  return msalInstance;
}

export function registerMicrosoftAuthRoutes(app: Express) {
  app.get("/api/auth/microsoft/status", (_req, res) => {
    res.json({ enabled: isConfigured() });
  });

  app.get("/api/auth/microsoft/login", async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ message: "Microsoft SSO is not configured" });
    }

    try {
      const msal = getMsalInstance();
      const redirectUri = getRedirectUri(req);

      const authUrlRequest: AuthorizationUrlRequest = {
        scopes: SCOPES,
        redirectUri,
        prompt: "select_account",
      };

      const authUrl = await msal.getAuthCodeUrl(authUrlRequest);
      return res.redirect(authUrl);
    } catch (err: any) {
      console.error("[MSAL] Login redirect error:", err.message);
      return res.redirect("/?error=sso_failed");
    }
  });

  app.get("/api/auth/microsoft/callback", async (req, res) => {
    const { code, error, error_description } = req.query;

    if (error) {
      console.error("[MSAL] Auth error:", error, error_description);
      return res.redirect("/?error=sso_denied");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/?error=sso_no_code");
    }

    try {
      const msal = getMsalInstance();
      const redirectUri = getRedirectUri(req);

      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes: SCOPES,
        redirectUri,
      };

      const response = await msal.acquireTokenByCode(tokenRequest);

      const account = response.account;
      if (!account) {
        return res.redirect("/?error=sso_no_account");
      }

      const email = (account.username || "").toLowerCase();
      const displayName = account.name || email;

      req.session.isAuthenticated = true;
      req.session.username = displayName;
      req.session.email = email;
      req.session.displayName = displayName;
      req.session.role = "admin";
      req.session.authMethod = "microsoft";

      try {
        await logAction({
          module: "admin",
          action: "microsoft_sso_login",
          agentName: displayName,
          detail: { email, method: "microsoft", tenantId: TENANT_ID },
        });
      } catch {}

      return res.redirect("/");
    } catch (err: any) {
      console.error("[MSAL] Token exchange error:", err.message);
      return res.redirect("/?error=sso_token_failed");
    }
  });
}
