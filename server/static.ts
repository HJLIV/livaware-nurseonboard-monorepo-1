import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectPosthogConfig } from "./posthog-config";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Inject the (public) PostHog config into the SPA shell once at boot.
  const indexHtml = injectPosthogConfig(
    fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8"),
  );

  app.use("/{*path}", (_req, res) => {
    res.status(200).set({ "Content-Type": "text/html" }).end(indexHtml);
  });
}
