import fs from 'fs/promises';
import path from 'path';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

type SpacesConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: SpacesConfig | null = null;

function trimSlash(v: string): string {
  return v.replace(/^\/+|\/+$/g, '');
}

function inferBucketFromEndpoint(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname;
    const first = host.split('.')[0] || '';
    return first;
  } catch {
    return '';
  }
}

function endpointForClient(endpoint: string, bucket: string): string {
  try {
    const u = new URL(endpoint);
    const bucketPrefix = `${bucket}.`;
    if (u.hostname.startsWith(bucketPrefix)) {
      u.hostname = u.hostname.slice(bucketPrefix.length);
      return u.toString().replace(/\/$/, '');
    }
  } catch {
    /* use the original endpoint */
  }
  return endpoint;
}

export function getSpacesConfig(): SpacesConfig | null {
  const endpoint =
    process.env.SPACES_ENDPOINT?.trim() ||
    process.env.DO_SPACES_ENDPOINT?.trim() ||
    process.env.DIGITALOCEAN_SPACES_ENDPOINT?.trim() ||
    process.env.S3_ENDPOINT?.trim() ||
    '';
  const accessKeyId =
    process.env.SPACES_ACCESS_KEY_ID?.trim() ||
    process.env.DO_SPACES_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim() ||
    '';
  const secretAccessKey =
    process.env.SPACES_SECRET_ACCESS_KEY?.trim() ||
    process.env.DO_SPACES_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.ACCESS_KEY?.trim() ||
    '';
  const bucket =
    process.env.SPACES_BUCKET?.trim() ||
    process.env.DO_SPACES_BUCKET?.trim() ||
    process.env.S3_BUCKET?.trim() ||
    (endpoint ? inferBucketFromEndpoint(endpoint) : '');
  const region =
    process.env.SPACES_REGION?.trim() ||
    process.env.DO_SPACES_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    'lon1';
  const keyPrefix = trimSlash(process.env.SPACES_KEY_PREFIX?.trim() || process.env.DO_SPACES_KEY_PREFIX?.trim() || '');

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, keyPrefix };
}

function getClient(): { client: S3Client; config: SpacesConfig } | null {
  const config = getSpacesConfig();
  if (!config) return null;
  if (
    !cachedClient ||
    !cachedConfig ||
    cachedConfig.endpoint !== config.endpoint ||
    cachedConfig.region !== config.region ||
    cachedConfig.accessKeyId !== config.accessKeyId ||
    cachedConfig.secretAccessKey !== config.secretAccessKey
  ) {
    cachedClient = new S3Client({
      endpoint: endpointForClient(config.endpoint, config.bucket),
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false,
    });
    cachedConfig = config;
  }
  return { client: cachedClient, config };
}

export function isSpacesEnabled(): boolean {
  return getSpacesConfig() != null;
}

export function spacesKey(...parts: Array<string | number | null | undefined>): string {
  const config = getSpacesConfig();
  const prefix = config?.keyPrefix ? [config.keyPrefix] : [];
  const cleaned = parts
    .filter((p) => p !== null && p !== undefined)
    .map((p) => trimSlash(String(p)))
    .filter(Boolean);
  return [...prefix, ...cleaned].join('/');
}

export function spacesObjectUrl(key: string): string | null {
  const config = getSpacesConfig();
  if (!config) return null;
  const endpoint = config.endpoint.replace(/\/+$/, '');
  try {
    const u = new URL(endpoint);
    if (u.hostname.startsWith(`${config.bucket}.`)) {
      return `${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`;
    }
    u.hostname = `${config.bucket}.${u.hostname}`;
    u.pathname = `/${key.split('/').map(encodeURIComponent).join('/')}`;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return `${endpoint}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function putSpacesBuffer(key: string, body: Buffer, contentType?: string | null): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  await c.client.send(
    new PutObjectCommand({
      Bucket: c.config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || undefined,
    }),
  );
  return true;
}

export async function putSpacesFile(key: string, filePath: string, contentType?: string | null): Promise<boolean> {
  const buf = await fs.readFile(filePath);
  return putSpacesBuffer(key, buf, contentType);
}

export async function getSpacesBuffer(key: string): Promise<Buffer | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const out = await c.client.send(new GetObjectCommand({ Bucket: c.config.bucket, Key: key }));
    if (!out.Body) return null;
    return streamToBuffer(out.Body as Readable);
  } catch {
    return null;
  }
}

export async function spacesObjectExists(key: string): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  try {
    await c.client.send(new HeadObjectCommand({ Bucket: c.config.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export function relativeFileKey(category: string, rootDir: string, filePath: string): string | null {
  const rel = path.relative(rootDir, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return spacesKey(category, rel.split(path.sep).join('/'));
}
