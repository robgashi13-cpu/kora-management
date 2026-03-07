const DEFAULT_ADMIN_PASSWORD_SALT = 'kora-admin-default-v1';
const DEFAULT_ADMIN_PASSWORD_HASH = 'IpGYMNibP/9UrCM0pQOCZLBEvOEGCm12DRJ66jLvCp4=';

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const hashWithSalt = async (password: string, salt: string) => {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${password}`));
  return toBase64(new Uint8Array(digest));
};

const sanitizeEnvSecret = (value?: string) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\r?\n/g, '').trim();
};

const fallbackVerify = async (password: string) => {
  const normalizedInput = sanitizeEnvSecret(password);
  const directPassword = sanitizeEnvSecret(import.meta.env.VITE_ADMIN_PASSWORD);
  const directMatch = directPassword.length > 0 && normalizedInput === directPassword;

  const salt = sanitizeEnvSecret(import.meta.env.VITE_ADMIN_PASSWORD_SALT) || DEFAULT_ADMIN_PASSWORD_SALT;
  const hash = sanitizeEnvSecret(import.meta.env.VITE_ADMIN_PASSWORD_HASH) || DEFAULT_ADMIN_PASSWORD_HASH;
  const computed = await hashWithSalt(normalizedInput, salt);
  const hashMatch = computed === hash;

  return directMatch || hashMatch;
};

export const verifyAdminPassword = async (password: string): Promise<boolean> => {
  if (!password) return false;

  try {
    const response = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      const data = await response.json();
      return data?.ok === true;
    }

    // 401 means the password is invalid. For route-not-found in Vite previews (404/405),
    // fall back to client-side hashed verification so admin login still works.
    if (response.status !== 404 && response.status !== 405) {
      return false;
    }
  } catch (error) {
    console.warn('Admin auth API unavailable, using fallback verification', error);
  }

  try {
    return await fallbackVerify(password);
  } catch (error) {
    console.error('Admin auth fallback verification failed', error);
    return false;
  }
};
