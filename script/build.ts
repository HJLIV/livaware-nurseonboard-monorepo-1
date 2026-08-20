import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { execFileSync } from "child_process";
import { copyFile, mkdir, rm, readFile } from "fs/promises";

const allowlist = [
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "axios",
  "bcryptjs",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  // Deployment builds only run `npm install` at the root, which leaves
  // artifacts/* (pnpm projects) without node_modules. The platform builds each
  // artifact right after this command, so their dependencies have to be on
  // disk by the time this finishes.
  console.log("installing artifact dependencies...");
  execFileSync("bash", ["scripts/install-artifact-deps.sh"], {
    stdio: "inherit",
  });

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("copying protected training assets...");
  await mkdir("dist/private-assets", { recursive: true });
  await copyFile(
    "server/private-assets/excellence-blueprint.mp4",
    "dist/private-assets/excellence-blueprint.mp4",
  );

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
