
import { createClient } from '@supabase/supabase-js'

// Read credentials from .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Check environment variables
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase credentials. Please check your .env.local file.'
  )
}

// Create Supabase client
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)
