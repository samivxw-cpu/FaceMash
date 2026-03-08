const K = 32;
const DEFAULT_SCORE = 1200;
const MIN_SCORE = 800;
const MAX_SCORE = 2600;
const AFRICA_MIN_TAB_COUNT = 300;
const MAX_ACTIVE_PROFILES = 5000;
const MIN_FAME_SCORE = 80;
const MIN_MAINSTREAM_SCORE = 95;
const MIN_IMAGE_YEAR = 2014;
const INSTITUTIONAL_PENALTY = 32;
const FALLBACK_IMG = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";
const MAX_RECENT_IDS = 180;
const MAX_RECENT_PAIRS = 1200;
const FACEMASH_SCORE_BAND = 220;
const FACEMASH_ANCHOR_POOL = 800;
const FACEMASH_ANCHOR_WINDOW = 180;
const FACEMASH_CHALLENGER_WINDOW = 80;
const RATING_STORAGE_KEY = "facemash_ratings_v1";
const RATING_CRITERIA = [
  { id: "tal", label: "TAL - Talent", weight: 0.18 },
  { id: "pop", label: "POP - Popularity", weight: 0.15 },
  { id: "ach", label: "ACH - Awards", weight: 0.14 },
  { id: "inf", label: "INF - Influence", weight: 0.14 },
  { id: "kind", label: "KND - Kindness", weight: 0.14 },
  { id: "lon", label: "LON - Longevity", weight: 0.1 },
  { id: "sty", label: "STY - Style", weight: 0.15 },
];

const CONTINENT_ORDER = ["world", "africa", "asia", "europe", "north-america", "south-america", "oceania"];
const CONTINENT_LABEL = {
  world: "World",
  africa: "Africa",
  asia: "Asia",
  europe: "Europe",
  "north-america": "North America",
  "south-america": "South America",
  oceania: "Oceania",
};

const MAJORITY_BY_COUNTRY = {
  fr: 18,
  us: 18,
  ca: 18,
  gb: 18,
  de: 18,
  it: 18,
  es: 18,
  jp: 18,
  kr: 19,
  ch: 18,
  sa: 18,
  ae: 18,
  in: 18,
  br: 18,
  ru: 18,
  cn: 18,
  tr: 18,
};

const FALLBACK_COUNTRIES = [
  ["us", "United States"],
  ["gb", "United Kingdom"],
  ["fr", "France"],
  ["de", "Germany"],
  ["it", "Italy"],
  ["es", "Spain"],
  ["br", "Brazil"],
  ["ar", "Argentina"],
  ["ma", "Morocco"],
  ["dz", "Algeria"],
  ["tn", "Tunisia"],
  ["ca", "Canada"],
  ["mx", "Mexico"],
  ["in", "India"],
  ["jp", "Japan"],
  ["kr", "South Korea"],
  ["au", "Australia"],
  ["ng", "Nigeria"],
  ["za", "South Africa"],
  ["eg", "Egypt"],
];

let celebs = [];
let currentGender = "male";
let currentContinent = "world";
let availableContinents = ["world"];
let left = null;
let right = null;
let worldMap = null;
let selectedCountryCode = null;
let profileInitialized = false;
let ratingPageInitialized = false;
let ratingsByCeleb = {};
let selectedRatedCeleb = null;
let currentCriteriaSelection = {};
let maxPopularityInDataset = 1;

const recentIds = [];
const recentPairs = [];

function el(id) {
  return document.getElementById(id);
}

function has(id) {
  return Boolean(el(id));
}

function expectedScore(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function clampScore(value) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(value)));
}

function dynamicK(player, expected, isUpset) {
  const votes = player?.votes || 0;
  let k = K;

  if (votes < 20) k += 10;
  if (votes > 180) k -= 8;
  if (isUpset) k += 6;
  if (expected > 0.82 || expected < 0.18) k -= 3;

  return Math.max(18, Math.min(52, k));
}

function updateElo(winner, loser) {
  const expectedWinner = expectedScore(winner.score, loser.score);
  const expectedLoser = 1 - expectedWinner;
  const upset = expectedWinner < 0.5;
  const upsetBoost = upset ? 1.2 : 1;
  const winnerK = dynamicK(winner, expectedWinner, upset) * upsetBoost;
  const loserK = dynamicK(loser, expectedLoser, upset) * upsetBoost;

  winner.score = clampScore(winner.score + winnerK * (1 - expectedWinner));
  loser.score = clampScore(loser.score + loserK * (0 - expectedLoser));
  winner.votes = (winner.votes || 0) + 1;
  loser.votes = (loser.votes || 0) + 1;
}

function setStatus(message) {
  const node = el("status");
  if (node) node.textContent = message;
}

function normalizeGender(value) {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();
  if (v === "male" || v === "m" || v === "man" || v === "men") return "male";
  if (v === "female" || v === "f" || v === "woman" || v === "women") return "female";
  return null;
}

function normalizeContinent(value) {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();

  if (v.includes("africa")) return "africa";
  if (v.includes("asia")) return "asia";
  if (v.includes("europe")) return "europe";
  if (v.includes("north america") || v.includes("north-america")) return "north-america";
  if (v.includes("south america") || v.includes("south-america") || v.includes("latin")) return "south-america";
  if (v.includes("oceania") || v.includes("australia")) return "oceania";
  if (v.includes("world")) return "world";

  return null;
}

function normalizeCountryCode(value) {
  if (!value) return null;
  const code = String(value).trim().toLowerCase();
  return code.length === 2 ? code : null;
}

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return "";
  return code
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function setImage(imgEl, url) {
  if (!imgEl) return;
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = FALLBACK_IMG;
  };
  imgEl.src = url;
}

function pairKey(a, b) {
  if (!a || !b) return "";
  return [a.id, b.id].sort().join("|");
}

function rememberId(id) {
  if (!id) return;
  recentIds.unshift(id);
  if (recentIds.length > MAX_RECENT_IDS) recentIds.length = MAX_RECENT_IDS;
}

function rememberPair(a, b) {
  const key = pairKey(a, b);
  if (!key) return;
  recentPairs.unshift(key);
  if (recentPairs.length > MAX_RECENT_PAIRS) recentPairs.length = MAX_RECENT_PAIRS;
}

function wasPairRecentlyUsed(a, b) {
  return recentPairs.includes(pairKey(a, b));
}

function updateQuestionLine() {
  const line = el("questionLine");
  if (!line) return;
  line.textContent = currentGender === "male"
    ? "Who is more handsome, left or right?"
    : "Who is more beautiful, left or right?";
}

function updateModeButtons() {
  const male = el("modeMale");
  const female = el("modeFemale");
  if (male) male.classList.toggle("active", currentGender === "male");
  if (female) female.classList.toggle("active", currentGender === "female");
}

function updateContinentButtons() {
  const tabs = el("continentTabs");
  if (!tabs) return;
  tabs.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.continent === currentContinent);
  });
}

function getPool(gender = currentGender, continent = currentContinent) {
  const byGender = celebs.filter((c) => c.gender === gender);
  if (continent === "world") return byGender;
  return byGender.filter((c) => c.continent === continent);
}

function computeAvailableContinents() {
  const counts = new Map();
  celebs.forEach((c) => counts.set(c.continent, (counts.get(c.continent) || 0) + 1));

  const dynamic = CONTINENT_ORDER.filter((c) => c !== "world").filter((c) => {
    const count = counts.get(c) || 0;
    if (!count) return false;
    if (c === "africa" && count < AFRICA_MIN_TAB_COUNT) return false;
    return true;
  });

  availableContinents = ["world", ...dynamic];
  if (!availableContinents.includes(currentContinent)) currentContinent = "world";
}

function ensureValidContinentForGender() {
  const currentPool = getPool(currentGender, currentContinent);
  if (currentPool.length >= 1) return;

  const fallback = availableContinents.find((c) => getPool(currentGender, c).length >= 1);
  currentContinent = fallback || "world";
}

function renderContinentTabs() {
  const tabs = el("continentTabs");
  if (!tabs) return;

  tabs.innerHTML = "";
  availableContinents.forEach((continent) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn";
    btn.dataset.continent = continent;
    btn.textContent = CONTINENT_LABEL[continent] || continent;
    btn.onclick = () => setContinent(continent);
    tabs.appendChild(btn);
  });

  updateContinentButtons();
}

function markShown(person) {
  if (!person) return;
  person.shown = (person.shown || 0) + 1;
  rememberId(person.id);
}

function eduardoPriority(person) {
  const score = Number(person?.score) || DEFAULT_SCORE;
  const votes = Number(person?.votes) || 0;
  const popularity = Number(person?.popularity) || 0;
  const shown = Number(person?.shown) || 0;
  const freshness = Number(person?.freshnessScore);
  const mainstream = Number(person?.mainstreamScore) || popularity;

  return score
    + Math.log10(votes + 1) * 52
    + Math.log10(popularity + 1) * 22
    + Math.log10(Math.max(1, mainstream) + 1) * 40
    + (Number.isFinite(freshness) ? freshness : 0.35) * 18
    - Math.log10(shown + 1) * 30;
}

function pickFallbackCandidate(pool, excludeIds = []) {
  if (!pool.length) return null;

  const exclude = new Set(excludeIds.filter(Boolean));
  let candidates = pool.filter((p) => !exclude.has(p.id));
  if (!candidates.length) return null;

  const nonRecent = candidates.filter((p) => !recentIds.includes(p.id));
  if (nonRecent.length >= 16) candidates = nonRecent;

  candidates.sort((a, b) => {
    const mainstreamA = a.mainstreamScore || 0;
    const mainstreamB = b.mainstreamScore || 0;
    if (mainstreamA !== mainstreamB) return mainstreamB - mainstreamA;

    const shownA = a.shown || 0;
    const shownB = b.shown || 0;
    if (shownA !== shownB) return shownA - shownB;

    const votesA = a.votes || 0;
    const votesB = b.votes || 0;
    if (votesA !== votesB) return votesA - votesB;

    return (b.popularity || 0) - (a.popularity || 0);
  });

  const windowSize = Math.min(120, candidates.length);
  const shortList = candidates.slice(0, windowSize);
  const minShown = shortList.reduce((min, p) => Math.min(min, p.shown || 0), Number.POSITIVE_INFINITY);
  const diversityPool = shortList.filter((p) => (p.shown || 0) <= minShown + 1);
  const drawPool = diversityPool.length >= 8 ? diversityPool : shortList;
  return drawPool[Math.floor(Math.random() * drawPool.length)];
}

function pickAnchorCandidate(pool, excludeIds = []) {
  if (!pool.length) return null;

  const exclude = new Set(excludeIds.filter(Boolean));
  let candidates = pool.filter((p) => !exclude.has(p.id));
  if (!candidates.length) return null;

  const nonRecent = candidates.filter((p) => !recentIds.includes(p.id));
  if (nonRecent.length >= 24) candidates = nonRecent;

  // Favor under-shown profiles so the same faces do not repeat every round.
  if (nonRecent.length >= 60 && Math.random() < 0.58) {
    const noveltyPool = [...nonRecent].sort((a, b) => (a.shown || 0) - (b.shown || 0));
    const take = Math.min(260, noveltyPool.length);
    const shortList = noveltyPool.slice(0, take);
    return shortList[Math.floor(Math.random() * shortList.length)];
  }

  candidates.sort((a, b) => {
    const powerA = eduardoPriority(a);
    const powerB = eduardoPriority(b);
    if (powerB !== powerA) return powerB - powerA;

    const shownA = a.shown || 0;
    const shownB = b.shown || 0;
    if (shownA !== shownB) return shownA - shownB;

    return (b.popularity || 0) - (a.popularity || 0);
  });

  const topPool = candidates.slice(0, Math.min(FACEMASH_ANCHOR_POOL, candidates.length));
  const windowSize = Math.min(FACEMASH_ANCHOR_WINDOW, topPool.length);
  const maxStart = Math.max(0, topPool.length - windowSize);
  const start = maxStart > 0 ? Math.floor(Math.random() * (maxStart + 1)) : 0;
  const shortList = topPool.slice(start, start + windowSize);
  return shortList[Math.floor(Math.random() * shortList.length)];
}

function pickClosestCandidate(pool, target, excludeIds = []) {
  if (!pool.length || !target) return null;

  const exclude = new Set([target.id, ...excludeIds].filter(Boolean));
  let candidates = pool.filter((p) => !exclude.has(p.id));
  if (!candidates.length) return null;

  const nonRecent = candidates.filter((p) => !recentIds.includes(p.id));
  if (nonRecent.length >= 14) candidates = nonRecent;

  const targetScore = target.score || DEFAULT_SCORE;
  candidates.sort((a, b) => {
    const aGap = Math.abs((a.score || DEFAULT_SCORE) - targetScore);
    const bGap = Math.abs((b.score || DEFAULT_SCORE) - targetScore);
    if (aGap !== bGap) return aGap - bGap;

    const powerA = eduardoPriority(a);
    const powerB = eduardoPriority(b);
    if (powerB !== powerA) return powerB - powerA;

    const shownA = a.shown || 0;
    const shownB = b.shown || 0;
    if (shownA !== shownB) return shownA - shownB;

    return (b.popularity || 0) - (a.popularity || 0);
  });

  const scoreBand = candidates.filter(
    (c) => Math.abs((c.score || DEFAULT_SCORE) - targetScore) <= FACEMASH_SCORE_BAND
  );
  const source = scoreBand.length >= 6 ? scoreBand : candidates;
  const windowSize = Math.min(FACEMASH_CHALLENGER_WINDOW, source.length);
  const shortList = source.slice(0, windowSize);
  const minShown = shortList.reduce((min, p) => Math.min(min, p.shown || 0), Number.POSITIVE_INFINITY);
  const diversityPool = shortList.filter((p) => (p.shown || 0) <= minShown + 2);
  const drawPool = diversityPool.length >= 8 ? diversityPool : shortList;
  return drawPool[Math.floor(Math.random() * drawPool.length)];
}

function clearBattle() {
  left = null;
  right = null;

  const imgLeft = el("imgLeft");
  const imgRight = el("imgRight");
  const nameLeft = el("nameLeft");
  const nameRight = el("nameRight");
  const countryLeft = el("countryLeft");
  const countryRight = el("countryRight");

  if (imgLeft) imgLeft.removeAttribute("src");
  if (imgRight) imgRight.removeAttribute("src");
  if (nameLeft) nameLeft.textContent = "-";
  if (nameRight) nameRight.textContent = "-";
  if (countryLeft) countryLeft.textContent = "";
  if (countryRight) countryRight.textContent = "";
}

function renderPair() {
  if (!has("battle") || !left || !right) {
    clearBattle();
    return;
  }

  setImage(el("imgLeft"), left.image);
  setImage(el("imgRight"), right.image);

  el("nameLeft").textContent = left.name;
  el("nameRight").textContent = right.name;

  el("countryLeft").textContent = `${countryCodeToFlag(left.countryCode)} ${left.countryName || ""}`.trim();
  el("countryRight").textContent = `${countryCodeToFlag(right.countryCode)} ${right.countryName || ""}`.trim();

  markShown(left);
  markShown(right);
}

function chooseTwoProfiles(pool) {
  if (pool.length < 2) return [null, null];

  for (let i = 0; i < 24; i += 1) {
    const first = pickAnchorCandidate(pool, recentIds) || pickFallbackCandidate(pool, recentIds);
    if (!first) break;

    const second =
      pickClosestCandidate(pool, first, recentIds) ||
      pickFallbackCandidate(pool, [first.id, ...recentIds]);
    if (!second) continue;

    if (!wasPairRecentlyUsed(first, second)) {
      return [first, second];
    }
  }

  const randomA = pickFallbackCandidate(pool);
  const randomB = pickFallbackCandidate(pool, [randomA?.id]);
  return [randomA, randomB];
}

function startFreshRound() {
  if (!has("battle")) return;

  ensureValidContinentForGender();
  updateContinentButtons();

  const pool = getPool();
  if (pool.length < 2) {
    setStatus("Not enough profiles for this mode.");
    clearBattle();
    return;
  }

  setStatus("");
  const [a, b] = chooseTwoProfiles(pool);
  left = a;
  right = b;
  renderPair();
}

function pickChallenger(winner) {
  const pool = getPool();
  if (pool.length < 2 || !winner) return null;

  for (let i = 0; i < 30; i += 1) {
    const candidate =
      pickClosestCandidate(pool, winner, recentIds) ||
      pickFallbackCandidate(pool, [winner.id, ...recentIds]);
    if (!candidate) continue;
    if (!wasPairRecentlyUsed(candidate, winner)) return candidate;
  }

  return pickClosestCandidate(pool, winner) || pickFallbackCandidate(pool, [winner.id]);
}

function continueRoundKeepingWinner(side) {
  if (!has("battle")) return;

  if (side === "left" && left) {
    right = pickChallenger(left) || right;
  } else if (side === "right" && right) {
    left = pickChallenger(right) || left;
  }

  renderPair();
}

function sortedPool(gender) {
  return [...getPool(gender, currentContinent)].sort((a, b) => {
    const powerA = eduardoPriority(a);
    const powerB = eduardoPriority(b);
    if (powerB !== powerA) return powerB - powerA;

    const mainstreamA = a.mainstreamScore || 0;
    const mainstreamB = b.mainstreamScore || 0;
    if (mainstreamB !== mainstreamA) return mainstreamB - mainstreamA;

    return (b.popularity || 0) - (a.popularity || 0);
  });
}

function renderRanking(listId, gender, limit = null) {
  const list = el(listId);
  if (!list) return;

  list.innerHTML = "";
  const sorted = sortedPool(gender);
  const subset = limit ? sorted.slice(0, limit) : sorted;

  subset.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = `${c.name} - ${c.countryName || ""}`.trim();
    list.appendChild(li);
  });
}

function renderChampionCard(containerId, gender) {
  const box = el(containerId);
  if (!box) return;

  const body = box.querySelector(".champion-body");
  if (!body) return;

  const sorted = sortedPool(gender);
  const top = sorted[0];

  if (!top) {
    body.innerHTML = "<p class=\"champion-meta\">No data yet.</p>";
    return;
  }

  body.innerHTML = `
    <img src="${top.image}" alt="${top.name}" loading="lazy">
    <div>
      <p class="champion-name">${top.name}</p>
      <p class="champion-meta">${countryCodeToFlag(top.countryCode)} ${top.countryName || ""}</p>
    </div>
  `;
}

function updateTopRankings() {
  const label = CONTINENT_LABEL[currentContinent] || "World";

  const maleTop = el("maleTopTitle");
  const femaleTop = el("femaleTopTitle");
  if (maleTop) maleTop.textContent = `Top 10 Men - ${label}`;
  if (femaleTop) femaleTop.textContent = `Top 10 Women - ${label}`;

  renderRanking("rankingMaleTop", "male", 10);
  renderRanking("rankingFemaleTop", "female", 10);
  renderChampionCard("maleChampion", "male");
  renderChampionCard("femaleChampion", "female");
}

function renderFullRankings() {
  const label = CONTINENT_LABEL[currentContinent] || "World";
  const maleTitle = el("maleRankingTitle");
  const femaleTitle = el("femaleRankingTitle");

  if (maleTitle) maleTitle.textContent = `${label} Men Ranking`;
  if (femaleTitle) femaleTitle.textContent = `${label} Women Ranking`;

  renderRanking("rankingMaleFull", "male");
  renderRanking("rankingFemaleFull", "female");
  renderChampionCard("maleChampion", "male");
  renderChampionCard("femaleChampion", "female");
}

function countryRankingPool(countryCode, gender = currentGender) {
  return celebs
    .filter((c) => c.countryCode === countryCode && c.gender === gender)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.popularity || 0) - (a.popularity || 0);
    });
}

function topForCountry(countryCode) {
  const filteredByGender = countryRankingPool(countryCode, currentGender);
  if (filteredByGender.length) return filteredByGender[0];

  const fallback = celebs
    .filter((c) => c.countryCode === countryCode)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.popularity || 0) - (a.popularity || 0);
    });

  return fallback.length ? fallback[0] : null;
}

function hideCountryRanking() {
  const panel = el("countryRankingPanel");
  if (!panel) return;
  panel.classList.add("hidden");
}

function renderCountryRanking(countryCode = selectedCountryCode) {
  const panel = el("countryRankingPanel");
  const title = el("countryRankingTitle");
  const list = el("countryRankingList");
  if (!panel || !title || !list || !countryCode) return;

  const ranked = countryRankingPool(countryCode, currentGender);
  const fallback = ranked.length
    ? ranked
    : celebs
      .filter((c) => c.countryCode === countryCode)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.popularity || 0) - (a.popularity || 0);
      });

  if (!fallback.length) {
    title.textContent = `${countryCode.toUpperCase()} - Aucun profil`;
    list.innerHTML = "<li>Aucun profil disponible pour ce pays.</li>";
    panel.classList.remove("hidden");
    return;
  }

  const display = fallback.slice(0, 10);
  const countryName = fallback[0].countryName || countryCode.toUpperCase();
  const flag = countryCodeToFlag(countryCode);
  const genderLabel = currentGender === "male" ? "Men" : "Women";

  title.textContent = `${flag} ${countryName} - Top ${display.length} ${genderLabel}`.trim();
  list.innerHTML = "";

  display.forEach((c, idx) => {
    const li = document.createElement("li");
    li.textContent = `${idx + 1}. ${c.name}`;
    list.appendChild(li);
  });

  panel.classList.remove("hidden");
}

function showCountryRanking(countryCode) {
  if (countryCode) selectedCountryCode = countryCode;
  renderCountryRanking(selectedCountryCode);
}

function renderCountrySpotlight(countryCode) {
  const card = el("countrySpotlight");
  if (!card) return;

  selectedCountryCode = countryCode;
  const top = topForCountry(countryCode);

  if (!top) {
    card.innerHTML = `<p>Aucun profil pour ${countryCode.toUpperCase()}.</p>`;
    hideCountryRanking();
    return;
  }

  card.innerHTML = `
    <div class="spotlight-wrap">
      <img src="${top.image}" alt="${top.name}" class="spotlight-img" loading="lazy">
      <div class="spotlight-meta">
        <h4>${countryCodeToFlag(countryCode)} ${top.countryName || countryCode.toUpperCase()}</h4>
        <p><strong>${top.name}</strong></p>
        <p>Top 1 (${top.gender === "male" ? "Men" : "Women"})</p>
        <button type="button" class="country-ranking-btn" onclick="showCountryRanking('${countryCode}')">Voir le classement du pays</button>
      </div>
    </div>
  `;

  hideCountryRanking();
}
function updateMapValues() {
  if (!worldMap || !worldMap.series || !worldMap.series.regions || !worldMap.series.regions[0]) return;

  const values = {};
  celebs.forEach((c) => {
    if (!c.countryCode) return;
    const key = c.countryCode.toUpperCase();
    values[key] = (values[key] || 0) + 1;
  });

  worldMap.series.regions[0].setValues(values);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((s) => s.src && s.src.includes(src));
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else existing.addEventListener("load", resolve, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureMapLibrary() {
  if (!window.jsVectorMap) {
    const coreCandidates = [
      "https://cdn.jsdelivr.net/npm/jsvectormap/dist/jsvectormap.min.js",
      "https://unpkg.com/jsvectormap/dist/jsvectormap.min.js",
    ];

    let loaded = false;
    for (const src of coreCandidates) {
      try {
        await loadScript(src);
        loaded = true;
        break;
      } catch {
        // try next source
      }
    }

    if (!loaded || !window.jsVectorMap) return false;
  }

  const maps = window.jsVectorMap.maps || {};
  if (maps.world_merc || maps.world) return true;

  const mapCandidates = [
    "https://cdn.jsdelivr.net/npm/jsvectormap/dist/maps/world-merc.js",
    "https://cdn.jsdelivr.net/npm/jsvectormap/dist/maps/world.js",
    "https://unpkg.com/jsvectormap/dist/maps/world-merc.js",
    "https://unpkg.com/jsvectormap/dist/maps/world.js",
  ];

  for (const src of mapCandidates) {
    try {
      await loadScript(src);
      const m = window.jsVectorMap.maps || {};
      if (m.world_merc || m.world) return true;
    } catch {
      // continue
    }
  }

  return false;
}

async function ensureGoogleGeoChart() {
  if (!window.google || !window.google.charts) {
    try {
      await loadScript("https://www.gstatic.com/charts/loader.js");
    } catch {
      return false;
    }
  }

  return new Promise((resolve) => {
    try {
      window.google.charts.load("current", { packages: ["geochart"] });
      window.google.charts.setOnLoadCallback(() => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

function renderGoogleGeoChart(mapEl) {
  if (!window.google || !window.google.visualization) return false;

  const byCountry = new Map();
  celebs.forEach((c) => {
    if (!c.countryCode) return;
    const key = c.countryCode.toUpperCase();
    byCountry.set(key, (byCountry.get(key) || 0) + 1);
  });

  const rows = [["Country", "Profiles"]];
  byCountry.forEach((value, code) => rows.push([code, value]));

  if (rows.length <= 1) {
    mapEl.innerHTML = "<p>No country data for map rendering.</p>";
    return false;
  }

  const data = window.google.visualization.arrayToDataTable(rows);
  const chart = new window.google.visualization.GeoChart(mapEl);

  window.google.visualization.events.addListener(chart, "select", () => {
    const selection = chart.getSelection();
    if (!selection.length) return;
    const rowIndex = selection[0].row;
    const code = String(data.getValue(rowIndex, 0) || "").toLowerCase();
    if (code) renderCountrySpotlight(code);
  });

  chart.draw(data, {
    legend: "none",
    colorAxis: { colors: ["#f8d8d2", "#da2d20"] },
    backgroundColor: "#ffffff",
    datalessRegionColor: "#efefef",
    defaultColor: "#ede8e6",
  });

  return true;
}

function renderCountryListFallback(mapEl) {
  const byCountry = new Map();
  celebs.forEach((c) => {
    if (!c.countryCode || !c.countryName) return;
    if (!byCountry.has(c.countryCode)) byCountry.set(c.countryCode, c.countryName);
  });

  const countries = [...byCountry.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  if (!countries.length) {
    mapEl.innerHTML = "<p>The world map failed to load and no country data is available.</p>";
    return;
  }

  mapEl.innerHTML = `
    <div class="map-fallback">
      <p>Interactive world map unavailable. Select a country below.</p>
      <div id="countryGridFallback" class="country-grid"></div>
    </div>
  `;

  const grid = el("countryGridFallback");
  if (!grid) return;

  countries.forEach(([code, name]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "country-btn";
    btn.textContent = `${countryCodeToFlag(code)} ${name}`.trim();
    btn.onclick = () => renderCountrySpotlight(code);
    grid.appendChild(btn);
  });
}

function resolveMapName() {
  const maps = window.jsVectorMap && window.jsVectorMap.maps ? window.jsVectorMap.maps : {};
  const preferred = ["world_merc", "world", "worldMill", "world_mill"];

  for (const name of preferred) {
    if (maps[name]) return name;
  }

  const keys = Object.keys(maps);
  return keys.length ? keys[0] : null;
}

async function initWorldMap() {
  if (!has("worldMap")) return;

  const mapEl = el("worldMap");
  mapEl.innerHTML = "<p>Loading world map...</p>";

  const ok = await ensureMapLibrary();
  if (ok) {
    const mapName = resolveMapName();
    if (mapName) {
      mapEl.innerHTML = "";

      worldMap = new jsVectorMap({
        selector: "#worldMap",
        map: mapName,
        zoomOnScroll: true,
        regionStyle: {
          initial: {
            fill: "#ece8e6",
            stroke: "#bbb1ad",
            strokeWidth: 0.7,
          },
          hover: {
            fill: "#f06c5f",
          },
          selected: {
            fill: "#da2d20",
          },
        },
        series: {
          regions: [{
            attribute: "fill",
            scale: ["#f8d8d2", "#da2d20"],
            values: {},
            normalizeFunction: "polynomial",
          }],
        },
        onRegionClick: (event, code) => {
          event.preventDefault();
          renderCountrySpotlight(String(code).toLowerCase());
        },
      });

      updateMapValues();
      return;
    }
  }

  const geoReady = await ensureGoogleGeoChart();
  if (geoReady) {
    mapEl.innerHTML = "";
    const drawn = renderGoogleGeoChart(mapEl);
    if (drawn) return;
  }

  renderCountryListFallback(mapEl);
  setStatus("Interactive map libraries unavailable. Fallback country selector loaded.");
}

function calculateAge(dateString) {
  const birth = new Date(dateString);
  if (Number.isNaN(birth.getTime())) return 0;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function requiredMajorAge(countryCode) {
  return MAJORITY_BY_COUNTRY[countryCode] || 18;
}

function populateCountryOptions(selectEl) {
  if (!selectEl) return;

  const byCode = new Map();
  celebs.forEach((c) => {
    if (!c.countryCode || !c.countryName) return;
    if (!byCode.has(c.countryCode)) byCode.set(c.countryCode, c.countryName);
  });

  const options = [...byCode.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sourceOptions = options.length ? options : FALLBACK_COUNTRIES;
  selectEl.innerHTML = "";

  sourceOptions.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name;
    selectEl.appendChild(option);
  });
}

function initProfileForm() {
  if (!has("profileForm") || profileInitialized) return;
  profileInitialized = true;

  const form = el("profileForm");
  const nameInput = el("profileName");
  const emailInput = el("profileEmail");
  const birthInput = el("profileBirth");
  const relationInput = el("profileRelation");
  const countryInput = el("profileCountry");
  const photoInput = el("profilePhoto");
  const identityType = el("identityType");
  const identityFile = el("identityFile");
  const ageDeclaration = el("ageDeclaration");
  const preview = el("profilePreview");
  const msg = el("profileMsg");

  const setMessage = (text, isError = false) => {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isError ? "#a10f07" : "#16624a";
  };

  populateCountryOptions(countryInput);

  const saved = localStorage.getItem("facemash_profile");
  if (saved) {
    try {
      const p = JSON.parse(saved);
      nameInput.value = p.name || "";
      emailInput.value = p.email || "";
      birthInput.value = p.birthDate || "";
      relationInput.value = p.relationship || "single";
      if (p.countryCode) countryInput.value = p.countryCode;
      if (p.photoDataUrl) {
        preview.src = p.photoDataUrl;
        preview.classList.remove("hidden");
      }
      if (ageDeclaration) ageDeclaration.checked = Boolean(p.ageDeclaration);
      setMessage("Local profile loaded on this device.");
    } catch {
      // ignore invalid local payload
    }
  }

  photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      preview.src = String(reader.result);
      preview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const countryCode = countryInput.value;
    const age = calculateAge(birthInput.value);
    const requiredAge = requiredMajorAge(countryCode);

    if (age < requiredAge) {
      setMessage(`Minimum age for ${countryInput.selectedOptions[0]?.textContent || "this country"} is ${requiredAge}.`, true);
      return;
    }

    if (!identityType.value || !identityFile.files || !identityFile.files[0]) {
      setMessage("Identity document type and file are required.", true);
      return;
    }

    if (!ageDeclaration.checked) {
      setMessage("You must confirm legal age and document validity.", true);
      return;
    }

    const profile = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      birthDate: birthInput.value,
      relationship: relationInput.value,
      countryCode,
      countryName: countryInput.selectedOptions[0]?.textContent || "",
      identityType: identityType.value,
      identityFileName: identityFile.files[0].name,
      ageDeclaration: ageDeclaration.checked,
      photoDataUrl: preview.classList.contains("hidden") ? "" : preview.src,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem("facemash_profile", JSON.stringify(profile));
    setMessage("Profile saved locally. Verification services can be connected later.");
  });
}

function setGender(gender) {
  currentGender = gender;
  ensureValidContinentForGender();

  updateModeButtons();
  updateQuestionLine();
  updateContinentButtons();

  updateTopRankings();
  renderFullRankings();

  if (has("battle")) startFreshRound();
  if (has("worldMap") && selectedCountryCode) renderCountrySpotlight(selectedCountryCode);
}

function setContinent(continent) {
  currentContinent = continent;
  ensureValidContinentForGender();
  updateContinentButtons();

  updateTopRankings();
  renderFullRankings();

  if (has("battle")) startFreshRound();
}

function vote(side) {
  if (!left || !right || !has("battle")) return;

  rememberPair(left, right);

  if (side === "left") {
    updateElo(left, right);
    continueRoundKeepingWinner("left");
  } else if (side === "right") {
    updateElo(right, left);
    continueRoundKeepingWinner("right");
  }

  updateTopRankings();
  renderFullRankings();

  if (has("worldMap") && selectedCountryCode) {
    renderCountrySpotlight(selectedCountryCode);
  }
}

function applyCountryOverrides(record) {
  if (record.id === "Q615") {
    record.countryName = "Argentina";
    record.countryCode = "ar";
    record.continent = "south-america";
  }
  return record;
}

function extractImageYear(imageUrl) {
  const text = String(imageUrl || "");
  const matches = text.match(/\b(19[6-9]\d|20[0-3]\d)\b/g);
  if (!matches || !matches.length) return 0;

  const maxAllowed = new Date().getFullYear() + 1;
  const years = matches
    .map((value) => Number(value))
    .filter((year) => Number.isFinite(year) && year >= 1960 && year <= maxAllowed);
  if (!years.length) return 0;
  return Math.max(...years);
}

function isInstitutionalProfile(person) {
  const text = `${person?.name || ""} ${person?.image || ""}`.toLowerCase();
  return /(president|presidential|prime minister|official portrait|secretary|senator|parliament|congress|chancellor|governor|minister|royal|king|queen|pope|dictator|emperor|chairman|general)/.test(text);
}

function computeFreshnessScore(imageUrl) {
  const year = extractImageYear(imageUrl);
  if (!year) return 0.35;

  const maxYear = new Date().getFullYear() + 1;
  const span = Math.max(1, maxYear - MIN_IMAGE_YEAR);
  const normalized = (year - MIN_IMAGE_YEAR) / span;
  return Math.max(0, Math.min(1, normalized));
}

function computeMainstreamScore(person) {
  const popularity = Math.max(0, Number(person?.popularity) || 0);
  const freshness = Number(person?.freshnessScore);
  const normalizedFreshness = Number.isFinite(freshness) ? freshness : 0.35;
  const hasCountry = Boolean(person?.countryCode);
  const institutionalPenalty = person?.institutional ? INSTITUTIONAL_PENALTY : 0;

  return popularity + normalizedFreshness * 36 + (hasCountry ? 8 : -8) - institutionalPenalty;
}

function readRatingsStore() {
  try {
    const raw = localStorage.getItem(RATING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRatingsStore() {
  localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(ratingsByCeleb));
}

function popularityBaseScore(person) {
  const pop = Math.max(0, Number(person?.popularity) || 0);
  const normalized = Math.sqrt(pop / Math.max(1, maxPopularityInDataset));
  return 1 + normalized * 4;
}

function criteriaWeightedScore(criteria) {
  return RATING_CRITERIA.reduce((sum, criterion) => {
    const value = Number(criteria[criterion.id]) || 0;
    return sum + (value * criterion.weight);
  }, 0);
}

function compositePersonalityScore(person) {
  const entry = ratingsByCeleb[person.id];
  const base = popularityBaseScore(person);
  if (!entry || !entry.criteriaScore) return Number(base.toFixed(2));
  return Number((entry.criteriaScore * 0.85 + base * 0.15).toFixed(2));
}

function findCelebBySearch(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;

  const exact = celebs.find((c) => c.name.toLowerCase() === q);
  if (exact) return exact;

  return celebs.find((c) => c.name.toLowerCase().includes(q)) || null;
}

function setRateStatus(message, isError = false) {
  const node = el("rateStatus");
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "#a10f07" : "#16624a";
}

function renderRateCriteriaRows() {
  const host = el("criteriaRows");
  if (!host) return;

  host.innerHTML = "";

  RATING_CRITERIA.forEach((criterion) => {
    const row = document.createElement("div");
    row.className = "criteria-row";

    const head = document.createElement("div");
    head.className = "criteria-head";

    const label = document.createElement("span");
    label.textContent = `${criterion.label} (${Math.round(criterion.weight * 100)}%)`;

    const score = document.createElement("strong");
    score.id = `criterionScore_${criterion.id}`;
    score.textContent = "0/5";

    head.appendChild(label);
    head.appendChild(score);

    const stars = document.createElement("div");
    stars.className = "star-row";

    for (let i = 1; i <= 5; i += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "star-btn";
      btn.dataset.criterion = criterion.id;
      btn.dataset.value = String(i);
      btn.innerHTML = "&#9733;";
      btn.onclick = () => {
        currentCriteriaSelection[criterion.id] = i;
        renderRateStars(criterion.id);
      };
      stars.appendChild(btn);
    }

    row.appendChild(head);
    row.appendChild(stars);
    host.appendChild(row);
  });
}

function renderRateStars(criterionId) {
  const value = Number(currentCriteriaSelection[criterionId]) || 0;
  const scoreNode = el(`criterionScore_${criterionId}`);
  if (scoreNode) scoreNode.textContent = `${value}/5`;

  document.querySelectorAll(`.star-btn[data-criterion="${criterionId}"]`).forEach((btn) => {
    const btnValue = Number(btn.dataset.value) || 0;
    btn.classList.toggle("active", btnValue <= value);
  });
}

function resetRateForm(disabled = false) {
  currentCriteriaSelection = {};
  RATING_CRITERIA.forEach((criterion) => {
    currentCriteriaSelection[criterion.id] = 0;
    renderRateStars(criterion.id);
  });

  const submit = el("rateSubmit");
  if (submit) submit.disabled = disabled;
}

function renderSelectedRatePerson(person) {
  const box = el("rateSelected");
  if (!box) return;

  if (!person) {
    box.innerHTML = "<p>Select a celebrity to start rating.</p>";
    return;
  }

  box.innerHTML = `
    <div class="rate-person-card">
      <img src="${person.image}" alt="${person.name}" loading="lazy">
      <div class="rate-person-meta">
        <h3>${person.name}</h3>
        <p>${countryCodeToFlag(person.countryCode)} ${person.countryName || "Unknown country"}</p>
        <p>${person.gender === "male" ? "Male" : "Female"} celebrity</p>
      </div>
    </div>
  `;
}

function renderRateRanking() {
  const list = el("ratingRankingList");
  if (!list) return;

  const ranked = [...celebs]
    .map((person) => {
      const entry = ratingsByCeleb[person.id];
      return {
        person,
        score: compositePersonalityScore(person),
        hasLocalVote: Boolean(entry),
        criteriaScore: entry?.criteriaScore || 0,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (Number(b.hasLocalVote) !== Number(a.hasLocalVote)) return Number(b.hasLocalVote) - Number(a.hasLocalVote);
      return (b.person.popularity || 0) - (a.person.popularity || 0);
    });

  list.innerHTML = "";
  ranked.slice(0, 100).forEach((row, idx) => {
    const li = document.createElement("li");
    const localTag = row.hasLocalVote ? ` - You rated: ${row.criteriaScore.toFixed(2)}/5` : "";
    li.textContent = `${idx + 1}. ${row.person.name} - ${row.person.countryName || ""} (${row.score.toFixed(2)}/5${localTag})`;
    list.appendChild(li);
  });
}

function selectRatePersonByQuery(query) {
  const clean = String(query || "").trim();
  if (!clean) {
    selectedRatedCeleb = null;
    renderSelectedRatePerson(null);
    const form = el("rateForm");
    if (form) form.classList.add("hidden");
    setRateStatus("Search and rate one personality.");
    return;
  }

  const person = findCelebBySearch(clean);
  if (!person) {
    selectedRatedCeleb = null;
    renderSelectedRatePerson(null);
    const form = el("rateForm");
    if (form) form.classList.add("hidden");
    setRateStatus("Celebrity not found in current dataset.", true);
    return;
  }

  selectedRatedCeleb = person;
  renderSelectedRatePerson(person);

  const form = el("rateForm");
  if (form) form.classList.remove("hidden");

  const existing = ratingsByCeleb[person.id];
  if (existing && existing.criteria) {
    currentCriteriaSelection = {};
    RATING_CRITERIA.forEach((criterion) => {
      currentCriteriaSelection[criterion.id] = Number(existing.criteria[criterion.id]) || 0;
      renderRateStars(criterion.id);
    });

    const submit = el("rateSubmit");
    if (submit) submit.disabled = true;

    setRateStatus("You already rated this personality on this device.");
    return;
  }

  resetRateForm(false);
  setRateStatus(`Ready to rate ${person.name}.`);
}

function initRatingPage() {
  if (!has("ratePage") || ratingPageInitialized) return;
  ratingPageInitialized = true;

  ratingsByCeleb = readRatingsStore();
  renderRateCriteriaRows();
  renderRateRanking();

  const suggestions = el("rateSuggestions");
  if (suggestions) {
    suggestions.innerHTML = "";
    [...celebs]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .forEach((person) => {
        const option = document.createElement("option");
        option.value = person.name;
        option.label = `${person.name} - ${person.countryName || "Unknown"}`;
        suggestions.appendChild(option);
      });
  }

  const search = el("rateSearch");
  if (search) {
    const searchHandler = () => selectRatePersonByQuery(search.value);
    search.addEventListener("input", searchHandler);
    search.addEventListener("change", searchHandler);
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchHandler();
      }
    });
    setTimeout(() => search.focus(), 80);
  }

  const form = el("rateForm");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!selectedRatedCeleb) {
        setRateStatus("Select a celebrity first.", true);
        return;
      }

      if (ratingsByCeleb[selectedRatedCeleb.id]) {
        setRateStatus("This device already rated this personality.", true);
        const submit = el("rateSubmit");
        if (submit) submit.disabled = true;
        return;
      }

      const missing = RATING_CRITERIA.find((criterion) => (Number(currentCriteriaSelection[criterion.id]) || 0) < 1);
      if (missing) {
        setRateStatus(`Please rate ${missing.label}.`, true);
        return;
      }

      const criteria = {};
      RATING_CRITERIA.forEach((criterion) => {
        criteria[criterion.id] = Number(currentCriteriaSelection[criterion.id]) || 0;
      });

      const criteriaScore = Number(criteriaWeightedScore(criteria).toFixed(2));
      ratingsByCeleb[selectedRatedCeleb.id] = {
        criteria,
        criteriaScore,
        votedAt: new Date().toISOString(),
      };
      saveRatingsStore();

      const submit = el("rateSubmit");
      if (submit) submit.disabled = true;

      setRateStatus(`Rating saved for ${selectedRatedCeleb.name}: ${criteriaScore.toFixed(2)}/5.`);
      renderRateRanking();
    });
  }

  setRateStatus("Search and rate one personality.");
}

function initCookieBanner() {
  const banner = el("cookie-banner");
  if (!banner) return;
  banner.classList.remove("hidden");
  banner.style.display = "flex";
}

function acceptCookies() {
  const banner = el("cookie-banner");
  if (banner) banner.style.display = "none";
}

function rejectCookies() {
  const banner = el("cookie-banner");
  if (banner) banner.style.display = "none";
}

async function loadCelebs() {
  const needsData = has("battle") || has("rankingMaleFull") || has("worldMap") || has("modeMale") || has("ratePage");
  if (!needsData) return;

  try {
    const response = await fetch("celebs.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    const seen = new Set();

    const parsedCelebs = raw
      .map((item, index) => {
        const gender = normalizeGender(item.gender);
        const continent = normalizeContinent(item.continent || item.region || item.continentLabel);
        const countryCode = normalizeCountryCode(item.countryCode);
        const popularity = Number.isFinite(item.sitelinks)
          ? item.sitelinks
          : (Number.isFinite(item.popularity) ? item.popularity : 0);
        const id = item.id || `c${index + 1}`;

        if (seen.has(id)) return null;
        if (!item.name || !item.image || !gender || !continent) return null;
        if (String(item.name).match(/^Q\d+$/)) return null;

        seen.add(id);

        const record = applyCountryOverrides({
          id,
          name: String(item.name),
          image: String(item.image).replace(/^http:/, "https:"),
          gender,
          continent,
          countryCode,
          countryName: item.countryName || "",
          popularity,
          score: Number.isFinite(item.score) ? item.score : DEFAULT_SCORE,
          shown: 0,
          votes: 0,
        });

        record.freshnessScore = computeFreshnessScore(record.image);
        record.institutional = isInstitutionalProfile(record);
        record.mainstreamScore = computeMainstreamScore(record);
        return record;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if ((b.mainstreamScore || 0) !== (a.mainstreamScore || 0)) {
          return (b.mainstreamScore || 0) - (a.mainstreamScore || 0);
        }
        return (b.popularity || 0) - (a.popularity || 0);
      });

    const strictMainstream = parsedCelebs.filter((c) =>
      (c.popularity || 0) >= MIN_FAME_SCORE
      && (c.mainstreamScore || 0) >= MIN_MAINSTREAM_SCORE
      && !c.institutional
    );
    const relaxedMainstream = parsedCelebs.filter((c) =>
      (c.popularity || 0) >= MIN_FAME_SCORE
      && (c.mainstreamScore || 0) >= (MIN_MAINSTREAM_SCORE - 15)
    );
    celebs = strictMainstream.length >= 400
      ? strictMainstream
      : (relaxedMainstream.length >= 450 ? relaxedMainstream : parsedCelebs);

    if (celebs.length > MAX_ACTIVE_PROFILES) {
      celebs = celebs.slice(0, MAX_ACTIVE_PROFILES);
    }

    maxPopularityInDataset = 1;
    celebs.forEach((c) => {
      const popularity = Number(c.popularity) || 0;
      if (popularity > maxPopularityInDataset) maxPopularityInDataset = popularity;
    });

    if (celebs.length < 2) {
      setStatus("Dataset is too small.");
      clearBattle();
      if (has("profileForm")) initProfileForm();
      if (has("ratePage")) initRatingPage();
      return;
    }

    computeAvailableContinents();
    ensureValidContinentForGender();
    renderContinentTabs();
    updateModeButtons();
    updateQuestionLine();
    updateTopRankings();
    renderFullRankings();

    if (has("battle")) startFreshRound();
    if (has("worldMap")) await initWorldMap();
    if (has("profileForm")) initProfileForm();
    if (has("ratePage")) initRatingPage();

    setStatus("");
  } catch (error) {
    setStatus(`Could not load celebs.json (${error.message})`);
    clearBattle();

    if (has("worldMap")) {
      const mapEl = el("worldMap");
      if (mapEl) renderCountryListFallback(mapEl);
    }

    if (has("profileForm")) initProfileForm();
    if (has("ratePage")) initRatingPage();
  }
}

window.acceptCookies = acceptCookies;
window.rejectCookies = rejectCookies;
window.setGender = setGender;
window.setContinent = setContinent;
window.vote = vote;
window.showCountryRanking = showCountryRanking;

document.addEventListener("DOMContentLoaded", () => {
  initCookieBanner();
  loadCelebs();
});











