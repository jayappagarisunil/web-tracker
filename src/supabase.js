// // lib/supabase.ts
// import { createClient } from '@supabase/supabase-js';

// // Replace these with your actual project values
// const SUPABASE_URL = 'https://auywvaxyqswskykmhvki.supabase.co';
// const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1eXd2YXh5cXN3c2t5a21odmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1NDEzMTEsImV4cCI6MjA2NDExNzMxMX0.s43VacrXpE8qlza5bPacYSLSy4ZoG1qOqo6hy1qRBa4';

// export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


import { createClient } from '@supabase/supabase-js';

const supabaseUrl ='https://auywvaxyqswskykmhvki.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1eXd2YXh5cXN3c2t5a21odmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1NDEzMTEsImV4cCI6MjA2NDExNzMxMX0.s43VacrXpE8qlza5bPacYSLSy4ZoG1qOqo6hy1qRBa4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
