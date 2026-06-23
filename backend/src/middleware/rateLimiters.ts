import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const TOO_MANY = {
    success: false,
    message: 'Too many attempts. Please try again later.',
    data: null,
};

function normalizeIp(raw: string): string {
    return raw.trim().replace(/^::ffff:/, '');
}

/** Skip auth rate limits on this machine during local dev (loopback / private LAN). */
export function skipAuthRateLimitOnLocalDev(req: Request): boolean {
    if (process.env.DISABLE_AUTH_RATE_LIMIT === 'true') return true;
    if (process.env.NODE_ENV === 'production') return false;

    const candidates = [req.ip, req.socket?.remoteAddress]
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .map(normalizeIp);

    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        candidates.push(normalizeIp(forwarded.split(',')[0]));
    }

    return candidates.some((ip) => {
        if (ip === '127.0.0.1' || ip === '::1') return true;
        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) return true;
        return false;
    });
}

const localDevSkip = { skip: skipAuthRateLimitOnLocalDev };

/**
 * Strict limiter for credential / sensitive endpoints.
 * 10 attempts per IP per 15 minutes.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: TOO_MANY,
    ...localDevSkip,
});

/**
 * Looser limiter for token refresh / endpoints every authed client
 * hits frequently. 60 per IP per 15 min.
 */
export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: TOO_MANY,
    ...localDevSkip,
});
