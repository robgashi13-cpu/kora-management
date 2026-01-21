const ADMIN_PASSWORD_HASH = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_HASH ?? '';
const ADMIN_PASSWORD_SALT = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_SALT ?? '';
const PBKDF2_ITERATIONS = 150000;

const encodeHex = (buffer: ArrayBuffer) =>
    Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

const hashPassword = async (password: string, salt: string) => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        256
    );
    return encodeHex(derivedBits);
};

const timingSafeCompare = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i += 1) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
};

export const verifyAdminPassword = async (
    password: string
): Promise<{ ok: boolean; error?: string }> => {
    if (!ADMIN_PASSWORD_HASH || !ADMIN_PASSWORD_SALT) {
        return {
            ok: false,
            error:
                'Admin access is not configured. Set NEXT_PUBLIC_ADMIN_PASSWORD_HASH and NEXT_PUBLIC_ADMIN_PASSWORD_SALT.',
        };
    }
    if (!password) {
        return { ok: false, error: 'Password is required.' };
    }

    const derived = await hashPassword(password, ADMIN_PASSWORD_SALT);
    const expected = ADMIN_PASSWORD_HASH.trim().toLowerCase();
    const match = timingSafeCompare(derived.toLowerCase(), expected);
    return match ? { ok: true } : { ok: false, error: 'Incorrect password.' };
};
