# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.2](https://github.com/flow-zy/sync-upstream/compare/v0.0.1...v0.0.2) (2025-08-09)

### [0.0.1](https://github.com/flow-zy/sync-upstream/compare/v0.0.1-beta.2...v0.0.1) (2025-08-08)

### [0.0.1-beta.2](https://gitee.com/overflow_z/sync-upstream/compare/v0.0.1-alpha.2...v0.0.1-beta.2) (2025-08-07)


### Features

* 🎸 完善错误捕获与日志处理 ([0a80e9a](https://gitee.com/overflow_z/sync-upstream/commit/0a80e9af6b4471d5f4d04efb8e720d48ce10a5b4))
* 增加重试机制 ([6b0e648](https://gitee.com/overflow_z/sync-upstream/commit/6b0e6480659a007e462c4508092f2cbb9a301e81))

### [0.0.1-beta.0](https://gitee.com/overflow_z/sync-upstream/compare/v0.0.1-alpha.2...v0.0.1-beta.0) (2025-08-07)


### Features

* 🎸 完善错误捕获与日志处理 ([0a80e9a](https://gitee.com/overflow_z/sync-upstream/commit/0a80e9af6b4471d5f4d04efb8e720d48ce10a5b4))

### [0.0.1-alpha.2](https://gitee.com/overflow_z/sync-upstream/compare/v0.0.1-alpha.1...v0.0.1-alpha.2) (2025-08-06)

### [0.0.1-alpha.1](https://gitee.com/overflow_z/sync-upstream/compare/v0.0.1-alpha.0...v0.0.1-alpha.1) (2025-08-05)


### Features

* 增加重试机制 ([b09f44b](https://gitee.com/overflow_z/sync-upstream/commit/b09f44b7f8b001f762cb8e5056194fe0c96a1d5a))

### 0.0.1-alpha.0 (2025-08-04)

# CHANGELOG

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [Unreleased]

### Features

- Added `concurrencyLimit` configuration option for parallel processing control
- Added authentication support with three types: SSH, USER_PASS, and PAT
- Added configuration validation logic
- Added command line support for concurrency limit with `--concurrency`/`-cl`
- Added interactive prompts for configuration
- Initial project setup
- Incremental sync using file hashes
- Parallel directory processing
- Git integration
- Configurable ignore patterns

### Bug Fixes

- Fixed import error in cli.ts
- Fixed package.json formatting issues

### Documentation

- Added README.md with usage instructions

### Build System

- Added TypeScript configuration
- Added ESLint and Prettier configuration

[Unreleased]: https://github.com/your-username/sync-tool/compare/v0.0.0...HEAD