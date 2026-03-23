# Clinical Skills Arcade / LiveAware NurseOnboard Platform

## Project Overview

A full-stack TypeScript monorepo for clinical skills training and nurse onboarding. It includes an Express backend, a React/Vite frontend, and uses PostgreSQL via Drizzle ORM.

## Architecture

- **Frontend**: React 18 + Vite, with Tailwind CSS + Radix UI components, located in `client/`
- **Backend**: Express 5 (Node.js), located in `server/`
- **Shared**: Drizzle ORM schema and shared types, located in `shared/`
- **Build System**: `npm` with `tsx` for TypeScript execution and `esbuild` for production bundling

## Key Technologies

- TypeScript (strict monorepo)
- Express 5 + express-session (authentication via passport-local + Microsoft/Azure MSAL)
- Drizzle ORM + PostgreSQL (`pg` driver)
- React + Vite (with HMR in dev, served through Express in development mode)
- Tailwind CSS + Radix UI + shadcn-style components
- Framer Motion, Recharts, React Hook Form, Zod
- WebSocket (`ws`) for real-time features

## Running the Project

- **Development**: `npm run dev` — starts the Express server which also serves the Vite frontend via middleware on port 5000
- **Production build**: `npm run build` — outputs to `dist/`
- **Production start**: `npm start` — runs `dist/index.cjs`
- **DB schema push**: `npm run db:push`

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (provided by Replit)
- `SESSION_SECRET` — Required in production for session signing
- `PORT` — Server port (default 5000)

## Database

- PostgreSQL via Replit's built-in database
- Schema managed with Drizzle Kit (`drizzle.config.ts` → `shared/schema.ts`)
- Run `npm run db:push` to sync schema changes

## Deployment

- Target: `autoscale`
- Build command: `npm run build`
- Run command: `node dist/index.cjs`
