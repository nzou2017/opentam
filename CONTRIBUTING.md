# Contributing to Q

Thank you for your interest in contributing to Q! This guide will help you get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/ningzou/q.git
cd q

# Install dependencies
pnpm install

# Copy env file and fill in API keys
cp .env.example .env

# Start all packages in dev mode
pnpm dev
```

The backend runs on `http://localhost:3001` and the dashboard on `http://localhost:3000`.

## Code Style

- **TypeScript** with strict mode enabled
- **Tailwind CSS** for styling (dashboard)
- Prefer functional patterns; avoid classes where possible
- Use `zod` for runtime validation on API boundaries

## Running Tests

```bash
# Run all tests
pnpm test

# Run backend tests
cd packages/backend && npx vitest run

# Watch mode
cd packages/backend && npx vitest
```

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure all tests pass (`pnpm test`)
4. Ensure TypeScript compiles without errors (`pnpm lint`)
5. Open a PR against `main` with a clear description
6. All PRs require at least one review before merging

## DCO Sign-Off

All commits must be signed off to certify you have the right to submit the code under the project's license:

```bash
git commit -s -m "Your commit message"
```

This adds a `Signed-off-by` line to your commit message, certifying compliance with the [Developer Certificate of Origin](https://developercertificate.org/).

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for ideas

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0.
