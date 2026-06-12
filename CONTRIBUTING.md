# Contributing

Thanks for improving 小店AI客服. This project is a desktop automation tool, so changes must protect existing reply behavior and avoid leaking local credentials.

## Local Setup

```bash
npm install
npm run build-extension
npm run desktop
```

Use a real test shop account only when you have permission to do so. For automated tests, prefer fixture-based scripts under `scripts/`.

## Required Checks

Before opening a pull request or release commit, run the checks that match your change:

```bash
npm run build-extension
npm run test:extension-modules
npm run test:status-ui
npm run test:release-readiness
npm run check:secrets
npm run doctor
```

For packaging changes, also run:

```bash
npm run dist:mac
npm run test:macos-package
```

Windows installer and portable-package smoke tests run in GitHub Actions.

## Secrets and Private Data

Never commit:

- DeepSeek API Key
- Enterprise WeChat / WeCom webhook URL
- Runyu Cookie or session token
- Desktop control Token
- `.env`
- personal runtime cache
- private Runyu judgment-library exports or downloaded private data
- local WeChat shop session data

If a log, screenshot, or fixture contains any credential, redact it before committing.

## WeChat Shop Page Changes

Changes that touch the mapped WeChat shop customer-service page must include clear verification notes:

- what page state was tested
- what customer message or action triggered the behavior
- whether text, image, file, product card, or order invitation was sent
- whether the action produced a reply record and status trace
- any screenshot evidence if the change affects layout or page automation

Do not replace a tested selector or page action with a guess. If the page structure changed, capture the page structure and document the new target.

## Code Style

- Keep the existing Electron and plain JavaScript structure unless a larger migration is explicitly planned.
- Keep user-facing UI light, compact, and operational.
- Prefer deterministic rules before AI fallback.
- Keep sensitive values out of command-line arguments and logs.
- Add tests near the behavior being changed.

## Commit Style

Use short conventional prefixes when practical:

- `fix:` for bug fixes
- `feat:` for new capabilities
- `docs:` for documentation
- `test:` for test coverage
- `ci:` for workflow changes
- `chore:` for version or release maintenance

Release commits should update version numbers, release notes, README links, and release readiness checks together.
