export const verifyAdminPassword = async (password: string): Promise<boolean> => {
  if (!password) return false;

  try {
    const response = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data?.ok === true;
  } catch (error) {
    console.error('Admin auth verification failed', error);
    return false;
  }
};
