# @midnight-ntwrk/http-client-proof-provider-auth

Authenticated HTTP proof provider for the Midnight blockchain. Drop-in replacement for `@midnight-ntwrk/midnight-js-http-client-proof-provider` that adds support for API key authentication with 3rd party proof servers.

## Why

The official Midnight SDK's proof provider doesn't support custom headers. This makes it impossible to use authenticated proof services like [Proof Station](https://proofstation.io) or any other hosted proving provider that requires API keys.

This package adds a `headers` config option — one line change in your app to enable authenticated proof generation.

## Install

```bash
npm install @midnight-ntwrk/http-client-proof-provider-auth
```

## Usage

```typescript
// Before (official SDK — no auth support)
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';

const proofProvider = httpClientProofProvider('http://localhost:6300', zkConfigProvider);

// After (this package — with auth)
import { httpClientProofProvider } from '@midnight-ntwrk/http-client-proof-provider-auth';

const proofProvider = httpClientProofProvider('https://api.proofstation.io', zkConfigProvider, {
  headers: {
    'X-API-Key': 'pk_live_...',
  },
});
```

Everything else stays the same. The provider implements the same interface — `proveTx()`, `prove()`, `check()`.

## Config

```typescript
interface AuthProofProviderConfig {
  timeout?: number;                  // Default: 300000 (5 min)
  headers?: Record<string, string>;  // Custom headers (API keys, auth tokens)
  retries?: number;                  // Default: 3
  retryDelay?: number;               // Default: 1000ms (exponential backoff)
  retryOn?: number[];                // Default: [500, 503]
}
```

## Examples

### Proof Station

```typescript
const proofProvider = httpClientProofProvider('https://api.proofstation.io', zkConfigProvider, {
  headers: { 'X-API-Key': process.env.PROOF_STATION_API_KEY },
});
```

### Bearer Token Auth

```typescript
const proofProvider = httpClientProofProvider('https://my-prover.example.com', zkConfigProvider, {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

### Self-Hosted (No Auth)

```typescript
// Works exactly like the official SDK — headers default to empty
const proofProvider = httpClientProofProvider('http://localhost:6300', zkConfigProvider);
```

## API

### `httpClientProofProvider(url, zkConfigProvider, config?)`

Creates a proof provider with `proveTx()` method for use with the Midnight SDK's transaction pipeline.

### `httpClientProvingProvider(url, zkConfigProvider, config?)`

Creates a lower-level proving provider with `prove()` and `check()` methods.

## Compatibility

- Works with any Midnight SDK version that uses `httpClientProofProvider`
- Same binary format — no changes to the proof server needed
- Backwards compatible — no headers = same behavior as official SDK

## Proposed SDK Change

This package exists because the official `@midnight-ntwrk/midnight-js-http-client-proof-provider` doesn't support custom headers. The minimal change needed in the SDK:

```diff
// midnight-js-http-client-proof-provider/src/index.ts

-const makeHttpRequest = async (url, payload, timeout) => {
+const makeHttpRequest = async (url, payload, timeout, headers = {}) => {
   const response = await fetchRetry(url, {
     method: 'POST',
     body: payload.buffer,
+    headers: { 'Content-Type': 'application/octet-stream', ...headers },
     signal: AbortSignal.timeout(timeout)
   });
```

And in the config type:

```diff
 export interface ProofProviderConfig {
   timeout?: number;
+  headers?: Record<string, string>;
 }
```

This would enable the entire Midnight ecosystem to work with authenticated proof servers natively.

---

Built by [Utkarsh Varma](https://github.com/UvRoxx) at [Webisoft](https://webisoft.com)
