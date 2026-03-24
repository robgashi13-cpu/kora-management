import { cloudClient } from './cloudAuth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tbjihsqkbmjiblpxzojo.supabase.co';

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
    const response = await fetch(`${SUPABASE_URL}/functions/v1/profile-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiamloc3FrYm1qaWJscHh6b2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MjQ2OTQsImV4cCI6MjA4MTEwMDY5NH0.JHus2d1aZ252FvhlT4nVAsPPJediXq-c8uhI-3wpGdE',
      },
      body: JSON.stringify({ profileName, password }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.session) return null;

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
