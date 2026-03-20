/* ══════════════════════════════════════════
   VOID.BLOG — app.js
   Database: Supabase (PostgreSQL)
   ══════════════════════════════════════════ */

// ── SUPABASE CLIENT ───────────────────────
const { createClient } = supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON);

// ── SESSION KEY (auth only, not data) ─────
const KEY_AUTH = 'vb_authed';

// ── STATE ─────────────────────────────────
let isOwner      = false;
let isViewerMode = false;
let posts        = [];   // loaded from Supabase
let about        = {};   // loaded from Supabase
let tags         = [];
let coverData    = null;
let editingId    = null;
let deleteId     = null;
let isSetupMode  = false;

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════
async function boot() {
  showLoading(true);

  // ── 1. Restore owner session FIRST before any hash check ──
  // This prevents a stale #post/... hash in the owner's browser
  // from incorrectly triggering viewer mode on reload.
  if (sessionStorage.getItem(KEY_AUTH) === '1') isOwner = true;

  // ── 2. Check for a shared post link (#post/<uuid>) ──
  const hash   = window.location.hash;
  const postId = hash.startsWith('#post/') ? hash.slice(6).split('?')[0].trim() : null;

  if (postId && !isOwner) {
    // Genuine external viewer — someone who received a share link
    isViewerMode = true;
    applyMode();
    await loadAbout();
    updateAboutSidebar();
    await openPost(postId);
    showLoading(false);
    return;
  }

  // ── 3. Owner visiting their own post link — open it in owner mode ──
  if (postId && isOwner) {
    // Clean the hash from the URL bar so it does not persist
    history.replaceState('', document.title, window.location.pathname);
    await loadAbout();
    await loadPosts();
    updateAboutSidebar();
    applyMode();
    showLoading(false);
    await openPost(postId);
    return;
  }

  // ── 4. Normal home load ──
  await loadAbout();
  await loadPosts();
  updateAboutSidebar();
  applyMode();
  showLoading(false);

  // Check if owner password has been set up yet
  const { data: settings } = await db
    .from('settings')
    .select('value')
    .eq('key', 'owner_pwd_hash')
    .maybeSingle();

  if (!settings) {
    showSetupModal();
  } else if (!isOwner) {
    openPwdModal();
  }

  renderHome();
}

// ─── Loading overlay ───────────────────────
function showLoading(show) {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.innerHTML = `<div class="loading-spinner"></div>`;
    Object.assign(el.style, {
      position:'fixed', inset:'0', background:'rgba(8,11,16,0.9)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:'9000', transition:'opacity 0.3s', pointerEvents:'all'
    });
    const style = document.createElement('style');
    style.textContent = `
      .loading-spinner {
        width:36px; height:36px;
        border:2px solid rgba(0,245,212,0.15);
        border-top-color:#00f5d4;
        border-radius:50%;
        animation:spin 0.7s linear infinite;
      }
      @keyframes spin { to { transform:rotate(360deg); } }`;
    document.head.appendChild(style);
    document.body.appendChild(el);
  }
  el.style.opacity       = show ? '1' : '0';
  el.style.pointerEvents = show ? 'all' : 'none';
}

// ══════════════════════════════════════════
// DATABASE — READ
// ══════════════════════════════════════════
async function loadPosts() {
  const { data, error } = await db
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error('loadPosts:', error); return; }
  posts = (data || []).map(dbToPost);
}

async function loadAbout() {
  const { data, error } = await db
    .from('settings')
    .select('key, value')
    .in('key', ['about_name', 'about_handle', 'about_bio', 'about_avatar']);

  if (error) { console.error('loadAbout:', error); return; }

  about = {};
  (data || []).forEach(row => {
    const k = row.key.replace('about_', '');
    about[k] = row.value;
  });

  if (!about.name)   about.name   = 'Author';
  if (!about.handle) about.handle = '@void';
  if (!about.bio)    about.bio    = 'Welcome to my blog. This is where I share ideas, stories, and experiments.';
}

// Map DB snake_case row → camelCase app object
function dbToPost(row) {
  return {
    id:        row.id,
    title:     row.title     || '',
    excerpt:   row.excerpt   || '',
    content:   row.content   || '',
    tags:      row.tags      || [],
    cover:     row.cover_url || null,
    status:    row.status,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ══════════════════════════════════════════
// DATABASE — WRITE
// ══════════════════════════════════════════
async function dbSavePost(postData, id = null) {
  const row = {
    title:      postData.title,
    excerpt:    postData.excerpt,
    content:    postData.content,
    tags:       postData.tags,
    cover_url:  postData.cover,
    status:     postData.status,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data, error } = await db
      .from('posts').update(row).eq('id', id).select().single();
    if (error) throw error;
    return dbToPost(data);
  } else {
    row.created_at = new Date().toISOString();
    const { data, error } = await db
      .from('posts').insert(row).select().single();
    if (error) throw error;
    return dbToPost(data);
  }
}

async function dbDeletePost(id) {
  const { error } = await db.from('posts').delete().eq('id', id);
  if (error) throw error;
}

async function dbSaveSetting(key, value) {
  const { error } = await db
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

// ── Upload image to Supabase Storage → return public URL ──
async function uploadImage(base64Data, path) {
  const [meta, data] = base64Data.split(',');
  const mime    = meta.match(/:(.*?);/)[1];
  const ext     = mime.split('/')[1];
  const binary  = atob(data);
  const arr     = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });

  const fileName = `${path}-${Date.now()}.${ext}`;
  const { error } = await db.storage
    .from('blog-assets')
    .upload(fileName, blob, { upsert: true, contentType: mime });
  if (error) throw error;

  const { data: urlData } = db.storage
    .from('blog-assets')
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════
function showSetupModal() {
  isSetupMode = true;
  document.getElementById('pwd-modal-title').textContent  = '🛠 Set Owner Password';
  document.getElementById('pwd-modal-desc').textContent   =
    'Create a password to protect owner access. Readers who open a shared post link get view-only access automatically.';
  document.getElementById('pwd-cancel-btn').style.display = 'none';
  document.getElementById('pwd-error').style.display      = 'none';
  document.getElementById('pwd-modal').classList.add('open');
}

function openPwdModal() {
  isSetupMode = false;
  document.getElementById('pwd-modal-title').textContent  = '🔐 Owner Access';
  document.getElementById('pwd-modal-desc').textContent   =
    'Enter your password to unlock write & manage capabilities.';
  document.getElementById('pwd-cancel-btn').style.display = 'inline-flex';
  document.getElementById('pwd-error').style.display      = 'none';
  document.getElementById('pwd-input').value              = '';
  document.getElementById('pwd-modal').classList.add('open');
  setTimeout(() => document.getElementById('pwd-input').focus(), 100);
}

function closePwdModal() {
  document.getElementById('pwd-modal').classList.remove('open');
  document.getElementById('pwd-input').value = '';
}

async function tryLogin() {
  const val   = document.getElementById('pwd-input').value;
  const errEl = document.getElementById('pwd-error');

  if (!val.trim()) {
    errEl.textContent = 'Please enter a password.';
    errEl.style.display = 'block';
    return;
  }

  const hash = await sha256(val);

  if (isSetupMode) {
    try {
      await dbSaveSetting('owner_pwd_hash', hash);
      isOwner = true;
      sessionStorage.setItem(KEY_AUTH, '1');
      closePwdModal();
      applyMode();
      await loadPosts();
      renderHome();
      toast("Password set! You're the owner ⚡", 'success');
    } catch (e) {
      errEl.textContent   = 'Could not save password. Check your connection.';
      errEl.style.display = 'block';
    }
    return;
  }

  try {
    const { data } = await db
      .from('settings').select('value').eq('key', 'owner_pwd_hash').single();

    if (data && data.value === hash) {
      isOwner = true;
      sessionStorage.setItem(KEY_AUTH, '1');
      closePwdModal();
      applyMode();
      await loadPosts();
      renderHome();
      toast('Welcome back, owner ⚡', 'success');
    } else {
      errEl.textContent   = 'Incorrect password. Try again.';
      errEl.style.display = 'block';
      document.getElementById('pwd-input').select();
    }
  } catch (e) {
    errEl.textContent   = 'Connection error. Please try again.';
    errEl.style.display = 'block';
  }
}

// SHA-256 via native Web Crypto API
async function sha256(message) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function logout() {
  sessionStorage.removeItem(KEY_AUTH);
  isOwner = false;
  applyMode();
  renderHome();
  showView('home');
  toast('Logged out.', 'success');
}

// ══════════════════════════════════════════
// MODE MANAGEMENT
// ══════════════════════════════════════════
function applyMode() {
  const ownerBadge = document.getElementById('owner-badge');
  const navWrite   = document.getElementById('nav-write');
  const logoutBtn  = document.getElementById('logout-btn');
  const loginSmall = document.getElementById('login-btn-small');
  const viewBanner = document.getElementById('viewer-banner');
  const navAbout   = document.getElementById('nav-about');

  if (isViewerMode) {
    viewBanner.classList.add('visible');
    ownerBadge.style.display = 'none';
    navWrite.style.display   = 'none';
    logoutBtn.style.display  = 'none';
    loginSmall.style.display = 'none';
    navAbout.style.display   = 'none';
  } else if (isOwner) {
    viewBanner.classList.remove('visible');
    ownerBadge.style.display = 'inline-flex';
    navWrite.style.display   = 'inline-flex';
    logoutBtn.style.display  = 'inline-flex';
    loginSmall.style.display = 'none';
  } else {
    viewBanner.classList.remove('visible');
    ownerBadge.style.display = 'none';
    navWrite.style.display   = 'none';
    logoutBtn.style.display  = 'none';
    loginSmall.style.display = 'inline-flex';
  }
}

// ══════════════════════════════════════════
// VIEW ROUTING
// ══════════════════════════════════════════
function showView(name) {
  if (name === 'write' && !isOwner) { openPwdModal(); return; }

  // If owner is navigating away from a shared post, exit viewer mode
  if (isOwner && isViewerMode) {
    isViewerMode = false;
    applyMode();
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');

  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  // Always clean the #post/... hash when navigating away from post view
  if (name !== 'post') history.pushState('', document.title, window.location.pathname);

  if (name === 'home')               renderHome();
  if (name === 'write' && !editingId) resetEditor();
  if (name === 'about')              renderAbout();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════════
// HOME RENDER
// ══════════════════════════════════════════
function renderHome() {
  const published = posts
    .filter(p => p.status === 'published')
    .sort((a, b) => b.createdAt - a.createdAt);

  const drafts = isOwner
    ? posts.filter(p => p.status === 'draft').sort((a, b) => b.createdAt - a.createdAt)
    : [];

  const totalWords = posts.reduce((acc, p) => acc + wordCount(p.content), 0);
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-box">
      <div class="stat-num">${published.length}</div>
      <div class="stat-label">Posts</div>
    </div>
    ${isOwner ? `<div class="stat-box">
      <div class="stat-num">${drafts.length}</div>
      <div class="stat-label">Drafts</div>
    </div>` : ''}
    <div class="stat-box">
      <div class="stat-num">${(totalWords / 1000).toFixed(1)}k</div>
      <div class="stat-label">Words</div>
    </div>`;

  document.getElementById('post-count-badge').textContent =
    `${published.length} post${published.length !== 1 ? 's' : ''}`;

  const container = document.getElementById('home-content');

  if (!published.length && !drafts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-glyph">◌</div>
        <div class="empty-title">Nothing here yet.</div>
        <div class="empty-sub">Hit "Write" to publish your first idea.</div>
        ${isOwner ? `<button class="btn-primary" onclick="showView('write')"
            style="width:auto;display:inline-flex;gap:0.4rem;padding:0.75rem 1.5rem;">
            ⚡ Write Now</button>` : ''}
      </div>`;
    return;
  }

  let html = '';

  if (published.length) {
    const f = published[0];
    html += `
      <div class="featured-card" onclick="openPost('${f.id}')">
        <div class="featured-content">
          <div class="featured-badge">★ Featured</div>
          <div class="card-tags">${renderTagChips(f.tags)}</div>
          <div class="featured-title">${esc(f.title)}</div>
          <div class="featured-excerpt">${esc(f.excerpt || stripMd(f.content).slice(0, 200))}</div>
          <div class="featured-meta">
            ${fmtDate(f.createdAt)}<span>·</span>${readTime(f.content)} min read
          </div>
        </div>
        <div class="featured-cover">
          ${f.cover
            ? `<img src="${f.cover}" alt="Cover">`
            : `<span class="cover-placeholder">${(f.title[0] || '◌').toUpperCase()}</span>`}
        </div>
      </div>`;

    if (published.length > 1) {
      html += `<div class="post-grid">`;
      published.slice(1).forEach(p => {
        html += `
          <div class="post-card" onclick="openPost('${p.id}')">
            <div class="post-card-cover">
              ${p.cover
                ? `<img src="${p.cover}" alt="">`
                : `<span class="post-card-placeholder">${(p.title[0] || '◌').toUpperCase()}</span>`}
            </div>
            <div class="post-card-body">
              <div class="card-tags" style="margin-bottom:0.6rem;">${renderTagChips(p.tags, 2)}</div>
              <div class="post-card-title">${esc(p.title)}</div>
              <div class="post-card-meta">${fmtDate(p.createdAt)} · ${readTime(p.content)} min</div>
            </div>
          </div>`;
      });
      html += `</div>`;
    }
  }

  if (drafts.length) {
    html += `<div class="drafts-section"><div class="drafts-heading">Drafts</div>`;
    drafts.forEach(d => {
      html += `
        <div class="draft-card" onclick="editPost('${d.id}')">
          <span class="draft-icon">📝</span>
          <div>
            <div class="draft-title">${esc(d.title || 'Untitled Draft')}</div>
            <div class="draft-meta">${fmtDate(d.createdAt)} · ${wordCount(d.content)} words</div>
          </div>
          <span class="draft-badge">Draft</span>
        </div>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

// ══════════════════════════════════════════
// OPEN POST
// ══════════════════════════════════════════
async function openPost(id) {
  showLoading(true);

  // Always fetch directly from DB — works for fresh share links
  const { data, error } = await db
    .from('posts')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  showLoading(false);

  if (error || !data) {
    if (isViewerMode) {
      // Viewer has nowhere to navigate to — show a clean not-found page
      document.getElementById('pv-content').innerHTML = `
        <div style="text-align:center;padding:6rem 2rem;">
          <div style="font-size:3rem;opacity:0.2;margin-bottom:1rem;">◌</div>
          <div style="font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;
               color:var(--muted2);margin-bottom:0.5rem;">Post not found.</div>
          <div style="font-size:0.85rem;color:var(--muted);">
            This post may have been removed or the link has expired.</div>
        </div>`;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-post').classList.add('active');
    } else {
      toast('Post not found or no longer available.', 'error');
      showView('home');
    }
    return;
  }

  const post     = dbToPost(data);
  const shareUrl = `${window.location.origin}${window.location.pathname}#post/${id}`;

  // Only write the hash when the owner views a post (makes it shareable).
  // For external viewers the hash is already in the URL from the link they received.
  if (isOwner) window.location.hash = `#post/${id}`;

  const viewerNotice  = isViewerMode
    ? `<div class="viewer-notice">👁 View-only — shared post link</div>` : '';

  const ownerControls = isOwner ? `
    <div class="pv-action-group">
      <button class="btn-outline" onclick="editPost('${post.id}')"
        style="width:auto;margin:0;padding:0.5rem 0.9rem;font-size:0.62rem;">✏️ Edit</button>
      <button class="btn-danger" onclick="askDelete('${post.id}')">🗑 Delete</button>
    </div>` : '';

  const shareBlock = isOwner ? `
    <div class="share-box">
      <span class="share-label">Share</span>
      <span class="share-url">${shareUrl}</span>
      <button class="copy-btn" onclick="copyLink('${shareUrl}')">Copy Link</button>
    </div>` : '';

  document.getElementById('pv-content').innerHTML = `
    ${!isViewerMode
      ? `<button class="pv-back" onclick="showView('home')">← Back to feed</button>`
      : '<div style="height:1rem;"></div>'}
    ${viewerNotice}
    <div class="pv-tags">${renderTagChips(post.tags)}</div>
    <h1 class="pv-title">${esc(post.title)}</h1>
    ${post.excerpt ? `<p class="pv-subtitle">${esc(post.excerpt)}</p>` : ''}
    <div class="pv-meta">
      <span>${fmtDate(post.createdAt)}</span>
      <span>·</span>
      <span>${readTime(post.content)} min read</span>
      <span>·</span>
      <span>${wordCount(post.content)} words</span>
    </div>
    ${post.cover ? `<img class="pv-hero" src="${post.cover}" alt="Cover image">` : ''}
    <div class="pv-body">${renderMarkdown(post.content)}</div>
    <div class="pv-actions">
      ${!isViewerMode
        ? `<button class="pv-back" onclick="showView('home')">← All posts</button>`
        : '<div></div>'}
      ${ownerControls}
    </div>
    ${shareBlock}`;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
  document.getElementById('view-post').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function copyLink(url) {
  navigator.clipboard.writeText(url)
    .then(()  => toast('Link copied! 🔗', 'success'))
    .catch(() => toast('Copy failed — paste manually.', 'error'));
}

// ══════════════════════════════════════════
// WRITE / EDIT
// ══════════════════════════════════════════
function editPost(id) {
  if (!isOwner) { openPwdModal(); return; }
  const p = posts.find(x => x.id === id);
  if (!p) return;

  editingId = id;
  resetEditor();
  document.getElementById('post-title').value              = p.title   || '';
  document.getElementById('post-excerpt').value            = p.excerpt || '';
  document.getElementById('post-content').value            = p.content || '';
  document.getElementById('write-heading').textContent     = 'Edit Post';
  tags = [...(p.tags || [])];
  renderTagsUI();

  if (p.cover) {
    coverData = p.cover;
    document.getElementById('cover-preview').src                = p.cover;
    document.getElementById('cover-preview-wrap').style.display = 'block';
    document.getElementById('cover-inner').style.display        = 'none';
  }

  updateWordCount();
  showView('write');
}

async function publishPost() {
  const title   = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  if (!title)   { toast('Add a title first.', 'error'); return; }
  if (!content) { toast('Write some content first.', 'error'); return; }
  await savePost('published');
}

async function saveDraft() { await savePost('draft'); }

async function savePost(status) {
  const title   = document.getElementById('post-title').value.trim()   || 'Untitled';
  const excerpt = document.getElementById('post-excerpt').value.trim();
  const content = document.getElementById('post-content').value.trim();

  // If cover is a fresh base64 image, upload it to Storage first
  let coverUrl = coverData;
  if (coverData && coverData.startsWith('data:')) {
    try {
      coverUrl = await uploadImage(coverData, `covers/${editingId || 'new'}`);
    } catch (e) {
      toast('Image upload failed — saving without cover.', 'error');
      coverUrl = null;
    }
  }

  const postData = { title, excerpt, content, tags: [...tags], cover: coverUrl, status };

  try {
    showLoading(true);
    const saved = await dbSavePost(postData, editingId || null);

    if (editingId) {
      const idx = posts.findIndex(p => p.id === editingId);
      if (idx !== -1) posts[idx] = saved; else posts.unshift(saved);
    } else {
      posts.unshift(saved);
    }

    editingId = null;
    showLoading(false);
    toast(status === 'published' ? '⚡ Published!' : '💾 Draft saved!', 'success');
    resetEditor();
    showView('home');
  } catch (e) {
    showLoading(false);
    console.error('savePost:', e);
    toast('Save failed: ' + (e.message || e), 'error');
  }
}

// ══════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════
function askDelete(id) {
  deleteId = id;
  document.getElementById('del-modal').classList.add('open');
}

function closeDelModal() {
  deleteId = null;
  document.getElementById('del-modal').classList.remove('open');
}

async function confirmDelete() {
  try {
    showLoading(true);
    await dbDeletePost(deleteId);
    posts = posts.filter(p => p.id !== deleteId);
    showLoading(false);
    closeDelModal();
    toast('Post deleted.', 'success');
    showView('home');
  } catch (e) {
    showLoading(false);
    toast('Delete failed: ' + (e.message || e), 'error');
  }
}

// ══════════════════════════════════════════
// COVER IMAGE (local preview before upload)
// ══════════════════════════════════════════
function handleCover(input) {
  if (input.files && input.files[0]) readCoverFile(input.files[0]);
}

function readCoverFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    coverData = e.target.result;
    document.getElementById('cover-preview').src                = coverData;
    document.getElementById('cover-preview-wrap').style.display = 'block';
    document.getElementById('cover-inner').style.display        = 'none';
  };
  reader.readAsDataURL(file);
}

function removeCover() {
  coverData = null;
  document.getElementById('cover-preview-wrap').style.display = 'none';
  document.getElementById('cover-inner').style.display        = 'block';
  const inp = document.getElementById('cover-input');
  if (inp) inp.value = '';
}

const coverZone = document.getElementById('cover-zone');
coverZone.addEventListener('dragover',  e => { e.preventDefault(); coverZone.classList.add('over'); });
coverZone.addEventListener('dragleave', ()  => coverZone.classList.remove('over'));
coverZone.addEventListener('drop', e => {
  e.preventDefault();
  coverZone.classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) readCoverFile(file);
});

// ══════════════════════════════════════════
// TAGS
// ══════════════════════════════════════════
document.getElementById('tag-input').addEventListener('keydown', function (e) {
  if ((e.key === 'Enter' || e.key === ',') && this.value.trim()) {
    e.preventDefault();
    addTag(this.value.trim().replace(/,/g, ''));
    this.value = '';
  }
  if (e.key === 'Backspace' && !this.value && tags.length) removeTag(tags[tags.length - 1]);
});

function addTag(val)    { if (!val || tags.includes(val)) return; tags.push(val); renderTagsUI(); }
function removeTag(val) { tags = tags.filter(t => t !== val); renderTagsUI(); }

function renderTagsUI() {
  const wrap = document.getElementById('tags-wrap');
  const inp  = document.getElementById('tag-input');
  wrap.querySelectorAll('.tag-item').forEach(el => el.remove());
  tags.forEach(t => {
    const el = document.createElement('span');
    el.className = 'tag-item';
    el.innerHTML = `${esc(t)} <span class="tag-remove" onclick="removeTag('${esc(t)}')">×</span>`;
    wrap.insertBefore(el, inp);
  });
}

function renderTagChips(tagArr, limit = null) {
  if (!tagArr || !tagArr.length) return '<span class="card-tag">Essay</span>';
  const arr = limit ? tagArr.slice(0, limit) : tagArr;
  return arr.map(t => `<span class="card-tag">${esc(t)}</span>`).join('');
}

// ══════════════════════════════════════════
// WORD COUNT (live)
// ══════════════════════════════════════════
document.getElementById('post-content').addEventListener('input', updateWordCount);

function updateWordCount() {
  const wc = wordCount(document.getElementById('post-content').value);
  document.getElementById('word-count').textContent = `${wc} word${wc !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════
// TOOLBAR HELPERS
// ══════════════════════════════════════════
function ins(before, after) {
  const ta = document.getElementById('post-content');
  const s  = ta.selectionStart, e = ta.selectionEnd;
  ta.setRangeText(before + ta.value.slice(s, e) + after, s, e, 'select');
  ta.focus();
}

function insLine(prefix) {
  const ta = document.getElementById('post-content');
  const ls = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  ta.setRangeText(prefix, ls, ls, 'end');
  ta.focus();
}

function insBlock(before, after) {
  const ta = document.getElementById('post-content');
  const s  = ta.selectionStart, e = ta.selectionEnd;
  ta.setRangeText(before + ta.value.slice(s, e) + after, s, e, 'end');
  ta.focus();
}

// ══════════════════════════════════════════
// RESET EDITOR
// ══════════════════════════════════════════
function resetEditor() {
  document.getElementById('post-title').value          = '';
  document.getElementById('post-excerpt').value        = '';
  document.getElementById('post-content').value        = '';
  document.getElementById('word-count').textContent    = '0 words';
  document.getElementById('write-heading').textContent = 'New Post';
  tags = []; coverData = null; editingId = null;
  renderTagsUI();
  removeCover();
}

// ══════════════════════════════════════════
// ABOUT VIEW
// ══════════════════════════════════════════
function renderAbout() {
  document.getElementById('abt-name').textContent   = about.name   || 'Author';
  document.getElementById('abt-handle').textContent = about.handle || '@void';
  document.getElementById('abt-bio').textContent    = about.bio    || '';

  const av = document.getElementById('av-display');
  av.innerHTML = about.avatar
    ? `<img src="${about.avatar}" alt="Avatar">`
    : (about.name || 'A')[0].toUpperCase();

  const editWrap = document.getElementById('about-edit-wrap');

  if (isOwner && !isViewerMode) {
    editWrap.innerHTML = `
      <button class="edit-toggle-btn" onclick="toggleAboutEdit()">✏️ Edit Profile</button>
      <div class="about-edit-form" id="about-edit-form" style="display:none;">
        <div class="field" style="margin-top:1.25rem;">
          <label>Display Name</label>
          <input type="text" id="abt-name-inp" value="${esc(about.name || '')}" />
        </div>
        <div class="field">
          <label>Handle / Title</label>
          <input type="text" id="abt-handle-inp" value="${esc(about.handle || '')}" />
        </div>
        <div class="field">
          <label>Bio</label>
          <textarea id="abt-bio-inp" style="min-height:120px;resize:vertical;">${esc(about.bio || '')}</textarea>
        </div>
        <div class="field">
          <label>Profile Photo</label>
          <div class="upload-zone" style="position:relative;">
            <input type="file" accept="image/*" onchange="handleAvatar(this)"
              style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;" />
            <div class="upload-icon">👤</div>
            <div class="upload-text">Click to upload</div>
          </div>
        </div>
        <button class="btn-primary" onclick="saveAbout()">Save Profile</button>
      </div>`;
  } else {
    editWrap.innerHTML = '';
  }
}

function updateAboutSidebar() {
  const logo     = document.getElementById('site-logo');
  const homeDesc = document.getElementById('home-desc');
  if (logo) {
    const name = (about.name || 'VOID').split(' ')[0].toUpperCase();
    logo.innerHTML = `${name}<span>.</span>BLOG`;
  }
  if (homeDesc && about.bio)
    homeDesc.textContent = about.bio.length > 130 ? about.bio.slice(0, 130) + '...' : about.bio;
}

function toggleAboutEdit() {
  const form = document.getElementById('about-edit-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function saveAbout() {
  const name   = document.getElementById('abt-name-inp').value.trim()   || 'Author';
  const handle = document.getElementById('abt-handle-inp').value.trim() || '@void';
  const bio    = document.getElementById('abt-bio-inp').value.trim();
  try {
    showLoading(true);
    await Promise.all([
      dbSaveSetting('about_name',   name),
      dbSaveSetting('about_handle', handle),
      dbSaveSetting('about_bio',    bio),
    ]);
    about = { ...about, name, handle, bio };
    showLoading(false);
    updateAboutSidebar();
    renderAbout();
    toast('Profile saved! ✅', 'success');
  } catch (e) {
    showLoading(false);
    toast('Save failed: ' + (e.message || e), 'error');
  }
}

async function handleAvatar(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      showLoading(true);
      const url = await uploadImage(e.target.result, 'avatars/profile');
      await dbSaveSetting('about_avatar', url);
      about.avatar = url;
      showLoading(false);
      renderAbout();
      toast('Photo updated!', 'success');
    } catch (err) {
      showLoading(false);
      toast('Photo upload failed: ' + (err.message || err), 'error');
    }
  };
  reader.readAsDataURL(input.files[0]);
}

// ══════════════════════════════════════════
// MARKDOWN RENDERER
// ══════════════════════════════════════════
function renderMarkdown(md) {
  if (!md) return '';
  let h = esc(md);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h2>$1</h2>');
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  h = h.replace(/`(.+?)`/g,           '<code>$1</code>');
  h = h.replace(/^---$/gm, '<hr>');
  h = h.replace(/(^- .+$\n?)+/gm, m =>
    `<ul>${m.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('')}</ul>`);
  h = h.replace(/(^\d+\. .+$\n?)+/gm, m =>
    `<ol>${m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('')}</ol>`);
  h = h.split(/\n\n+/).map(b =>
    /^<(h[1-6]|ul|ol|blockquote|pre|hr)/.test(b) ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`
  ).join('\n');
  return h;
}

// ══════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════
function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function stripMd(str)  { return (str||'').replace(/[#*`_~>]/g,'').replace(/\n/g,' ').trim(); }
function wordCount(t)  { return (t||'').trim().split(/\s+/).filter(Boolean).length; }
function readTime(t)   { return Math.max(1, Math.round(wordCount(t) / 200)); }
function fmtDate(ts)   {
  return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function toast(message, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className   = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3200);
}

// Close modals on backdrop click
document.getElementById('pwd-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('pwd-modal')) closePwdModal();
});
document.getElementById('del-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('del-modal')) closeDelModal();
});

// ══════════════════════════════════════════
// RUN
// ══════════════════════════════════════════
boot();