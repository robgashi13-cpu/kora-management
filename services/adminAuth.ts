import { cloudClient } from './cloudAuth';

/**
 * Authenticate a profile via the profile-auth edge function.
 * For admin profiles, a password is required.
 * Returns the session data on success, or null on failure.
 */
export const authenticateProfile = async (
  profileName: string,
  password?: string
): Promise<{ session: any; profile: any } | null> => {
  try {
    const { data, error } = await cloudClient.functions.invoke('profile-auth', {
      body: { profileName, password },
    });

    if (error || !data?.session) {
      return null;
    }

    // Set the session on the client
    await cloudClient.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    return data;
  } catch (error) {
    console.error('Profile authentication failed:', error);
    return null;
  }
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
