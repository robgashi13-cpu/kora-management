import { createClient, SupabaseClient } from '@supabase/supabase-js';

let authClient: SupabaseClient | null = null;

// Fallback values matching Lovable Cloud project
const FALLBACK_URL = 'https://tbjihsqkbmjiblpxzojo.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiamloc3FrYm1qaWJscHh6b2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MjQ2OTQsImV4cCI6MjA4MTEwMDY5NH0.JHus2d1aZ252FvhlT4nVAsPPJediXq-c8uhI-3wpGdE';

const getSupabaseUrl = () => {
    try { return import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL; } catch { return FALLBACK_URL; }
};
const getSupabaseKey = () => {
    try { return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY; } catch { return FALLBACK_KEY; }
};

export const getAuthClient = (): SupabaseClient => {
    if (!authClient) {
        authClient = createClient(getSupabaseUrl(), getSupabaseKey(), {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                storageKey: 'kora-auth-session',
            },
        });
    }
    return authClient;
};

export type AuthProfile = {
    id: string;
    profileName: string;
    email: string;
    isAdmin: boolean;
};

export const signIn = async (email: string, password: string): Promise<{ success: boolean; profile?: AuthProfile; error?: string }> => {
    const client = getAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
        return { success: false, error: error.message };
    }

    if (!data.user) {
        return { success: false, error: 'Login failed' };
    }

    // Fetch profile
    const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) {
        return { success: false, error: 'Profile not found' };
    }

    return {
        success: true,
        profile: {
            id: profile.id,
            profileName: profile.profile_name,
            email: profile.email,
            isAdmin: profile.is_admin,
        },
    };
};

export const signOut = async (): Promise<void> => {
    const client = getAuthClient();
    await client.auth.signOut();
};

export const changePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const client = getAuthClient();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
};

export const getCurrentSession = async (): Promise<AuthProfile | null> => {
    const client = getAuthClient();
    const { data: { session } } = await client.auth.getSession();

    if (!session?.user) return null;

    const { data: profile } = await client
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (!profile) return null;

    return {
        id: profile.id,
        profileName: profile.profile_name,
        email: profile.email,
        isAdmin: profile.is_admin,
    };
};

export const getAllProfiles = async (): Promise<AuthProfile[]> => {
    const client = getAuthClient();
    const { data } = await client.from('profiles').select('*');
    if (!data) return [];
    return data.map((p: any) => ({
        id: p.id,
        profileName: p.profile_name,
        email: p.email,
        isAdmin: p.is_admin,
    }));
};
