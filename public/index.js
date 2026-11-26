(function () {
  var PROXY = '/api/proxy';
  var MEDIA = '/api/media?path=';
  var $ = function (s) { return document.querySelector(s); };

  var form = $('#form');
  var endpointSel = $('#endpoint');
  var keywordsFld = $('#keywordsField');
  var submitBtn = $('#submitBtn');
  var statusEl = $('#status');
  var resultsEl = $('#results');
  var loadMoreBtn = $('#loadMore');
  var debugEl = $('#debug');
  var modal = $('#playerModal');
  var player = $('#player');
  var downloadBtn = $('#downloadJsonBtn');

  var state = { cursor: '', hasMore: false, params: null, loading: false };
  var allFetchedVideos = [];

  function fix(url) {
    if (!url) { return ''; }
    if (/^https?:\/\//i.test(url)) { return url; }
    if (url.indexOf('/video/') !== 0) { return url; }
    return MEDIA + encodeURIComponent(url);
  }

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
    if (n >= 1e9) { return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'; }
    if (n >= 1e6) { return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; }
    if (n >= 1e3) { return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; }
    return String(n);
  }

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    if (sec === 0) { return '—'; }
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
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

  function updateDebug() {
    debugEl.textContent =
      'cursor: ' + (state.cursor || '—') +
      ' · hasMore: ' + state.hasMore +
      ' · loading: ' + state.loading;
  }

  async function run(opts) {
    var append = opts.append;
    if (state.loading) { return; }

    var unique_id = $('#unique_id').value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    var endpoint = endpointSel.value;
    var keywords = $('#keywords').value.trim();
    var count = $('#count').value.trim();
    var rawCursor = $('#cursor').value.trim();

    if (!unique_id) {
      setStatus('unique_id is required', 'error');
      return;
    }
    if (endpoint === 'search' && !keywords) {
      setStatus('keywords is required for search', 'error');
      return;
    }

    var cursor;
    if (append) {
      cursor = String(state.cursor == null ? '' : state.cursor);
      if (!cursor) {
        setStatus('Cannot load more: cursor is empty.', 'error');
        return;
      }
    } else {
      cursor = rawCursor || undefined;
    }

    var qs = 'unique_id=' + encodeURIComponent(unique_id) +
             '&endpoint=' + encodeURIComponent(endpoint);
    if (count) { qs += '&count=' + encodeURIComponent(count); }
    if (cursor !== undefined && cursor !== '') { qs += '&cursor=' + encodeURIComponent(cursor); }
    if (endpoint === 'search') { qs += '&keywords=' + encodeURIComponent(keywords); }

    var url = PROXY + '?' + qs;
    console.log('[Fetch ' + (append ? 'LOAD MORE' : 'FIRST') + ']', url);

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
      var res = await fetch(url);
      var json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || json.details || ('HTTP ' + res.status));
      }
      if (json.code !== 0) {
        throw new Error(json.msg || 'API returned non-zero code');
      }

      var videos = (json.data && json.data.videos) || [];
      var data = json.data || {};

      for (var i = 0; i < videos.length; i++) {
        allFetchedVideos.push(videos[i]);
      }
      if (!append) {
        renderProfile(videos.length ? videos[0].author : null, videos.length ? videos[0].region : null);
      }

      state.params = qs;
      state.cursor = data.cursor != null ? String(data.cursor) : '';
      state.hasMore = !!data.hasMore;

      $('#cursor').value = state.cursor;

      if (!videos.length) {
        setStatus(append ? 'No more results' : 'No results', 'error');
        state.hasMore = false;
      } else {
        render(videos, append);
        setStatus(
          (append ? 'Loaded more ' : 'Loaded ') + videos.length + ' • ' +
          'cursor ' + (state.cursor || '-') + ' • hasMore ' + state.hasMore,
          'success'
        );
      }

      loadMoreBtn.hidden = !state.hasMore;
      if (state.hasMore) {
        loadMoreBtn.textContent =
          'Load more · cursor ' + state.cursor.slice(0, 6) + '…';
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
    flagEl.title = region ? String(region).toUpperCase() : '';

    card.hidden = false;
  }

  function render(videos, append) {
    var html = videos.map(function (v) {
      var isPhoto = Array.isArray(v.images) && v.images.length > 0;
      var cover = fix(v.cover || '');
      var play = fix(v.play || v.wmplay || '');
      var images = isPhoto ? v.images.map(fix) : [];

      var title = esc(v.title || '');
      var author = esc(v.author && v.author.unique_id ? v.author.unique_id : '');
      var nickname = esc(v.author && v.author.nickname ? v.author.nickname : '');
      var music = esc(v.music_info && v.music_info.title ? v.music_info.title : '');
      var initial = (v.author && v.author.unique_id ? v.author.unique_id : '?').charAt(0).toUpperCase();

      var date = v.create_time
        ? new Date(v.create_time * 1000).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
        : '—';
      var size = v.size > 0 ? (v.size / 1048576).toFixed(1) + ' MB' : '—';

      var badges = isPhoto
        ? '<span class="badge bl"><i class="fa-solid fa-layer-group"></i> ' + images.length + '</span>'
        : '<span class="badge bl"><i class="fa-solid fa-play"></i> ' + fmt(v.play_count) + '</span>' +
          '<span class="badge br"><i class="fa-solid fa-clock"></i> ' + fmtDur(v.duration) + '</span>';

      var stats = [
        ['fa-heart', fmt(v.digg_count)],
        ['fa-comment', fmt(v.comment_count)],
        ['fa-share', fmt(v.share_count)],
        ['fa-download', fmt(v.download_count)],
        ['fa-bookmark', fmt(v.collect_count)],
      ].map(function (pair) {
        return '<span class="stat"><i class="fa-solid ' + pair[0] + '"></i>' + pair[1] + '</span>';
      }).join('');

      var mediaUrl = play || images[0] || '';
      var mediaType = play ? 'video' : (images.length ? 'image' : '');
      var imgList = isPhoto ? JSON.stringify(images) : '';

      return '' +
        '<article class="card" data-type="' + mediaType + '" data-src="' + esc(mediaUrl) + '" data-imgs="' + esc(imgList) + '">' +
          '<div class="thumb">' +
            '<img loading="lazy" src="' + esc(cover) + '" alt="" onerror="this.style.opacity=0.15" />' +
            badges +
          '</div>' +
          '<div class="meta">' +
            '<p class="title">' + (title || '&nbsp;') + '</p>' +
            '<div class="author">' +
              '<span class="avatar">' + esc(initial) + '</span>' +
              '<span class="handle">@' + (author || 'unknown') + '</span>' +
              (nickname ? '<span class="nickname">· ' + nickname + '</span>' : '') +
            '</div>' +
            '<div class="stats">' + stats + '</div>' +
            '<div class="meta-line">' +
              '<span><i class="fa-regular fa-calendar"></i>' + date + '</span>' +
              '<span><i class="fa-solid fa-hard-drive"></i>' + size + '</span>' +
            '</div>' +
            (music ? '<div class="audio" title="' + music + '"><i class="fa-solid fa-music"></i><span>' + music + '</span></div>' : '') +
          '</div>' +
        '</article>';
    }).join('');

    if (append) {
      resultsEl.insertAdjacentHTML('beforeend', html);
    } else {
      resultsEl.innerHTML = html;
    }
  }

  resultsEl.addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (!card) { return; }
    var type = card.dataset.type;
    var src = card.dataset.src;
    if (type === 'video' && src) { openVideo(src); }
    else if (type === 'image' && src) { openImages(src, card.dataset.imgs); }
  });

  function openVideo(url) {
    player.src = url;
    player.style.display = '';
    modal.classList.add('open');
    var p = player.play();
    if (p && p.catch) { p.catch(function () {}); }
  }

  function openImages(firstUrl, listJson) {
    var list = [];
    try { list = JSON.parse(listJson || '[]'); } catch (e) {}
    if (!list.length) { list = [firstUrl]; }

    player.removeAttribute('src');
    player.pause();

    var overlay = document.createElement('img');
    overlay.src = list[0];
    overlay.alt = '';
    overlay.id = 'imageOverlay';
    overlay.style.cssText =
      'max-width:100%;max-height:100%;border-radius:8px;object-fit:contain;cursor:pointer;';
    overlay.dataset.idx = '0';
    overlay.dataset.list = JSON.stringify(list);
    overlay.addEventListener('click', function () {
      var arr = JSON.parse(overlay.dataset.list);
      var next = (Number(overlay.dataset.idx) + 1) % arr.length;
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
    var img = document.getElementById('imageOverlay');
    if (img) { img.remove(); }
    modal.classList.remove('open');
  }

  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('#playerClose')) { closePlayer(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) { closePlayer(); }
  });

  downloadBtn.addEventListener('click', function () {
    if (allFetchedVideos.length === 0) {
      setStatus('Nothing to download — fetch something first.', 'error');
      return;
    }
    var payload = {
      exported_at: new Date().toISOString(),
      total: allFetchedVideos.length,
      videos: allFetchedVideos,
    };
    var name = ($('#unique_id').value.trim().replace(/^@/, '') || 'responses') + '.json';
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Downloaded ' + allFetchedVideos.length + ' videos.', 'success');
  });
})();
