# Contributing

Thanks for helping make local agent tooling safer.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

## Guidelines

- Keep public examples free of personal paths, tokens, emails, and private hostnames.
- Preserve dry-run-first behavior.
- Do not add a generic shell tool.
- Add tests for safety-sensitive changes.
- Document caveats honestly, especially around downstream CLI permissions and sandboxing.

## Pull requests

Include:

- What changed.
- How it was tested.
- Any security tradeoffs.
