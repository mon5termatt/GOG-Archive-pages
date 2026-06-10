"use strict";

const PER_PAGE = 50;
const CATEGORY_LABELS = { game: "Game", extras: "Extras", patches: "Patches" };
const FILE_KIND_LABELS = { installers: "Installers", extras_files: "Extra files" };

const state = {
  payload: null,
  gamesBySlug: new Map(),
  query: "",
  typeFilter: "",
  tagFilter: "",
  page: 1,
};

function downloadTypeLabel(game) {
  return game.has_torrent ? "Magnet/Direct" : "Direct";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const gameMatch = hash.match(/^\/game\/([^/?#]+)/);
  if (gameMatch) {
    return { view: "game", slug: decodeURIComponent(gameMatch[1]) };
  }
  const params = new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : "");
  return {
    view: "index",
    query: params.get("q") || "",
    type: params.get("type") || "",
    tag: params.get("tag") || "",
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
  };
}

function indexHash({ query = "", type = "", tag = "", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (type) params.set("type", type);
  if (tag) params.set("tag", tag);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `#/${qs ? `?${qs}` : ""}`;
}

function setRoute(route) {
  if (route.view === "game") {
    window.location.hash = `#/game/${encodeURIComponent(route.slug)}`;
    return;
  }
  window.location.hash = indexHash(route);
}

function filteredGames() {
  const q = state.query.trim().toLowerCase();
  return state.payload.games.filter((game) => {
    if (state.typeFilter === "magnet" && !game.has_torrent) return false;
    if (state.typeFilter === "direct" && game.has_torrent) return false;
    if (state.tagFilter && !(game.tags || []).includes(state.tagFilter)) return false;
    if (!q) return true;
    const haystack = [
      game.title,
      game.slug,
      game.developer,
      game.publisher,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function renderHeaderStats() {
  const stats = state.payload.stats;
  document.getElementById("header-stats").textContent =
    `${stats.total_games} games · ${stats.total_download_links} links · ${stats.torrent_games} magnet/direct`;
}

function renderTagOptions(selectedTag) {
  return state.payload.tags
    .map(
      (tag) =>
        `<option value="${escapeHtml(tag.name)}"${
          selectedTag === tag.name ? " selected" : ""
        }>${escapeHtml(tag.name)} (${tag.game_count})</option>`,
    )
    .join("");
}

function renderIndex() {
  const games = filteredGames();
  const totalPages = Math.max(1, Math.ceil(games.length / PER_PAGE));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * PER_PAGE;
  const pageGames = games.slice(start, start + PER_PAGE);

  const metaParts = [`Showing ${pageGames.length} of ${games.length} game(s)`];
  if (state.query) metaParts.push(`matching “${state.query}”`);
  if (state.tagFilter) metaParts.push(`tag: ${state.tagFilter}`);
  if (state.typeFilter === "magnet") metaParts.push("Magnet/Direct");
  if (state.typeFilter === "direct") metaParts.push("Direct only");

  const rows = pageGames
    .map((game) => {
      const badgeClass = game.has_torrent ? "badge-magnet" : "badge-direct";
      const tags = (game.tags || []).slice(0, 6);
      const tagHtml = tags.length
        ? `<div class="tag-list">${tags
            .map(
              (tag) =>
                `<a class="tag-chip" href="${indexHash({
                  query: state.query,
                  type: state.typeFilter,
                  tag,
                  page: 1,
                })}">${escapeHtml(tag)}</a>`,
            )
            .join("")}${
            (game.tags || []).length > 6
              ? `<span class="tag-more">+${game.tags.length - 6}</span>`
              : ""
          }</div>`
        : "—";

      return `<tr>
        <td>
          <a class="game-link" href="#/game/${encodeURIComponent(game.slug)}">${escapeHtml(game.title)}</a>
          <span class="slug">${escapeHtml(game.slug)}</span>
        </td>
        <td>${escapeHtml(game.developer || "—")}</td>
        <td class="tags-cell">${tagHtml}</td>
        <td>${escapeHtml(game.current_version || "—")}</td>
        <td>${game.direct_link_count || 0}</td>
        <td><span class="badge ${badgeClass}">${downloadTypeLabel(game)}</span></td>
      </tr>`;
    })
    .join("");

  const pagination =
    totalPages > 1
      ? `<nav class="pagination" aria-label="Pagination">
          ${
            state.page > 1
              ? `<a href="${indexHash({
                  query: state.query,
                  type: state.typeFilter,
                  tag: state.tagFilter,
                  page: state.page - 1,
                })}">← Prev</a>`
              : ""
          }
          <span>Page ${state.page} / ${totalPages}</span>
          ${
            state.page < totalPages
              ? `<a href="${indexHash({
                  query: state.query,
                  type: state.typeFilter,
                  tag: state.tagFilter,
                  page: state.page + 1,
                })}">Next →</a>`
              : ""
          }
        </nav>`
      : "";

  document.getElementById("app").innerHTML = `
    <section class="hero">
      <h1>Game catalog</h1>
      <p class="lede">Browse archived metadata, magnet links, direct downloads, and tags from gog-games.to.</p>
    </section>

    <form class="search-form" id="search-form">
      <div class="search-row">
        <input type="search" id="search-input" value="${escapeHtml(state.query)}"
          placeholder="Search title, slug, developer, publisher…">
        <button type="submit">Search</button>
      </div>
      <div class="filter-row">
        <label class="filter-field">
          <span class="filter-label">Type</span>
          <select id="type-filter" class="filter-select">
            <option value=""${state.typeFilter ? "" : " selected"}>All games</option>
            <option value="magnet"${state.typeFilter === "magnet" ? " selected" : ""}>Magnet/Direct</option>
            <option value="direct"${state.typeFilter === "direct" ? " selected" : ""}>Direct only</option>
          </select>
        </label>
        <label class="filter-field">
          <span class="filter-label">Tag</span>
          <select id="tag-filter" class="filter-select">
            <option value=""${state.tagFilter ? "" : " selected"}>All tags</option>
            ${renderTagOptions(state.tagFilter)}
          </select>
        </label>
      </div>
    </form>

    <p class="results-meta">${escapeHtml(metaParts.join(" · "))}</p>

    ${
      pageGames.length
        ? `<table class="game-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Developer</th>
                <th>Tags</th>
                <th>Version</th>
                <th>Links</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>${pagination}`
        : `<p class="empty">No games matched your search.</p>`
    }
  `;

  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = document.getElementById("search-input").value;
    state.page = 1;
    setRoute({
      view: "index",
      query: state.query,
      type: state.typeFilter,
      tag: state.tagFilter,
      page: 1,
    });
  });

  document.getElementById("type-filter").addEventListener("change", (event) => {
    state.typeFilter = event.target.value;
    state.page = 1;
    setRoute({
      view: "index",
      query: state.query,
      type: state.typeFilter,
      tag: state.tagFilter,
      page: 1,
    });
  });

  document.getElementById("tag-filter").addEventListener("change", (event) => {
    state.tagFilter = event.target.value;
    state.page = 1;
    setRoute({
      view: "index",
      query: state.query,
      type: state.typeFilter,
      tag: state.tagFilter,
      page: 1,
    });
  });
}

function renderLinksSection(title, links) {
  if (!links || !links.length) return "";
  const rows = links
    .map(
      (link) => `<tr>
        <td>${escapeHtml(link.hoster)}</td>
        <td>${escapeHtml(link.filename || "—")}</td>
        <td><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.url)}</a></td>
      </tr>`,
    )
    .join("");
  return `<section class="panel">
    <h2>${escapeHtml(title)}</h2>
    <table class="link-table">
      <thead><tr><th>Hoster</th><th>Filename</th><th>URL</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderFilesSection(title, files) {
  if (!files || !files.length) return "";
  const rows = files
    .map(
      (file) => `<tr>
        <td>${escapeHtml(file.name)}</td>
        <td>${escapeHtml(file.size || "—")}</td>
      </tr>`,
    )
    .join("");
  return `<section class="panel">
    <h2>${escapeHtml(title)}</h2>
    <table class="link-table">
      <thead><tr><th>Name</th><th>Size</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderGame(slug) {
  const game = state.gamesBySlug.get(slug);
  if (!game) {
    document.getElementById("app").innerHTML =
      `<p class="empty">Game not found: ${escapeHtml(slug)}</p>` +
      `<p><a href="${indexHash()}">← Back to catalog</a></p>`;
    return;
  }

  document.title = `${game.title} · GOG Archive`;
  const badgeClass = game.has_torrent ? "badge-magnet" : "badge-direct";
  const tagsHtml = (game.tags || []).length
    ? `<div class="tag-section">
        <p class="field-label">Tags</p>
        <div class="tag-list">${(game.tags || [])
          .map(
            (tag) =>
              `<a class="tag-chip" href="${indexHash({ tag, page: 1 })}">${escapeHtml(tag)}</a>`,
          )
          .join("")}</div>
      </div>`
    : "";

  const magnetSection = game.has_torrent
    ? `<section class="panel">
        <h2>Magnet</h2>
        ${game.infohash ? `<p class="mono"><strong>Infohash:</strong> ${escapeHtml(game.infohash)}</p>` : ""}
        ${
          game.magnet
            ? `<label class="field-label" for="magnet">Magnet link</label>
               <textarea id="magnet" class="mono magnet-box" readonly>${escapeHtml(game.magnet)}</textarea>`
            : ""
        }
        ${
          game.torrent_url
            ? `<p><a href="${escapeHtml(game.torrent_url)}" target="_blank" rel="noopener">Direct .torrent URL</a></p>`
            : ""
        }
        ${
          game.local_torrent
            ? `<p class="mono">Local file: ${escapeHtml(game.local_torrent)}</p>`
            : ""
        }
      </section>`
    : "";

  const linkSections = Object.entries(game.links || {})
    .map(([category, items]) =>
      renderLinksSection(`${CATEGORY_LABELS[category] || category} downloads`, items),
    )
    .join("");

  const fileSections = Object.entries(game.files || {})
    .map(([kind, items]) =>
      renderFilesSection(
        FILE_KIND_LABELS[kind] || kind.replaceAll("_", " "),
        items,
      ),
    )
    .join("");

  document.getElementById("app").innerHTML = `
    <p class="back-link"><a href="${indexHash()}">← Back to catalog</a></p>
    <article class="game-detail">
      <header class="game-header">
        <div>
          <h1>${escapeHtml(game.title)}</h1>
          <p class="slug">${escapeHtml(game.slug)}</p>
        </div>
        <div class="badges">
          <span class="badge ${badgeClass}">${downloadTypeLabel(game)}</span>
          ${
            game.direct_link_count
              ? `<span class="badge">${game.direct_link_count} direct link(s)</span>`
              : ""
          }
        </div>
      </header>
      <section class="panel">
        <h2>Details</h2>
        <dl class="meta-grid">
          <dt>Developer</dt><dd>${escapeHtml(game.developer || "—")}</dd>
          <dt>Publisher</dt><dd>${escapeHtml(game.publisher || "—")}</dd>
          <dt>Version</dt><dd>${escapeHtml(game.current_version || "—")}</dd>
          <dt>Last update</dt><dd>${escapeHtml(game.last_update || "—")}</dd>
          <dt>Catalog ID</dt><dd>${escapeHtml(game.catalog_id || "—")}</dd>
        </dl>
        ${tagsHtml}
        <div class="external-links">
          ${
            game.gog_url
              ? `<a href="${escapeHtml(game.gog_url)}" target="_blank" rel="noopener">GOG store</a>`
              : ""
          }
          ${
            game.game_page
              ? `<a href="${escapeHtml(game.game_page)}" target="_blank" rel="noopener">gog-games.to page</a>`
              : ""
          }
        </div>
      </section>
      ${magnetSection}
      ${linkSections}
      ${fileSections}
    </article>
  `;
}

function render() {
  renderHeaderStats();
  document.title = "GOG Archive";
  const route = parseRoute();
  if (route.view === "game") {
    renderGame(route.slug);
    return;
  }
  state.query = route.query;
  state.typeFilter = route.type;
  state.tagFilter = route.tag;
  state.page = route.page;
  renderIndex();
}

async function loadArchive() {
  const response = await fetch("data/games.json");
  if (!response.ok) {
    throw new Error(`Failed to load data/games.json (${response.status})`);
  }
  state.payload = await response.json();
  state.gamesBySlug = new Map(state.payload.games.map((game) => [game.slug, game]));
  render();
}

window.addEventListener("hashchange", render);
document.getElementById("brand-link").addEventListener("click", (event) => {
  event.preventDefault();
  setRoute({ view: "index" });
});

loadArchive().catch((error) => {
  document.getElementById("app").innerHTML = `
    <section class="hero">
      <h1>Could not load archive</h1>
      <p class="lede">${escapeHtml(error.message)}</p>
    </section>`;
});
