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
      ref: href.charAt(0) === "/" ? BASE_URL + href : href,
      title: title,
      kind: kind,
      type: kind === "movie" ? "movie" : "series",
      poster: poster,
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
      ref: ref,
      title: title,
      kind: kind,
      type: kind,
      backdrop: backdrop,
      poster: backdrop || logo,
      logo: logo,
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
    var href = hrefMatch[1];
    if (href.charAt(0) === "/") href = BASE_URL + href;
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
  for (var li = 0; li < sortedLangs.length; li++) {
    var l = sortedLangs[li];
    if (!l || !Array.isArray(l.servers)) continue;
    for (var si = 0; si < l.servers.length; si++) {
      var s = l.servers[si];
      var src = (s && s.src) || "";
      if (!src) continue;
      var streamObj = null;
      if (src.indexOf("vidara") >= 0) streamObj = await resolveVidara(src);
      else if (src.indexOf("savefiles") >= 0) streamObj = await resolveSavefiles(src);
      if (streamObj && streamObj.url) {
        servers.push({
          name: (s.title || "Servidor") + " (" + (l.label || "Video") + ")",
          url: streamObj.url,
          quality: streamObj.mime && streamObj.mime.indexOf("mpegURL") >= 0 ? "HLS" : "HD",
          isHls: !!(streamObj.mime && streamObj.mime.indexOf("mpegURL") >= 0) || /\.m3u8/i.test(streamObj.url),
          headers: streamObj.headers || {},
        });
      }
    }
  }
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

async function getDiscover(opts) {
  opts = opts || {};
  var page = Number(opts.page || 1) || 1;
  var filter = String(opts.filter || opts.genre || opts.catalogId || opts.type || "peliculas");
  // Grillas: películas / series / anime
  var ref = "peliculas";
  if (/serie/i.test(filter)) ref = "series";
  else if (/anime/i.test(filter)) ref = "anime";
  else if (/terror/i.test(filter)) ref = "genres/terror";
  else if (/accion|acción/i.test(filter)) ref = "genres/accion";
  else if (/pel|movie/i.test(filter)) ref = "peliculas";
  else if (filter && filter !== "all") ref = filter;
  try {
    var br = await kinoBrowse(ref, String(page));
    return {
      items: (br.items || []).map(mapItem).filter(Boolean),
      hasMore: !!br.next,
    };
  } catch (e) {
    return { items: [], hasMore: false };
  }
}

async function getDiscoverFilters() {
  return [
    { id: "peliculas", label: "Películas", title: "Películas" },
    { id: "series", label: "Series", title: "Series" },
    { id: "anime", label: "Anime", title: "Anime" },
    { id: "genres/terror", label: "Terror", title: "Terror" },
    { id: "genres/accion", label: "Acción", title: "Acción" },
  ];
}

async function getCatalogs() {
  return [
    { id: "peliculas", title: "Películas", type: "movie" },
    { id: "series", title: "Series", type: "series" },
    { id: "anime", title: "Anime", type: "series" },
    { id: "destacados", title: "Destacados", type: "mixed" },
    { id: "genres/terror", title: "Terror", type: "movie" },
    { id: "genres/accion", title: "Acción", type: "movie" },
  ];
}

async function getCatalog(catalogId, opts) {
  opts = opts || {};
  var page = Number(opts.page || 1) || 1;
  var br = await kinoBrowse(String(catalogId || "peliculas"), String(page));
  return {
    items: (br.items || []).map(mapItem).filter(Boolean),
    hasMore: !!br.next,
  };
}

async function getMeta(id, type) {
  id = String(id || "").trim();
  if (!id) return null;
  // Aceptar URL completa o slug
  var ref = id;
  if (id.indexOf("http") === 0) ref = id;
  else if (id.indexOf("/ver/") >= 0) ref = id.indexOf("http") === 0 ? id : BASE_URL + (id.charAt(0) === "/" ? id : "/" + id);
  else ref = BASE_URL + "/ver/" + id.replace(/^\/?ver\//, "");

  // Extra desde search: puede venir solo slug
  try {
    // Si parece película y type movie, intentar sin episodios
    var data = await kinoEpisodes(ref);
    var list = (data && data.episodes) || [];
    var series = (data && data.series) || {};
    if (list.length === 0) {
      // Ficha de película: un solo "capítulo" = la propia ref
      return {
        id: cleanId(id),
        title: series.title || cleanId(id).replace(/-/g, " "),
        type: "movie",
        poster: series.poster || null,
        overview: series.overview || null,
        seasons: [],
        extra: { ref: ref },
      };
    }
    var seasonsMap = {};
    var epMap = {};
    list.forEach(function (ep) {
      var sn = Number(ep.season || 1) || 1;
      var n = Number(ep.number || 0) || 0;
      if (!seasonsMap[sn]) seasonsMap[sn] = [];
      epMap[sn + ":" + n] = ep.ref;
      seasonsMap[sn].push({
        number: n,
        id: String(ep.ref || n),
        title: ep.title || ("Episodio " + n),
        still: ep.still || null,
      });
    });
    try {
      // cache refs for getStreams
      globalThis.__gnulaEpMap = globalThis.__gnulaEpMap || {};
      globalThis.__gnulaEpMap[cleanId(id)] = epMap;
      globalThis.__gnulaEpMap[ref] = epMap;
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
    return {
      id: cleanId(id),
      title: series.title || cleanId(id).replace(/-/g, " "),
      type: "series",
      poster: series.poster || null,
      overview: series.overview || null,
      seasons: seasons,
      extra: { ref: ref },
    };
  } catch (e) {
    kino.log("getMeta: " + ((e && e.message) || e));
    return {
      id: cleanId(id),
      title: cleanId(id).replace(/-/g, " "),
      type: String(type || "movie"),
      seasons: [],
      extra: { ref: ref },
    };
  }
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

  // 1) id ya es URL de episodio con id/t
  if (/id=\d+/.test(id) && /[?&]t=/.test(id)) {
    ref = id.indexOf("http") === 0 ? id : BASE_URL + (id.charAt(0) === "/" ? id : "/" + id);
  }

  // 2) mapa guardado en getMeta
  if (!ref && episode != null) {
    try {
      var maps = globalThis.__gnulaEpMap || {};
      var key = cleanId(id);
      var epMap = maps[key] || maps[id];
      var sn = Number(season || 1) || 1;
      var en = Number(episode) || 1;
      if (epMap && epMap[sn + ":" + en]) ref = epMap[sn + ":" + en];
      // también probar solo número
      if (!ref && epMap) {
        var k2 = Object.keys(epMap).filter(function (k) { return k.split(":")[1] === String(en); })[0];
        if (k2) ref = epMap[k2];
      }
    } catch (e) {}
  }

  // 3) película / URL de ficha
  if (!ref) {
    if (id.indexOf("http") === 0) ref = id;
    else if (id.indexOf("/ver/") >= 0) ref = id.indexOf("http") === 0 ? id : BASE_URL + (id.charAt(0) === "/" ? id : "/" + id);
    else ref = BASE_URL + "/ver/" + id.replace(/^\/?ver\//, "");
  }

  // Si es serie y tenemos season/episode pero ref es la ficha, recargar episodios
  if (episode != null && String(type || "").toLowerCase() !== "movie") {
    try {
      var needFetch = !/id=\d+/.test(ref);
      if (needFetch) {
        var data = await kinoEpisodes(ref.indexOf("/ver/") >= 0 ? ref : BASE_URL + "/ver/" + cleanId(id));
        var list = (data && data.episodes) || [];
        var sn = Number(season || 1) || 1;
        var en = Number(episode) || 1;
        for (var i = 0; i < list.length; i++) {
          if (Number(list[i].season) === sn && Number(list[i].number) === en) {
            ref = list[i].ref;
            break;
          }
        }
        if (!/id=\d+/.test(String(ref)) && list.length) {
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

  try {
    var servers = await kinoResolve(ref);
    return Array.isArray(servers) ? servers : [];
  } catch (e) {
    kino.log("getStreams: " + ((e && e.message) || e));
    return [];
  }
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
