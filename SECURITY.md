# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting instead:
[**Report a vulnerability**](https://github.com/nazmul284/kormo-hr/security/advisories/new).

You should get an acknowledgement within 72 hours and a fix or a plan within
14 days. If a report is valid and you would like credit, you will be named in
the advisory.

## Supported versions

This is a single-branch project: `main` is the supported version. Fixes land
there and are tagged.

## What is in scope

Anything that lets someone read or change data they should not be able to:

- Authentication or session handling (token rotation, reuse detection, cookies)
- Authorisation — permission checks, row-level scope (`resolveScope`), the
  salary permission gate
- Mass assignment through the self-service profile endpoints
- SQL or command injection
- Anything that leaks one tenant's data to another

## What is not in scope

- **The demo seed data.** Every account in it uses the same published
  password. That is the point — it is a demo. Do not report it.
- **`.env.example` secrets.** They are placeholders, and the API refuses to
  boot in production if they are still in place (see
  `common/config/configuration.ts`).
- Missing rate limits on endpoints that are not authentication.
- Findings from a scanner with no demonstrated impact.

## Running it for real

If you are deploying this rather than evaluating it, read
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — the production checklist there is
not optional. At minimum: generate fresh JWT secrets, set `COOKIE_SECURE=true`,
put it behind HTTPS, and change every seeded password.
