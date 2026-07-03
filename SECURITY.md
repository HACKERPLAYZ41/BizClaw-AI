# Security Policy

We take the security of BizClaw AI seriously. If you believe you have found a security vulnerability, please report it to us responsibly using the guidelines below.

## Supported Versions

Only the latest active version of BizClaw AI receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

Please **DO NOT** open a public GitHub issue for security vulnerabilities. Instead, report it using one of the following methods:

1. **GitHub Security Advisory:** Submit a private draft security advisory directly through the repository's "Security" tab.
2. **Direct Contact:** Contact the developer privately at `@utkarsh.decodes` on Instagram or via email if configured.

### What to Include in a Report:
* A detailed description of the vulnerability.
* Step-by-step instructions (or proof-of-concept code) to reproduce the vulnerability.
* The potential impact of the vulnerability.

## Our Security Response Process

Once a vulnerability report is received:
1. We will acknowledge receipt of your report within **24 to 48 hours**.
2. We will analyze the vulnerability, determine its severity, and work on a patch or mitigation.
3. A fix will be committed directly to the `main` branch, and we will notify you upon release.

## Security Best Practices for Self-Hosting

If you are self-hosting this chatbot platform on a VPS or Pterodactyl Panel:
* **Never commit secrets:** Ensure `config.yml`, `.env`, and `database.json` are always listed in your `.gitignore` file and never uploaded to public repositories.
* **Keep dependencies updated:** Regularly check and run `npm update` to keep the underlying Baileys and engine packages patched.
* **Enable Rate Limiting:** Keep the built-in custom Express rate limiters active to protect auth endpoints.
