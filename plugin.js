/**
 * GnulaHD — adaptado a la app (getHome, getDiscover, search, getMeta, getStreams)
 * Origen: plugin Kino GnulaHD v8 (ww3.gnulahd.nu)
 */
(function () {
  var G = typeof globalThis !== "undefined" ? globalThis : this;
  function kinoFetch(url, options) {
    options = options || {};
    var method = (options.method || "GET").toUpperCase();
    var headers = Object.assign({}, options.headers || {});
    var body = undefined;
    if (options.body != null) {
      if (typeof options.body === "string") body = options.body;
      else if (typeof options.body === "object") {
        try { body = JSON.stringify(options.body); if (!headers["Content-Type"]) headers["Content-Type"] = "application/json"; } catch (e) {}
      }
    }
    var timeoutMs = options.timeoutMs || 25000;
    var signal;
    try {
      if (typeof AbortController !== "undefined") {
        var c = new AbortController();
        signal = c.signal;
        setTimeout(function () { try { c.abort(); } catch (e) {} }, timeoutMs);
      }
    } catch (e) {}
    return G.fetch(url, { method: method, headers: headers, body: body, signal: signal }).then(function (r) {
      return r.text().then(function (text) {
        var hdrs = {};
        try {
          if (r.headers && r.headers.forEach) r.headers.forEach(function (v, k) { hdrs[k] = v; });
        } catch (e) {}
        return {
          ok: !!(r.ok || (r.status >= 200 && r.status < 300)),
          status: r.status || 0,
          url: r.url || url,
          headers: hdrs,
          text: function () { return text; },
          json: function () { try { return JSON.parse(text); } catch (e) { return null; } },
        };
      });
    });
  }
  G.kino = {
    apiVersion: 8,
    lang: "es",
    fetch: kinoFetch,
    log: function () {
      try { console.log.apply(console, ["[GnulaHD]"].concat([].slice.call(arguments))); } catch (e) {}
    },
    error: function (code, msg) {
      var err = new Error(String(msg || code));
      err.code = code;
      throw err;
    },
    sleep: function (ms) {
      return new Promise(function (r) { setTimeout(r, Math.max(0, Number(ms) || 0)); });
    },
    get config() {
      try {
        if (G.__nuvioConfig && G.__nuvioConfig.current) return G.__nuvioConfig.current;
      } catch (e) {}
      return {};
    },
  };
})();


var BASE_URL = "https://ww3.gnulahd.nu";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var TMDB_KEY = "a2d9bbed370d9f678e34006f8750a5a5";
var TMDB_LANG = "es-MX";
var TMDB_IMG = "https://image.tmdb.org/t/p/";

async function tmdbGet(path, params) {
  params = params || {};
  var q = [];
  q.push("api_key=" + encodeURIComponent(TMDB_KEY));
  q.push("language=" + encodeURIComponent(TMDB_LANG));
  for (var k in params) {
    if (params[k] != null && params[k] !== "") q.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
  }
  var url = "https://api.themoviedb.org/3" + path + "?" + q.join("&");
  try {
    var res = await kino.fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      timeoutMs: 12000,
    });
    if (!res || !res.ok) return null;
    var body = res.json();
    if (body && typeof body.then === "function") body = await body;
    return body;
  } catch (e) {
    kino.log("tmdbGet: " + ((e && e.message) || e));
    return null;
  }
}

function tmdbImg(path, size) {
  if (!path) return null;
  if (String(path).indexOf("http") === 0) return path;
  return TMDB_IMG + (size || "w500") + path;
}

function cleanTitleForTmdb(title) {
  return String(title || "")
    .replace(/[-_]+/g, " ")
    .replace(/\(\d{4}\)/g, "")
    .replace(/\b(latino|castellano|subtitulado|sub\s*esp|online|gratis|hd|fullhd|1080p|720p|4k|gnula|gnulahd)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function tmdbFind(title, kind, year) {
  var q = cleanTitleForTmdb(title);
  if (!q || q.length < 2) return null;
  var kindL = String(kind || "").toLowerCase();
  var isMovie = kindL === "movie" || kindL === "pelicula" || kindL === "película" || kindL === "peliculas";
  var isTv = kindL === "series" || kindL === "tv" || kindL === "show" || kindL === "anime";

  function pick(results, preferMovie) {
    if (!results || !results.length) return null;
    var r = results[0];
    var movie = preferMovie;
    if (r.media_type === "movie") movie = true;
    if (r.media_type === "tv") movie = false;
    if (r.title && !r.name) movie = true;
    if (r.name && !r.title) movie = false;
    return {
      tmdbId: r.id,
      isMovie: movie,
      title: r.title || r.name || q,
      overview: r.overview || "",
      poster: tmdbImg(r.poster_path, "w500"),
      backdrop: tmdbImg(r.backdrop_path, "w1280"),
      year: String(r.release_date || r.first_air_date || "").slice(0, 4) || null,
      rating: r.vote_average != null ? Math.round(r.vote_average * 10) / 10 : null,
    };
  }

  async function search(path, params) {
    var data = await tmdbGet(path, params);
    return data && data.results ? data.results : [];
  }

  var yearStr = year ? String(year).replace(/\D/g, "").slice(0, 4) : "";
  var tries = [];

  if (isMovie || !isTv) {
    var pm = { query: q, include_adult: "false" };
    if (yearStr) pm.primary_release_year = yearStr;
    tries.push(search("/search/movie", pm).then(function (r) { return pick(r, true); }));
  }
  if (isTv || !isMovie) {
    var pt = { query: q, include_adult: "false" };
    if (yearStr) pt.first_air_date_year = yearStr;
    tries.push(search("/search/tv", pt).then(function (r) { return pick(r, false); }));
  }
  // multi sin año
  tries.push(search("/search/multi", { query: q, include_adult: "false" }).then(function (r) {
    r = (r || []).filter(function (x) { return x.media_type === "movie" || x.media_type === "tv"; });
    return pick(r, isMovie);
  }));

  // sin año si había año
  if (yearStr) {
    tries.push(search(isMovie && !isTv ? "/search/movie" : "/search/tv", { query: q, include_adult: "false" }).then(function (r) {
      return pick(r, isMovie && !isTv);
    }));
  }

  for (var i = 0; i < tries.length; i++) {
    try {
      var hit = await tries[i];
      if (hit && (hit.poster || hit.backdrop || hit.overview)) return hit;
      if (hit) return hit;
    } catch (e) {}
  }
  return null;
}

async function tmdbTvDetail(tmdbId) {
  if (!tmdbId) return null;
  return tmdbGet("/tv/" + tmdbId, {});
}

async function tmdbSeasonEpisodes(tmdbId, seasonNum) {
  if (!tmdbId) return [];
  var data = await tmdbGet("/tv/" + tmdbId + "/season/" + seasonNum, {});
  if (!data || !Array.isArray(data.episodes)) return [];
  return data.episodes.map(function (ep) {
    return {
      number: ep.episode_number,
      title: ep.name || ("Episodio " + ep.episode_number),
      overview: ep.overview || "",
      still: tmdbImg(ep.still_path, "w300"),
      airDate: ep.air_date || null,
      runtime: ep.runtime || null,
    };
  });
}

function absUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (u.indexOf("//") === 0) return "https:" + u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) === "/") return BASE_URL + u;
  return BASE_URL + "/" + u;
}


function gnrdUnpack(s) {
  try {
    var b = atob(s);
    var k = [103, 78, 55, 100];
    var a = [];
    for (var i = 0; i < b.length; i++) a.push(b.charCodeAt(i) ^ k[i & 3]);
    var str = "";
    for (var j = 0; j < a.length; j++) str += String.fromCharCode(a[j]);
    // utf-8 decode simple
    try {
      if (typeof TextDecoder !== "undefined") {
        str = new TextDecoder("utf-8").decode(Uint8Array.from(a));
      }
    } catch (e) {}
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function cleanId(raw) {
  var s = String(raw || "");
  try { s = decodeURIComponent(s); } catch (e) {}
  var id = s
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._~-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
  if (!id) id = "item-" + Math.abs(hashCode(raw));
  return id;
}

function hashCode(str) {
  var hash = 0;
  str = String(str || "");
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function parseCards(html, defaultKind) {
  defaultKind = defaultKind || "movie";
  var cards = [];
  var cardRegex = /<a class="gnrd-card" href="([^"]+)" title="([^"]+)">([\s\S]*?)<\/a>/g;
  var match;
  while ((match = cardRegex.exec(String(html || ""))) !== null) {
    var href = match[1];
    var title = match[2].trim();
    var body = match[3];
    var slugMatch = href.match(/\/ver\/([^\/]+)/);
    var rawSlug = slugMatch ? slugMatch[1] : href.replace(/^https?:\/\/[^\/]+\//, "");
    var id = cleanId(rawSlug);
    var imgMatch = body.match(/<img[^>]+src="([^"]+)"/i);
    var poster = imgMatch ? imgMatch[1] : "";
    var ratingMatch = body.match(/class="gnrd-rating"[^>]*>[^0-9]*([0-9.]+)/i);
    var rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;
    var yearMatch = body.match(/<span>((?:19|20)\d{2})<\/span>/);
    var year = yearMatch ? yearMatch[1] : undefined;
    var badges = [];
    var langRe = /class="gnrd-lang"[^>]*>([^<]+)<\/span>/g;
    var lm;
    while ((lm = langRe.exec(body))) {
      var l = lm[1].trim();
      if (l && badges.indexOf(l) < 0) badges.push(l);
    }
    var kind = defaultKind;
    if (/serie/i.test(body) || href.indexOf("/ver/series/") >= 0) kind = "series";
    else if (href.indexOf("/ver/anime/") >= 0) kind = "series";
    else if (href.indexOf("/ver/peliculas/") >= 0) kind = "movie";
    cards.push({
      id: id,
      ref: absUrl(href),
      title: title,
      kind: kind,
      type: kind === "movie" ? "movie" : "series",
      poster: absUrl(poster),
      rating: rating,
      year: year,
      badges: badges.slice(0, 3),
    });
  }
  return cards;
}

function parseHeroSlides(html) {
  var slides = [];
  var slideRegex = /<div class="gnrd-slide[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  var match;
  while ((match = slideRegex.exec(String(html || ""))) !== null) {
    var block = match[1];
    var bgMatch = block.match(/background-image:url\('([^']+)'\)/i);
    if (!bgMatch) bgMatch = block.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
    var backdrop = bgMatch ? bgMatch[1] : "";
    var logoMatch = block.match(/<img class="gnrd-hero-logo" src="([^"]+)" alt="([^"]+)"/i);
    var logo = logoMatch ? logoMatch[1] : "";
    var title = logoMatch ? logoMatch[2].trim() : "";
    var playMatch = block.match(/href="([^"]+)"[^>]*>[\s\S]*?Reproducir/i);
    if (!playMatch) playMatch = block.match(/href="([^"]*\/ver\/[^"]+)"/i);
    if (!playMatch) continue;
    var ref = playMatch[1];
    if (ref.charAt(0) === "/") ref = BASE_URL + ref;
    if (!title) {
      var sm = ref.match(/\/ver\/([^\/\?#]+)/);
      title = sm ? sm[1].replace(/-/g, " ") : "Destacado";
    }
    var synMatch = block.match(/<p class="gnrd-hero-syn">([\s\S]*?)<\/p>/i);
    var overview = synMatch ? synMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    var yearMatch = block.match(/<span>((?:19|20)\d{2})<\/span>/);
    var year = yearMatch ? yearMatch[1] : undefined;
    var ratingMatch = block.match(/class="gnrd-m-rating"[^>]*>[^0-9]*([0-9.]+)/i);
    var rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;
    var isSeries = /serie/i.test(block) || /temporada/i.test(block);
    var kind = isSeries ? "series" : "movie";
    var slugMatch = ref.match(/\/ver\/([^\/\?#]+)/);
    var id = cleanId(slugMatch ? slugMatch[1] : ref);
    slides.push({
      id: id,
      ref: absUrl(ref),
      title: title,
      kind: kind,
      type: kind,
      backdrop: absUrl(backdrop),
      poster: absUrl(backdrop || logo),
      logo: absUrl(logo),
      overview: overview,
      year: year,
      rating: rating,
    });
  }
  return slides;
}

async function fetchHtml(url) {
  var res = await kino.fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: BASE_URL + "/" },
  });
  if (!res.ok) throw kino.error("unavailable", "HTTP " + res.status);
  return res.text();
}

async function fetchJson(url, referer) {
  var res = await kino.fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: referer || BASE_URL + "/",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function resolveVidara(url) {
  var m = String(url || "").match(/(?:vidara\.[a-z]+|vidaraa\.[a-z]+)\/(?:e\/)?([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  var filecode = m[1];
  try {
    var res = await kino.fetch("https://vidara.to/api/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Referer: "https://vidara.to/e/" + filecode,
        Origin: "https://vidara.to",
      },
      body: JSON.stringify({ filecode: filecode, device: "desktop", codecs: ["h264", "aac"] }),
    });
    if (!res.ok) return null;
    var data = res.json();
    if (data && data.streaming_url) {
      return {
        url: data.streaming_url,
        mime: "application/x-mpegURL",
        headers: { Referer: "https://vidara.to/e/" + filecode, "User-Agent": USER_AGENT },
      };
    }
  } catch (e) {}
  return null;
}

async function resolveSavefiles(url) {
  var m = String(url || "").match(/savefiles\.com\/(?:e\/)?([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  var filecode = m[1];
  try {
    var bodyStr =
      "op=embed&file_code=" +
      encodeURIComponent(filecode) +
      "&auto=1&referer=" +
      encodeURIComponent(BASE_URL + "/");
    var res = await kino.fetch("https://savefiles.com/dl", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        Referer: "https://savefiles.com/e/" + filecode,
        Origin: "https://savefiles.com",
      },
      body: bodyStr,
    });
    if (!res.ok) return null;
    var html = res.text();
    var m3u8Match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
    if (m3u8Match) {
      return {
        url: m3u8Match[0],
        mime: "application/x-mpegURL",
        headers: { Referer: "https://savefiles.com/e/" + filecode, "User-Agent": USER_AGENT },
      };
    }
  } catch (e) {}
  return null;
}

// ---- Kino catalog API ----
async function kinoSearch(query) {
  var q = typeof query === "string" ? query : (query && query.q) || "";
  if (!String(q).trim()) return [];
  var html = await fetchHtml(BASE_URL + "/?s=" + encodeURIComponent(String(q).trim()));
  return parseCards(html);
}

async function kinoHome() {
  var homeHtml = await fetchHtml(BASE_URL + "/");
  var heroSlides = parseHeroSlides(homeHtml);
  var pages = await Promise.all([
    fetchHtml(BASE_URL + "/ver/peliculas/").catch(function () { return ""; }),
    fetchHtml(BASE_URL + "/ver/series/").catch(function () { return ""; }),
    fetchHtml(BASE_URL + "/ver/anime/").catch(function () { return ""; }),
    fetchHtml(BASE_URL + "/genres/terror/").catch(function () { return ""; }),
    fetchHtml(BASE_URL + "/genres/accion/").catch(function () { return ""; }),
  ]);
  var movieItems = parseCards(pages[0], "movie");
  var seriesItems = parseCards(pages[1], "series");
  var animeItems = parseCards(pages[2], "series");
  var terrorItems = parseCards(pages[3], "movie");
  var accionItems = parseCards(pages[4], "movie");
  var rows = [];
  if (heroSlides.length) {
    rows.push({
      id: "featured",
      title: "Destacados",
      ref: "destacados",
      items: heroSlides,
    });
  }
  rows.push({ id: "movies", title: "Películas Recientes", ref: "peliculas", items: movieItems });
  rows.push({ id: "series", title: "Series Recientes", ref: "series", items: seriesItems });
  rows.push({ id: "anime", title: "Anime Reciente", ref: "anime", items: animeItems });
  if (terrorItems.length) rows.push({ id: "terror", title: "Terror · Top Semanal", ref: "genres/terror", items: terrorItems });
  if (accionItems.length) rows.push({ id: "accion", title: "Acción · Top Semanal", ref: "genres/accion", items: accionItems });
  // Enriquecer con TMDB solo tarjetas sin poster (máx 12, no bloquea el home entero)
  try {
    var need = [];
    rows.forEach(function (row) {
      (row.items || []).forEach(function (it) {
        if (it && !it.poster && need.length < 12) need.push(it);
      });
    });
    for (var ni = 0; ni < need.length; ni++) {
      try {
        var tm = await tmdbFind(need[ni].title, need[ni].kind || need[ni].type, need[ni].year);
        if (tm) {
          if (tm.poster) need[ni].poster = tm.poster;
          if (tm.backdrop) need[ni].backdrop = tm.backdrop;
          if (tm.overview) need[ni].overview = tm.overview;
          if (tm.year && !need[ni].year) need[ni].year = tm.year;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return rows;
}

async function kinoBrowse(ref, cursor) {
  var page = parseInt(cursor || "1", 10) || 1;
  var url = "";
  var defaultKind = "movie";
  ref = String(ref || "");
  if (ref === "peliculas" || ref === "movies") {
    url = BASE_URL + "/ver/peliculas/?page=" + page;
    defaultKind = "movie";
  } else if (ref === "series") {
    url = BASE_URL + "/ver/series/?page=" + page;
    defaultKind = "series";
  } else if (ref === "anime") {
    url = BASE_URL + "/ver/anime/?page=" + page;
    defaultKind = "series";
  } else if (ref === "destacados" || ref === "featured") {
    var homeHtml = await fetchHtml(BASE_URL + "/");
    return { items: parseHeroSlides(homeHtml), next: null };
  } else if (ref.indexOf("genres/") === 0 || ref.indexOf("generos/") === 0) {
    var slug = ref.replace(/^(genres|generos)\//, "").replace(/\/$/, "");
    url = BASE_URL + "/genres/" + slug + "/?page=" + page;
  } else if (ref.indexOf("http") === 0) {
    url = ref.indexOf("?") >= 0 ? ref + "&page=" + page : ref + "?page=" + page;
  } else {
    url = BASE_URL + "/genres/" + ref + "/?page=" + page;
  }
  var html = await fetchHtml(url);
  var items = parseCards(html, defaultKind);
  var hasNext = html.indexOf("page=" + (page + 1)) >= 0 || items.length >= 40;
  return { items: items, next: hasNext ? String(page + 1) : null };
}

async function kinoEpisodes(ref) {
  ref = String(ref || "");
  if (ref.indexOf("http") !== 0 && ref.charAt(0) === "/") ref = BASE_URL + ref;
  if (ref.indexOf("http") !== 0) ref = BASE_URL + "/ver/" + ref.replace(/^\/?ver\//, "");
  var html = await fetchHtml(ref);
  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  var seriesTitle = h1 ? h1[1].replace(/<[^>]+>/g, "").trim() : "Serie";
  var poster = "";
  var og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og) poster = og[1];
  var overview = "";
  var ogd = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogd) overview = ogd[1];

  var cardRegex = /<a[^>]*class="[^"]*gnrd-epc[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  var episodes = [];
  var match;
  while ((match = cardRegex.exec(html)) !== null) {
    var fullTag = match[0];
    var innerHtml = match[1];
    var hrefMatch = fullTag.match(/href="([^"]+)"/);
    if (!hrefMatch) continue;
    var href = absUrl(hrefMatch[1]);
    var sMatch = fullTag.match(/data-s="([^"]+)"/);
    var eMatch = fullTag.match(/data-e="([^"]+)"/);
    var idMatch = fullTag.match(/data-id="([^"]+)"/);
    var tMatch = fullTag.match(/data-t="([^"]+)"/);
    var sNum = sMatch ? parseInt(sMatch[1], 10) : 1;
    var eNum = eMatch ? parseInt(eMatch[1], 10) : 1;
    var pid = idMatch ? idMatch[1] : "";
    var tok = tMatch ? tMatch[1] : "";
    var titleMatch = innerHtml.match(/class="[^"]*gnrd-epc-title[^"]*"[^>]*>([\s\S]*?)<\//i);
    var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Episodio " + eNum;
    var imgMatch = innerHtml.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
    var still = imgMatch ? imgMatch[1] : "";
    var epRef = pid && tok ? href + (href.indexOf("?") >= 0 ? "&" : "?") + "id=" + pid + "&t=" + encodeURIComponent(tok) : href;
    episodes.push({ season: sNum, number: eNum, ref: epRef, title: title, still: still });
  }
  episodes.sort(function (a, b) {
    return a.season - b.season || a.number - b.number;
  });
  return {
    series: { title: seriesTitle, poster: poster, overview: overview },
    episodes: episodes,
  };
}

async function kinoResolve(ref) {
  ref = String(ref || "");
  if (ref.indexOf("http") !== 0 && ref.charAt(0) === "/") ref = BASE_URL + ref;
  var pid = null;
  var tok = null;
  try {
    var q = ref.split("?")[1] || "";
    q.split("&").forEach(function (p) {
      var kv = p.split("=");
      if (kv[0] === "id") pid = decodeURIComponent(kv[1] || "");
      if (kv[0] === "t") tok = decodeURIComponent(kv[1] || "");
    });
  } catch (e) {}
  if (!pid || !tok) {
    var html = await fetchHtml(ref);
    var pidMatch = html.match(/_gnrdPid\s*=\s*(\d+)/);
    var tokMatch = html.match(/_gnrdTok\s*=\s*"([^"]+)"/);
    if (pidMatch) pid = pidMatch[1];
    if (tokMatch) tok = tokMatch[1];
  }
  if (!pid || !tok) throw new Error("No se pudo obtener el reproductor");

  var apiUrl = BASE_URL + "/wp-json/gnrd/v1/player?id=" + pid + "&t=" + encodeURIComponent(tok);
  var data = await fetchJson(apiUrl, ref);
  if (!data || !data.p) throw new Error("Respuesta de player vacía");
  var unpacked = gnrdUnpack(data.p);
  if (!unpacked || !Array.isArray(unpacked.langs)) throw new Error("No hay idiomas/servidores");

  var preferred = "latino";
  try {
    preferred = String((kino.config && (kino.config.preferredLang || kino.config.server)) || "latino");
  } catch (e) {}

  var sortedLangs = unpacked.langs.slice().sort(function (a, b) {
    var aLabel = String((a && a.label) || "").toLowerCase();
    var bLabel = String((b && b.label) || "").toLowerCase();
    function score(lab) {
      if (preferred === "latino" && lab.indexOf("lat") >= 0) return 0;
      if (preferred === "castellano" && (lab.indexOf("cast") >= 0 || lab.indexOf("esp") >= 0)) return 0;
      if (preferred === "subtitulado" && lab.indexOf("sub") >= 0) return 0;
      return 1;
    }
    return score(aLabel) - score(bLabel);
  });

  var servers = [];
  var embeds = [];
  for (var li = 0; li < sortedLangs.length; li++) {
    var l = sortedLangs[li];
    if (!l || !Array.isArray(l.servers)) continue;
    for (var si = 0; si < l.servers.length; si++) {
      var s = l.servers[si];
      var src = (s && s.src) || "";
      if (!src) continue;
      src = absUrl(src);
      var streamObj = null;
      try {
        if (/vidara/i.test(src)) streamObj = await resolveVidara(src);
        else if (/savefiles/i.test(src)) streamObj = await resolveSavefiles(src);
      } catch (e) {}
      if (streamObj && streamObj.url) {
        servers.push({
          name: (s.title || "Servidor") + " (" + (l.label || "Video") + ")",
          url: streamObj.url,
          quality: streamObj.mime && String(streamObj.mime).indexOf("mpegURL") >= 0 ? "HLS" : "HD",
          isHls: !!(streamObj.mime && String(streamObj.mime).indexOf("mpegURL") >= 0) || /\.m3u8/i.test(streamObj.url),
          headers: streamObj.headers || {},
        });
      } else if (/^https?:\/\//i.test(src)) {
        embeds.push({
          name: (s.title || "Embed") + " (" + (l.label || "Video") + ")",
          url: src,
          quality: l.label || "HD",
          isHls: /\.m3u8/i.test(src),
          headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT },
        });
      }
    }
  }
  // Si no hubo stream directo, devolver embeds (algunos players los abren)
  if (!servers.length && embeds.length) return embeds;
  return servers;
}

// ---- Map to app ContentItem / HomeRow ----
function mapItem(it) {
  if (!it) return null;
  var kind = String(it.kind || it.type || "movie").toLowerCase();
  var type = kind === "movie" || kind === "pelicula" || kind === "película" ? "movie" : "series";
  var id = String(it.id || "");
  if (!id && it.ref) {
    var m = String(it.ref).match(/\/ver\/([^\/\?#]+)/);
    id = cleanId(m ? m[1] : it.ref);
  }
  var out = {
    id: id,
    title: String(it.title || id),
    type: type,
  };
  if (it.poster) out.poster = it.poster;
  if (it.backdrop) out.backdrop = it.backdrop;
  if (it.logo) out.logo = it.logo;
  if (it.overview) out.overview = it.overview;
  if (it.year) out.year = String(it.year);
  if (it.rating != null) out.rating = it.rating;
  if (it.badges && it.badges.length) out.genres = it.badges;
  out.extra = { ref: it.ref || (BASE_URL + "/ver/" + id), kind: kind };
  return out;
}

function mapRow(row, asHero) {
  var items = (row.items || []).map(mapItem).filter(Boolean);
  var r = {
    id: String(row.id || row.ref || row.title || "row"),
    title: String(row.title || row.id || "Catálogo"),
    items: items,
  };
  if (asHero || row.id === "featured" || row.ref === "destacados") {
    r.type = "hero";
    r.imageStyle = "backdrop";
  } else {
    r.type = "row";
  }
  if (row.ref) r.catalogId = row.ref;
  return r;
}

// ========== APP EXPORTS ==========

async function getHome(opts) {
  opts = opts || {};
  if (opts.structureOnly || opts.lightweight) {
    return [
      { id: "featured", title: "Destacados", type: "hero", items: [] },
      { id: "movies", title: "Películas Recientes", type: "row", items: [] },
      { id: "series", title: "Series Recientes", type: "row", items: [] },
      { id: "anime", title: "Anime Reciente", type: "row", items: [] },
      { id: "terror", title: "Terror · Top Semanal", type: "row", items: [] },
      { id: "accion", title: "Acción · Top Semanal", type: "row", items: [] },
    ];
  }
  // Carga de una fila (progressive)
  if (opts.rowId || opts.catalogId || opts.id) {
    var rid = String(opts.rowId || opts.catalogId || opts.id);
    var page = Number(opts.page || 1) || 1;
    if (rid === "featured" || rid === "destacados") {
      var h = await fetchHtml(BASE_URL + "/");
      return {
        id: "featured",
        title: "Destacados",
        type: "hero",
        items: parseHeroSlides(h).map(mapItem).filter(Boolean),
        hasMore: false,
      };
    }
    var br = await kinoBrowse(rid, String(page));
    return {
      id: rid,
      title: rid,
      items: (br.items || []).map(mapItem).filter(Boolean),
      hasMore: !!br.next,
    };
  }
  var rows = await kinoHome();
  return rows.map(function (r, i) {
    return mapRow(r, i === 0 && (r.id === "featured" || r.ref === "destacados"));
  });
}

async function getNews() {
  // Novedades del launcher: mismos destacados (hero del home)
  try {
    var h = await fetchHtml(BASE_URL + "/");
    return parseHeroSlides(h).map(mapItem).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function appSearch(query) {
  var q = typeof query === "string" ? query : (query && (query.q || query.query)) || "";
  try {
    var items = await kinoSearch(q);
    return (items || []).map(mapItem).filter(Boolean);
  } catch (e) {
    kino.log("search: " + ((e && e.message) || e));
    return [];
  }
}


var DISCOVER_GENRES = [
  { id: "", value: "", label: "Todos", title: "Todos" },
  { id: "genres/drama", value: "genres/drama", label: "Drama", title: "Drama" },
  { id: "genres/accion", value: "genres/accion", label: "Acción", title: "Acción" },
  { id: "genres/comedia", value: "genres/comedia", label: "Comedia", title: "Comedia" },
  { id: "genres/terror", value: "genres/terror", label: "Terror", title: "Terror" },
  { id: "genres/romance", value: "genres/romance", label: "Romance", title: "Romance" },
  { id: "genres/suspenso", value: "genres/suspenso", label: "Suspenso", title: "Suspenso" },
  { id: "genres/ciencia-ficcion", value: "genres/ciencia-ficcion", label: "Ciencia ficción", title: "Ciencia ficción" },
  { id: "genres/animacion", value: "genres/animacion", label: "Animación", title: "Animación" },
  { id: "genres/aventura", value: "genres/aventura", label: "Aventura", title: "Aventura" },
  { id: "genres/crimen", value: "genres/crimen", label: "Crimen", title: "Crimen" },
  { id: "genres/familia", value: "genres/familia", label: "Familia", title: "Familia" },
  { id: "genres/fantasia", value: "genres/fantasia", label: "Fantasía", title: "Fantasía" },
  { id: "genres/misterio", value: "genres/misterio", label: "Misterio", title: "Misterio" },
  { id: "genres/thriller", value: "genres/thriller", label: "Thriller", title: "Thriller" },
  { id: "genres/documental", value: "genres/documental", label: "Documental", title: "Documental" },
  { id: "genres/historia", value: "genres/historia", label: "Historia", title: "Historia" },
  { id: "genres/musica", value: "genres/musica", label: "Música", title: "Música" },
  { id: "genres/belica", value: "genres/belica", label: "Bélica", title: "Bélica" },
  { id: "genres/oeste", value: "genres/oeste", label: "Oeste", title: "Oeste" },
  { id: "genres/telenovela", value: "genres/telenovela", label: "Telenovela", title: "Telenovela" },
  { id: "genres/reality", value: "genres/reality", label: "Reality", title: "Reality" },
  { id: "genres/ninos", value: "genres/ninos", label: "Niños", title: "Niños" },
  { id: "genres/pelicula-de-tv", value: "genres/pelicula-de-tv", label: "Película de TV", title: "Película de TV" },
  { id: "genres/accion-y-aventura", value: "genres/accion-y-aventura", label: "Acción y aventura", title: "Acción y aventura" },
  { id: "genres/ciencia-ficcion-y-fantasia", value: "genres/ciencia-ficcion-y-fantasia", label: "Ciencia ficción y fantasía", title: "Ciencia ficción y fantasía" },
  { id: "genres/guerra-y-politica", value: "genres/guerra-y-politica", label: "Guerra y política", title: "Guerra y política" }
];
var DISCOVER_TAGS = [
  { id: "tag/adolescence", value: "tag/adolescence", label: "Tag: Adolescencia", title: "Adolescencia" },
  { id: "tag/adult-animation", value: "tag/adult-animation", label: "Tag: Animación adulta", title: "Animación adulta" },
  { id: "tag/airplane", value: "tag/airplane", label: "Tag: Aviones", title: "Aviones" },
  { id: "tag/alcoholism", value: "tag/alcoholism", label: "Tag: Alcoholismo", title: "Alcoholismo" },
  { id: "tag/alien-invasion", value: "tag/alien-invasion", label: "Tag: Invasión alienígena", title: "Invasión alienígena" },
  { id: "tag/amistad", value: "tag/amistad", label: "Tag: Amistad", title: "Amistad" },
  { id: "tag/animals", value: "tag/animals", label: "Tag: Animales", title: "Animales" },
  { id: "tag/anthology", value: "tag/anthology", label: "Tag: Antología", title: "Antología" },
  { id: "tag/anti-hero", value: "tag/anti-hero", label: "Tag: Antiheroe", title: "Antiheroe" },
  { id: "tag/apocalypse", value: "tag/apocalypse", label: "Tag: Apocalipsis", title: "Apocalipsis" },
  { id: "tag/autism", value: "tag/autism", label: "Tag: Autismo", title: "Autismo" },
  { id: "tag/based-on-comic", value: "tag/based-on-comic", label: "Tag: Basado en cómic", title: "Basado en cómic" },
  { id: "tag/based-on-true-story", value: "tag/based-on-true-story", label: "Tag: Basado en hechos reales", title: "Basado en hechos reales" },
  { id: "tag/based-on-video-game", value: "tag/based-on-video-game", label: "Tag: Basado en videojuego", title: "Basado en videojuego" },
  { id: "tag/biography", value: "tag/biography", label: "Tag: Biografía", title: "Biografía" },
  { id: "tag/black-and-white", value: "tag/black-and-white", label: "Tag: Blanco y negro", title: "Blanco y negro" },
  { id: "tag/boxing", value: "tag/boxing", label: "Tag: Boxeo", title: "Boxeo" },
  { id: "tag/buddy-comedy", value: "tag/buddy-comedy", label: "Tag: Comedia de amigos", title: "Comedia de amigos" },
  { id: "tag/buddy-cop", value: "tag/buddy-cop", label: "Tag: Policías compañeros", title: "Policías compañeros" },
  { id: "tag/china", value: "tag/china", label: "Tag: China", title: "China" },
  { id: "tag/christian-film", value: "tag/christian-film", label: "Tag: Cine cristiano", title: "Cine cristiano" },
  { id: "tag/christmas", value: "tag/christmas", label: "Tag: Navidad", title: "Navidad" },
  { id: "tag/coming-of-age", value: "tag/coming-of-age", label: "Tag: Crecimiento personal", title: "Crecimiento personal" },
  { id: "tag/cyberpunk", value: "tag/cyberpunk", label: "Tag: Cyberpunk", title: "Cyberpunk" },
  { id: "tag/dark-comedy", value: "tag/dark-comedy", label: "Tag: Comedia negra", title: "Comedia negra" },
  { id: "tag/deportes", value: "tag/deportes", label: "Tag: Deportes", title: "Deportes" },
  { id: "tag/detective", value: "tag/detective", label: "Tag: Detective", title: "Detective" },
  { id: "tag/disability", value: "tag/disability", label: "Tag: Discapacidad", title: "Discapacidad" },
  { id: "tag/disaster", value: "tag/disaster", label: "Tag: Desastre", title: "Desastre" },
  { id: "tag/documentary", value: "tag/documentary", label: "Tag: Documental", title: "Documental" },
  { id: "tag/dragon", value: "tag/dragon", label: "Tag: Dragones", title: "Dragones" },
  { id: "tag/drugs", value: "tag/drugs", label: "Tag: Drogas", title: "Drogas" },
  { id: "tag/dystopia", value: "tag/dystopia", label: "Tag: Distopía", title: "Distopía" },
  { id: "tag/epic", value: "tag/epic", label: "Tag: Épica", title: "Épica" },
  { id: "tag/escape", value: "tag/escape", label: "Tag: Escape", title: "Escape" },
  { id: "tag/ex-con", value: "tag/ex-con", label: "Tag: Ex convictos", title: "Ex convictos" },
  { id: "tag/exorcism", value: "tag/exorcism", label: "Tag: Exorcismo", title: "Exorcismo" },
  { id: "tag/fairy-tale", value: "tag/fairy-tale", label: "Tag: Cuento de hadas", title: "Cuento de hadas" },
  { id: "tag/film-in-film", value: "tag/film-in-film", label: "Tag: Cine dentro del cine", title: "Cine dentro del cine" },
  { id: "tag/forest", value: "tag/forest", label: "Tag: Bosque", title: "Bosque" },
  { id: "tag/found-footage", value: "tag/found-footage", label: "Tag: Found Footage", title: "Found Footage" },
  { id: "tag/gangster", value: "tag/gangster", label: "Tag: Gangster", title: "Gangster" },
  { id: "tag/gay-theme", value: "tag/gay-theme", label: "Tag: Temática gay", title: "Temática gay" },
  { id: "tag/gore", value: "tag/gore", label: "Tag: Gore", title: "Gore" },
  { id: "tag/gothic", value: "tag/gothic", label: "Tag: Gothic", title: "Gothic" },
  { id: "tag/hacker", value: "tag/hacker", label: "Tag: Hacker", title: "Hacker" },
  { id: "tag/halloween", value: "tag/halloween", label: "Tag: Halloween", title: "Halloween" },
  { id: "tag/haunted-house", value: "tag/haunted-house", label: "Tag: Haunted House", title: "Haunted House" },
  { id: "tag/heist", value: "tag/heist", label: "Tag: Heist", title: "Heist" },
  { id: "tag/hitman", value: "tag/hitman", label: "Tag: Hitman", title: "Hitman" },
  { id: "tag/hong-kong", value: "tag/hong-kong", label: "Tag: Hong Kong", title: "Hong Kong" },
  { id: "tag/independent-film", value: "tag/independent-film", label: "Tag: Independent Film", title: "Independent Film" },
  { id: "tag/india", value: "tag/india", label: "Tag: India", title: "India" },
  { id: "tag/island", value: "tag/island", label: "Tag: Island", title: "Island" },
  { id: "tag/japan", value: "tag/japan", label: "Tag: Japan", title: "Japan" },
  { id: "tag/journalist", value: "tag/journalist", label: "Tag: Journalist", title: "Journalist" },
  { id: "tag/kidnapping", value: "tag/kidnapping", label: "Tag: Secuestro", title: "Secuestro" },
  { id: "tag/lawyer", value: "tag/lawyer", label: "Tag: Lawyer", title: "Lawyer" },
  { id: "tag/lgbt", value: "tag/lgbt", label: "Tag: LGBT", title: "LGBT" },
  { id: "tag/martial-arts", value: "tag/martial-arts", label: "Tag: Artes marciales", title: "Artes marciales" },
  { id: "tag/mockumentary", value: "tag/mockumentary", label: "Tag: Mockumentary", title: "Mockumentary" },
  { id: "tag/musical", value: "tag/musical", label: "Tag: Musical", title: "Musical" },
  { id: "tag/nature", value: "tag/nature", label: "Tag: Nature", title: "Nature" },
  { id: "tag/nazi", value: "tag/nazi", label: "Tag: Nazi", title: "Nazi" },
  { id: "tag/neo-noir", value: "tag/neo-noir", label: "Tag: Neo Noir", title: "Neo Noir" },
  { id: "tag/parody", value: "tag/parody", label: "Tag: Parody", title: "Parody" },
  { id: "tag/police", value: "tag/police", label: "Tag: Police", title: "Police" },
  { id: "tag/politics", value: "tag/politics", label: "Tag: Politics", title: "Politics" },
  { id: "tag/possession", value: "tag/possession", label: "Tag: Possession", title: "Possession" },
  { id: "tag/post-apocalyptic-future", value: "tag/post-apocalyptic-future", label: "Tag: Post Apocalyptic Future", title: "Post Apocalyptic Future" },
  { id: "tag/prison", value: "tag/prison", label: "Tag: Prison", title: "Prison" },
  { id: "tag/psychological-thriller", value: "tag/psychological-thriller", label: "Tag: Psychological Thriller", title: "Psychological Thriller" },
  { id: "tag/psychopath", value: "tag/psychopath", label: "Tag: Psychopath", title: "Psychopath" },
  { id: "tag/racism", value: "tag/racism", label: "Tag: Racism", title: "Racism" },
  { id: "tag/religion", value: "tag/religion", label: "Tag: Religion", title: "Religion" },
  { id: "tag/revenge", value: "tag/revenge", label: "Tag: Venganza", title: "Venganza" },
  { id: "tag/road-movie", value: "tag/road-movie", label: "Tag: Road Movie", title: "Road Movie" },
  { id: "tag/road-trip", value: "tag/road-trip", label: "Tag: Road Trip", title: "Road Trip" },
  { id: "tag/robbery", value: "tag/robbery", label: "Tag: Robbery", title: "Robbery" },
  { id: "tag/romcom", value: "tag/romcom", label: "Tag: Romcom", title: "Romcom" },
  { id: "tag/santa-claus", value: "tag/santa-claus", label: "Tag: Santa Claus", title: "Santa Claus" },
  { id: "tag/satire", value: "tag/satire", label: "Tag: Satire", title: "Satire" },
  { id: "tag/secret-agent", value: "tag/secret-agent", label: "Tag: Secret Agent", title: "Secret Agent" },
  { id: "tag/serial-killer", value: "tag/serial-killer", label: "Tag: Asesino en serie", title: "Asesino en serie" },
  { id: "tag/slasher", value: "tag/slasher", label: "Tag: Slasher", title: "Slasher" },
  { id: "tag/slavery", value: "tag/slavery", label: "Tag: Slavery", title: "Slavery" },
  { id: "tag/social-media", value: "tag/social-media", label: "Tag: Social Media", title: "Social Media" },
  { id: "tag/south-korea", value: "tag/south-korea", label: "Tag: South Korea", title: "South Korea" },
  { id: "tag/spy", value: "tag/spy", label: "Tag: Spy", title: "Spy" },
  { id: "tag/steampunk", value: "tag/steampunk", label: "Tag: Steampunk", title: "Steampunk" },
  { id: "tag/stop-motion", value: "tag/stop-motion", label: "Tag: Stop Motion", title: "Stop Motion" },
  { id: "tag/superheroe", value: "tag/superheroe", label: "Tag: Superheroe", title: "Superheroe" },
  { id: "tag/surrealism", value: "tag/surrealism", label: "Tag: Surrealism", title: "Surrealism" },
  { id: "tag/survival", value: "tag/survival", label: "Tag: Survival", title: "Survival" },
  { id: "tag/suspense", value: "tag/suspense", label: "Tag: Suspense", title: "Suspense" },
  { id: "tag/sword-and-sorcery", value: "tag/sword-and-sorcery", label: "Tag: Sword And Sorcery", title: "Sword And Sorcery" },
  { id: "tag/teacher", value: "tag/teacher", label: "Tag: Teacher", title: "Teacher" },
  { id: "tag/terrorism", value: "tag/terrorism", label: "Tag: Terrorism", title: "Terrorism" },
  { id: "tag/thailand", value: "tag/thailand", label: "Tag: Thailand", title: "Thailand" },
  { id: "tag/torture", value: "tag/torture", label: "Tag: Torture", title: "Torture" },
  { id: "tag/vampire", value: "tag/vampire", label: "Tag: Vampiros", title: "Vampiros" },
  { id: "tag/viaje-en-el-tiempo", value: "tag/viaje-en-el-tiempo", label: "Tag: Viaje En El Tiempo", title: "Viaje En El Tiempo" },
  { id: "tag/virus", value: "tag/virus", label: "Tag: Virus", title: "Virus" },
  { id: "tag/wedding", value: "tag/wedding", label: "Tag: Wedding", title: "Wedding" },
  { id: "tag/werewolf", value: "tag/werewolf", label: "Tag: Werewolf", title: "Werewolf" },
  { id: "tag/witch", value: "tag/witch", label: "Tag: Witch", title: "Witch" },
  { id: "tag/world-war-ii", value: "tag/world-war-ii", label: "Tag: Segunda Guerra Mundial", title: "Segunda Guerra Mundial" },
  { id: "tag/zombie", value: "tag/zombie", label: "Tag: Zombies", title: "Zombies" }
];
var DISCOVER_YEARS = [
  { id: "", value: "", label: "Todos los años", title: "Todos los años" },
  { id: "2026", value: "2026", label: "2026", title: "2026" },
  { id: "2025", value: "2025", label: "2025", title: "2025" },
  { id: "2024", value: "2024", label: "2024", title: "2024" },
  { id: "2023", value: "2023", label: "2023", title: "2023" },
  { id: "2022", value: "2022", label: "2022", title: "2022" },
  { id: "2021", value: "2021", label: "2021", title: "2021" },
  { id: "2020", value: "2020", label: "2020", title: "2020" },
  { id: "2019", value: "2019", label: "2019", title: "2019" },
  { id: "2018", value: "2018", label: "2018", title: "2018" },
  { id: "2017", value: "2017", label: "2017", title: "2017" },
  { id: "2016", value: "2016", label: "2016", title: "2016" },
  { id: "2015", value: "2015", label: "2015", title: "2015" },
  { id: "2014", value: "2014", label: "2014", title: "2014" },
  { id: "2013", value: "2013", label: "2013", title: "2013" },
  { id: "2012", value: "2012", label: "2012", title: "2012" },
  { id: "2011", value: "2011", label: "2011", title: "2011" },
  { id: "2010", value: "2010", label: "2010", title: "2010" },
  { id: "2009", value: "2009", label: "2009", title: "2009" },
  { id: "2008", value: "2008", label: "2008", title: "2008" },
  { id: "2007", value: "2007", label: "2007", title: "2007" },
  { id: "2006", value: "2006", label: "2006", title: "2006" },
  { id: "2005", value: "2005", label: "2005", title: "2005" },
  { id: "2004", value: "2004", label: "2004", title: "2004" },
  { id: "2003", value: "2003", label: "2003", title: "2003" },
  { id: "2002", value: "2002", label: "2002", title: "2002" },
  { id: "2001", value: "2001", label: "2001", title: "2001" },
  { id: "2000", value: "2000", label: "2000", title: "2000" }
];
var DISCOVER_TYPES = [
  { id: "", value: "", label: "Todos", title: "Todos" },
  { id: "peliculas", value: "peliculas", label: "Películas", title: "Películas" },
  { id: "series", value: "series", label: "Series", title: "Series" },
  { id: "anime", value: "anime", label: "Anime", title: "Anime" },
];

function buildDiscoverUrl(opts) {
  opts = opts || {};
  var type = String(opts.type || opts.filter || opts.tipo || "").trim();
  var genre = String(opts.genre || opts.genero || opts.category || "").trim();
  var tag = String(opts.tag || "").trim();
  var year = String(opts.year || opts.anio || opts.año || "").trim();
  var page = Number(opts.page || 1) || 1;

  var path = "";
  if (genre.indexOf("tag/") === 0) {
    path = "/tag/" + genre.slice(4).replace(/\/$/, "") + "/";
  } else if (genre.indexOf("genres/") === 0) {
    path = "/genres/" + genre.slice(7).replace(/\/$/, "") + "/";
  } else if (tag) {
    path = "/tag/" + tag.replace(/^tag\//, "").replace(/\/$/, "") + "/";
  } else if (genre) {
    path = "/genres/" + genre.replace(/^genres\//, "").replace(/\/$/, "") + "/";
  } else if (type === "series") {
    path = "/ver/series/";
  } else if (type === "anime") {
    path = "/ver/anime/";
  } else if (type === "peliculas") {
    path = "/ver/peliculas/";
  } else {
    path = "/ver/peliculas/";
  }

  if (page > 1) {
    path = path.replace(/\/?$/, "/") + "page/" + page + "/";
  }

  var qs = [];
  if (type && path.indexOf("/ver/") !== 0) qs.push("type=" + encodeURIComponent(type));
  if (year) qs.push("anio=" + encodeURIComponent(year));
  var url = BASE_URL + path;
  if (qs.length) url += "?" + qs.join("&");
  return url;
}

async function getDiscoverFilters(opts) {
  // 3 filtros: tipo, género (géneros + tags), año
  var genreOpts = [{ id: "", value: "", label: "Todos los géneros", title: "Todos los géneros" }]
    .concat(DISCOVER_GENRES)
    .concat(DISCOVER_TAGS);
  return [
    {
      id: "type",
      key: "type",
      name: "type",
      label: "Tipo",
      title: "Tipo",
      type: "select",
      options: DISCOVER_TYPES,
    },
    {
      id: "genre",
      key: "genre",
      name: "genre",
      label: "Género / Tag",
      title: "Género / Tag",
      type: "select",
      options: genreOpts,
    },
    {
      id: "year",
      key: "year",
      name: "year",
      label: "Año",
      title: "Año",
      type: "select",
      options: DISCOVER_YEARS,
    },
  ];
}

async function getDiscover(opts) {
  opts = opts || {};
  // Aceptar filtros planos o anidados
  if (opts.filters && typeof opts.filters === "object") {
    opts = Object.assign({}, opts, opts.filters);
  }
  var page = Number(opts.page || 1) || 1;
  var type = String(opts.type || opts.filter || opts.tipo || "").trim();
  // compat: filterId antiguo
  if (!type && opts.filterId) {
    var fid = String(opts.filterId);
    if (fid === "peliculas" || fid === "series" || fid === "anime") type = fid;
    else if (!opts.genre) opts.genre = fid;
  }
  var genre = String(opts.genre || opts.genero || opts.category || opts.catalogId || "").trim();
  var year = String(opts.year || opts.anio || opts.año || "").trim();

  var url = buildDiscoverUrl({
    type: type,
    genre: genre,
    tag: opts.tag,
    year: year,
    page: page,
  });
  kino.log("discover " + url);
  try {
    var html = await fetchHtml(url);
    var defaultKind = "movie";
    if (type === "series" || type === "anime") defaultKind = "series";
    if (genre.indexOf("tag/") === 0 || /\/tag\//.test(url)) {
      // tags mezclan; parseCards detecta
    }
    var items = parseCards(html, defaultKind).map(mapItem).filter(Boolean);
    // paginación: rel=next o /page/N+1/
    var hasMore = false;
    if (new RegExp("/page/" + (page + 1) + "/").test(html)) hasMore = true;
    if (html.indexOf("page=" + (page + 1)) >= 0) hasMore = true;
    if (items.length >= 40) hasMore = true;
    var nextLink = html.match(/rel=["']next["'][^>]*href=["']([^"']+)["']/i);
    if (nextLink) hasMore = true;
    return { items: items, hasMore: hasMore, page: page, url: url };
  } catch (e) {
    kino.log("getDiscover: " + ((e && e.message) || e));
    return { items: [], hasMore: false, page: page };
  }
}

async function getCatalogs() {
  var list = [
    { id: "peliculas", title: "Películas", type: "movie" },
    { id: "series", title: "Series", type: "series" },
    { id: "anime", title: "Anime", type: "series" },
    { id: "destacados", title: "Destacados", type: "mixed" },
  ];
  DISCOVER_GENRES.forEach(function (g) {
    list.push({ id: g.id, title: g.label, type: "mixed" });
  });
  return list;
}

async function getCatalog(catalogId, opts) {
  opts = opts || {};
  var page = Number(opts.page || 1) || 1;
  var id = String(catalogId || "peliculas");
  if (id.indexOf("genres/") === 0 || id.indexOf("tag/") === 0) {
    return getDiscover({
      genre: id,
      type: opts.type || "",
      year: opts.year || opts.anio || "",
      page: page,
    });
  }
  var br = await kinoBrowse(id, String(page));
  return {
    items: (br.items || []).map(mapItem).filter(Boolean),
    hasMore: !!br.next,
  };
}

function isSiteJunkImage(url) {
  var u = String(url || "").toLowerCase();
  if (!u) return true;
  // logos / banners genéricos de Gnula, no arte del título
  if (/logo|organizacion|imagen[-_]?desitio|favicon|wp-content\/uploads\/2026\/05\/imagen|wp-content\/uploads\/2026\/05\/logo/i.test(u)) return true;
  if (/gnulahd\.nu\/wp-content\/uploads\/[^/]+\/logo/i.test(u)) return true;
  if (/i[0-9]\.wp\.com\/.*logo/i.test(u)) return true;
  return false;
}

function cleanDisplayTitle(title, year) {
  var s = String(title || "").trim();
  s = s.replace(/\s*[\|\-–—]\s*Gnula.*$/i, "");
  s = s.replace(/\s*[\|\-–—]\s*GnulaHD.*$/i, "");
  s = s.replace(/\s+online\b.*$/i, "");
  // quitar año del título si viene pegado: "Titulo (2024)" o "Titulo 2024"
  s = s.replace(/\s*\(\s*((?:19|20)\d{2})\s*\)\s*$/g, "");
  if (year) {
    var y = String(year);
    s = s.replace(new RegExp("\\s*[\\(\\[]?" + y + "[\\)\\]]?\\s*$"), "");
  }
  s = s.replace(/\s*[\(\[](?:19|20)\d{2}[\)\]]\s*$/g, "");
  return s.replace(/\s+/g, " ").trim();
}

async function scrapeFichaHtml(html, ref) {
  var title = "";
  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) title = h1[1].replace(/<[^>]+>/g, "").trim();
  if (!title) {
    var ogt = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogt) title = ogt[1].trim();
  }
  if (!title) {
    var tit = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tit) title = tit[1].replace(/<[^>]+>/g, "").split("|")[0].trim();
  }

  var poster = "";
  var ogi = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogi) poster = absUrl(ogi[1]);
  if (!poster || isSiteJunkImage(poster)) {
    var img = html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i);
    if (img) poster = absUrl(img[1]);
  }
  if (isSiteJunkImage(poster)) poster = "";

  var backdrop = "";
  var bg = html.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
  if (bg) backdrop = absUrl(bg[1]);
  if (isSiteJunkImage(backdrop)) backdrop = "";

  var overview = "";
  var syn = html.match(/class="[^"]*(?:synopsis|sinopsis|description|gnrd-syn|gnrd-overview)[^"]*"[^>]*>([\s\S]*?)<\//i);
  if (syn) overview = syn[1].replace(/<[^>]+>/g, "").trim();
  if (!overview) {
    var ogd = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (ogd) overview = ogd[1].trim();
  }
  // meta description genérica del sitio no sirve
  if (overview && /catálogo completo|español latino hd|mejores películas y series/i.test(overview)) overview = "";

  var year = null;
  var ym = html.match(/(?:año|year|estreno)[^0-9]{0,20}((?:19|20)\d{2})/i);
  if (ym) year = ym[1];
  if (!year) {
    var ym2 = title.match(/\b((?:19|20)\d{2})\b/);
    if (ym2) year = ym2[1];
  }

  return {
    title: cleanDisplayTitle(title, year),
    poster: poster,
    backdrop: backdrop,
    overview: overview,
    year: year,
    ref: ref,
  };
}

async function tmdbEnrichFull(title, kind, year) {
  var tm = await tmdbFind(title, kind, year);
  if (!tm || !tm.tmdbId) return tm;

  // Detalle completo: poster, backdrop y sinopsis oficiales
  try {
    var path = tm.isMovie ? ("/movie/" + tm.tmdbId) : ("/tv/" + tm.tmdbId);
    var det = await tmdbGet(path, {});
    if (det) {
      if (det.poster_path) tm.poster = tmdbImg(det.poster_path, "w500");
      if (det.backdrop_path) tm.backdrop = tmdbImg(det.backdrop_path, "w1280");
      if (det.overview) tm.overview = det.overview;
      if (det.release_date) tm.year = String(det.release_date).slice(0, 4);
      if (det.first_air_date) tm.year = String(det.first_air_date).slice(0, 4);
      if (det.title || det.name) tm.title = det.title || det.name;
      if (det.vote_average != null) tm.rating = Math.round(det.vote_average * 10) / 10;
      // logo oficial si existe
      try {
        var imgs = await tmdbGet(path + "/images", { include_image_language: TMDB_LANG + ",null" });
        if (imgs && Array.isArray(imgs.logos) && imgs.logos.length) {
          var logo = imgs.logos[0];
          if (logo && logo.file_path) tm.logo = tmdbImg(logo.file_path, "w500");
        }
      } catch (e2) {}
    }
  } catch (e) {
    kino.log("tmdb detail: " + ((e && e.message) || e));
  }
  return tm;
}

async function getMeta(id, type) {
  id = String(id || "").trim();
  if (!id) return null;

  var ref = id;
  if (id.indexOf("http") === 0) ref = id;
  else if (id.indexOf("/ver/") >= 0) ref = absUrl(id);
  else ref = BASE_URL + "/ver/" + id.replace(/^\/?ver\//, "");

  var typeHint = String(type || "").toLowerCase();
  var ficha = { title: "", poster: "", backdrop: "", overview: "", year: null, ref: ref };
  var list = [];
  var html = "";

  try {
    html = await fetchHtml(ref);
    ficha = await scrapeFichaHtml(html, ref);
    var cardRegex = /<a[^>]*class="[^"]*gnrd-epc[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = cardRegex.exec(html)) !== null) {
      var fullTag = match[0];
      var innerHtml = match[1];
      var hrefMatch = fullTag.match(/href="([^"]+)"/);
      if (!hrefMatch) continue;
      var href = absUrl(hrefMatch[1]);
      var sMatch = fullTag.match(/data-s="([^"]+)"/);
      var eMatch = fullTag.match(/data-e="([^"]+)"/);
      var idMatch = fullTag.match(/data-id="([^"]+)"/);
      var tMatch = fullTag.match(/data-t="([^"]+)"/);
      var sNum = sMatch ? parseInt(sMatch[1], 10) : 1;
      var eNum = eMatch ? parseInt(eMatch[1], 10) : 1;
      var pid = idMatch ? idMatch[1] : "";
      var tok = tMatch ? tMatch[1] : "";
      var titleMatch = innerHtml.match(/class="[^"]*gnrd-epc-title[^"]*"[^>]*>([\s\S]*?)<\//i);
      var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Episodio " + eNum;
      var imgMatch = innerHtml.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
      var still = imgMatch ? absUrl(imgMatch[1]) : "";
      var epRef = href;
      if (pid && tok) {
        epRef = href + (href.indexOf("?") >= 0 ? "&" : "?") + "id=" + pid + "&t=" + encodeURIComponent(tok);
      }
      list.push({ season: sNum || 1, number: eNum || 1, ref: epRef, title: title, still: still, pid: pid, tok: tok });
    }
    list.sort(function (a, b) { return a.season - b.season || a.number - b.number; });
  } catch (e) {
    kino.log("getMeta fetch: " + ((e && e.message) || e));
  }

  var titleForTmdb = ficha.title || cleanDisplayTitle(cleanId(id).replace(/-/g, " "), null);
  if (!titleForTmdb || titleForTmdb.length < 2) {
    titleForTmdb = cleanId(id).replace(/-/g, " ");
  }

  var isMovieGuess =
    typeHint === "movie" ||
    typeHint === "pelicula" ||
    typeHint === "película" ||
    typeHint === "peliculas";
  if (list.length > 0) isMovieGuess = false;
  if (typeHint === "series" || typeHint === "tv" || typeHint === "anime") isMovieGuess = false;

  // TMDB: búsqueda + detalle (poster/backdrop/sinopsis solo de TMDB)
  var tm = null;
  try {
    tm = await tmdbEnrichFull(titleForTmdb, isMovieGuess ? "movie" : "series", ficha.year);
  } catch (e) {
    kino.log("tmdbEnrich: " + ((e && e.message) || e));
  }

  // Si no encontró, probar el otro tipo
  if (!tm || (!tm.poster && !tm.backdrop)) {
    try {
      var tm2 = await tmdbEnrichFull(titleForTmdb, isMovieGuess ? "series" : "movie", ficha.year);
      if (tm2 && (tm2.poster || tm2.backdrop || tm2.overview)) tm = tm2;
    } catch (e) {}
  }

  // Aplicar SOLO datos TMDB a imágenes y sinopsis
  if (tm) {
    if (tm.poster) ficha.poster = tm.poster;
    else ficha.poster = ""; // no usar logo del sitio
    if (tm.backdrop) ficha.backdrop = tm.backdrop;
    else ficha.backdrop = tm.poster || "";
    if (tm.overview) ficha.overview = tm.overview;
    if (tm.year) ficha.year = tm.year;
    if (tm.title) ficha.title = cleanDisplayTitle(tm.title, tm.year);
    if (tm.logo) ficha.logo = tm.logo;
  } else {
    // sin TMDB: nunca devolver logo basura como poster/backdrop
    if (isSiteJunkImage(ficha.poster)) ficha.poster = "";
    if (isSiteJunkImage(ficha.backdrop)) ficha.backdrop = "";
  }

  ficha.title = cleanDisplayTitle(ficha.title, ficha.year);

  // Episodios TMDB
  if (tm && !tm.isMovie && tm.tmdbId && list.length) {
    try {
      var seasonNums = {};
      list.forEach(function (ep) { seasonNums[ep.season || 1] = true; });
      var seasonsKeys = Object.keys(seasonNums).map(Number);
      for (var si = 0; si < seasonsKeys.length && si < 8; si++) {
        var sn = seasonsKeys[si];
        var teps = await tmdbSeasonEpisodes(tm.tmdbId, sn);
        var byNum = {};
        teps.forEach(function (e) { byNum[e.number] = e; });
        list.forEach(function (ep) {
          if (Number(ep.season || 1) !== sn) return;
          var te = byNum[ep.number];
          if (!te) return;
          if (te.still) ep.still = te.still;
          if (te.title) ep.title = te.title;
          if (te.overview) ep.overview = te.overview;
        });
      }
    } catch (e) {
      kino.log("tmdb eps: " + ((e && e.message) || e));
    }
  }

  var epMap = {};
  var seasonsMap = {};
  list.forEach(function (ep) {
    var sn = Number(ep.season || 1) || 1;
    var n = Number(ep.number || 0) || 0;
    if (!seasonsMap[sn]) seasonsMap[sn] = [];
    epMap[sn + ":" + n] = ep.ref;
    seasonsMap[sn].push({
      number: n,
      id: String(ep.ref || n),
      title: ep.title || ("Episodio " + n),
      overview: ep.overview || null,
      still: ep.still || null,
    });
  });

  try {
    globalThis.__gnulaEpMap = globalThis.__gnulaEpMap || {};
    globalThis.__gnulaEpMap[cleanId(id)] = epMap;
    globalThis.__gnulaEpMap[ref] = epMap;
    var sm = ref.match(/\/ver\/([^\/\?#]+)/);
    if (sm) globalThis.__gnulaEpMap[cleanId(sm[1])] = epMap;
  } catch (e) {}

  var seasons = Object.keys(seasonsMap)
    .map(Number)
    .sort(function (a, b) { return a - b; })
    .map(function (sn) {
      return {
        number: sn,
        name: "Temporada " + sn,
        episodes: seasonsMap[sn].sort(function (a, b) { return a.number - b.number; }),
      };
    });

  var isMovie = isMovieGuess || (list.length === 0 && typeHint !== "series" && typeHint !== "tv" && typeHint !== "anime");
  if (list.length > 0) isMovie = false;
  if (tm && tm.isMovie === false) isMovie = false;
  if (tm && tm.isMovie === true && list.length === 0) isMovie = true;

  return {
    id: cleanId(id),
    title: ficha.title || cleanDisplayTitle(cleanId(id).replace(/-/g, " "), ficha.year),
    type: isMovie ? "movie" : "series",
    poster: ficha.poster || null,
    backdrop: ficha.backdrop || null,
    logo: ficha.logo || null,
    overview: ficha.overview || null,
    year: ficha.year || null,
    rating: tm && tm.rating != null ? tm.rating : null,
    tmdbId: tm && tm.tmdbId ? String(tm.tmdbId) : null,
    seasons: seasons,
    extra: { ref: ref, tmdbId: tm && tm.tmdbId ? tm.tmdbId : null },
  };
}

async function getStreams(id, type, season, episode) {
  if (id && typeof id === "object") {
    var o = id;
    episode = o.episode != null ? o.episode : episode;
    season = o.season != null ? o.season : season;
    type = o.type != null ? o.type : type;
    id = o.id || o.contentId || "";
  }
  id = String(id || "").trim();
  var ref = null;
  var sn = Number(season || 1) || 1;
  var en = episode != null && episode !== "" ? Number(episode) : null;

  if (/id=\d+/.test(id) && /[?&]t=/.test(id)) {
    ref = id.indexOf("http") === 0 ? id : absUrl(id);
  }

  if (!ref && en != null) {
    try {
      var maps = globalThis.__gnulaEpMap || {};
      var key = cleanId(id);
      var epMap = maps[key] || maps[id];
      if (epMap && epMap[sn + ":" + en]) ref = epMap[sn + ":" + en];
      if (!ref && epMap) {
        var keys = Object.keys(epMap);
        for (var ki = 0; ki < keys.length; ki++) {
          if (keys[ki].split(":")[1] === String(en)) {
            ref = epMap[keys[ki]];
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (!ref) {
    if (id.indexOf("http") === 0) ref = id;
    else if (id.indexOf("/ver/") >= 0) ref = absUrl(id);
    else ref = BASE_URL + "/ver/" + id.replace(/^\/?ver\//, "");
  }

  // Serie: asegurar ref de episodio con pid/tok
  var typeL = String(type || "").toLowerCase();
  if (en != null && typeL !== "movie" && typeL !== "pelicula") {
    try {
      if (!/id=\d+/.test(String(ref))) {
        var seriesRef = BASE_URL + "/ver/" + cleanId(id);
        if (id.indexOf("http") === 0) seriesRef = id.split("?")[0];
        else if (id.indexOf("/ver/") >= 0) seriesRef = absUrl(id).split("?")[0];
        var data = await kinoEpisodes(seriesRef);
        var list = (data && data.episodes) || [];
        for (var i = 0; i < list.length; i++) {
          if (Number(list[i].season) === sn && Number(list[i].number) === en) {
            ref = list[i].ref;
            break;
          }
        }
        if (!/id=\d+/.test(String(ref))) {
          for (var j = 0; j < list.length; j++) {
            if (Number(list[j].number) === en) {
              ref = list[j].ref;
              break;
            }
          }
        }
      }
    } catch (e) {
      kino.log("getStreams episodes: " + ((e && e.message) || e));
    }
  }

  // Varias pasadas de resolución
  var servers = [];
  var seen = {};
  function merge(list) {
    (list || []).forEach(function (s) {
      if (!s || !s.url || seen[s.url]) return;
      seen[s.url] = true;
      servers.push(s);
    });
  }

  try {
    merge(await kinoResolve(ref));
  } catch (e) {
    kino.log("resolve1: " + ((e && e.message) || e));
  }

  // Si no hay pid en ref, cargar HTML del episodio y reintentar
  if (!servers.length) {
    try {
      var html = await fetchHtml(ref);
      var pidMatch = html.match(/_gnrdPid\s*=\s*(\d+)/);
      var tokMatch = html.match(/_gnrdTok\s*=\s*"([^"]+)"/);
      if (pidMatch && tokMatch) {
        var ref2 = ref.split("?")[0] + "?id=" + pidMatch[1] + "&t=" + encodeURIComponent(tokMatch[1]);
        merge(await kinoResolve(ref2));
      }
      // data-id / data-t en enlaces de la propia página
      if (!servers.length) {
        var dm = html.match(/data-id="(\d+)"[^>]*data-t="([^"]+)"/);
        if (!dm) dm = html.match(/data-t="([^"]+)"[^>]*data-id="(\d+)"/);
        if (dm) {
          var pid = dm[1].length < 8 ? dm[1] : dm[2];
          var tok = dm[1].length < 8 ? dm[2] : dm[1];
          if (!/^\d+$/.test(pid)) { pid = dm[2]; tok = dm[1]; }
          var ref3 = ref.split("?")[0] + "?id=" + pid + "&t=" + encodeURIComponent(tok);
          merge(await kinoResolve(ref3));
        }
      }
    } catch (e2) {
      kino.log("resolve2: " + ((e2 && e2.message) || e2));
    }
  }

  kino.log("getStreams → " + servers.length + " (" + ref + ")");
  return servers;
}

module.exports = {
  getHome: getHome,
  getNews: getNews,
  search: appSearch,
  getDiscover: getDiscover,
  getDiscoverFilters: getDiscoverFilters,
  getCatalogs: getCatalogs,
  getCatalog: getCatalog,
  getMeta: getMeta,
  getStreams: getStreams,
};
