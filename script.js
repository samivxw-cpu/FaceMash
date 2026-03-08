const K = 32;
const DEFAULT_SCORE = 1200;
const AFRICA_MIN_TAB_COUNT = 300;
const MAX_ACTIVE_PROFILES = 5000;
const MIN_FAME_SCORE = 45;
const FALLBACK_IMG = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";
const MAX_RECENT_IDS = 48;
const MAX_RECENT_PAIRS = 320;

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

function updateElo(winner, loser) {
  const expectedWinner = expectedScore(winner.score, loser.score);
  const expectedLoser = expectedScore(loser.score, winner.score);

  winner.score = Math.round(winner.score + K * (1 - expectedWinner));
  loser.score = Math.round(loser.score + K * (0 - expectedLoser));
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

function pickCandidate(pool, excludeIds = []) {
  if (!pool.length) return null;

  const exclude = new Set(excludeIds.filter(Boolean));
  let candidates = pool.filter((p) => !exclude.has(p.id));
  if (!candidates.length) return null;

  const nonRecent = candidates.filter((p) => !recentIds.includes(p.id));
  if (nonRecent.length >= 10) candidates = nonRecent;

  candidates.sort((a, b) => {
    const shownA = a.shown || 0;
    const shownB = b.shown || 0;
    if (shownA !== shownB) return shownA - shownB;

    const votesA = a.votes || 0;
    const votesB = b.votes || 0;
    if (votesA !== votesB) return votesA - votesB;

    return (b.popularity || 0) - (a.popularity || 0);
  });

  const windowSize = Math.min(40, candidates.length);
  const shortList = candidates.slice(0, windowSize);
  return shortList[Math.floor(Math.random() * shortList.length)];
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
    const first = pickCandidate(pool, recentIds);
    if (!first) break;

    const second = pickCandidate(pool, [first.id, ...recentIds]);
    if (!second) continue;

    if (!wasPairRecentlyUsed(first, second)) {
      return [first, second];
    }
  }

  const randomA = pool[Math.floor(Math.random() * pool.length)];
  let randomB = pool[Math.floor(Math.random() * pool.length)];
  while (randomB && randomA && randomB.id === randomA.id) {
    randomB = pool[Math.floor(Math.random() * pool.length)];
  }
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
    const candidate = pickCandidate(pool, [winner.id, ...recentIds]);
    if (!candidate) continue;
    if (!wasPairRecentlyUsed(candidate, winner)) return candidate;
  }

  return pickCandidate(pool, [winner.id]);
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
    if (b.score !== a.score) return b.score - a.score;
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

function topForCountry(countryCode) {
  const filteredByGender = celebs.filter((c) => c.countryCode === countryCode && c.gender === currentGender);
  if (filteredByGender.length) {
    return [...filteredByGender].sort((a, b) => b.score - a.score)[0];
  }

  const fallback = celebs.filter((c) => c.countryCode === countryCode);
  if (!fallback.length) return null;
  return [...fallback].sort((a, b) => b.score - a.score)[0];
}

function renderCountrySpotlight(countryCode) {
  const card = el("countrySpotlight");
  if (!card) return;

  selectedCountryCode = countryCode;
  const top = topForCountry(countryCode);

  if (!top) {
    card.innerHTML = `<p>No profile data for ${countryCode.toUpperCase()} yet.</p>`;
    return;
  }

  card.innerHTML = `
    <div class="spotlight-wrap">
      <img src="${top.image}" alt="${top.name}" class="spotlight-img" loading="lazy">
      <div class="spotlight-meta">
        <h4>${countryCodeToFlag(countryCode)} ${top.countryName || countryCode.toUpperCase()}</h4>
        <p><strong>${top.name}</strong></p>
        <p>Top profile (${top.gender === "male" ? "Man" : "Woman"})</p>
      </div>
    </div>
  `;
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

function initCookieBanner() {
  const banner = el("cookie-banner");
  if (!banner) return;
  banner.style.display = "flex";
}

function acceptCookies() {
  const banner = el("cookie-banner");
  if (banner) banner.style.display = "none";
  localStorage.setItem("cookiesAccepted", "true");
}

function rejectCookies() {
  const banner = el("cookie-banner");
  if (banner) banner.style.display = "none";
  localStorage.setItem("cookiesAccepted", "rejected");
}

async function loadCelebs() {
  const needsData = has("battle") || has("rankingMaleFull") || has("worldMap") || has("modeMale");
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

        return applyCountryOverrides({
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
      })
      .filter(Boolean)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    const highFame = parsedCelebs.filter((c) => (c.popularity || 0) >= MIN_FAME_SCORE);
    celebs = highFame.length >= 700 ? highFame : parsedCelebs;

    if (celebs.length > MAX_ACTIVE_PROFILES) {
      celebs = celebs.slice(0, MAX_ACTIVE_PROFILES);
    }

    if (celebs.length < 2) {
      setStatus("Dataset is too small.");
      clearBattle();
      if (has("profileForm")) initProfileForm();
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

    setStatus("");
  } catch (error) {
    setStatus(`Could not load celebs.json (${error.message})`);
    clearBattle();

    if (has("worldMap")) {
      const mapEl = el("worldMap");
      if (mapEl) renderCountryListFallback(mapEl);
    }

    if (has("profileForm")) initProfileForm();
  }
}

window.acceptCookies = acceptCookies;
window.rejectCookies = rejectCookies;
window.setGender = setGender;
window.setContinent = setContinent;
window.vote = vote;

document.addEventListener("DOMContentLoaded", () => {
  initCookieBanner();
  loadCelebs();
});


