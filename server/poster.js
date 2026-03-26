require('dotenv').config();

const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

// Post to Facebook Page
async function postToFacebookPage(message) {
  if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
    console.log('[Poster] FB credentials not set, skipping Facebook post');
    return null;
  }

  try {
    const url = `https://graph.facebook.com/v25.0/${FB_PAGE_ID}/feed`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        access_token: FB_PAGE_TOKEN,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    console.log(`[Poster] Facebook post published: ${data.id}`);
    return data.id;
  } catch (e) {
    console.error('[Poster] Facebook post failed:', e.message);
    return null;
  }
}

// Extract posts from agent analysis text
function extractPostsFromAnalysis(analysis) {
  const posts = {};

  // Extract Monday post
  const mondayMatch = analysis.match(/\*\*Monday Post:\*\*\n([\s\S]*?)(?=\*\*Wednesday Post:|$)/);
  if (mondayMatch) posts.monday = mondayMatch[1].trim();

  // Extract Wednesday post
  const wedMatch = analysis.match(/\*\*Wednesday Post:\*\*\n([\s\S]*?)(?=\*\*Friday Post:|$)/);
  if (wedMatch) posts.wednesday = wedMatch[1].trim();

  // Extract Friday post
  const friMatch = analysis.match(/\*\*Friday Post:\*\*\n([\s\S]*?)(?=\*\*Post In These Groups:|$)/);
  if (friMatch) posts.friday = friMatch[1].trim();

  return posts;
}

// Decide which post to publish based on day of week
async function publishTodaysPost(analysis) {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const posts = extractPostsFromAnalysis(analysis);

  let postContent = null;
  let dayName = '';

  if (day === 1 && posts.monday) { postContent = posts.monday; dayName = 'Monday'; }
  else if (day === 3 && posts.wednesday) { postContent = posts.wednesday; dayName = 'Wednesday'; }
  else if (day === 5 && posts.friday) { postContent = posts.friday; dayName = 'Friday'; }

  if (!postContent) {
    console.log(`[Poster] No post scheduled for today (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]})`);
    return null;
  }

  console.log(`[Poster] Publishing ${dayName} post to Facebook Page...`);
  const postId = await postToFacebookPage(postContent);
  return { dayName, postContent, postId };
}

module.exports = { postToFacebookPage, publishTodaysPost, extractPostsFromAnalysis };
