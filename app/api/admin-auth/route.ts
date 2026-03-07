import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

const hashWithSalt = (password: string, salt: string) => {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${password}`)
    .digest('base64');
};

const DEFAULT_ADMIN_PASSWORD_SALT = 'kora-admin-default-v1';
const DEFAULT_ADMIN_PASSWORD_HASH = 'IpGYMNibP/9UrCM0pQOCZLBEvOEGCm12DRJ66jLvCp4=';

const sanitizeEnvSecret = (value?: string) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\r?\n/g, '').trim();
};

const safeEqual = (a: string, b: string) => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const normalizedInput = sanitizeEnvSecret(password);
  const directPassword = sanitizeEnvSecret(process.env.ADMIN_PASSWORD);
  if (directPassword.length > 0) {
    const ok = safeEqual(normalizedInput, directPassword);
    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  }

  const salt = sanitizeEnvSecret(process.env.ADMIN_PASSWORD_SALT) || DEFAULT_ADMIN_PASSWORD_SALT;
  const hash = sanitizeEnvSecret(process.env.ADMIN_PASSWORD_HASH) || DEFAULT_ADMIN_PASSWORD_HASH;

  const computed = hashWithSalt(normalizedInput, salt);
  const ok = safeEqual(computed, hash);

  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
