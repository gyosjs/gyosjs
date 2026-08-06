# Security Policy

## Security Model

GyosJS operates on trusted application templates. Template expressions, inline `g-scope`, `gm-*`, event expressions, and `g-router-params` execute JavaScript and are not a sandbox. Never build directive names or expression attributes from user-controlled input.

The current expression implementation uses `Function()`. Applications with a strict Content Security Policy that omits `unsafe-eval` are not currently compatible. This limitation must be considered before adopting GyosJS in high-security deployments.

`g-html` intentionally writes raw HTML and requires application-level sanitization. `g-markdown` escapes raw HTML and rejects active URL schemes, while bound `href` and `src` values reject `javascript:`, `vbscript:`, unsafe `data:` URLs, and active-content elements such as `script` and `iframe`. These defenses do not replace server-side validation and output encoding.

MPA Boost accepts only same-origin `text/html` or `application/xhtml+xml` responses and rejects attachments. A rejected GET response falls back to native navigation. A non-GET request is never replayed after it has been sent; GyosJS keeps the current DOM mounted and reports the rejected response. Keep API, download, and user-uploaded-content endpoints outside boost navigation with `g-no-boost`.

`g-provide` accepts JSON objects only. Use JavaScript provider APIs for dynamic values.

## Supported Versions

Security fixes are expected to land on the latest public release first. Older versions may not receive patches unless a fix is trivial to backport.

## Reporting a Vulnerability

Please do not open a public GitHub issue for security-sensitive problems.

Send the report to:

- `phuvncom007@gmail.com`

Include as much detail as possible:

- affected version
- reproduction steps
- impact
- proof of concept if available
- any suggested mitigation

## Response Expectations

- Initial acknowledgement: within 7 days
- Triage and impact confirmation: as soon as practical after acknowledgement
- Fix timeline: depends on severity, exploitability, and release risk

If the report is valid, the preferred flow is private coordination first, then a public fix and disclosure note after a patch is available.
