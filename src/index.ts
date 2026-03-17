/**
 * @midnight-ntwrk/http-client-proof-provider-auth
 *
 * Drop-in replacement for @midnight-ntwrk/midnight-js-http-client-proof-provider
 * that supports API key authentication and custom headers for 3rd party proof servers.
 *
 * Enables the Midnight SDK to work with authenticated proof services like
 * Proof Station (proofstation.io) and other hosted proving providers.
 *
 * @example
 * ```typescript
 * import { httpClientProofProvider } from '@midnight-ntwrk/http-client-proof-provider-auth';
 *
 * const proofProvider = httpClientProofProvider(
 *   'https://api.proofstation.io',
 *   zkConfigProvider,
 *   {
 *     timeout: 300000,
 *     headers: {
 *       'X-API-Key': 'pk_live_...',
 *     },
 *   },
 * );
 * ```
 *
 * @author Utkarsh Varma <utkarsh@webisoft.com>
 * @license Apache-2.0
 */

import {
  createProvingPayload,
  createCheckPayload,
  parseCheckResult,
  CostModel,
} from '@midnight-ntwrk/ledger-v7';
import {
  InvalidProtocolSchemeError,
  zkConfigToProvingKeyMaterial,
} from '@midnight-ntwrk/midnight-js-types';
import crossFetch from 'cross-fetch';
import fetchBuilder from 'fetch-retry';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for the authenticated proof provider.
 */
export interface AuthProofProviderConfig {
  /**
   * Request timeout in milliseconds.
   * @default 300000 (5 minutes)
   */
  timeout?: number;

  /**
   * Custom headers to include in every proof server request.
   * Use this for API key authentication with 3rd party proof servers.
   *
   * @example
   * ```typescript
   * headers: {
   *   'X-API-Key': 'pk_live_...',
   *   'Authorization': 'Bearer ...',
   * }
   * ```
   */
  headers?: Record<string, string>;

  /**
   * Number of retry attempts on 500/503 errors.
   * @default 3
   */
  retries?: number;

  /**
   * Base retry delay in milliseconds. Exponential backoff is applied.
   * @default 1000
   */
  retryDelay?: number;

  /**
   * HTTP status codes that trigger a retry.
   * @default [500, 503]
   */
  retryOn?: number[];
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Required<AuthProofProviderConfig> = {
  timeout: 300_000,
  headers: {},
  retries: 3,
  retryDelay: 1_000,
  retryOn: [500, 503],
};

export const DEFAULT_TIMEOUT = 300_000;

// ─── Internal ───────────────────────────────────────────────────────────────

const CHECK_PATH = '/check';
const PROVE_PATH = '/prove';

const getKeyMaterial = async (
  zkConfigProvider: any,
  keyLocation: string,
): Promise<any | undefined> => {
  try {
    const zkConfig = await zkConfigProvider.getZkConfig(keyLocation);
    return zkConfigToProvingKeyMaterial(zkConfig);
  } catch {
    return undefined;
  }
};

const makeHttpRequest = async (
  url: URL,
  payload: Uint8Array,
  timeout: number,
  headers: Record<string, string>,
): Promise<Uint8Array> => {
  const fetchRetry = fetchBuilder(crossFetch, {
    retries: 3,
    retryDelay: (attempt: number) => 2 ** attempt * 1_000,
    retryOn: [500, 503],
  });

  const response = await fetchRetry(url.toString(), {
    method: 'POST',
    body: payload.buffer,
    headers: {
      'Content-Type': 'application/octet-stream',
      ...headers,
    },
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Failed Proof Server response: url="${response.url}", code="${response.status}", status="${response.statusText}"${body ? `, body="${body.slice(0, 200)}"` : ''}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Creates an authenticated HTTP proving provider.
 *
 * This is a drop-in replacement for `httpClientProvingProvider` from
 * `@midnight-ntwrk/midnight-js-http-client-proof-provider` that adds
 * support for custom headers (API keys, auth tokens, etc.).
 *
 * @param url - Proof server URL (e.g., 'https://api.proofstation.io')
 * @param zkConfigProvider - ZK config provider from the Midnight SDK
 * @param config - Optional configuration including headers for authentication
 */
export const httpClientProvingProvider = (
  url: string,
  zkConfigProvider: any,
  config?: AuthProofProviderConfig,
) => {
  const checkUrl = new URL(CHECK_PATH, url);
  const proveUrl = new URL(PROVE_PATH, url);

  if (checkUrl.protocol !== 'http:' && checkUrl.protocol !== 'https:') {
    throw new InvalidProtocolSchemeError(checkUrl.protocol, ['http:', 'https:']);
  }
  if (proveUrl.protocol !== 'http:' && proveUrl.protocol !== 'https:') {
    throw new InvalidProtocolSchemeError(proveUrl.protocol, ['http:', 'https:']);
  }

  const timeout = config?.timeout ?? DEFAULT_TIMEOUT;
  const headers = config?.headers ?? {};

  return {
    async check(
      serializedPreimage: Uint8Array,
      keyLocation: string,
    ): Promise<any[]> {
      const keyMaterial = await getKeyMaterial(zkConfigProvider, keyLocation);
      const payload = createCheckPayload(serializedPreimage, keyMaterial?.ir);
      const result = await makeHttpRequest(checkUrl, payload, timeout, headers);
      return parseCheckResult(result);
    },

    async prove(
      serializedPreimage: Uint8Array,
      keyLocation: string,
      overwriteBindingInput?: any,
    ): Promise<Uint8Array> {
      const keyMaterial = await getKeyMaterial(zkConfigProvider, keyLocation);
      const payload = createProvingPayload(
        serializedPreimage,
        overwriteBindingInput,
        keyMaterial,
      );
      return makeHttpRequest(proveUrl, payload, timeout, headers);
    },
  };
};

/**
 * Creates an authenticated HTTP proof provider with transaction-level proving.
 *
 * Drop-in replacement for `httpClientProofProvider` from the Midnight SDK.
 * Adds API key authentication support for 3rd party proof servers.
 *
 * @param url - Proof server URL
 * @param zkConfigProvider - ZK config provider
 * @param config - Optional configuration including auth headers
 *
 * @example
 * ```typescript
 * // With Proof Station
 * const proofProvider = httpClientProofProvider(
 *   'https://api.proofstation.io',
 *   zkConfigProvider,
 *   { headers: { 'X-API-Key': 'pk_live_...' } },
 * );
 *
 * // Use with Midnight SDK — no other changes needed
 * const providers = {
 *   proofProvider,
 *   walletProvider: wp,
 *   midnightProvider: wp,
 *   // ...
 * };
 * ```
 */
export const httpClientProofProvider = (
  url: string,
  zkConfigProvider: any,
  config?: AuthProofProviderConfig,
) => {
  const baseProvingProvider = httpClientProvingProvider(
    url,
    zkConfigProvider,
    config,
  );

  return {
    async proveTx(unprovenTx: any, _partialProveTxConfig?: any) {
      const costModel = CostModel.initialCostModel();
      return unprovenTx.prove(baseProvingProvider, costModel);
    },
  };
};
