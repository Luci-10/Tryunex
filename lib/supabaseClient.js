import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jbforuradtjtjqffqeyo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZm9ydXJhZHRqdGpxZmZxZXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzUzMDksImV4cCI6MjA5NDA1MTMwOX0.q3A2YdRc3BAeRu1u-Xs8sXX9QaRcNwoFUBcFOAHy-0E";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
