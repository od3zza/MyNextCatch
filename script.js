// script.js — versão 3.0 (com upload, envio, download e reset)
let cardObjects = [];
let userCollection = new Set();
let uploadedCollection = new Set();
let caughtCollection = new Set();
let currentCard = null;

const fileInput = document.getElementById("fileInput");
const cardList = document.getElementById("cardList");
const whatsNextBtn = document.getElementById("whatsNextBtn");
const caughtBtn = document.getElementById("caughtBtn");
const pokemonCard = document.getElementById("pokemonCard");
const loader = document.getElementById("loader");
const trainersList = document.getElementById("trainersList");
const collectionCount = document.getElementById("collectionCount");
const toast = document.getElementById("toast");
const sendCollectionBtn = document.getElementById("sendCollectionBtn");
const downloadCollectionBtn = document.getElementById("downloadCollectionBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

let cardsLoaded = false;
let trainerNickname = null;

// >>>>>>>>>>>>> URL do seu Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzPnt5GN8jqx38HUfHM38DceKW1pj7sva0FBTw2yDobqOrBf3qafHFE9SbgOErzbXVo7g/exec";
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

// Modal
const nicknameModal = document.getElementById("nicknameModal");
const nicknameInput = document.getElementById("nicknameInput");
const nicknameSubmit = document.getElementById("nicknameSubmit");
const modalError = document.getElementById("modalError");

// Áudio
const catchSound = new Audio("assets/catch.mp3");
const bgMusic = document.getElementById("bgMusic");
bgMusic.volume = 0.4;
catchSound.volume = 0.2;

// ---------- Utils ----------
function normalizePokemonName(name) {
  if (!name) return "";
  let base = name.toString().trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’:.]/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/\s+/g, " ");
  base = base
    .replace(/^radiant\s+/i, "")
    .replace(/^dark\s+/i, "")
    .replace(/^team\s+rocket\s+/i, "")
    .replace(/^delta\s+/i, "")
    .replace(/^shiny\s+/i, "");
  base = base
    .replace(/\s+(ex|gx|-GX|vmax|vstar|v-union|lv\.x|prism|break|turbo|δ)$/i, "")
    .replace(/\s+v$/i, "")
    .replace(/\s+mega$/i, "-mega")
    .replace(/\s+(alolan|galarian|hisuian)$/i, "-$1")
    .trim();
  base = base
    .replace(/-alolan/i, "-alola")
    .replace(/-galarian/i, "-galar")
    .replace(/-hisuian/i, "-hisui");
  return base.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
}

// sprite cache
const spriteCache = new Map();
async function getSpriteUrl(pokemonName) {
  const normalized = normalizePokemonName(pokemonName);
  if (spriteCache.has(normalized)) return spriteCache.get(normalized);

  const base = "https://cdn.jsdelivr.net/gh/msikma/pokesprite@master/pokemon-gen8";
  const regularUrl = `${base}/regular/${normalized}.png`;
  const shinyUrl = `${base}/shiny/${normalized}.png`;
  const fallback = `https://raw.githubusercontent.com/msikma/pokesprite/master/items/ball/poke.png`;

  try {
    const res = await fetch(regularUrl, { method: "HEAD" });
    if (res.ok) { spriteCache.set(normalized, regularUrl); return regularUrl; }
    const shinyRes = await fetch(shinyUrl, { method: "HEAD" });
    if (shinyRes.ok) { spriteCache.set(normalized, shinyUrl); return shinyUrl; }
    spriteCache.set(normalized, fallback);
    return fallback;
  } catch {
    spriteCache.set(normalized, fallback);
    return fallback;
  }
}

// Toast simples
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// Música / Modal
window.addEventListener("load", () => {
  nicknameModal.style.display = "flex";
  nicknameInput.focus();
  const tryPlay = () => bgMusic.play().catch(() => {});
  window.addEventListener("click", tryPlay, { once: true });
  });

  // Helper: Check if nickname exists in spreadsheet
  async function nicknameExists(nickname) {
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL);
      const text = await res.text();
      let data = [];
      try { data = JSON.parse(text); } catch {}
      return data.some(row => Array.isArray(row) && row[0] && row[0].toLowerCase() === nickname.toLowerCase());
    } catch {
      return false; // On error, allow (fail open)
    }
  }

// Modal submit
nicknameSubmit.addEventListener("click", () => {
  modalError.textContent = "";
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    modalError.textContent = "Please enter your nickname!";
    return;
  }
  nicknameSubmit.disabled = true;
  modalError.textContent = "Checking nickname...";
  nicknameExists(nickname).then(exists => {
    if (exists) {
      modalError.textContent = "This nickname is already taken. Please choose another.";
      nicknameSubmit.disabled = false;
      nicknameInput.focus();
      return;
    }
    trainerNickname = nickname;
    nicknameModal.style.display = "none";
    updateTrainerSidebar();
    nicknameSubmit.disabled = false;
  }).catch(() => {
    modalError.textContent = "Error checking nickname. Try again.";
    nicknameSubmit.disabled = false;
  });
  });

// ---------- Load Cards ----------
async function loadCards() {
  try {
    const res = await fetch("data/cards.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    cardObjects = JSON.parse(text);
    cardsLoaded = true;
    console.log("cards.json loaded:", cardObjects.length);
  } catch (err) {
    console.error("Error loading cards:", err);
    showToast("Error loading cards.json!");
  }
}
loadCards();

// restore from localStorage
const saved = JSON.parse(localStorage.getItem("userCollection") || "[]");
saved.forEach(id => userCollection.add(id));
const savedCaught = JSON.parse(localStorage.getItem("caughtCollection") || "[]");
if (Array.isArray(savedCaught)) {
  savedCaught.forEach(id => {
    const card = cardObjects.find(c => c.id?.toLowerCase() === id);
    if (card) caughtCollection.add(card);
  });
}
updateCount();

// ---------- Quantidades ----------
function saveQuantities() {
  const quantities = {};
  document.querySelectorAll("#cardList li").forEach(li => {
    const name = li.querySelector("span").textContent;
    const qty = parseInt(li.querySelector(".quantity-input").value, 10) || 1;
    quantities[name] = qty;
  });
  localStorage.setItem("collectionQuantities", JSON.stringify(quantities));
}

function loadQuantities() {
  const data = JSON.parse(localStorage.getItem("collectionQuantities") || "{}");
  for (const [name, qty] of Object.entries(data)) {
    const li = Array.from(cardList.children).find(li => li.textContent.includes(name));
    if (li) {
      const input = li.querySelector(".quantity-input");
      if (input) input.value = qty;
    }
  }
}


function updateCount() {
  collectionCount.textContent = `(${userCollection.size})`;
}

// ---------- Google Apps Script ----------
function sendToGoogle(payload) {
  const formData = new URLSearchParams();
  formData.append("payload", JSON.stringify(payload));
  return fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: formData })
    .then(r => r.text())
    .catch(err => console.warn("Send failed:", err));
}

// ---------- Add Card ----------
async function addToCollection(card) {
  const cardId = (card.id || "").toLowerCase();
  if (!cardId || userCollection.has(cardId)) return;

  userCollection.add(cardId);
  caughtCollection.add(card);
  localStorage.setItem("userCollection", JSON.stringify([...userCollection]));
  localStorage.setItem("caughtCollection", JSON.stringify([...caughtCollection].map(c => c.id)));

  updateCount();
  catchSound.play();
  showToast(`You caught ${card.name}!`);

  const clone = pokemonCard.cloneNode(true);
  clone.style.position = "absolute";
  const rect = pokemonCard.getBoundingClientRect();
  clone.style.left = rect.left + "px";
  clone.style.top = rect.top + "px";
  clone.style.margin = "0";
  clone.style.zIndex = "1000";
  clone.style.animation = "flyToSidebar 0.8s forwards";
  document.body.appendChild(clone);

  setTimeout(async () => {
    clone.remove();
    const setAbbrev = card.set?.ptcgoCode || card.set?.id || "UNK";
    const number = card.number || "???";
    const displayText = `${card.name} ${setAbbrev} ${number}`;

    const li = document.createElement("li");
    li.classList.add("collection-item");
    li.innerHTML = `
      <button class="quantity-btn minus" title="Reduzir">-</button>
      <input type="number" class="quantity-input" min="1" value="1">
      <button class="quantity-btn plus" title="Aumentar">+</button>
      <span class="collection-name">${displayText}</span>
    `;
    cardList.appendChild(li);

    const input = li.querySelector(".quantity-input");
    const minusBtn = li.querySelector(".minus");
    const plusBtn = li.querySelector(".plus");

    minusBtn.addEventListener("click", () => {
      let val = parseInt(input.value, 10) || 1;
      if (val > 1) input.value = val - 1;
      saveQuantities();
    });
    plusBtn.addEventListener("click", () => {
      let val = parseInt(input.value, 10) || 1;
      input.value = val + 1;
      saveQuantities();
    });
    input.addEventListener("change", () => {
      if (parseInt(input.value, 10) < 1) input.value = 1;
      saveQuantities();
    });
    saveQuantities();
    






    if (trainerNickname) {
      const payload = {
        nickname: trainerNickname,
        card: displayText,
        favorite: card.name,
        date: new Date().toISOString(),
        sprite: await getSpriteUrl(card.name)
      };
      sendToGoogle(payload).finally(updateTrainerSidebar);
    }
  }, 800);
}

// ---------- Upload Collection ----------
fileInput.addEventListener("change", (e) => {
  if (!cardsLoaded) return alert("Cards not loaded yet.");
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const lines = event.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    uploadedCollection.clear();

    lines.forEach(line => {
      const clean = line.replace(/^\d+\s*/, "");
      const namePart = clean.split(/\s+/).slice(0, -2).join(" ");
      const card = cardObjects.find(c => c.name && c.name.toLowerCase() === namePart.toLowerCase());
      if (card) {
        userCollection.add(card.id.toLowerCase());
        uploadedCollection.add(card);
      }
    });

    localStorage.setItem("userCollection", JSON.stringify([...userCollection]));
    updateCount();
// ---------- Quantidades ----------
function saveQuantities() {
  const quantities = {};
  document.querySelectorAll("#cardList li").forEach(li => {
    const nameEl = li.querySelector("span") || li.querySelector(".collection-name");
    const name = nameEl ? nameEl.textContent.trim() : li.textContent.trim();
    const input = li.querySelector(".quantity-input");
    const qty = input ? (parseInt(input.value, 10) || 1) : 1;
    quantities[name] = qty;
  });
  localStorage.setItem("collectionQuantities", JSON.stringify(quantities));
}

function loadQuantities() {
  const data = JSON.parse(localStorage.getItem("collectionQuantities") || "{}");
  for (const [name, qty] of Object.entries(data)) {
    const li = Array.from(cardList.children).find(li => li.textContent.includes(name));
    if (li) {
      const input = li.querySelector(".quantity-input");
      if (input) input.value = qty;
    }
  }
}









    showToast(`Loaded ${lines.length} cards from your collection.`);
    sendCollectionBtn.style.display = "inline-block";
  };
  reader.readAsText(file);
});

// ---------- Send Collection ----------
sendCollectionBtn.addEventListener("click", async () => {
  if (uploadedCollection.size === 0) return alert("No collection loaded to send!");
  if (!trainerNickname) return alert("Set your Trainer name first!");

  showToast("Sending your collection...");
  sendCollectionBtn.disabled = true;

  for (const card of uploadedCollection) {
    const setAbbrev = card.set?.ptcgoCode || card.set?.id || "UNK";
    const number = card.number || "???";
    const displayText = `${card.name} ${setAbbrev} ${number}`;
    const payload = {
      nickname: trainerNickname,
      card: displayText,
      favorite: card.name,
      date: new Date().toISOString(),
      sprite: await getSpriteUrl(card.name)
    };
    await sendToGoogle(payload);
  }

  showToast("Collection sent!");
  sendCollectionBtn.disabled = false;
});

// ---------- Download Caught Cards ----------
downloadCollectionBtn.addEventListener("click", () => {
  if (caughtCollection.size === 0) {
    alert("You haven’t caught any cards yet!");
    return;
  }

  // 1) Ler quantidades diretamente do DOM (se existirem)
  const quantitiesFromDom = {};
  document.querySelectorAll("#cardList li").forEach(li => {
    const nameEl = li.querySelector("span") || li.querySelector(".collection-name");
    const name = nameEl ? nameEl.textContent.trim() : li.textContent.trim();
    const input = li.querySelector(".quantity-input");
    const qty = input ? (parseInt(input.value, 10) || 1) : 1;
    quantitiesFromDom[name] = qty;
  });

  // 2) Fallback para valores salvos (se necessário)
  const quantitiesData = JSON.parse(localStorage.getItem("collectionQuantities") || "{}");

  const lines = Array.from(caughtCollection).map(card => {
    const setAbbrev = card.set?.ptcgoCode || card.set?.id || "UNK";
    const number = card.number || "???";
    const displayText = `${card.name} ${setAbbrev} ${number}`.trim();
    const qty = (quantitiesFromDom[displayText] ?? quantitiesData[displayText]) || 1;
    return `${qty} ${displayText}`;
  });

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caughtCollection_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Clear All ----------
clearAllBtn.addEventListener("click", () => {
  const confirmClear = confirm("Are you sure you want to clear your entire collection?");
  if (!confirmClear) return;

  userCollection.clear();
  uploadedCollection.clear();
  caughtCollection.clear();
  localStorage.removeItem("userCollection");
  localStorage.removeItem("caughtCollection");
  cardList.innerHTML = "";
  updateCount();
  pokemonCard.style.display = "none";
  caughtBtn.style.display = "none";
  sendCollectionBtn.style.display = "none";
  showToast("All data cleared!");
});

// ---------- Display Card ----------
const typeColors = {
  Fire: "linear-gradient(to bottom, #ff9a9e, #ff6a00)",
  Water: "linear-gradient(to bottom, #a1c4fd, #c2e9fb)",
  Grass: "linear-gradient(to bottom, #d4fc79, #96e6a1)",
  Electric: "linear-gradient(to bottom, #fddb92, #f6e27f)",
  Psychic: "linear-gradient(to bottom, #fbc2eb, #a6c1ee)",
  Fighting: "linear-gradient(to bottom, #f6d365, #fda085)",
  Darkness: "linear-gradient(to bottom, #a18cd1, #fbc2eb)",
  Metal: "linear-gradient(to bottom, #cfd9df, #e2ebf0)",
  Fairy: "linear-gradient(to bottom, #fddde6, #fbc2eb)",
  Colorless: "linear-gradient(to bottom, #e0e0e0, #ffffff)",
  Dragon: "linear-gradient(to bottom, #fbc2eb, #a6c1ee)",
  Default: "linear-gradient(to bottom, #f5f5f7, #ffffff)"
};

function getRandomCard() {
  const available = cardObjects
    .filter(c => c.supertype === "Pokémon")
    .filter(c => c.id && !userCollection.has(c.id.toLowerCase()));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function displayCard(card) {
  if (!card) {
    pokemonCard.style.display = "none";
    caughtBtn.style.display = "none";
    document.body.style.background = typeColors.Default;
    currentCard = null;
    return;
  }

  pokemonCard.style.display = "flex";
  currentCard = card;

  const setAbbrev = card.set?.ptcgoCode || card.set?.id || "UNK";
  const number = card.number || "???";
  const imageUrl = card.images?.large || "";

  pokemonCard.innerHTML = `
    <img src="${imageUrl}" alt="${card.name}">
    <h3>${card.name} ${setAbbrev} ${number}</h3>
  `;
  caughtBtn.style.display = "inline-block";

  const primaryType = card.types?.[0] || "Default";
  document.body.style.background = typeColors[primaryType] || typeColors.Default;
}

// ---------- Sidebar ----------
function updateTrainerSidebar() {
  const trainersLoader = document.getElementById("trainersLoader");
  trainersLoader.style.display = "block";
  trainersList.style.display = "none";

  fetch(GOOGLE_SCRIPT_URL)
    .then(async res => {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return []; }
    })
    .then(data => {
      trainersList.innerHTML = "";
      const rows = data
        .filter(row => Array.isArray(row) && row.some(cell => cell))
        .reverse()
        .slice(0, 50);

      rows.forEach(row => {
        const [nickname, cardName, favorite, dateString, spriteUrl] = row;
        const avatar = spriteUrl || `https://cdn.jsdelivr.net/gh/msikma/pokesprite@master/pokemon-gen8/regular/${normalizePokemonName(favorite)}.png`;
        let formatted = "";
        try {
          const d = new Date(dateString);
          if (!isNaN(d)) formatted = d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
        } catch {}
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="trainer-entry">
            <img src="${avatar}" class="trainer-avatar" alt="${favorite || "pokemon"}">
            <div>
              <strong>${nickname || "Anonymous"}</strong> caught <em>${cardName || "—"}</em><br>
              <small>${formatted}</small>
            </div>
          </div>`;
        trainersList.appendChild(li);
      });
    })
    .catch(err => console.error("Error fetching trainers:", err))
    .finally(() => {
      trainersLoader.style.display = "none";
      trainersList.style.display = "block";
    });
}

// ---------- Buttons ----------
whatsNextBtn.addEventListener("click", () => {
  if (!cardsLoaded) return alert("Cards not loaded yet.");
  loader.style.display = "block";
  setTimeout(() => {
    const card = getRandomCard();
    displayCard(card);
    loader.style.display = "none";
  }, 500);
});

caughtBtn.addEventListener("click", () => {
  if (!currentCard) return;
  addToCollection(currentCard);
  const nextCard = getRandomCard();
  displayCard(nextCard);
});

// hide card on start
pokemonCard.style.display = "none";
caughtBtn.style.display = "none";

// ----- Collapsible sidebars (mobile only) -----
document.querySelectorAll(".collapsible").forEach(title => {
  title.addEventListener("click", () => {
    if (window.innerWidth > 768) return; // só ativa no mobile
    const content = title.nextElementSibling;
    title.classList.toggle("active");
    content.classList.toggle("expanded");
  });
});
