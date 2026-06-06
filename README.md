# OpenTube

OpenTube is a self-hostable video sharing platform inspired by the dense, early web video sites of 2006. It uses original OpenTube branding and assets, not YouTube trademarks, logos, copyrighted assets, or proprietary code.

Taglines:

- Broadcast Yourself, Openly.
- An open video archive for everyone.
- Share your world.

## Features

- User registration, login, logout, secure session cookies, CSRF protection
- Roles: User, Moderator, Admin
- Video upload, magic-byte validation, Redis/BullMQ queueing, FFmpeg processing
- H.264/AAC MP4 output, 360p and 480p variants, generated thumbnails, duration extraction
- Public, unlisted, and private videos
- Watch page with custom Flash-style HTML5 player
- Embed page at `/embed/:videoId` and API at `/api/embed/:videoId`
- Comments, replies, profile comments, ratings, favorites, subscriptions
- Browse recent, most viewed, top rated, categories, search, channels, groups, community
- Account pages for profile customization, uploaded videos, favorites, subscriptions
- Admin/moderator pages for stats, reports, users, videos, and settings
- Caddy reverse proxy with automatic HTTPS when a real domain is configured
- Docker Compose deployment with PostgreSQL, Valkey, backend, worker, frontend, and Caddy

## Requirements

- Docker and Docker Compose for deployment
- Node.js 22 for local development
- PostgreSQL and Valkey/Redis for local non-Docker development
- FFmpeg for local worker development

## Quick Start

```sh
cp .env.example .env
npm install
npm run typecheck
npm run test
npm run build
docker compose up -d --build
```

Open `http://localhost`.

## Admin Bootstrap

Create the first admin with the CLI:

```sh
npm run create-admin -- --username admin --email admin@example.com --password 'replace-with-a-long-password'
```

Or set all three variables before first container startup:

```env
OPENTUBE_ADMIN_USERNAME=
OPENTUBE_ADMIN_EMAIL=
OPENTUBE_ADMIN_PASSWORD=
```

Environment bootstrap only creates an admin when no admin exists. It does not reset an existing admin password on restart.

## Environment

Copy `.env.example` to `.env` and change secrets before production.

Important variables:

- `OPENTUBE_DOMAIN`: Domain Caddy serves. Use `localhost` locally or a real hostname in production.
- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_URL`: Valkey/Redis connection string.
- `COOKIE_SECURE`: Set `true` when serving HTTPS.
- `VIEW_HASH_SECRET`: Long random secret used to hash IP and user-agent view fingerprints.
- `STORAGE_ROOT`: Container storage path, default `/app/storage`.
- `MAX_UPLOAD_BYTES`: Upload size limit.
- `OPENTUBE_ADMIN_*`: Optional first-start admin bootstrap.

## Video Processing

Upload flow:

1. Backend creates a video record with `UPLOADING`.
2. Upload endpoint saves the file under a generated path.
3. Backend validates file magic bytes for mp4, mov, avi, webm, or mkv.
4. Backend marks the video `PROCESSING` and queues a BullMQ job.
5. Worker runs FFmpeg to create 360p and 480p MP4 files and a JPEG thumbnail.
6. Worker updates the video to `READY`, or `FAILED` on processing errors.

The worker container includes FFmpeg. Keep the image rebuilt and patched.

## Storage

By default, Compose bind-mounts:

```text
./storage:/app/storage
./storage:/srv/storage:ro
```

The backend and worker write uploads, processed videos, and thumbnails. Caddy serves `/media/*` read-only from the same storage directory.

S3-compatible storage is not enabled by default. The code keeps storage paths relative and isolated so an S3/MinIO adapter can be added without trusting user-provided filenames.

## Caddy and HTTPS

`Caddyfile` routes:

- `/api/*` and `/health` to the backend
- `/media/*` to the storage volume
- `/embed/*` and all other frontend routes to the frontend container

Set `OPENTUBE_DOMAIN=your-domain.example` and point DNS at the host. Caddy will obtain HTTPS certificates automatically.

## Database

Prisma schema and migrations live in `apps/backend/prisma`.

Commands:

```sh
npm run db:generate
npm run db:migrate
npm run db:deploy
```

The backend container runs `prisma migrate deploy` before starting.

## Backups

Back up both PostgreSQL and media storage.

Example:

```sh
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > opentube.sql
tar -czf opentube-storage.tgz storage/
```

Restore PostgreSQL before starting backend/worker containers, then restore `storage/`.

## Updates

```sh
git pull
npm install
npm run typecheck
npm run test
npm run build
docker compose up -d --build
```

Review migration output before production rollout.

## Security

Implemented protections include:

- Argon2 password hashing
- Opaque server-side sessions stored in PostgreSQL
- HttpOnly session cookie and SameSite Lax
- Double-submit CSRF tokens for unsafe requests
- Fastify Helmet security headers
- Auth and upload route rate limiting
- Zod validation
- Sanitization of user-generated text and channel color customization
- Magic-byte upload validation
- Safe storage path construction
- Role-based authorization checks
- View de-duplication using HMAC-hashed IP and user-agent
- No hardcoded production credentials

Production checklist:

- Change all `.env` example secrets.
- Set `COOKIE_SECURE=true` behind HTTPS.
- Use a strong PostgreSQL password.
- Restrict server SSH and database access.
- Keep Docker images, Node dependencies, and FFmpeg patched.
- Monitor reports and moderation queues.

## Development Commands

```sh
npm install
npm run db:generate
npm run typecheck
npm run test
npm run build
npm audit --omit=dev
```

Frontend dev server:

```sh
npm --workspace apps/frontend run dev
```

Backend dev server:

```sh
npm --workspace apps/backend run dev
```

Worker dev process:

```sh
npm --workspace apps/worker run dev
```

## License

OpenTube is released under the MIT License. See `LICENSE`.
