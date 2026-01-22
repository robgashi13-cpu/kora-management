export type PasswordRecord = {
    passwordHash: string;
    passwordSalt: string;
};

const bufferToBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => {
        binary += String.fromCharCode(b);
    });
    return btoa(binary);
};

export const hashWithSalt = async (value: string, salt: string) => {
    const data = new TextEncoder().encode(`${salt}:${value}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bufferToBase64(digest);
};

export const generateSalt = () => crypto.randomUUID();

export const generateSetupToken = () => crypto.randomUUID();

export const createPasswordRecord = async (password: string): Promise<PasswordRecord> => {
    const salt = generateSalt();
    const hash = await hashWithSalt(password, salt);
    return { passwordHash: hash, passwordSalt: salt };
};

export const verifyPassword = async (password: string, record?: PasswordRecord | null) => {
    if (!record?.passwordHash || !record.passwordSalt) return false;
    const hash = await hashWithSalt(password, record.passwordSalt);
    return hash === record.passwordHash;
};
