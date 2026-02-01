
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
    console.error('Invalid Supabase URL:', supabaseUrl);
    throw new Error('Supabase URL is missing or invalid. Check your .env.local file.');
}

if (!supabaseAnonKey) {
    console.error('Supabase Anon Key is missing');
    throw new Error('Supabase Anon Key is missing. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
