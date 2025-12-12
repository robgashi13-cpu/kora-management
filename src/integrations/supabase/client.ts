import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://tbjihsqkbmjiblpxzojo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiamloc3FrYm1qaWJscHh6b2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MjQ2OTQsImV4cCI6MjA4MTEwMDY5NH0.JHus2d1aZ252FvhlT4nVAsPPJediXq-c8uhI-3wpGdE";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});