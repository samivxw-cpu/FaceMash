const K = 32;
const DEFAULT_SCORE = 1200;
const AFRICA_MIN_TAB_COUNT = 300;
const GALLERY_BATCH_SIZE = 120;
const FALLBACK_IMG = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";
const POPULARITY_MIN_WITH_SIGNAL = 85;

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

let celebs = [];
let currentGender = "male";
let currentContinent = "world";
let currentView = "battle";
let availableContinents = ["world"];
let left = null;
let right = null;
let galleryCursor = 0;
let galleryData = [];
let rankingsDirty = true;
let worldMap = null;
let selectedCountryCode = null;
let profileInitialized = false;

function expectedScore(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function updateElo(winner, loser) {
  const expectedWinner = expectedScore(winner.score, loser.score);
  const expectedLoser = expectedScore(loser.score, winner.score);

  winner.score = Math.round(winner.score + K * (1 - expectedWinner));
  loser.score = Math.round(loser.score + K * (0 - expectedLoser));
}

function setStatus(message) {
  document.getElementById("status").textContent = message;
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
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = FALLBACK_IMG;
  };
  imgEl.src = url;
}

function setView(view) {
  currentView = view;
  document.getElementById("battleView").classList.toggle("hidden", view !== "battle");
  document.getElementById("rankingView").classList.toggle("hidden", view !== "ranking");
  document.getElementById("tabBattle").classList.toggle("active", view === "battle");
  document.getElementById("tabRanking").classList.toggle("active", view === "ranking");

  if (view === "ranking" && rankingsDirty) {
    renderFullRankings();
  }
}

function getPool(gender = currentGender, continent = currentContinent) {
  const byGender = celebs.filter((c) => c.gender === gender);
  if (continent === "world") return byGender;
  return byGender.filter((c) => c.continent === continent);
}

function ensureValidContinentForCurrentGender() {
  const valid = availableContinents.find((continent) => getPool(currentGender, continent).length >= 2);
  if (!valid) {
    currentContinent = "world";
    return;
  }

  if (!getPool(currentGender, currentContinent).length) {
    currentContinent = valid;
  }
}

function updateQuestionLine() {
  const line = document.getElementById("questionLine");
  if (currentGender === "male") {
    line.textContent = "Who is more handsome, left or right?";
  } else {
    line.textContent = "Who is more beautiful, left or right?";
  }
}

function updateModeButtons() {
  document.getElementById("modeMale").classList.toggle("active", currentGender === "male");
  document.getElementById("modeFemale").classList.toggle("active", currentGender === "female");
}

function updateContinentButtons() {
  const tabs = document.getElementById("continentTabs");
  tabs.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.continent === currentContinent);
  });
}

function buildContinentTabs() {
  const counts = new Map();

  celebs.forEach((c) => {
    counts.set(c.continent, (counts.get(c.continent) || 0) + 1);
  });

  const dynamicContinents = CONTINENT_ORDER
    .filter((continent) => continent !== "world")
    .filter((continent) => {
      const count = counts.get(continent) || 0;
      if (count === 0) return false;
      if (continent === "africa" && count < AFRICA_MIN_TAB_COUNT) return false;
      return true;
    });

  availableContinents = ["world", ...dynamicContinents];

  const tabs = document.getElementById("continentTabs");
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

  if (!availableContinents.includes(currentContinent)) {
    currentContinent = "world";
  }

  ensureValidContinentForCurrentGender();
  updateContinentButtons();
}

function clearBattle() {
  left = null;
  right = null;
  document.getElementById("imgLeft").removeAttribute("src");
  document.getElementById("imgRight").removeAttribute("src");
  document.getElementById("nameLeft").textContent = "-";
  document.getElementById("nameRight").textContent = "-";
  document.getElementById("countryLeft").textContent = "";
  document.getElementById("countryRight").textContent = "";
}

function featuredSubset(pool) {
  const sorted = [...pool].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return sorted.slice(0, Math.min(220, sorted.length));
}

function pickRandom(pool, excludeIds = []) {
  const candidates = pool.filter((p) => !excludeIds.includes(p.id));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function renderPair() {
  if (!left || !right) {
    clearBattle();
    return;
  }

  setImage(document.getElementById("imgLeft"), left.image);
  setImage(document.getElementById("imgRight"), right.image);
  document.getElementById("nameLeft").textContent = left.name;
  document.getElementById("nameRight").textContent = right.name;

  const leftFlag = countryCodeToFlag(left.countryCode);
  const rightFlag = countryCodeToFlag(right.countryCode);
  document.getElementById("countryLeft").textContent = `${leftFlag} ${left.countryName || ""}`.trim();
  document.getElementById("countryRight").textContent = `${rightFlag} ${right.countryName || ""}`.trim();
}

function startFreshRound() {
  ensureValidContinentForCurrentGender();
  updateContinentButtons();

  const pool = getPool();
  if (pool.length < 2) {
    setStatus("Not enough profiles for this mode.");
    clearBattle();
    return;
  }

  setStatus("");
  const featured = featuredSubset(pool);
  left = pickRandom(featured);
  right = pickRandom(featured, [left.id]);

  if (!left || !right) {
    left = pickRandom(pool);
    right = pickRandom(pool, [left.id]);
  }

  renderPair();
}

function continueRoundKeepingWinner(side) {
  const pool = getPool();
  if (pool.length < 2) {
    startFreshRound();
    return;
  }

  const featured = featuredSubset(pool);

  if (side === "left") {
    right = pickRandom(featured, [left.id]) || pickRandom(pool, [left.id]);
  }

  if (side === "right") {
    left = pickRandom(featured, [right.id]) || pickRandom(pool, [right.id]);
  }

  renderPair();
}

function setGender(gender) {
  currentGender = gender;
  updateModeButtons();
  updateQuestionLine();
  ensureValidContinentForCurrentGender();
  updateContinentButtons();

  rankingsDirty = true;
  updateTopRankings();
  if (currentView === "ranking") renderFullRankings();

  initGallery();
  startFreshRound();

  if (selectedCountryCode) {
    renderCountrySpotlight(selectedCountryCode);
  }
}

function setContinent(continent) {
  currentContinent = continent;
  ensureValidContinentForCurrentGender();
  updateContinentButtons();

  rankingsDirty = true;
  updateTopRankings();
  if (currentView === "ranking") renderFullRankings();

  initGallery();
  startFreshRound();
}

function vote(side) {
  if (!left || !right) return;

  if (side === "left") {
    updateElo(left, right);
    continueRoundKeepingWinner("left");
  }

  if (side === "right") {
    updateElo(right, left);
    continueRoundKeepingWinner("right");
  }

  rankingsDirty = true;
  updateTopRankings();
  if (currentView === "ranking") renderFullRankings();

  if (selectedCountryCode) {
    renderCountrySpotlight(selectedCountryCode);
  }
}

function sortedPool(gender) {
  return [...getPool(gender, currentContinent)].sort((a, b) => b.score - a.score);
}

function renderRanking(listId, gender, limit = null) {
  const list = document.getElementById(listId);
  list.innerHTML = "";

  const sorted = sortedPool(gender);
  const subset = limit ? sorted.slice(0, limit) : sorted;

  subset.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = `${c.name} - ${c.countryName || CONTINENT_LABEL[c.continent] || ""}`;
    list.appendChild(li);
  });
}

function updateTopRankings() {
  const label = CONTINENT_LABEL[currentContinent] || "World";
  document.getElementById("maleTopTitle").textContent = `Top 10 Men - ${label}`;
  document.getElementById("femaleTopTitle").textContent = `Top 10 Women - ${label}`;

  renderRanking("rankingMaleTop", "male", 10);
  renderRanking("rankingFemaleTop", "female", 10);
}

function renderFullRankings() {
  const label = CONTINENT_LABEL[currentContinent] || "World";
  document.getElementById("maleRankingTitle").textContent = `${label} Men Ranking`;
  document.getElementById("femaleRankingTitle").textContent = `${label} Women Ranking`;

  renderRanking("rankingMaleFull", "male", null);
  renderRanking("rankingFemaleFull", "female", null);
  rankingsDirty = false;
}

function buildGalleryCard(person) {
  const card = document.createElement("article");
  card.className = "gallery-card";

  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = person.name;
  setImage(img, person.image);

  const title = document.createElement("h4");
  title.textContent = person.name;

  const meta = document.createElement("p");
  const genderLabel = person.gender === "male" ? "Man" : "Woman";
  meta.textContent = `${genderLabel} • ${person.countryName || ""}`;

  card.appendChild(img);
  card.appendChild(title);
  card.appendChild(meta);

  return card;
}

function loadMoreGallery() {
  const gallery = document.getElementById("gallery");
  const start = galleryCursor;
  const end = Math.min(start + GALLERY_BATCH_SIZE, galleryData.length);

  for (let i = start; i < end; i += 1) {
    gallery.appendChild(buildGalleryCard(galleryData[i]));
  }

  galleryCursor = end;

  const btn = document.getElementById("loadMoreBtn");
  if (galleryCursor >= galleryData.length) {
    btn.disabled = true;
    btn.textContent = "Everything loaded";
  }
}

function initGallery() {
  galleryCursor = 0;
  galleryData = [...celebs].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  const gallery = document.getElementById("gallery");
  const btn = document.getElementById("loadMoreBtn");
  gallery.innerHTML = "";
  btn.disabled = false;
  btn.textContent = "Load more";

  const total = galleryData.length;
  const men = galleryData.filter((c) => c.gender === "male").length;
  const women = galleryData.filter((c) => c.gender === "female").length;

  document.getElementById("galleryTitle").textContent = "Celebrity Gallery (All Regions)";
  document.getElementById("galleryCount").textContent = `${total} profiles • ${men} men • ${women} women`;

  loadMoreGallery();
}

function topForCountry(countryCode) {
  const filtered = celebs.filter((c) => c.countryCode === countryCode && c.gender === currentGender);
  if (filtered.length) {
    return [...filtered].sort((a, b) => b.score - a.score)[0];
  }

  const fallback = celebs.filter((c) => c.countryCode === countryCode);
  if (!fallback.length) return null;
  return [...fallback].sort((a, b) => b.score - a.score)[0];
}

function renderCountrySpotlight(countryCode) {
  selectedCountryCode = countryCode;
  const container = document.getElementById("countrySpotlight");
  const top = topForCountry(countryCode);

  if (!top) {
    container.innerHTML = `<p>No profile data for ${countryCode.toUpperCase()} yet.</p>`;
    return;
  }

  const flag = countryCodeToFlag(countryCode);
  const genderLabel = top.gender === "male" ? "Man" : "Woman";

  container.innerHTML = `
    <div class="spotlight-wrap">
      <img src="${top.image}" alt="${top.name}" class="spotlight-img" loading="lazy">
      <div class="spotlight-meta">
        <h4>${flag} ${top.countryName || top.countryCode.toUpperCase()}</h4>
        <p><strong>${top.name}</strong></p>
        <p>Top profile (${genderLabel})</p>
      </div>
    </div>
  `;
}

function updateMapValues() {
  if (!worldMap || !worldMap.series || !worldMap.series.regions[0]) return;

  const values = {};
  celebs.forEach((c) => {
    if (!c.countryCode) return;
    const key = c.countryCode.toUpperCase();
    values[key] = (values[key] || 0) + 1;
  });

  worldMap.series.regions[0].setValues(values);
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

function initWorldMap() {
  const mapEl = document.getElementById("worldMap");

  if (!window.jsVectorMap) {
    mapEl.innerHTML = "<p>The world map failed to load.</p>";
    return;
  }

  const mapName = resolveMapName();
  if (!mapName) {
    mapEl.innerHTML = "<p>The world map failed to load.</p>";
    return;
  }

  mapEl.innerHTML = "";

  worldMap = new jsVectorMap({
    selector: "#worldMap",
    map: mapName,
    zoomOnScroll: true,
    regionStyle: {
      initial: {
        fill: "#ecdcc7",
        stroke: "#cfb99b",
        strokeWidth: 0.7,
      },
      hover: {
        fill: "#d88d80",
      },
      selected: {
        fill: "#b5140c",
      },
    },
    series: {
      regions: [{
        attribute: "fill",
        scale: ["#f4e7d5", "#b5140c"],
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
}

function calculateAge(dateString) {
  const birth = new Date(dateString);
  if (Number.isNaN(birth.getTime())) return 0;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function requiredMajorAge(countryCode) {
  if (!countryCode) return 18;
  return MAJORITY_BY_COUNTRY[countryCode] || 18;
}

function populateCountryOptions(selectEl) {
  const byCode = new Map();

  celebs.forEach((c) => {
    if (!c.countryCode || !c.countryName) return;
    if (!byCode.has(c.countryCode)) byCode.set(c.countryCode, c.countryName);
  });

  const options = [...byCode.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  selectEl.innerHTML = "";

  options.forEach(([code, name]) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });
}

function initProfileForm() {
  if (profileInitialized) return;
  profileInitialized = true;

  const form = document.getElementById("profileForm");
  const nameInput = document.getElementById("profileName");
  const emailInput = document.getElementById("profileEmail");
  const birthInput = document.getElementById("profileBirth");
  const relationInput = document.getElementById("profileRelation");
  const countryInput = document.getElementById("profileCountry");
  const photoInput = document.getElementById("profilePhoto");
  const preview = document.getElementById("profilePreview");
  const msg = document.getElementById("profileMsg");

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
    } catch {
      // ignore
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const countryCode = countryInput.value;
    const age = calculateAge(birthInput.value);
    const required = requiredMajorAge(countryCode);

    if (age < required) {
      msg.textContent = `Minimum age for this country is ${required}.`;
      return;
    }

    const profile = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      birthDate: birthInput.value,
      relationship: relationInput.value,
      countryCode,
      photoDataUrl: preview.classList.contains("hidden") ? "" : preview.src,
    };

    localStorage.setItem("facemash_profile", JSON.stringify(profile));
    msg.textContent = "Profile saved successfully.";
  });
}

function acceptCookies() {
  document.getElementById("cookie-banner").style.display = "none";
  localStorage.setItem("cookiesAccepted", "true");
}

function rejectCookies() {
  document.getElementById("cookie-banner").style.display = "none";
  localStorage.setItem("cookiesAccepted", "rejected");
}

window.acceptCookies = acceptCookies;
window.rejectCookies = rejectCookies;
window.loadMoreGallery = loadMoreGallery;

function initCookieBanner() {
  const banner = document.getElementById("cookie-banner");
  if (localStorage.getItem("cookiesAccepted")) {
    banner.style.display = "none";
  } else {
    banner.style.display = "block";
  }
}

async function loadCelebs() {
  try {
    const response = await fetch("celebs.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    const seen = new Set();
    const hasPopularitySignal = raw.some((item) => Number.isFinite(item.sitelinks));

    celebs = raw
      .map((item, index) => {
        const gender = normalizeGender(item.gender);
        const continent = normalizeContinent(item.continent || item.continentLabel || item.region);
        const countryCode = normalizeCountryCode(item.countryCode);
        const id = item.id || `c${index + 1}`;
        const popularity = Number.isFinite(item.sitelinks) ? item.sitelinks : 0;

        if (seen.has(id)) return null;
        if (!gender || !continent || !item.name || !item.image) return null;
        if (hasPopularitySignal && popularity < POPULARITY_MIN_WITH_SIGNAL) return null;

        seen.add(id);

        return {
          id,
          name: String(item.name),
          image: String(item.image).replace(/^http:/, "https:"),
          gender,
          continent,
          countryCode,
          countryName: item.countryName || "",
          popularity,
          score: Number.isFinite(item.score) ? item.score : DEFAULT_SCORE,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    if (celebs.length < 2) {
      setStatus("Dataset is too small.");
      clearBattle();
      return;
    }

    buildContinentTabs();
    updateModeButtons();
    updateQuestionLine();

    rankingsDirty = true;
    updateTopRankings();
    if (currentView === "ranking") renderFullRankings();

    initGallery();
    setView("battle");
    startFreshRound();

    initProfileForm();
    initWorldMap();
  } catch (error) {
    setStatus(`Could not load celebs.json (${error.message})`);
    clearBattle();
  }
}

initCookieBanner();
loadCelebs();

