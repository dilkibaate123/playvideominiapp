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

const CATEGORY_SLUG_MAP = {
     'ULLU': 'category/ullu-c2',
     'Feel': 'category/feel',
     'Prime Shots': 'category/prime-shots',
     'VOOVI': 'category/voovi-d1'
};

function determineCategory(title, url, defaultCategory = 'Latest') {
     const t = title.toLowerCase();
     const u = url.toLowerCase();
     
     if (t.includes('ullu') || u.includes('ullu')) {
          return 'ULLU';
     }
     if (t.includes('feel') || u.includes('feel')) {
          return 'Feel';
     }
     if (t.includes('prime shots') || t.includes('primeshots') || u.includes('prime-shots') || u.includes('primeshots')) {
          return 'Prime Shots';
     }
     if (t.includes('voovi') || u.includes('voovi')) {
          return 'VOOVI';
     }
     return defaultCategory;
}

async function scrapePage(url, defaultCategory) {
     try {
          const res = await fetch(url, {
               headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
               }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();

          const liRegex = /<li class="godx-box vblock">([\s\S]*?)<\/li>/g;
          let match;
          const videos = [];

          while ((match = liRegex.exec(html)) !== null) {
               const content = match[1];

               const hrefMatch = content.match(/href="([^"]+)"/);
               const titleMatch = content.match(/alt="([^"]+)"/) || content.match(/<h2 class="vtitle">([^<]+)<\/h2>/);
               
               // Handle lazy loaded images
               let thumbnail = '';
               const srcMatch = content.match(/src="([^"]+)"/);
               const dataSrcMatch = content.match(/data-src="([^"]+)"/) || content.match(/data-lazy-src="([^"]+)"/);
               if (srcMatch && !srcMatch[1].includes('placeholder') && !srcMatch[1].includes('blank.gif') && !srcMatch[1].includes('.gif')) {
                    thumbnail = srcMatch[1];
               } else if (dataSrcMatch) {
                    thumbnail = dataSrcMatch[1];
               } else if (srcMatch) {
                    thumbnail = srcMatch[1];
               }

               // Extract duration
               let duration = '00:00';
               const durationMatch = content.match(/<div class="time">([\s\S]*?)<\/div>/);
               if (durationMatch) {
                    duration = durationMatch[1].replace(/<[^>]*>/g, '').trim();
               }

               // Extract uploaded time
               let uploaded = 'Recently';
               const uploadedMatch = content.match(/<div class="top-right">([\s\S]*?)<\/div>/);
               if (uploadedMatch) {
                    uploaded = uploadedMatch[1].replace(/<[^>]*>/g, '').trim();
               }

               if (hrefMatch && titleMatch && thumbnail) {
                    const title = titleMatch[1].trim();
                    const videoUrl = hrefMatch[1];
                    const category = determineCategory(title, videoUrl, defaultCategory);

                    videos.push({
                         url: videoUrl,
                         thumbnail: thumbnail,
                         title: title,
                         duration: duration,
                         uploaded: uploaded,
                         category: category
                    });
               }
          }
          return videos;
     } catch (err) {
          console.error(`Error scraping ${url}:`, err);
          return [];
     }
}

export async function GET(request) {
     return handleSync(request);
}

export async function POST(request) {
     return handleSync(request);
}

async function handleSync(request) {
     try {
          const { searchParams } = new URL(request.url);
          const secret = searchParams.get('secret');

          const EXPECTED_SECRET = process.env.SYNC_SECRET || 'fileadda';
          if (secret !== EXPECTED_SECRET) {
               return NextResponse.json({ error: 'Unauthorized: Invalid secret.' }, { status: 401 });
          }

          // Read page range and category parameters
          const startPage = parseInt(searchParams.get('start') || '1', 10);
          const endPage = parseInt(searchParams.get('end') || '1', 10);
          const targetCategory = searchParams.get('category') || 'all'; // Default to 'all' to refresh all categories

          if (isNaN(startPage) || isNaN(endPage) || startPage < 1 || endPage < startPage) {
               return NextResponse.json({ error: 'Invalid page range parameters.' }, { status: 400 });
          }

          // Cap the page range to avoid timeouts
          if (endPage - startPage > 20) {
               return NextResponse.json({ error: 'Range too large. Scrape maximum of 20 pages per request to prevent timeouts.' }, { status: 400 });
          }

          const results = [];
          const seenUrls = new Set();
          const scrapeTasks = [];

          if (targetCategory === 'all') {
               // Scrape range for Homepage
               for (let page = startPage; page <= endPage; page++) {
                    const url = page === 1 
                         ? 'https://hiwebxseries.com.co/' 
                         : `https://hiwebxseries.com.co/page/${page}/`;
                    scrapeTasks.push({ url, defaultCategory: 'Latest', label: `Homepage page ${page}` });
               }

               // Scrape range for categories
               for (const [catName, slug] of Object.entries(CATEGORY_SLUG_MAP)) {
                    for (let page = startPage; page <= endPage; page++) {
                         const url = page === 1 
                              ? `https://hiwebxseries.com.co/${slug}/` 
                              : `https://hiwebxseries.com.co/${slug}/page/${page}/`;
                         scrapeTasks.push({ url, defaultCategory: catName, label: `${catName} page ${page}` });
                    }
               }
          } else {
               // Scrape specific category
               for (let page = startPage; page <= endPage; page++) {
                    let url = '';
                    if (targetCategory === 'Latest') {
                         url = page === 1 
                              ? 'https://hiwebxseries.com.co/' 
                              : `https://hiwebxseries.com.co/page/${page}/`;
                    } else {
                         const slug = CATEGORY_SLUG_MAP[targetCategory];
                         if (!slug) {
                              return NextResponse.json({ error: `Unsupported category: ${targetCategory}` }, { status: 400 });
                         }
                         url = page === 1 
                              ? `https://hiwebxseries.com.co/${slug}/` 
                              : `https://hiwebxseries.com.co/${slug}/page/${page}/`;
                    }
                    scrapeTasks.push({ url, defaultCategory: targetCategory, label: `${targetCategory} page ${page}` });
               }
          }

          console.log(`[Scraper] Starting sync of ${scrapeTasks.length} URLs...`);

          // Process scrape tasks sequentially
          for (let i = 0; i < scrapeTasks.length; i++) {
               const task = scrapeTasks[i];
               console.log(`[Scraper] Processing ${i + 1}/${scrapeTasks.length}: ${task.label}`);
               const pageVideos = await scrapePage(task.url, task.defaultCategory);
               console.log(`[Scraper] Found ${pageVideos.length} videos`);

               for (const video of pageVideos) {
                    if (!seenUrls.has(video.url)) {
                         seenUrls.add(video.url);
                         results.push(video);
                    }
               }

               // Politeness delay
               if (i < scrapeTasks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
               }
          }

          if (results.length === 0) {
               return NextResponse.json({ ok: false, message: 'Scraped 0 videos. Target structure might have changed.' }, { status: 400 });
          }

          // ─── Save in Supabase ───
          const supabase = getSupabaseClient();
          let supabaseError = null;
          let supabaseSuccess = false;

          if (supabase) {
               try {
                    const { error } = await supabase
                         .from('webseries_videos')
                         .upsert(results, { onConflict: 'url' });

                    if (error) {
                         supabaseError = error.message;
                         console.warn('[Supabase Cache] Table write failed:', error.message);
                    } else {
                         supabaseSuccess = true;
                         console.log('[Supabase Cache] Successfully cached in Supabase!');
                    }
               } catch (err) {
                    supabaseError = err.message;
                    console.warn('[Supabase Cache] Exception during write:', err.message);
               }
          }

          // ─── Local JSON Cache Fallback ───
          let localSuccess = false;
          let localCount = 0;
          try {
               const cacheDir = path.dirname(LOCAL_CACHE_PATH);
               if (!fs.existsSync(cacheDir)) {
                    fs.mkdirSync(cacheDir, { recursive: true });
               }

               let existingVideos = [];
               if (fs.existsSync(LOCAL_CACHE_PATH)) {
                    try {
                         const fileContent = fs.readFileSync(LOCAL_CACHE_PATH, 'utf8');
                         existingVideos = JSON.parse(fileContent);
                    } catch (e) {
                         console.warn('[Local Cache] Failed to parse existing JSON cache, resetting:', e);
                    }
               }

               const mergedMap = new Map();
               existingVideos.forEach(v => mergedMap.set(v.url, v));
               results.forEach(v => mergedMap.set(v.url, v));

               const mergedList = Array.from(mergedMap.values());
               fs.writeFileSync(LOCAL_CACHE_PATH, JSON.stringify(mergedList, null, 2), 'utf8');
               localSuccess = true;
               localCount = mergedList.length;
          } catch (err) {
               console.error('[Local Cache] Failed to write cache file:', err);
          }

          return NextResponse.json({
               ok: true,
               message: `Sync completed successfully. Processed ${scrapeTasks.length} scrape tasks.`,
               stats: {
                    newly_scraped: results.length,
                    cached_in_supabase: supabaseSuccess,
                    cached_in_local_file: localSuccess,
                    total_local_count: localCount
               },
               supabase_details: supabaseSuccess ? 'Success' : `Failed: ${supabaseError || 'Supabase config missing'}`,
               videos: results.slice(0, 10)
          });

     } catch (error) {
          console.error('Sync execution crash:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
     }
}
