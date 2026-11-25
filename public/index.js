(() => {
  const PROXY = '/api/proxy';
  const MEDIA = '/api/media?path=';
  const $ = function (s) {
    return document.querySelector(s);
  };

  const form = $('#form');
  const endpointSel = $('#endpoint');
  const keywordsFld = $('#keywordsField');
  const submitBtn = $('#submitBtn');
  const statusEl = $('#status');
  const resultsEl = $('#results');
  const loadMoreBtn = $('#loadMore');
  const debugEl = $('#debug');
  const modal = $('#playerModal');
  const player = $('#player');

  let state = { cursor: '', hasMore: false, params: null, loading: false };

  /* ============================================================
     NEW FEATURE: accumulate every fetch's videos for JSON export.
     Purely additive — does not modify the fetch pipeline.
     ============================================================ */
  const allFetchedVideos = [];

  const downloadBtn = $('#downloadJsonBtn');
  downloadBtn.addEventListener('click', function () {
    if (allFetchedVideos.length === 0) {
      setStatus('Nothing to download — fetch something first.', 'error');
      return;
    }
    const payload = {
      exported_at: new Date().toISOString(),
      total: allFetchedVideos.length,
      videos: allFetchedVideos,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${($('#unique_id').value.trim().replace(/^@/, '') || 'responses')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${allFetchedVideos.length} videos.`, 'success');
  });
  /* ======================== END NEW FEATURE ==================== */

  endpointSel.addEventListener('change', function () {
    keywordsFld.hidden = endpointSel.value !== 'search';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    run({ append: false });
  });

  loadMoreBtn.addEventListener('click', function () {
    if (!state.params) {
      setStatus('No previous fetch — click Fetch first.', 'error');
      return;
    }
    if (state.loading) {
      setStatus('Already loading, wait…', 'error');
      return;
    }
    if (!state.cursor) {
      setStatus('API returned no cursor — nothing more to load.', 'error');
      return;
    }
    run({ append: true });
  });

  function fix(url) {
    if (!url) {
      return '';
    }
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    if (!url.startsWith('/video/')) {
      return url;
    }
    return MEDIA + encodeURIComponent(url);
  }

  function updateDebug() {
    debugEl.textContent =
      `cursor: ${state.cursor || '—'} · hasMore: ${state.hasMore} · loading: ${state.loading}`;
  }

  async function run({ append }) {
    if (state.loading) {
      return;
    }

    const unique_id = $('#unique_id').value.trim();
    const endpoint = endpointSel.value;
    const keywords = $('#keywords').value.trim();
    const count = $('#count').value.trim();
    const rawCursor = $('#cursor').value.trim();

    if (!unique_id) {
      return setStatus('unique_id is required', 'error');
    }
    if (endpoint === 'search' && !keywords) {
      return setStatus('keywords is required for search', 'error');
    }

    let cursor;
    if (append) {
      cursor = String(state.cursor ?? '');
      if (!cursor) {
        setStatus('Cannot load more: cursor is empty.', 'error');
        return;
      }
    } else {
      cursor = rawCursor || undefined;
    }

    const params = new URLSearchParams({ unique_id, endpoint });
    if (count) {
      params.set('count', count);
    }
    if (cursor !== undefined && cursor !== '') {
      params.set('cursor', cursor);
    }
    if (endpoint === 'search') {
      params.set('keywords', keywords);
    }

    const url = `${PROXY}?${params.toString()}`;
    console.log(`[Fetch ${append ? 'LOAD MORE' : 'FIRST'}]`, url);

    state.loading = true;
    submitBtn.disabled = true;
    loadMoreBtn.disabled = true;
    if (!append) {
      resultsEl.innerHTML = '';
      loadMoreBtn.hidden = true;
      allFetchedVideos.length = 0;
    }
    setStatus(append ? 'Loading more…' : 'Loading…', '');
    updateDebug();

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || json.details || `HTTP ${res.status}`);
      }
      if (json.code !== 0) {
        throw new Error(json.msg || 'API returned non-zero code');
      }

      const videos = json.data?.videos || [];
      const data = json.data || {};

      for (const v of videos) {
        allFetchedVideos.push(v);
      }
      if (!append) {
        renderProfile(videos.length ? videos[0].author : null);
      }

      state.params = params;
      state.cursor = data.cursor != null ? String(data.cursor) : '';
      state.hasMore = !!data.hasMore;

      $('#cursor').value = state.cursor;

      if (!videos.length) {
        setStatus(append ? 'No more results' : 'No results', 'error');
        state.hasMore = false;
      } else {
        render(videos, append);
        setStatus(
          `${append ? 'Loaded more' : 'Loaded'} ${videos.length} • ` +
          `cursor ${state.cursor || '-'} • hasMore ${state.hasMore}`,
          'success'
        );
      }

      loadMoreBtn.hidden = !state.hasMore;
      if (state.hasMore) {
        loadMoreBtn.textContent =
          `Load more · cursor ${state.cursor.slice(0, 6)}…`;
      }
    } catch (err) {
      console.error('[Fetch Error]', err);
      setStatus(err.message || 'Request failed', 'error');
    } finally {
      state.loading = false;
      submitBtn.disabled = false;
      loadMoreBtn.disabled = false;
      updateDebug();
    }
  }

  function countryFlag(code) {
    if (!code || typeof code !== 'string' || code.length !== 2) {
      return '';
    }
    var cc = code.toUpperCase();
    var A = 0x1F1E6;
    var a = 'A'.charCodeAt(0);
    return String.fromCodePoint(A + (cc.charCodeAt(0) - a)) +
           String.fromCodePoint(A + (cc.charCodeAt(1) - a));
  }

  function renderProfile(author, region) {
    var card = document.getElementById('profileCard');
    if (!author || !author.unique_id) {
      card.hidden = true;
      return;
    }
    var avatarEl = document.getElementById('profileAvatar');
    var nickEl = document.getElementById('profileNickname');
    var uidEl = document.getElementById('profileUnique');
    var flagEl = document.getElementById('profileFlag');

    nickEl.textContent = author.nickname || '';
    uidEl.textContent = '@' + (author.unique_id || '');

    var avatarUrl = fix(author.avatar || '');
    if (avatarUrl) {
      avatarEl.src = avatarUrl;
      avatarEl.onerror = function () {
        avatarEl.style.opacity = '0.15';
      };
      avatarEl.style.opacity = '';
    } else {
      avatarEl.removeAttribute('src');
    }

    var flag = countryFlag(region);
    flagEl.textContent = flag;
    flagEl.title = region ? region.toUpperCase() : '';

    card.hidden = false;
  }

  function render(videos, append) {
    const html = videos.map(function (v) {
      const isPhoto = Array.isArray(v.images) && v.images.length > 0;
      const cover = fix(v.cover || '');
      const play = fix(v.play || v.wmplay || '');
      const images = isPhoto ? v.images.map(fix) : [];

      const title = esc(v.title || '');
      const author = esc(v.author?.unique_id || '');
      const nickname = esc(v.author?.nickname || '');
      const music = esc(v.music_info?.title || '');
      const initial = (v.author?.unique_id || '?').charAt(0).toUpperCase();

      const date = v.create_time
        ? new Date(v.create_time * 1000).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
        : '—';
      const size = v.size > 0 ? (v.size / 1048576).toFixed(1) + ' MB' : '—';

      const badges = isPhoto
        ? `<span class="badge bl"><i class="fa-solid fa-layer-group"></i> ${images.length}</span>`
        : `
          <span class="badge bl"><i class="fa-solid fa-play"></i> ${fmt(v.play_count)}</span>
          <span class="badge br"><i class="fa-solid fa-clock"></i> ${fmtDur(v.duration)}</span>
        `;

      const stats = [
        ['fa-heart', fmt(v.digg_count)],
        ['fa-comment', fmt(v.comment_count)],
        ['fa-share', fmt(v.share_count)],
        ['fa-download', fmt(v.download_count)],
        ['fa-bookmark', fmt(v.collect_count)],
      ].map(function (pair) {
        return `<span class="stat"><i class="fa-solid ${pair[0]}"></i>${pair[1]}</span>`;
      }).join('');

      const mediaUrl = play || images[0] || '';
      const mediaType = play ? 'video' : (images.length ? 'image' : '');
      const imgList = isPhoto ? JSON.stringify(images) : '';

      return `
        <article class="card"
                 data-type="${mediaType}"
                 data-src="${esc(mediaUrl)}"
                 data-imgs="${esc(imgList)}">
          <div class="thumb">
            <img loading="lazy" src="${esc(cover)}" alt=""
                 onerror="this.style.opacity=0.15" />
            ${badges}
          </div>
          <div class="meta">
            <p class="title">${title || '&nbsp;'}</p>
            <div class="author">
              <span class="avatar">${esc(initial)}</span>
              <span class="handle">@${author || 'unknown'}</span>
              ${nickname ? `<span class="nickname">· ${nickname}</span>` : ''}
            </div>
            <div class="stats">${stats}</div>
            <div class="meta-line">
              <span><i class="fa-regular fa-calendar"></i>${date}</span>
              <span><i class="fa-solid fa-hard-drive"></i>${size}</span>
            </div>
            ${music ? `<div class="audio" title="${music}"><i class="fa-solid fa-music"></i><span>${music}</span></div>` : ''}
          </div>
        </article>
      `;
    }).join('');

    if (append) {
      resultsEl.insertAdjacentHTML('beforeend', html);
    } else {
      resultsEl.innerHTML = html;
    }
  }

  resultsEl.addEventListener('click', function (e) {
    const card = e.target.closest('.card');
    if (!card) {
      return;
    }
    const type = card.dataset.type;
    const src = card.dataset.src;
    if (type === 'video' && src) {
      openVideo(src);
    } else if (type === 'image' && src) {
      openImages(src, card.dataset.imgs);
    }
  });

  function openVideo(url) {
    player.src = url;
    player.style.display = '';
    modal.classList.add('open');
    const p = player.play();
    if (p && p.catch) {
      p.catch(function () {});
    }
  }

  function openImages(firstUrl, listJson) {
    let list = [];
    try {
      list = JSON.parse(listJson || '[]');
    } catch {}
    if (!list.length) {
      list = [firstUrl];
    }

    player.removeAttribute('src');
    player.pause();

    const overlay = document.createElement('img');
    overlay.src = list[0];
    overlay.alt = '';
    overlay.id = 'imageOverlay';
    overlay.style.cssText =
      'max-width:100%;max-height:100%;border-radius:8px;object-fit:contain;cursor:pointer;';
    overlay.dataset.idx = '0';
    overlay.dataset.list = JSON.stringify(list);
    overlay.addEventListener('click', function () {
      const arr = JSON.parse(overlay.dataset.list);
      const next = (Number(overlay.dataset.idx) + 1) % arr.length;
      overlay.dataset.idx = String(next);
      overlay.src = arr[next];
    });

    player.style.display = 'none';
    modal.appendChild(overlay);
    modal.classList.add('open');
  }

  function closePlayer() {
    player.pause();
    player.removeAttribute('src');
    player.load();
    player.style.display = '';
    const img = document.getElementById('imageOverlay');
    if (img) {
      img.remove();
    }
    modal.classList.remove('open');
  }

  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('#playerClose')) {
      closePlayer();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closePlayer();
    }
  });

  function setStatus(msg, type) {
    statusEl.textContent = msg || '';
    statusEl.className = type || '';
  }

  function esc(s) {
    var out = String(s);
    out = out.split('&').join('&amp;');
    out = out.split('<').join('&lt;');
    out = out.split('>').join('&gt;');
    out = out.split('"').join('&quot;');
    out = out.split("'").join('&#39;');
    return out;
  }

  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 1e9) {
      return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (n >= 1e6) {
      return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (n >= 1e3) {
      return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return String(n);
  }

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    if (sec === 0) {
      return '—';
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
})();
