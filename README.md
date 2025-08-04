# Sync Tool

A tool for synchronizing code with upstream repositories with incremental updates and parallel processing.

## Features
- Incremental sync using file hashes
- Parallel directory processing
- Git integration
- Configurable ignore patterns
- Conflict resolution

## Installation

```bash
npm install -g sync-tool
```

## Usage

```bash
sync-upstream --config sync.config.js
```

## Configuration

Create a `sync.config.js` file with the following structure:

```javascript
module.exports = {
  // Path to the local repository
  localRepoPath: './my-project',
  // Upstream repository URL
  upstreamRepoUrl: 'https://github.com/example/upstream-repo.git',
  // Upstream branch to sync with
  upstreamBranch: 'main',
  // Local branch to sync to
  localBranch: 'main',
  // Patterns to ignore during sync
  ignorePatterns: ['node_modules', 'dist', '.git'],
  // Concurrency limit for parallel processing
  concurrencyLimit: 5,
}
```

## API

### Classes

#### UpstreamSyncer

Main class for handling synchronization with upstream repositories.

```typescript
import { UpstreamSyncer } from 'sync-tool'

const syncer = new UpstreamSyncer({
  localRepoPath: './my-project',
  upstreamRepoUrl: 'https://github.com/example/upstream-repo.git',
  upstreamBranch: 'main',
  localBranch: 'main',
  ignorePatterns: ['node_modules', 'dist', '.git'],
  concurrencyLimit: 5,
})

syncer.run()
  .then(() => console.log('Sync completed successfully'))
  .catch(err => console.error('Sync failed:', err))
```

## License

ISC
