const K = 32;
const DEFAULT_SCORE = 1200;
const GALLERY_BATCH_SIZE = 120;
const FALLBACK_IMG = "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";

let celebs = [];
let currentGender = "female";
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
  const v = String(value).toLowerCase();
  if (v === "male" || v === "m" || v === "homme") return "male";
  if (v === "female" || v === "f" || v === "femme") return "female";
  return null;
}

function getPoolByGender(gender) {
  return celebs.filter((c) => c.gender === gender);
}

function updateModeButtons() {
  const femaleBtn = document.getElementById("modeFemale");
  const maleBtn = document.getElementById("modeMale");

  femaleBtn.classList.toggle("active", currentGender === "female");
  maleBtn.classList.toggle("active", currentGender === "male");
}

function setGender(gender) {
  currentGender = gender;
  updateModeButtons();
  nextRound();
}

function clearBattle() {
  left = null;
  right = null;
  document.getElementById("imgLeft").removeAttribute("src");
  document.getElementById("imgRight").removeAttribute("src");
  document.getElementById("nameLeft").textContent = "-";
  document.getElementById("nameRight").textContent = "-";
}

function chooseTwoDifferent(pool) {
  const leftIndex = Math.floor(Math.random() * pool.length);
  let rightIndex = Math.floor(Math.random() * pool.length);

  while (rightIndex === leftIndex) {
    rightIndex = Math.floor(Math.random() * pool.length);
  }

  return [pool[leftIndex], pool[rightIndex]];
}

function setImage(imgEl, url) {
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = FALLBACK_IMG;
  };
  imgEl.src = url;
}

function nextRound() {
  const pool = getPoolByGender(currentGender);

  if (pool.length < 2) {
    setStatus("Pas assez de profils dans ce genre pour lancer un duel.");
    clearBattle();
    return;
  }

  setStatus("");
  [left, right] = chooseTwoDifferent(pool);

  setImage(document.getElementById("imgLeft"), left.image);
  setImage(document.getElementById("imgRight"), right.image);
  document.getElementById("nameLeft").textContent = left.name;
  document.getElementById("nameRight").textContent = right.name;
}

function vote(side) {
  if (!left || !right) return;

  if (side === "left") updateElo(left, right);
  if (side === "right") updateElo(right, left);

  updateRankings();
  nextRound();
}

function renderRanking(listId, gender) {
  const ranking = document.getElementById(listId);
  ranking.innerHTML = "";

  const sorted = getPoolByGender(gender)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  sorted.forEach((c, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${c.name} (${c.score})`;
    ranking.appendChild(li);
  });
}

function updateRankings() {
  renderRanking("rankingFemale", "female");
  renderRanking("rankingMale", "male");
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
  meta.textContent = person.gender === "female" ? "Femme" : "Homme";

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
    btn.textContent = "Tout est charge";
  }
}

function initGallery() {
  galleryCursor = 0;
  galleryData = [...celebs].sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById("gallery").innerHTML = "";
  document.getElementById("loadMoreBtn").disabled = false;
  document.getElementById("loadMoreBtn").textContent = "Charger plus";

  const total = celebs.length;
  const female = getPoolByGender("female").length;
  const male = getPoolByGender("male").length;
  document.getElementById("galleryCount").textContent = `${total} profils | ${female} femmes | ${male} hommes`;

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
        if (!gender || !item.name || !item.image) return null;

        return {
          id: item.id || `c${index + 1}`,
          name: item.name,
          image: String(item.image).replace(/^http:/, "https:"),
          gender,
          score: Number.isFinite(item.score) ? item.score : DEFAULT_SCORE,
        };
      })
      .filter(Boolean);

    if (celebs.length < 2) {
      setStatus("Dataset insuffisant.");
      clearBattle();
      return;
    }

    updateModeButtons();
    updateRankings();
    initGallery();
    nextRound();
  } catch (error) {
    setStatus(`Erreur de chargement celebs.json (${error.message})`);
    clearBattle();
  }
}

loadCelebs();
