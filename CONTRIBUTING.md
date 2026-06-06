# Contributing

Thanks for contributing to OpenTube.

## Development

1. Install Node.js 22, Docker, Docker Compose, and FFmpeg for local worker testing.
2. Run `npm install`.
3. Run `npm run db:generate`.
4. Run `npm run typecheck`, `npm run test`, and `npm run build` before submitting changes.

## Code Guidelines

- Keep the 2006-era UI intentional: small fonts, dense layouts, blue links, old form controls, and no modern SaaS styling.
- Do not use YouTube logos, trademarks, copied assets, or proprietary code.
- Validate inputs with Zod and keep backend authorization checks close to route handlers.
- Treat uploads as untrusted; never trust filenames or extensions.
- Prefer small readable functions over clever abstractions.

## Pull Requests

Include:

- What changed
- Security or migration impact
- Verification commands run
- Screenshots for UI changes when practical
