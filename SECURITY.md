# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report vulnerabilities by emailing the maintainers directly or by using [GitHub's private vulnerability reporting](https://github.com/alegerber/chess.com-mcp/security/advisories/new).

When reporting, please include:

- A description of the vulnerability
- Steps to reproduce the issue
- The potential impact
- Any suggested fix (if applicable)

## Response Timeline

- **Acknowledgement**: We will acknowledge receipt of your report within 72 hours.
- **Assessment**: We aim to assess and validate the vulnerability within 7 days.
- **Fix**: Critical vulnerabilities will be prioritized and patched as soon as possible.

## Scope

This project is an MCP server that proxies requests to the Chess.com and Lichess public APIs. Security concerns relevant to this project include:

- Input validation and sanitization of user-provided parameters
- Dependency vulnerabilities in third-party packages
- Server-side request forgery (SSRF) or unintended API access
- Information disclosure through error messages or logs

## Best Practices for Users

- Keep the package updated to the latest supported version.
- Run `npm audit` periodically to check for known dependency vulnerabilities.
- Do not expose the MCP server to untrusted networks without appropriate access controls.
