const K = 32;
const DEFAULT_SCORE = 1200;
const MIN_TAB_COUNT = 300;
const GALLERY_BATCH_SIZE = 120;
const FALLBACK_IMG = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";

const CONTINENT_ORDER = ["africa", "asia", "europe", "north-america", "south-america", "oceania"];
const CONTINENT_LABEL = {
  "africa": "Africa",
  "asia": "Asia",
  "europe": "Europe",
  "north-america": "North America",
  "south-america": "South America",
  "oceania": "Oceania",
};

let celebs = [];
let currentGender = "male";
let currentContinent = "";
let currentView = "battle";
let availableContinents = [];
let left = null;
let right = null;
let galleryCursor = 0;
let galleryData = [];

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
}

function getPool(gender = currentGender, continent = currentContinent) {
  return celebs.filter((c) => c.gender === gender && c.continent === continent);
}

function ensureValidContinentForCurrentGender() {
  const valid = availableContinents.find((continent) => getPool(currentGender, continent).length >= 2);
  if (!valid) {
    currentContinent = availableContinents[0] || "";
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

  availableContinents = CONTINENT_ORDER.filter((continent) => {
    const count = counts.get(continent) || 0;
    if (count === 0) return false;
    if (continent === "africa" && count < MIN_TAB_COUNT) return false;
    return true;
  });

  const tabs = document.getElementById("continentTabs");
  tabs.innerHTML = "";

  availableContinents.forEach((continent) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.continent = continent;
    btn.textContent = CONTINENT_LABEL[continent] || continent;
    btn.onclick = () => setContinent(continent);
    tabs.appendChild(btn);
  });

  if (!currentContinent || !availableContinents.includes(currentContinent)) {
    currentContinent = availableContinents[0] || "";
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
}

function pickTwo(pool) {
  const leftIndex = Math.floor(Math.random() * pool.length);
  let rightIndex = Math.floor(Math.random() * pool.length);

  while (rightIndex === leftIndex) {
    rightIndex = Math.floor(Math.random() * pool.length);
  }

  return [pool[leftIndex], pool[rightIndex]];
}

function nextRound() {
  ensureValidContinentForCurrentGender();
  updateContinentButtons();

  const pool = getPool();

  if (pool.length < 2) {
    setStatus("Not enough profiles for this mode.");
    clearBattle();
    return;
  }

  setStatus("");
  [left, right] = pickTwo(pool);

  setImage(document.getElementById("imgLeft"), left.image);
  setImage(document.getElementById("imgRight"), right.image);
  document.getElementById("nameLeft").textContent = left.name;
  document.getElementById("nameRight").textContent = right.name;
}

function setGender(gender) {
  currentGender = gender;
  updateModeButtons();
  updateQuestionLine();
  ensureValidContinentForCurrentGender();
  updateContinentButtons();
  updateRankings();
  initGallery();
  nextRound();
}

function setContinent(continent) {
  currentContinent = continent;
  ensureValidContinentForCurrentGender();
  updateContinentButtons();
  updateRankings();
  initGallery();
  nextRound();
}

function vote(side) {
  if (!left || !right) return;

  if (side === "left") updateElo(left, right);
  if (side === "right") updateElo(right, left);

  updateRankings();
  nextRound();
}

function renderRanking(listId, gender, limit) {
  const list = document.getElementById(listId);
  list.innerHTML = "";

  const sorted = getPool(gender, currentContinent)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  sorted.forEach((c, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${c.name}`;
    list.appendChild(li);
  });
}

function updateRankings() {
  const label = CONTINENT_LABEL[currentContinent] || "Continent";

  document.getElementById("maleTopTitle").textContent = `Top 10 Men - ${label}`;
  document.getElementById("femaleTopTitle").textContent = `Top 10 Women - ${label}`;
  document.getElementById("maleRankingTitle").textContent = `Full Men Ranking - ${label}`;
  document.getElementById("femaleRankingTitle").textContent = `Full Women Ranking - ${label}`;

  renderRanking("rankingMaleTop", "male", 10);
  renderRanking("rankingFemaleTop", "female", 10);
  renderRanking("rankingMaleFull", "male", 5000);
  renderRanking("rankingFemaleFull", "female", 5000);
}

function getGalleryData() {
  return galleryData;
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
  meta.textContent = `${genderLabel} • ${CONTINENT_LABEL[person.continent] || person.continent}`;

  card.appendChild(img);
  card.appendChild(title);
  card.appendChild(meta);

  return card;
}

function loadMoreGallery() {
  const data = getGalleryData();
  const gallery = document.getElementById("gallery");
  const start = galleryCursor;
  const end = Math.min(start + GALLERY_BATCH_SIZE, data.length);

  for (let i = start; i < end; i += 1) {
    gallery.appendChild(buildGalleryCard(data[i]));
  }

  galleryCursor = end;

  const btn = document.getElementById("loadMoreBtn");
  if (galleryCursor >= data.length) {
    btn.disabled = true;
    btn.textContent = "Everything loaded";
  }
}

function initGallery() {
  galleryCursor = 0;

  galleryData = celebs
    .filter((c) => c.continent === currentContinent)
    .sort((a, b) => {
      if (a.gender !== b.gender) return a.gender === "male" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  document.getElementById("gallery").innerHTML = "";
  document.getElementById("loadMoreBtn").disabled = false;
  document.getElementById("loadMoreBtn").textContent = "Load more";

  const total = galleryData.length;
  const men = galleryData.filter((c) => c.gender === "male").length;
  const women = galleryData.filter((c) => c.gender === "female").length;
  const label = CONTINENT_LABEL[currentContinent] || "Continent";

  document.getElementById("galleryTitle").textContent = `Living Celebrities - ${label}`;
  document.getElementById("galleryCount").textContent = `${total} profiles • ${men} men • ${women} women`;

  loadMoreGallery();
}

async function loadCelebs() {
  try {
    const response = await fetch("celebs.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    celebs = raw
      .map((item, index) => {
        const gender = normalizeGender(item.gender);
        const continent = normalizeContinent(item.continent || item.continentLabel || item.region);

        if (!gender || !continent || !item.name || !item.image) return null;

        return {
          id: item.id || `c${index + 1}`,
          name: item.name,
          image: String(item.image).replace(/^http:/, "https:"),
          gender,
          continent,
          score: Number.isFinite(item.score) ? item.score : DEFAULT_SCORE,
        };
      })
      .filter(Boolean);

    if (celebs.length < 2) {
      setStatus("Dataset is too small.");
      clearBattle();
      return;
    }

    buildContinentTabs();
    updateModeButtons();
    updateQuestionLine();
    updateRankings();
    initGallery();
    setView("battle");
    nextRound();
  } catch (error) {
    setStatus(`Could not load celebs.json (${error.message})`);
    clearBattle();
  }
}

loadCelebs();

