/* ══════════════════════════════════════════
   VOID.BLOG — app.js
   ══════════════════════════════════════════ */

// ── STORAGE KEYS ──────────────────────────
const KEY_PWD   = 'vb_owner_pwd';
const KEY_POSTS = 'vb_posts';
const KEY_ABOUT = 'vb_about';
const KEY_AUTH  = 'vb_authed';

// ── STATE ─────────────────────────────────
let isOwner      = false;
let isViewerMode = false;
let posts        = JSON.parse(localStorage.getItem(KEY_POSTS) || '[]');
let about        = JSON.parse(localStorage.getItem(KEY_ABOUT) || '{"name":"Author","handle":"@void","bio":"Welcome to my blog. This is where I share ideas, stories, and experiments."}');
let tags         = [];
let coverData    = null;
let editingId    = null;
let deleteId     = null;
let isSetupMode  = false;

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════
function boot() {
  const hash = window.location.hash;

  // Shared post link — viewer mode
  if (hash.startsWith('#post/')) {
    const encoded = hash.slice(6);
    isViewerMode = true;
    isOwner      = false;
    applyMode();
    
    // Try to find post in localStorage first (local access)
    const localPost = posts.find(p => p.id === encoded && p.status === 'published');
    if (localPost) {
      openPost(encoded);
      return;
    }
    
    // Try to decode from URL (shared link from another device)
    try {
      const decodedPost = decodePostData(encoded);
      if (decodedPost) {
        // Temporarily add decoded post to display it (only if not already in posts)
        const existingIndex = posts.findIndex(p => p.id === decodedPost.id);
        if (existingIndex === -1) {
          posts.push(decodedPost);
        }
        openPost(decodedPost.id, true); // true = isSharedLink
        return;
      }
    } catch (e) {
      console.error('Failed to decode shared post:', e);
    }
    
    showView('home');
    toast('Post not found or no longer available.', 'error');
    return;
  }

  // Normal load — restore session auth
  if (sessionStorage.getItem(KEY_AUTH) === '1') {
    isOwner = true;
  }
  applyMode();

  const hasPwd = localStorage.getItem(KEY_PWD);
  if (!hasPwd) {
    showSetupModal();       // first launch: create password
  } else if (!isOwner) {
    openPwdModal();         // returning visitor: prompt login
  }

  renderHome();
  updateAboutSidebar();
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
    viewBanner.classList.add('visible');
    ownerBadge.style.display  = 'none';
    navWrite.style.display    = 'none';
    logoutBtn.style.display   = 'none';
    loginSmall.style.display  = 'none';
    navAbout.style.display    = 'none';
  } else if (isOwner) {
    viewBanner.classList.remove('visible');
    ownerBadge.style.display  = 'inline-flex';
    navWrite.style.display    = 'inline-flex';
    logoutBtn.style.display   = 'inline-flex';
    loginSmall.style.display  = 'none';
  } else {
    viewBanner.classList.remove('visible');
    ownerBadge.style.display  = 'none';
    navWrite.style.display    = 'none';
    logoutBtn.style.display   = 'none';
    loginSmall.style.display  = 'inline-flex';
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
  document.getElementById('pwd-modal-title').textContent   = '🛠 Set Owner Password';
  document.getElementById('pwd-modal-desc').textContent    = 'Create a password to protect owner access. Readers who open a shared post link get view-only access automatically.';
  document.getElementById('pwd-cancel-btn').style.display  = 'none';
  document.getElementById('pwd-error').style.display       = 'none';
  m.classList.add('open');
}

function openPwdModal() {
  isSetupMode = false;
  const m = document.getElementById('pwd-modal');
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
    // Save new password (base64 encoded — lightweight obfuscation)
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

// Close modals on backdrop click
document.getElementById('pwd-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('pwd-modal')) closePwdModal();
});

document.getElementById('del-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('del-modal')) closeDelModal();
});

// ══════════════════════════════════════════
// VIEW ROUTING
// ══════════════════════════════════════════
function showView(name) {
  if (name === 'write' && !isOwner) { openPwdModal(); return; }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));

  document.getElementById('view-' + name).classList.add('active');

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

  // Update stats
  const totalWords = posts.reduce((acc, p) => acc + wordCount(p.content), 0);
  const statsRow = document.getElementById('stats-row');
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

  document.getElementById('post-count-badge').textContent =
    `${published.length} post${published.length !== 1 ? 's' : ''}`;

  const container = document.getElementById('home-content');

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
    // Featured card (first post)
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

    // Remaining posts grid
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

  // Drafts section (owner only)
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
function openPost(id, isSharedLink = false) {
  const post = posts.find(p => p.id === id);
  if (!post) { toast('Post not found.', 'error'); return; }

  // Keep encoded hash when viewing from shared link, else allow local ID navigation
  const activeHash = isSharedLink ? encodePostData(post) : post.id;
  window.location.hash = `#post/${activeHash}`;

  // Generate shareable URL with encoded post data
  const shortUrl = `${window.location.origin}${window.location.pathname}#post/${post.id}`;
  const longUrl  = `${window.location.origin}${window.location.pathname}#post/${encodePostData(post)}`;

  let shareUrl;
  if (isOwner && !isSharedLink) {
    shareUrl = longUrl;
  } else {
    shareUrl = `${window.location.origin}${window.location.pathname}#post/${activeHash}`;
  }

  const viewerNotice = isViewerMode
    ? `<div class="viewer-notice">👁 View-only — shared post link</div>`
    : '';

  const ownerControls = isOwner ? `
    <div class="pv-action-group">
      <button class="btn-outline" onclick="editPost('${post.id}')" style="width:auto;margin:0;padding:0.5rem 0.9rem;font-size:0.62rem;">✏️ Edit</button>
      <button class="btn-danger" onclick="askDelete('${post.id}')">🗑 Delete</button>
    </div>` : '';

  const shareBlock = isOwner && !isSharedLink ? `
    <div class="share-box">
      <span class="share-label">Cross-device link (compressed)</span>
      <span class="share-url">${longUrl}</span>
      <button class="copy-btn" onclick="copyLink('${longUrl}')">Copy Cross-device Link</button>
      <div style="margin-top:.75rem; font-size:.78rem; color:#a7f2ff">Short link for same host (local only):</div>
      <span class="share-url">${shortUrl}</span>
      <button class="copy-btn" onclick="copyLink('${shortUrl}')">Copy Short Link</button>
    </div>` : '';

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

  editingId = id;
  resetEditor();

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
  showView('write');
}

function publishPost() {
  const title   = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  if (!title)   { toast('Add a title first.', 'error'); return; }
  if (!content) { toast('Write some content first.', 'error'); return; }
  savePost('published');
}

function saveDraft() {
  savePost('draft');
}

function savePost(status) {
  const title   = document.getElementById('post-title').value.trim()   || 'Untitled';
  const excerpt = document.getElementById('post-excerpt').value.trim();
  const content = document.getElementById('post-content').value.trim();

  if (editingId) {
    const idx = posts.findIndex(p => p.id === editingId);
    if (idx !== -1) {
      posts[idx] = {
        ...posts[idx],
        title, excerpt, content,
        tags: [...tags],
        cover: coverData,
        status,
        updatedAt: Date.now()
      };
    }
    editingId = null;
  } else {
    posts.unshift({
      id: Date.now().toString(),
      title, excerpt, content,
      tags: [...tags],
      cover: coverData,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  localStorage.setItem(KEY_POSTS, JSON.stringify(posts));
  toast(status === 'published' ? '⚡ Published!' : '💾 Draft saved!', 'success');
  resetEditor();
  showView('home');
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

function confirmDelete() {
  posts = posts.filter(p => p.id !== deleteId);
  localStorage.setItem(KEY_POSTS, JSON.stringify(posts));
  closeDelModal();
  toast('Post deleted.', 'success');
  showView('home');
}

// ══════════════════════════════════════════
// COVER IMAGE
// ══════════════════════════════════════════
function handleCover(input) {
  if (input.files && input.files[0]) readCoverFile(input.files[0]);
}

function readCoverFile(file) {
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

// Drag-and-drop on cover zone
const coverZone = document.getElementById('cover-zone');
coverZone.addEventListener('dragover',  e => { e.preventDefault(); coverZone.classList.add('over'); });
coverZone.addEventListener('dragleave', () => coverZone.classList.remove('over'));
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
  wrap.querySelectorAll('.tag-item').forEach(el => el.remove());
  tags.forEach(t => {
    const el = document.createElement('span');
    el.className = 'tag-item';
    el.innerHTML = `${esc(t)} <span class="tag-remove" onclick="removeTag('${esc(t)}')">×</span>`;
    wrap.insertBefore(el, inp);
  });
}

// Helper to render tag chips for post cards / post view
function renderTags(tagArr, size = 'default') {
  if (!tagArr || !tagArr.length) return '<span class="card-tag">Essay</span>';
  const limit = size === 'small' ? 2 : tagArr.length;
  return tagArr.slice(0, limit).map(t => `<span class="card-tag">${esc(t)}</span>`).join('');
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

// ══════════════════════════════════════════
// RESET EDITOR
// ══════════════════════════════════════════
function resetEditor() {
  document.getElementById('post-title').value   = '';
  document.getElementById('post-excerpt').value = '';
  document.getElementById('post-content').value = '';
  document.getElementById('word-count').textContent = '0 words';
  document.getElementById('write-heading').textContent = 'New Post';
  tags      = [];
  coverData = null;
  editingId = null;
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

// ══════════════════════════════════════════
// MARKDOWN RENDERER
// ══════════════════════════════════════════
function renderMarkdown(md) {
  if (!md) return '';
  let h = esc(md);

  // Code blocks (must come first)
  h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);

  // Headings
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h2>$1</h2>');

  // Blockquote
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold + italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Inline code
  h = h.replace(/`(.+?)`/g, '<code>$1</code>');

  // Horizontal rule
  h = h.replace(/^---$/gm, '<hr>');

  // Unordered lists
  h = h.replace(/(^- .+$\n?)+/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  h = h.replace(/(^\d+\. .+$\n?)+/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Wrap remaining lines in paragraphs
  h = h.split(/\n\n+/).map(block => {
    if (/^<(h[1-6]|ul|ol|blockquote|pre|hr)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return h;
}

// ══════════════════════════════════════════
// POST DATA ENCODING (for shareable links)
// ══════════════════════════════════════════
// simple LZ-string (URL safe) helper; inlined to avoid external dependency
const LZString = {
  keyStrUriSafe: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",

  compressToEncodedURIComponent: function (input) {
    if (input == null) return "";
    return this._compress(input, 6, function (a) {
      return LZString.keyStrUriSafe.charAt(a);
    });
  },

  decompressFromEncodedURIComponent: function (input) {
    if (input == null) return "";
    if (input == "") return null;
    input = input.replace(/ /g, "+");
    return this._decompress(input.length, 32, function (index) {
      return LZString.keyStrUriSafe.indexOf(input.charAt(index));
    });
  },

  _compress: function (uncompressed, bitsPerChar, getCharFromInt) {
    if (uncompressed == null) return "";
    let i, value,
      context_dictionary = {},
      context_dictionaryToCreate = {},
      context_c = "",
      context_wc = "",
      context_w = "",
      context_enlargeIn = 2,
      context_dictSize = 3,
      context_numBits = 2,
      context_data = [],
      context_data_val = 0,
      context_data_position = 0;
    for (i = 0; i < uncompressed.length; i += 1) {
      context_c = uncompressed.charAt(i);
      if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
        context_dictionary[context_c] = context_dictSize++;
        context_dictionaryToCreate[context_c] = true;
      }
      context_wc = context_w + context_c;
      if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
        context_w = context_wc;
      } else {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
          if (context_w.charCodeAt(0) < 256) {
            for (i = 0; i < context_numBits; i += 1) {
              context_data_val = (context_data_val << 1);
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 8; i += 1) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          } else {
            value = 1;
            for (i = 0; i < context_numBits; i += 1) {
              context_data_val = (context_data_val << 1) | value;
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = 0;
            }
            value = context_w.charCodeAt(0);
            for (i = 0; i < 16; i += 1) {
              context_data_val = (context_data_val << 1) | (value & 1);
              if (context_data_position == bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn == 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          delete context_dictionaryToCreate[context_w];
        } else {
          value = context_dictionary[context_w];
          for (i = 0; i < context_numBits; i += 1) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        context_dictionary[context_wc] = context_dictSize++;
        context_w = String(context_c);
      }
    }
    if (context_w !== "") {
      if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
        if (context_w.charCodeAt(0) < 256) {
          for (i = 0; i < context_numBits; i += 1) {
            context_data_val = (context_data_val << 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 8; i += 1) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        } else {
          value = 1;
          for (i = 0; i < context_numBits; i += 1) {
            context_data_val = (context_data_val << 1) | value;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = 0;
          }
          value = context_w.charCodeAt(0);
          for (i = 0; i < 16; i += 1) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        delete context_dictionaryToCreate[context_w];
      } else {
        value = context_dictionary[context_w];
        for (i = 0; i < context_numBits; i += 1) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position == bitsPerChar - 1) {
            context_data_position = 0;
            context_data.push(getCharFromInt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      }
    }
    value = 2;
    for (i = 0; i < context_numBits; i += 1) {
      context_data_val = (context_data_val << 1) | (value & 1);
      if (context_data_position == bitsPerChar - 1) {
        context_data_position = 0;
        context_data.push(getCharFromInt(context_data_val));
        context_data_val = 0;
      } else {
        context_data_position++;
      }
      value = value >> 1;
    }
    while (context_data_val > 0) {
      context_data_val = (context_data_val << 1);
      if (context_data_position == bitsPerChar - 1) {
        context_data_position = 0;
        context_data.push(getCharFromInt(context_data_val));
        context_data_val = 0;
      } else {
        context_data_position++;
      }
    }
    return context_data.join("");
  },

  _decompress: function (length, resetValue, getNextValue) {
    let dictionary = [""],
      next, enlargeIn = 4,
      dictSize = 4,
      numBits = 3,
      entry = "",
      result = [],
      w, bits, resb, maxpower, power,
      c, data = { val: getNextValue(0), position: resetValue, index: 1 };

    for (let i = 0; i < 3; i += 1) {
      dictionary[i] = i;
    }
    bits = 0;
    maxpower = Math.pow(2, 2);
    power = 1;
    while (power != maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position == 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power *= 2;
    }
    switch (next = bits) {
      case 0:
        bits = 0;
        maxpower = Math.pow(2, 8);
        power = 1;
        while (power != maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position == 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power *= 2;
        }
        c = String.fromCharCode(bits);
        break;
      case 1:
        bits = 0;
        maxpower = Math.pow(2, 16);
        power = 1;
        while (power != maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position == 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power *= 2;
        }
        c = String.fromCharCode(bits);
        break;
      case 2:
        return "";
    }
    dictionary[3] = c;
    w = c;
    result.push(c);
    while (true) {
      if (data.index > length) return "";

      bits = 0;
      maxpower = Math.pow(2, numBits);
      power = 1;
      while (power != maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position == 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power *= 2;
      }

      switch (c = bits) {
        case 0:
          bits = 0;
          maxpower = Math.pow(2, 8);
          power = 1;
          while (power != maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power *= 2;
          }
          dictionary[dictSize++] = String.fromCharCode(bits);
          c = dictSize - 1;
          enlargeIn--;
          break;
        case 1:
          bits = 0;
          maxpower = Math.pow(2, 16);
          power = 1;
          while (power != maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power *= 2;
          }
          dictionary[dictSize++] = String.fromCharCode(bits);
          c = dictSize - 1;
          enlargeIn--;
          break;
        case 2:
          return result.join("");
      }

      if (enlargeIn == 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }

      if (dictionary[c]) {
        entry = dictionary[c];
      } else {
        if (c === dictSize) {
          entry = w + w.charAt(0);
        } else {
          return null;
        }
      }
      result.push(entry);
      dictionary[dictSize++] = w + entry.charAt(0);
      dictSize++;
      w = entry;

      enlargeIn--;

      if (enlargeIn == 0) {
        enlargeIn = Math.pow(2, numBits);
        numBits++;
      }
    }
  }
};

function encodePostData(post) {
  try {
    const json = JSON.stringify(post);
    return encodeURIComponent(btoa(json));
  } catch (e) {
    console.error('Encoding failed:', e);
    return post.id;
  }
}

function decodePostData(encoded) {
  try {
    if (!encoded || encoded.length <= 10) return null;
    const decodedUri = decodeURIComponent(encoded);
    const json = atob(decodedUri);
    const post = JSON.parse(json);
    if (post && post.title && post.content && post.id) return post;
  } catch (e) {
    console.error('Decoding failed:', e);
  }
  return null;
}

// ══════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════
function esc(str) {
  return (str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function stripMd(str) {
  return (str || '').replace(/[#*`_~>]/g, '').replace(/\n/g, ' ').trim();
}

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function readTime(text) {
  return Math.max(1, Math.round(wordCount(text) / 200));
}

function fmtDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric'
  });
}

function toast(message, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className   = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3200);
}

// ══════════════════════════════════════════
// RUN
// ══════════════════════════════════════════
boot();
