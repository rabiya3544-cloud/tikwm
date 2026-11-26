(function () {
  var MEDIA = '/api/media?path=';
  var $ = function (s) { return document.querySelector(s); };

  var form = $('#form');
  var submitBtn = $('#submitBtn');
  var statusEl = $('#status');
  var resultsEl = $('#results');
  var debugEl = $('#debug');
  var modal = $('#playerModal');
  var player = $('#player');
  var downloadBtn = $('#downloadJsonBtn');

  var allVideos = [];
  var loading = false;

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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    load();
  });

  function buildJsonUrl(unique_id) {
    var id = String(unique_id || '').replace(/^@/, '');
    return './' + encodeURIComponent(id) + '.json';
  }

  async function load() {
    if (loading) { return; }
    var unique_id = $('#unique_id').value.trim();
    if (!unique_id) {
      setStatus('unique_id is required', 'error');
      return;
    }

    var url = buildJsonUrl(unique_id);
    loading = true;
    submitBtn.disabled = true;
    resultsEl.innerHTML = '';
    allVideos.length = 0;
    setStatus('Loading ' + url + '…', '');
    debugEl.textContent = 'source: ' + url + ' · loading: true';

    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ' — ' + url);
      }
      var json = await res.json();

      var videos = [];
      if (Array.isArray(json)) {
        videos = json;
      } else if (json && Array.isArray(json.videos)) {
        videos = json.videos;
      } else if (json && json.data && Array.isArray(json.data.videos)) {
        videos = json.data.videos;
      }

      if (!videos.length) {
        setStatus('No videos in ' + url, 'error');
        renderProfile(null);
        debugEl.textContent = 'source: ' + url + ' · loading: false · 0 videos';
        return;
      }

      for (var i = 0; i < videos.length; i++) {
        allVideos.push(videos[i]);
      }
      renderProfile(videos.length ? videos[0].author : null, videos.length ? videos[0].region : null);
      render(videos);

      setStatus('Loaded ' + videos.length + ' videos from ' + url, 'success');
      debugEl.textContent = 'source: ' + url + ' · loading: false · ' + videos.length + ' videos';
    } catch (err) {
      console.error('[Load Error]', err);
      setStatus(err.message || 'Failed to load json', 'error');
      renderProfile(null);
      debugEl.textContent = 'source: ' + url + ' · loading: false · error';
    } finally {
      loading = false;
      submitBtn.disabled = false;
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

    flagEl.textContent = countryFlag(region);
    flagEl.title = region ? String(region).toUpperCase() : '';

    card.hidden = false;
  }

  function render(videos) {
    var html = videos.map(function (v) {
      var isPhoto = Array.isArray(v.images) && v.images.length > 0;
      var cover = fix(v.cover || '');
      var play = fix(v.play || v.wmplay || '');
      var images = isPhoto ? v.images.map(fix) : [];

      var title = esc(v.title || '');
      var music = esc(v.music_info && v.music_info.title ? v.music_info.title : '');

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
          '<span class="badge br"><i class="fa-solid fa-clock"></i> ' + fmtDur(v.duration) + '</span>' +
        '<span class="badge tr"><i class="fa-regular fa-calendar"></i>' + date + '</span>';

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
            '<div class="stats">' + stats + '</div>' +
            '<div class="meta-line">' +
              '<span><i class="fa-regular fa-calendar"></i>' + date + '</span>' +
              '<span><i class="fa-solid fa-hard-drive"></i>' + size + '</span>' +
            '</div>' +
            (music ? '<div class="audio" title="' + music + '"><i class="fa-solid fa-music"></i><span>' + music + '</span></div>' : '') +
          '</div>' +
        '</article>';
    }).join('');

    resultsEl.innerHTML = html;
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
    if (allVideos.length === 0) {
      setStatus('Nothing to download — load a json first.', 'error');
      return;
    }
    var payload = {
      exported_at: new Date().toISOString(),
      total: allVideos.length,
      videos: allVideos,
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
    setStatus('Downloaded ' + allVideos.length + ' videos.', 'success');
  });
})();
