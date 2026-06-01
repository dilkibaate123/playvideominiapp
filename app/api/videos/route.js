import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Supabase client initialization
let supabaseClient = null;
function getSupabaseClient() {
     if (supabaseClient) return supabaseClient;
     const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
     const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
     if (!supabaseUrl || !supabaseServiceKey) return null;
     supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
     return supabaseClient;
}

const LOCAL_CACHE_PATH = path.join('/tmp', 'webseries_videos.json');

export async function GET(request) {
     try {
          const { searchParams } = new URL(request.url);
          const query = searchParams.get('q')?.toLowerCase() || '';
          const category = searchParams.get('category') || 'Latest';

          let videos = [];
          let source = 'unknown';

          // ─── 1. Try fetching from Supabase ───
          const supabase = getSupabaseClient();
          if (supabase) {
               try {
                    const { data, error } = await supabase
                         .from('webseries_videos')
                         .select('*');

                    if (!error && data && data.length > 0) {
                         videos = data;
                         source = 'supabase';
                    }
               } catch (err) {
                    console.warn('[API Videos] Supabase fetch exception, falling back to file:', err.message);
               }
          }

          // ─── 2. Try fetching from Local File Cache if Supabase failed/unconfigured ───
          if (videos.length === 0) {
               try {
                    if (fs.existsSync(LOCAL_CACHE_PATH)) {
                         const fileContent = fs.readFileSync(LOCAL_CACHE_PATH, 'utf8');
                         videos = JSON.parse(fileContent);
                         source = 'local_file';
                    }
               } catch (err) {
                    console.error('[API Videos] Local file cache read failure:', err);
               }
          }

          // ─── 3. Filter results ───
          let filtered = [...videos];

          // Category filter (if category is not 'Latest', filter by specific category)
          if (category && category !== 'Latest') {
               filtered = filtered.filter(v => v.category === category);
          }

          // Search query filter
          if (query) {
               filtered = filtered.filter(v => 
                    v.title?.toLowerCase().includes(query) || 
                    v.category?.toLowerCase().includes(query)
               );
          }

          return NextResponse.json({
               ok: true,
               source: source,
               count: filtered.length,
               videos: filtered
          });

     } catch (error) {
          console.error('Fetch videos route crash:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
     }
}
