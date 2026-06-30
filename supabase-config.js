/* supabase-config.js — The Sleep Collective Hub */
const SUPABASE_URL  = 'https://pajcmkotmstzkmgfbcyp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhamNta290bXN0emttZ2ZiY3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTQwNjQsImV4cCI6MjA5ODM5MDA2NH0.KBrOkFWTstE4yx5WR0XZFjCcS1gTGFjqICnblxoxePQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
