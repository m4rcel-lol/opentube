# Security Policy

## Supported Versions

OpenTube is pre-1.0 software. Security fixes are accepted on the main branch and should be deployed by rebuilding the containers.

## Reporting Vulnerabilities

Report vulnerabilities privately to the repository maintainer. Do not post exploit details publicly until a fix is available.

Include:

- Affected version or commit
- Steps to reproduce
- Impact and affected roles
- Any logs or proof-of-concept files needed to verify safely

## Security Notes

- Do not run with default example secrets.
- Set `COOKIE_SECURE=true` when serving HTTPS.
- Keep `VIEW_HASH_SECRET`, PostgreSQL credentials, and admin bootstrap values private.
- Uploaded media is validated by magic bytes and processed by FFmpeg, but operators should still keep FFmpeg patched.
- Use least-privilege filesystem permissions for the mounted `storage/` directory.
- Review reports and moderation queues regularly on public instances.
