/* ══════════════════════════════════════════
   VOID.BLOG — app.js (Supabase Global Edition)
   ══════════════════════════════════════════ */

// ── SUPABASE CONFIG ───────────────────────
// We now use the globally available 'supabase' object from the HTML script tag
const supabaseUrl = 'https://qgdkiyboxwcqvrvzvnxu.supabase.co';
const supabaseKey = 'sb_publishable_HCcs7cVOPcNV2tnxf8PQTQ_2_o3Ru6e';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ── STORAGE KEYS (Local overrides) ────────
const KEY_PWD   = 'vb_owner_pwd';
const KEY_ABOUT = 'vb_about'; 
const KEY_AUTH  = 'vb_authed';

// ── STATE ─────────────────────────────────
let isOwner      = false;
let isViewerMode = false;
let posts        = []; 
let about        = JSON.parse(localStorage.getItem(KEY_ABOUT) || '{"name":"Author","handle":"@void","bio":"Welcome to my blog. This is where I share ideas, stories, and experiments."}');
let tags         = [];
let coverData    = null;
let editingId    = null;
let deleteId     = null;
let isSetupMode  = false;

// ══════════════════════════════════════════
// LOADER UTILS (Dynamically injected)
// ══════════════════════════════════════════
function showLoader() {
  let loader = document.getElementById('global-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'global-loader';
    
    // Match the VOID.BLOG aesthetic
    loader.innerHTML = `
      <div style="text-align: center;">
        <div style="font-family: 'Syne', sans-serif; font-size: 1.5rem; font-weight: 800; color: var(--text); letter-spacing: -0.02em; margin-bottom: 0.5rem;">
          VOID<span style="color: var(--cyan);">.</span>BLOG
        </div>
        <div style="font-family: 'Space Mono', monospace; font-size: 0.6rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted);">
          Syncing Data<span class="dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
      </div>
    `;

    Object.assign(loader.style, {
      position: 'fixed', inset: '0', zIndex: '99999',
      backgroundColor: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'opacity 0.4s ease, visibility 0.4s ease'
    });

    if (!document.getElementById('loader-style')) {
      const style = document.createElement('style');
      style.id = 'loader-style';
      style.innerHTML = `
        @keyframes syncBlink { 0%, 20% { opacity: 0; } 50%, 100% { opacity: 1; } }
        .dots span { animation: syncBlink 1.4s infinite both; }
        .dots span:nth-child(2) { animation-delay: 0.2s; }
        .dots span:nth-child(3) { animation-delay: 0.4s; }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(loader);
  }
  
  loader.style.opacity = '1';
  loader.style.visibility = 'visible';
}

function hideLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.visibility = 'hidden';
  }
}

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════
async function boot() {
  const hash = window.location.hash;
  const isSharedLink = hash.startsWith('#post/');

  // Restore session auth if it exists
  if (sessionStorage.getItem(KEY_AUTH) === '1') {
    isOwner = true;
  }

  // 1. Instantly lock into Viewer Mode if it's a shared link
  if (isSharedLink) {
    isViewerMode = true;
    isOwner = false;
  }
  
  applyMode();

  // 2. ONLY show password modals if they are NOT viewing a shared link
  if (!isSharedLink) {
    const hasPwd = localStorage.getItem(KEY_PWD);
    if (!hasPwd) {
      showSetupModal();       // First launch: create password
    } else if (!isOwner) {
      openPwdModal();         // Returning owner: prompt login
    }
  }

  // ── FETCH POSTS FROM SUPABASE ──
  try {
    const { data: dbPosts, error } = await supabaseClient
      .from('posts')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;
    posts = dbPosts || [];
  } catch (err) {
    console.error('Failed to fetch posts:', err);
    toast('Database connection failed.', 'error');
  }

  // 3. Complete the routing now that data is loaded
  if (isSharedLink) {
    const postId = hash.slice(6);
    const activePost = posts.find(p => p.id === postId && p.status === 'published');
    
    if (activePost) {
      openPost(postId);
      return;
    } else {
      showView('home');
      toast('Post not found or no longer available.', 'error');
      return;
    }
  }

  renderHome();
  updateAboutSidebar();
}

function cancelEdit() {
  if (editingId) {
    // If you were editing an existing post, go back to reading it
    const previousId = editingId;
    resetEditor();
    openPost(previousId);
    toast('Edit cancelled.', 'success');
  } else {
    // If it was a brand new post, just go back home
    resetEditor();
    showView('home');
    toast('Cancelled new post.', 'success');
  }
}

// ══════════════════════════════════════════
// MODE MANAGEMENT
// ══════════════════════════════════════════
function applyMode() {
  const ownerBadge  = document.getElementById('owner-badge');
  const navWrite    = document.getElementById('nav-write');
  const logoutBtn   = document.getElementById('logout-btn');
  const loginSmall  = document.getElementById('login-btn-small');
  const viewBanner  = document.getElementById('viewer-banner');
  const navAbout    = document.getElementById('nav-about');

  if (isViewerMode) {
    if(viewBanner) viewBanner.classList.add('visible');
    if(ownerBadge) ownerBadge.style.display  = 'none';
    if(navWrite) navWrite.style.display    = 'none';
    if(logoutBtn) logoutBtn.style.display   = 'none';
    if(loginSmall) loginSmall.style.display  = 'none';
    if(navAbout) navAbout.style.display    = 'none';
  } else if (isOwner) {
    if(viewBanner) viewBanner.classList.remove('visible');
    if(ownerBadge) ownerBadge.style.display  = 'inline-flex';
    if(navWrite) navWrite.style.display    = 'inline-flex';
    if(logoutBtn) logoutBtn.style.display   = 'inline-flex';
    if(loginSmall) loginSmall.style.display  = 'none';
  } else {
    if(viewBanner) viewBanner.classList.remove('visible');
    if(ownerBadge) ownerBadge.style.display  = 'none';
    if(navWrite) navWrite.style.display    = 'none';
    if(logoutBtn) logoutBtn.style.display   = 'none';
    if(loginSmall) loginSmall.style.display  = 'inline-flex';
  }
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
// AUTH MODAL
// ══════════════════════════════════════════
function showSetupModal() {
  isSetupMode = true;
  const m = document.getElementById('pwd-modal');
  if(!m) return;
  document.getElementById('pwd-modal-title').textContent   = '🛠 Set Owner Password';
  document.getElementById('pwd-modal-desc').textContent    = 'Create a password to protect owner access.';
  document.getElementById('pwd-cancel-btn').style.display  = 'none';
  document.getElementById('pwd-error').style.display       = 'none';
  m.classList.add('open');
}

function openPwdModal() {
  isSetupMode = false;
  const m = document.getElementById('pwd-modal');
  if(!m) return;
  document.getElementById('pwd-modal-title').textContent   = '🔐 Owner Access';
  document.getElementById('pwd-modal-desc').textContent    = 'Enter your password to unlock write & manage capabilities.';
  document.getElementById('pwd-cancel-btn').style.display  = 'inline-flex';
  document.getElementById('pwd-error').style.display       = 'none';
  document.getElementById('pwd-input').value               = '';
  m.classList.add('open');
  setTimeout(() => document.getElementById('pwd-input').focus(), 100);
}

function closePwdModal() {
  document.getElementById('pwd-modal').classList.remove('open');
  document.getElementById('pwd-input').value = '';
}

function tryLogin() {
  const val = document.getElementById('pwd-input').value;
  const errEl = document.getElementById('pwd-error');

  if (!val.trim()) {
    errEl.textContent = 'Please enter a password.';
    errEl.style.display = 'block';
    return;
  }

  if (isSetupMode) {
    localStorage.setItem(KEY_PWD, btoa(val));
    isOwner = true;
    sessionStorage.setItem(KEY_AUTH, '1');
    closePwdModal();
    applyMode();
    renderHome();
    toast('Password set! You\'re the owner ⚡', 'success');
    return;
  }

  const stored = localStorage.getItem(KEY_PWD);
  if (stored && atob(stored) === val) {
    isOwner = true;
    sessionStorage.setItem(KEY_AUTH, '1');
    closePwdModal();
    applyMode();
    renderHome();
    toast('Welcome back, owner ⚡', 'success');
  } else {
    errEl.textContent = 'Incorrect password. Try again.';
    errEl.style.display = 'block';
    document.getElementById('pwd-input').select();
  }
}

document.getElementById('pwd-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('pwd-modal')) closePwdModal();
});

document.getElementById('del-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('del-modal')) closeDelModal();
});

// ══════════════════════════════════════════
// VIEW ROUTING
// ══════════════════════════════════════════
function showView(name) {
  if (name === 'write' && !isOwner) { openPwdModal(); return; }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));

  const viewEl = document.getElementById('view-' + name);
  if(viewEl) viewEl.classList.add('active');

  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  if (name !== 'post') history.pushState('', document.title, window.location.pathname);

  if (name === 'home')  renderHome();
  if (name === 'write' && !editingId) resetEditor();
  if (name === 'about') renderAbout();

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
  const statsRow = document.getElementById('stats-row');
  if(statsRow) {
    statsRow.innerHTML = `
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
      </div>
    `;
  }

  const countBadge = document.getElementById('post-count-badge');
  if(countBadge) countBadge.textContent = `${published.length} post${published.length !== 1 ? 's' : ''}`;

  const container = document.getElementById('home-content');
  if(!container) return;

  if (!published.length && !drafts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-glyph">◌</div>
        <div class="empty-title">Nothing here yet.</div>
        <div class="empty-sub">Hit "Write" to publish your first idea.</div>
        ${isOwner ? `<button class="btn-primary" onclick="showView('write')" style="width:auto;display:inline-flex;gap:0.4rem;padding:0.75rem 1.5rem;">⚡ Write Now</button>` : ''}
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
          <div class="card-tags">${renderTags(f.tags, 'default')}</div>
          <div class="featured-title">${esc(f.title)}</div>
          <div class="featured-excerpt">${esc(f.excerpt || stripMd(f.content).slice(0, 200))}</div>
          <div class="featured-meta">
            ${fmtDate(f.createdAt)}
            <span>·</span>
            ${readTime(f.content)} min read
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
              <div class="card-tags" style="margin-bottom:0.6rem;">${renderTags(p.tags, 'small')}</div>
              <div class="post-card-title">${esc(p.title)}</div>
              <div class="post-card-meta">${fmtDate(p.createdAt)} · ${readTime(p.content)} min</div>
            </div>
          </div>`;
      });
      html += `</div>`;
    }
  }

  if (drafts.length) {
    html += `
      <div class="drafts-section">
        <div class="drafts-heading">Drafts</div>`;
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
// OPEN POST (single post view)
// ══════════════════════════════════════════
function openPost(id) {
  const post = posts.find(p => p.id === id);
  if (!post) { toast('Post not found.', 'error'); return; }

  window.location.hash = `#post/${post.id}`;
  const shareUrl = `${window.location.origin}${window.location.pathname}#post/${post.id}`;

  const viewerNotice = isViewerMode
    ? `<div class="viewer-notice">👁 View-only — shared post link</div>`
    : '';

  const ownerControls = isOwner ? `
    <div class="pv-action-group">
      <button class="btn-outline" onclick="editPost('${post.id}')" style="width:auto;margin:0;padding:0.5rem 0.9rem;font-size:0.62rem;">✏️ Edit</button>
      <button class="btn-danger" onclick="askDelete('${post.id}')">🗑 Delete</button>
    </div>` : '';

  const shareBlock = `<div class="share-box">
      <span class="share-label">Shareable Link</span>
      <span class="share-url">${shareUrl}</span>
      <button class="copy-btn" onclick="copyLink('${shareUrl}')">Copy Link</button>
    </div>`;

  document.getElementById('pv-content').innerHTML = `
    ${!isViewerMode ? `<button class="pv-back" onclick="showView('home')">← Back to feed</button>` : '<div style="height:1rem;"></div>'}
    ${viewerNotice}
    <div class="pv-tags">${renderTags(post.tags, 'default')}</div>
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
    ${shareBlock}
  `;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
  document.getElementById('view-post').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function copyLink(url) {
  navigator.clipboard.writeText(url)
    .then(() => toast('Link copied! 🔗', 'success'))
    .catch(() => toast('Could not copy — copy it manually.', 'error'));
}

// ══════════════════════════════════════════
// WRITE / EDIT
// ══════════════════════════════════════════
function editPost(id) {
  if (!isOwner) { openPwdModal(); return; }
  const p = posts.find(x => x.id === id);
  if (!p) return;

  // FIX: Run reset FIRST, then set the editing ID!
  resetEditor();
  editingId = id;

  document.getElementById('post-title').value   = p.title   || '';
  document.getElementById('post-excerpt').value = p.excerpt || '';
  document.getElementById('post-content').value = p.content || '';
  document.getElementById('write-heading').textContent = 'Edit Post';

  tags = [...(p.tags || [])];
  renderTagsUI();

  if (p.cover) {
    coverData = p.cover;
    document.getElementById('cover-preview').src              = p.cover;
    document.getElementById('cover-preview-wrap').style.display = 'block';
    document.getElementById('cover-inner').style.display        = 'none';
  }

  updateWordCount();
  showView('write'); // Now showView won't wipe it out!
}

function publishPost() { savePost('published'); }
function saveDraft() { savePost('draft'); }

async function savePost(status) {
  const title   = document.getElementById('post-title').value.trim()   || 'Untitled';
  const excerpt = document.getElementById('post-excerpt').value.trim();
  const content = document.getElementById('post-content').value.trim();

  if (!title && status === 'published')  { toast('Add a title first.', 'error'); return; }
  if (!content && status === 'published') { toast('Write some content first.', 'error'); return; }

  toast('Saving...', 'success');

  const postData = {
    id: editingId || Date.now().toString(),
    title, 
    excerpt, 
    content,
    tags: tags,
    cover: coverData,
    status,
    updatedAt: Date.now()
  };

  if (!editingId) {
    postData.createdAt = Date.now();
  } else {
    const existing = posts.find(p => p.id === editingId);
    postData.createdAt = existing ? existing.createdAt : Date.now();
  }

  // UPSERT TO SUPABASE
  try {
    const { error } = await supabaseClient.from('posts').upsert(postData);
    if (error) throw error;

    if (editingId) {
      const idx = posts.findIndex(p => p.id === editingId);
      if (idx !== -1) posts[idx] = postData;
    } else {
      posts.unshift(postData);
    }

    toast(status === 'published' ? '⚡ Published!' : '💾 Draft saved!', 'success');
    resetEditor();
    showView('home');

  } catch (err) {
    console.error('Failed to save:', err);
    toast('Error saving to database.', 'error');
  }
}

// ══════════════════════════════════════════
// DELETE
// ══════════════════════════════════════════
function askDelete(id) {
  deleteId = id;
  const modal = document.getElementById('del-modal');
  if(modal) modal.classList.add('open');
}

function closeDelModal() {
  deleteId = null;
  const modal = document.getElementById('del-modal');
  if(modal) modal.classList.remove('open');
}

async function confirmDelete() {
  if(!deleteId) return;
  toast('Deleting...', 'success');
  
  try {
    const { error } = await supabaseClient.from('posts').delete().eq('id', deleteId);
    if (error) throw error;

    posts = posts.filter(p => p.id !== deleteId);
    closeDelModal();
    toast('Post deleted.', 'success');
    showView('home');
  } catch (err) {
    console.error('Delete failed:', err);
    toast('Error deleting post.', 'error');
  }
}

// ══════════════════════════════════════════
// COVER IMAGE (Base64)
// ══════════════════════════════════════════
function handleCover(input) {
  if (input.files && input.files[0]) readCoverFile(input.files[0]);
}

function readCoverFile(file) {
  if(file.size > 2 * 1024 * 1024) { 
    toast('Image is large. DB save might fail.', 'error');
  }
  const reader = new FileReader();
  reader.onload = e => {
    coverData = e.target.result;
    document.getElementById('cover-preview').src              = coverData;
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
if(coverZone) {
  coverZone.addEventListener('dragover',  e => { e.preventDefault(); coverZone.classList.add('over'); });
  coverZone.addEventListener('dragleave', () => coverZone.classList.remove('over'));
  coverZone.addEventListener('drop', e => {
    e.preventDefault();
    coverZone.classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) readCoverFile(file);
  });
}

// ══════════════════════════════════════════
// TAGS
// ══════════════════════════════════════════
document.getElementById('tag-input')?.addEventListener('keydown', function (e) {
  if ((e.key === 'Enter' || e.key === ',') && this.value.trim()) {
    e.preventDefault();
    addTag(this.value.trim().replace(/,/g, ''));
    this.value = '';
  }
  if (e.key === 'Backspace' && !this.value && tags.length) {
    removeTag(tags[tags.length - 1]);
  }
});

function addTag(val) {
  if (!val || tags.includes(val)) return;
  tags.push(val);
  renderTagsUI();
}

function removeTag(val) {
  tags = tags.filter(t => t !== val);
  renderTagsUI();
}

function renderTagsUI() {
  const wrap = document.getElementById('tags-wrap');
  const inp  = document.getElementById('tag-input');
  if(!wrap) return;
  wrap.querySelectorAll('.tag-item').forEach(el => el.remove());
  tags.forEach(t => {
    const el = document.createElement('span');
    el.className = 'tag-item';
    el.innerHTML = `${esc(t)} <span class="tag-remove" onclick="removeTag('${esc(t)}')">×</span>`;
    wrap.insertBefore(el, inp);
  });
}

function renderTags(tagArr, size = 'default') {
  if (!tagArr || !tagArr.length) return '<span class="card-tag">Essay</span>';
  const limit = size === 'small' ? 2 : tagArr.length;
  return tagArr.slice(0, limit).map(t => `<span class="card-tag">${esc(t)}</span>`).join('');
}

// ══════════════════════════════════════════
// UTILS & MISC
// ══════════════════════════════════════════
document.getElementById('post-content')?.addEventListener('input', updateWordCount);

function updateWordCount() {
  const el = document.getElementById('post-content');
  if(!el) return;
  const wc = wordCount(el.value);
  const wcEl = document.getElementById('word-count');
  if(wcEl) wcEl.textContent = `${wc} word${wc !== 1 ? 's' : ''}`;
}

function ins(before, after) {
  const ta  = document.getElementById('post-content');
  const s   = ta.selectionStart;
  const e   = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  ta.setRangeText(before + sel + after, s, e, 'select');
  ta.focus();
}

function insLine(prefix) {
  const ta        = document.getElementById('post-content');
  const s         = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
  ta.setRangeText(prefix, lineStart, lineStart, 'end');
  ta.focus();
}

function insBlock(before, after) {
  const ta  = document.getElementById('post-content');
  const s   = ta.selectionStart;
  const e   = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  ta.setRangeText(before + sel + after, s, e, 'end');
  ta.focus();
}

function resetEditor() {
  const title = document.getElementById('post-title');
  const excerpt = document.getElementById('post-excerpt');
  const content = document.getElementById('post-content');
  const header = document.getElementById('write-heading');
  const wordCountEl = document.getElementById('word-count');

  if(title) title.value   = '';
  if(excerpt) excerpt.value = '';
  if(content) content.value = '';
  if(wordCountEl) wordCountEl.textContent = '0 words';
  if(header) header.textContent = 'New Post';
  
  tags      = [];
  coverData = null;
  editingId = null;
  renderTagsUI();
  removeCover();
}

// ABOUT logic kept to local storage to avoid extra DB schemas for now
function renderAbout() {
  const n = document.getElementById('abt-name');
  const h = document.getElementById('abt-handle');
  const b = document.getElementById('abt-bio');
  if(n) n.textContent   = about.name   || 'Author';
  if(h) h.textContent = about.handle || '@void';
  if(b) b.textContent    = about.bio    || '';

  const av = document.getElementById('av-display');
  if(av) {
    av.innerHTML = about.avatar
      ? `<img src="${about.avatar}" alt="Avatar">`
      : (about.name || 'A')[0].toUpperCase();
  }

  const editWrap = document.getElementById('about-edit-wrap');
  if(editWrap) {
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
              <input type="file" accept="image/*" onchange="handleAvatar(this)" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;" />
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
}

function updateAboutSidebar() {
  const siteLogoEl = document.getElementById('site-logo');
  const homeDesc   = document.getElementById('home-desc');

  if (siteLogoEl) {
    const name = (about.name || 'VOID').split(' ')[0].toUpperCase();
    siteLogoEl.innerHTML = `${name}<span>.</span>BLOG`;
  }

  if (homeDesc && about.bio) {
    homeDesc.textContent = about.bio.length > 130
      ? about.bio.slice(0, 130) + '...'
      : about.bio;
  }
}

function toggleAboutEdit() {
  const form = document.getElementById('about-edit-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function saveAbout() {
  about.name   = document.getElementById('abt-name-inp').value.trim()   || 'Author';
  about.handle = document.getElementById('abt-handle-inp').value.trim() || '@void';
  about.bio    = document.getElementById('abt-bio-inp').value.trim();
  localStorage.setItem(KEY_ABOUT, JSON.stringify(about));
  updateAboutSidebar();
  renderAbout();
  toast('Profile saved! ✅', 'success');
}

function handleAvatar(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    about.avatar = e.target.result;
    localStorage.setItem(KEY_ABOUT, JSON.stringify(about));
    renderAbout();
    toast('Photo updated!', 'success');
  };
  reader.readAsDataURL(input.files[0]);
}

function renderMarkdown(md) {
  if (!md) return '';
  let h = esc(md);
  h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h2>$1</h2>');
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  h = h.replace(/`(.+?)`/g, '<code>$1</code>');
  h = h.replace(/^---$/gm, '<hr>');
  h = h.replace(/(^- .+$\n?)+/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  h = h.replace(/(^\d+\. .+$\n?)+/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  h = h.split(/\n\n+/).map(block => {
    if (/^<(h[1-6]|ul|ol|blockquote|pre|hr)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return h;
}

function esc(str) {
  return (str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function stripMd(str) { return (str || '').replace(/[#*`_~>]/g, '').replace(/\n/g, ' ').trim(); }
function wordCount(text) { return (text || '').trim().split(/\s+/).filter(Boolean).length; }
function readTime(text) { return Math.max(1, Math.round(wordCount(text) / 200)); }
function fmtDate(timestamp) {
  return new Date(Number(timestamp)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toast(message, type = 'success') {
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = message;
  el.className   = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3200);
}

// ══════════════════════════════════════════
// RUN
// ══════════════════════════════════════════
boot();