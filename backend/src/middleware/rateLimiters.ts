import rateLimit from 'express-rate-limit';

const TOO_MANY = {
    success: false,
    message: 'Too many attempts. Please try again later.',
    data: null,
};

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
});
