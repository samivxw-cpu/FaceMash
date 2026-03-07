const K = 32;

let celebs = [];
let currentRegion = "world";

let left = null;
let right = null;

function expectedScore(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function updateElo(winner, loser) {
  const expectedWinner = expectedScore(winner.score, loser.score);
  const expectedLoser = expectedScore(loser.score, winner.score);

  winner.score = Math.round(winner.score + K * (1 - expectedWinner));
  loser.score = Math.round(loser.score + K * (0 - expectedLoser));
}

function getRegionPool() {
  if (currentRegion === "world") return celebs;
  return celebs.filter((c) => c.region === currentRegion);
}

function getRoundPool() {
  const regionPool = getRegionPool();
  if (regionPool.length >= 2) return regionPool;
  return celebs;
}

function setStatus(message) {
  const status = document.getElementById("status");
  status.textContent = message;
}

function clearBattle() {
  left = null;
  right = null;
  document.getElementById("imgLeft").removeAttribute("src");
  document.getElementById("nameLeft").innerText = "-";
  document.getElementById("imgRight").removeAttribute("src");
  document.getElementById("nameRight").innerText = "-";
}

async function loadCelebs() {
  try {
    const response = await fetch("celebs.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    celebs = await response.json();

    celebs = celebs.map((c) => ({
      ...c,
      score: Number.isFinite(c.score) ? c.score : 1200,
    }));

    if (celebs.length < 2) {
      setStatus("Ajoute au moins 2 profils dans celebs.json pour voter.");
      updateRanking();
      clearBattle();
      return;
    }

    updateRanking();
    nextRound();
  } catch (error) {
    setStatus(`Erreur de chargement de celebs.json (${error.message})`);
    clearBattle();
  }
}

function setRegion(region) {
  currentRegion = region;

  const regionPool = getRegionPool();
  if (region !== "world" && regionPool.length < 2) {
    setStatus("Pas assez de profils dans cette region. Match global affiche.");
  } else {
    setStatus("");
  }

  updateRanking();
  nextRound();
}

function nextRound() {
  const pool = getRoundPool();

  if (pool.length < 2) {
    setStatus("Pas assez de profils pour lancer un duel.");
    clearBattle();
    return;
  }

  const leftIndex = Math.floor(Math.random() * pool.length);
  let rightIndex = Math.floor(Math.random() * pool.length);

  while (rightIndex === leftIndex) {
    rightIndex = Math.floor(Math.random() * pool.length);
  }

  left = pool[leftIndex];
  right = pool[rightIndex];

  document.getElementById("imgLeft").src = left.image;
  document.getElementById("nameLeft").innerText = left.name;

  document.getElementById("imgRight").src = right.image;
  document.getElementById("nameRight").innerText = right.name;
}

function vote(side) {
  if (!left || !right) return;

  if (side === "left") {
    updateElo(left, right);
  }

  if (side === "right") {
    updateElo(right, left);
  }

  updateRanking();
  nextRound();
}

function updateRanking() {
  const pool = getRegionPool();
  const fallbackPool = pool.length ? pool : celebs;

  const sorted = [...fallbackPool].sort((a, b) => b.score - a.score);

  const ranking = document.getElementById("ranking");
  ranking.innerHTML = "";

  sorted.slice(0, 20).forEach((c, i) => {
    const li = document.createElement("li");
    li.innerText = `${i + 1}. ${c.name} (${c.score})`;
    ranking.appendChild(li);
  });
}

loadCelebs();
