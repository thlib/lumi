# Changelog

All notable changes to Lumi are documented in this file.

The project follows [Semantic Versioning](https://semver.org/). Before 1.0,
breaking public API changes may be released in a minor version and will be
identified here.

## Unreleased

### Added

- Native delegated event bindings with automatic lifecycle cleanup.
- Native element and event inference in the generated TypeScript declarations.
- Browser contracts for forms, focus, custom elements, and open Shadow DOM.
- Clean package-build and installed-consumer validation.
- GitHub Actions validation for types, unit contracts, packaging, Chromium, and
  Firefox.

### Changed

- Declaration builds now remove the previous `dist` tree before emitting.
