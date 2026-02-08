# Security Policy

## Supported versions

| Version                 | Supported |
| ----------------------- | --------- |
| latest `main`           | ✅        |
| previous tagged release | ✅        |
| anything older          | ❌        |

We generally release fixes on `main` and backport if the change is critical and low risk. If you rely on a forked deployment, follow our releases and rebase often.

## Reporting a vulnerability

Send security issues to **security@goatscreams.com** (PGP optional). Include:

- Steps to reproduce
- Impact assessment (data exposure, denial of service, etc.)
- Suggested remediation or mitigations, if known
- Whether the issue has been disclosed elsewhere

You should receive an acknowledgment within 48 hours and a status update within five business days. Please do not open public GitHub issues for sensitive reports.

## Coordinated disclosure

We follow responsible disclosure best practices. Once a fix is ready and deployed, we will:

1. Credit reporters if they consent to being named.
2. Publish details in [`CHANGELOG.md`](CHANGELOG.md) and the Releases page.
3. Notify affected users via the repo README or Discussions when material.

Thank you for helping us keep goat screams safe for everyone.
