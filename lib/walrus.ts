/**
 * Walrus decentralized storage (Mysten Labs / Sui). Creators upload a video and
 * it's stored as a blob on Walrus; the aggregator serves it back at a stable
 * URL that drops straight into our <video> player. Pairs decentralized storage
 * with Driplet's decentralized per-second payments on Arc.
 *
 * The public testnet publisher sponsors uploads (no WAL tokens needed) and CORS
 * is open, so the browser PUTs the file directly — no server round-trip, no
 * Vercel body-size limit. Endpoints are overridable via env for mainnet / a
 * self-hosted publisher later.
 */
export const WALRUS_PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER ?? "https://publisher.walrus-testnet.walrus.space";
export const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ?? "https://aggregator.walrus-testnet.walrus.space";

/** Public testnet publishers cap uploads at 10 MiB. */
export const WALRUS_MAX_BYTES = 10 * 1024 * 1024;

/** How many storage epochs to keep the blob (testnet epoch ≈ 1 day). */
const DEFAULT_EPOCHS = 10;

export function walrusBlobUrl(blobId: string): string {
  return `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
}

export interface WalrusUpload {
  blobId: string;
  url: string;
}

/**
 * Upload a file to Walrus from the browser and return the blob id + a public
 * URL that serves it. Reports progress (0–100) if a callback is given.
 */
export function uploadToWalrus(
  file: File,
  onProgress?: (pct: number) => void,
  epochs = DEFAULT_EPOCHS,
): Promise<WalrusUpload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WALRUS_PUBLISHER}/v1/blobs?epochs=${epochs}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Walrus upload failed (HTTP ${xhr.status}).`));
        return;
      }
      try {
        const json = JSON.parse(xhr.responseText);
        const blobId: string | undefined =
          json?.newlyCreated?.blobObject?.blobId ?? json?.alreadyCertified?.blobId;
        if (!blobId) {
          reject(new Error("Walrus did not return a blob id."));
          return;
        }
        resolve({ blobId, url: walrusBlobUrl(blobId) });
      } catch {
        reject(new Error("Could not parse the Walrus response."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error uploading to Walrus."));
    xhr.send(file);
  });
}
