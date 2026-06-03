// PostHog is a client-side analytics / session-recording tool, but this is a
// Vite SPA served by Express — the browser can't read server secrets directly.
// The project token is a *public* (publishable) token, so we inject it into the
// served HTML as `window.__POSTHOG__` for the client entry to pick up.
//
// Secrets are stored with the Next.js-style names PostHog's setup wizard
// suggests (NEXT_PUBLIC_*), even though this app is not Next.js.

const DEFAULT_HOST = "https://us.i.posthog.com";

function escapeForInlineScript(value: string): string {
  // Prevent the value from breaking out of the <script> tag.
  return value.replace(/</g, "\\u003c");
}

function firstDefined(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

export function injectPosthogConfig(html: string): string {
  // Accept whichever naming variant the secret was stored under.
  const token = firstDefined(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
    "VITE_POSTHOG_PROJECT_TOKEN",
    "POSTHOG_PROJECT_TOKEN",
  );
  if (!token) return html;
  const host =
    firstDefined(
      "NEXT_PUBLIC_POSTHOG_HOST",
      "VITE_POSTHOG_HOST",
      "POSTHOG_HOST",
    ) || DEFAULT_HOST;
  const json = escapeForInlineScript(JSON.stringify({ token, host }));
  const tag = `<script>window.__POSTHOG__=${json};</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${tag}</head>`);
  }
  return tag + html;
}
