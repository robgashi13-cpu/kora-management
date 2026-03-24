import { cloudClient } from './cloudAuth';

export const changeProfilePassword = async (profileName: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
  const key = profileName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const { error } = await cloudClient
    .from('app_config')
    .upsert({
      key: `profile_password_${key}`,
      value: { password: newPassword },
      updated_at: new Date().toISOString(),
      updated_by: profileName,
    }, { onConflict: 'key' });
  if (error) return { success: false, error: error.message };
  return { success: true };
};

type AuthSuccessPayload = { session: any; profile: any };
type AuthAttemptResult = {
  data: AuthSuccessPayload | null;
  errorMessage: string | null;
};

const parseFunctionError = async (error: any, data: any): Promise<string> => {
  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error.trim();
  }

  const responseContext = error?.context;
  if (responseContext && typeof responseContext.json === 'function') {
    try {
      const parsed = await responseContext.json();
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      // no-op: fallback to generic error handling below
    }
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return 'Sign-in failed';
};

export const authenticateProfileWithStatus = async (
  profileName: string,
  password?: string
): Promise<AuthAttemptResult> => {
  try {
    const { data, error } = await cloudClient.functions.invoke('profile-auth', {
      body: { profileName, password },
    });

    if (error || !data?.session) {
      const message = await parseFunctionError(error, data);
      return { data: null, errorMessage: message };
    }

    await cloudClient.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    return { data, errorMessage: null };
  } catch (error) {
    const message = await parseFunctionError(error, null);
    console.error('Profile authentication failed:', error);
    return { data: null, errorMessage: message };
  }
};

/**
 * Authenticate a profile via the profile-auth edge function.
 * For admin profiles, a password is required.
 * Returns the session data on success, or null on failure.
 */
export const authenticateProfile = async (
  profileName: string,
  password?: string
): Promise<{ session: any; profile: any } | null> => {
  const result = await authenticateProfileWithStatus(profileName, password);
  return result.data;
};

/**
 * Legacy wrapper: verifies admin password via edge function.
 * Used by Dashboard sidebar password modal.
 */
export const verifyAdminPassword = async (password: string): Promise<boolean> => {
  if (!password) return false;
  const result = await authenticateProfile('Robert', password);
  return result !== null;
};
