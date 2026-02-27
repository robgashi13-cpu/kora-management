import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

const hashWithSalt = (password: string, salt: string) => {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${password}`)
    .digest('base64');
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

  const salt = process.env.ADMIN_PASSWORD_SALT;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!salt || !hash) {
    console.error('ADMIN_PASSWORD_SALT and ADMIN_PASSWORD_HASH must be configured on the server.');
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const computed = hashWithSalt(password, salt);
  const ok = safeEqual(computed, hash);

  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
