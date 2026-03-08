import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tbjihsqkbmjiblpxzojo.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiamloc3FrYm1qaWJscHh6b2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MjQ2OTQsImV4cCI6MjA4MTEwMDY5NH0.JHus2d1aZ252FvhlT4nVAsPPJediXq-c8uhI-3wpGdE';

export const cloudClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
