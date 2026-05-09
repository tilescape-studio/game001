const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("inscriptionOverlay");
const inscriptionText = document.getElementById("inscriptionText");

const TILE = 32;
const MAP_W = 32;
const MAP_H = 32;

const VISION = {
  full: 3,
  hint: 5
};

const TIMING = {
  sunStep: 30,
  windChange: 30,
  hungerDrop: 120,
  strongWindFlowerCheck: 15,
  wiltAfter: 120,
  waterRecover: 60,
  campfireOutMin: 5,
  campfireOutMax: 10
};

const screen = {
  w: window.innerWidth,
  h: window.innerHeight,
  dpr: window.devicePixelRatio || 1
};

function resizeCanvas() {
  screen.w = window.innerWidth;
  screen.h = window.innerHeight;
  screen.dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(screen.w * screen.dpr);
  canvas.height = Math.floor(screen.h * screen.dpr);

  ctx.setTransform(screen.dpr, 0, 0, screen.dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
prepareFullscreenSurface();


function prepareFullscreenSurface() {
  // iPhone Safari does not support true arbitrary-element fullscreen reliably,
  // but these settings reduce accidental scrolling and keep the canvas occupying the viewport.
  document.documentElement.style.margin = "0";
  document.documentElement.style.padding = "0";
  document.documentElement.style.overflow = "hidden";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.inset = "0";
  canvas.style.display = "block";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.touchAction = "none";
}

function requestFullscreenIfPossible() {
  if (game.fullscreenRequested) return;
  game.fullscreenRequested = true;
  prepareFullscreenSurface();

  const target = document.documentElement;
  const request = target.requestFullscreen || target.webkitRequestFullscreen || canvas.requestFullscreen || canvas.webkitRequestFullscreen;

  if (request) {
    try {
      const result = request.call(target);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (_) {
      // unsupported environments simply keep the fixed full-viewport canvas.
    }
  }

  setTimeout(resizeCanvas, 120);
}


const game = {
  startedAt: performance.now(),
  lastTime: performance.now(),
  paused: false,
  debug: false,
  fullscreenRequested: false,

  externalWind: "breeze",
  activeWind: "none",
  lastWindChange: 0,
  lastStrongWindFlowerCheck: 0,

  sunIndex: Math.floor(Math.random() * 8),

  hunger: 50,
  lastHungerDrop: 0,
  sandwichUsed: false,

  forceActionCount: 0,

  message: "ここにあったもの",
  messageTimer: 180,

  flowerField: false,
  endingShown: false
};

const sunNames = [
  "東",
  "南東",
  "南",
  "南西",
  "西",
  "北西",
  "北",
  "北東"
];

const flowerColors = {
  red: {
    label: "赤",
    petal: "#d85b5b",
    center: "#f0c36a",
    scent: "香りは、\nまだ少しあたたかく残っている。"
  },
  blue: {
    label: "青",
    petal: "#5b7fd8",
    center: "#d8dced",
    scent: "香りは、\n静かな方へ冷えて残っている。"
  },
  yellow: {
    label: "黄",
    petal: "#e5c84f",
    center: "#8b6f2b",
    scent: "香りは、\n明るい方へほどけていた。"
  },
  white: {
    label: "白",
    petal: "#f3efe4",
    center: "#d2c49d",
    scent: "香りは、\nほとんど重さを持たずに残っている。"
  },
  black: {
    label: "黒",
    petal: "#2c2a27",
    center: "#9d9076",
    scent: "香りは、\n低いところに沈んでいた。"
  }
};

const player = {
  x: 4 * TILE,
  y: 26 * TILE,
  w: 24,
  h: 24,
  speed: 1.47,
  blinkSeed: Math.random() * 1000
};

const camera = {
  x: 0,
  y: 0,
  zoom: 2
};

const input = {
  moveActive: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  dx: 0,
  dy: 0,

  keys: {
    up: false,
    down: false,
    left: false,
    right: false
  }
};

const objects = {
  flowers: [],
  petals: [],
  water: null,
  waters: [],
  grasses: [],
  trees: [],
  fragments: [],
  door: null,
  stone: null,
  campfire: null,
  sandwich: {
    available: true
  }
};

const inventory = {
  slots: [
    { kind: "sandwich" },
    null,
    null
  ]
};

const island = {
  tiles: []
};

const occupied = new Set();

function keyOf(tx, ty) {
  return `${tx},${ty}`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(probability) {
  return Math.random() < probability;
}

function choose(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function weightedChoice(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let r = Math.random() * total;

  for (const entry of entries) {
    r -= entry.weight;
    if (r <= 0) return entry.value;
  }

  return entries[entries.length - 1].value;
}

function generateIsland() {
  island.tiles = [];

  const cx = MAP_W / 2;
  const cy = MAP_H / 2;

  const radiusX = MAP_W * 0.42;
  const radiusY = MAP_H * 0.40;

  for (let y = 0; y < MAP_H; y++) {
    island.tiles[y] = [];

    for (let x = 0; x < MAP_W; x++) {
      const nx = (x - cx) / radiusX;
      const ny = (y - cy) / radiusY;

      const edgeNoise =
        Math.sin(x * 0.75) * 0.08 +
        Math.cos(y * 0.6) * 0.08 +
        Math.sin((x + y) * 0.35) * 0.06;

      const d = nx * nx + ny * ny;
      const inside = d < 1 + edgeNoise;

      island.tiles[y][x] = inside ? "land" : "water";
    }
  }
}

function isLandTile(tx, ty) {
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
  return island.tiles[ty]?.[tx] === "land";
}

function isInnerLandTile(tx, ty, margin = 1) {
  if (!isLandTile(tx, ty)) return false;

  for (let dy = -margin; dy <= margin; dy++) {
    for (let dx = -margin; dx <= margin; dx++) {
      if (!isLandTile(tx + dx, ty + dy)) {
        return false;
      }
    }
  }

  return true;
}

function randomFreeTile() {
  for (let i = 0; i < 1000; i++) {
    const tx = randomInt(2, MAP_W - 3);
    const ty = randomInt(2, MAP_H - 3);
    const key = keyOf(tx, ty);

    if (isLandTile(tx, ty) && !occupied.has(key)) {
      occupied.add(key);
      return { tx, ty };
    }
  }

  return { tx: Math.floor(MAP_W / 2), ty: Math.floor(MAP_H / 2) };
}

function getWaters() {
  if (objects.waters && objects.waters.length > 0) return objects.waters;
  return objects.water ? [objects.water] : [];
}

function isOccupiedByWater(tx, ty) {
  return getWaters().some(water => {
    return water.pattern.some(cell => water.tx + cell.x === tx && water.ty + cell.y === ty);
  });
}

function isTreeTrunkTile(tx, ty) {
  return objects.trees.some(tree => tree.tx === tx && tree.ty === ty);
}

function isBlockedTile(tx, ty) {
  return isTreeTrunkTile(tx, ty);
}

function randomFreeDryTile() {
  for (let i = 0; i < 1000; i++) {
    const tx = randomInt(2, MAP_W - 3);
    const ty = randomInt(2, MAP_H - 3);
    const key = keyOf(tx, ty);

    if (isLandTile(tx, ty) && !occupied.has(key) && !isOccupiedByWater(tx, ty) && !isBlockedTile(tx, ty)) {
      occupied.add(key);
      return { tx, ty };
    }
  }

  return randomFreeTile();
}

function generateWorld() {
  generateIsland();
  placePlayerOnShore();
  generateWater();
  generateGrasses();
  generateTrees();
  generateFragments();
  generateFlowers();
  generateDoor();
  generateStone();
  generateCampfire();
  updateFlowerField();
}

function placePlayerOnShore() {
  const candidates = [];

  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (!isLandTile(x, y)) continue;

      const nearWater =
        !isLandTile(x - 1, y) ||
        !isLandTile(x + 1, y) ||
        !isLandTile(x, y - 1) ||
        !isLandTile(x, y + 1);

      if (nearWater) {
        candidates.push({ tx: x, ty: y });
      }
    }
  }

  const pos = candidates.length > 0
    ? choose(candidates)
    : { tx: Math.floor(MAP_W / 2), ty: Math.floor(MAP_H / 2) };

  player.x = pos.tx * TILE;
  player.y = pos.ty * TILE;
}

function rollFlowerColors() {
  const colors = [];

  for (let i = 0; i < 3; i++) {
    const r = Math.random();

    if (r < 0.01) {
      colors.push("white");
    } else if (r < 0.34) {
      colors.push("red");
    } else if (r < 0.67) {
      colors.push("blue");
    } else {
      colors.push("yellow");
    }
  }

  if (colors.includes("white")) {
    return ["white", "white", "white"];
  }

  return colors;
}

function generateFlowers() {
  const colors = rollFlowerColors();

  for (let i = 0; i < 3; i++) {
    const pos = randomFlowerTile();

    objects.flowers.push({
      id: `flower-${i}`,
      tx: pos.tx,
      ty: pos.ty,
      color: colors[i],
      state: "normal",
      pickedAt: null
    });
  }
}

function generateDoor() {
  const pos = randomFreeTile();

  const r = Math.random();
  let state = "open";

  if (r < 0.45) {
    state = "open";
  } else if (r < 0.9) {
    state = "closed";
  } else {
    state = chance(0.5) ? "broken_open" : "broken_closed";
  }

  if (state === "closed" && chance(0.2)) {
    state = "locked";
  }

  objects.door = {
    tx: pos.tx,
    ty: pos.ty,
    state
  };
}

function generateStone() {
  const pos = randomFreeTile();

  objects.stone = {
    tx: pos.tx,
    ty: pos.ty
  };
}

function makeWaterBlob(targetSize) {
  // くびれが出るランダムウォーク型ではなく、
  // 低い場所に一続きで溜まった水面に見える「まとまった面」を作る。
  let w;
  let h;

  if (targetSize <= 4) {
    w = 2;
    h = 2;
  } else if (targetSize <= 11) {
    w = targetSize <= 8 ? 3 : 4;
    h = 3;
  } else {
    w = targetSize <= 16 ? 5 : 5;
    h = targetSize <= 16 ? 4 : 5;
  }

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const candidates = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 中央に近いものほど残しやすい。少しだけノイズを足して歪ませる。
      const nx = (x - cx) / Math.max(1, cx + 0.35);
      const ny = (y - cy) / Math.max(1, cy + 0.35);
      const edgeNoise = Math.sin((x + 1) * 1.7 + (y + 2) * 0.9) * 0.08;
      const score = nx * nx + ny * ny + edgeNoise;
      candidates.push({ x, y, score });
    }
  }

  let selected = candidates
    .sort((a, b) => a.score - b.score)
    .slice(0, targetSize)
    .map(c => ({ x: c.x, y: c.y, deep: false }));

  // 小さい水たまりは最低限、隣り合うまとまりにする。
  if (targetSize <= 4 && selected.length < targetSize) {
    selected = [
      { x: 0, y: 0, deep: false },
      { x: 1, y: 0, deep: false },
      { x: 0, y: 1, deep: false },
      { x: 1, y: 1, deep: false }
    ].slice(0, targetSize);
  }

  // 孤立や細い首が出た場合は、中央寄りの不足セルで補正する。
  selected = smoothWaterBlob(selected, targetSize, w, h);

  const minX = Math.min(...selected.map(c => c.x));
  const minY = Math.min(...selected.map(c => c.y));

  return selected.map(c => ({ x: c.x - minX, y: c.y - minY, deep: false }));
}

function smoothWaterBlob(cells, targetSize, w, h) {
  const key = c => keyOf(c.x, c.y);
  const set = new Set(cells.map(key));

  function neighborCount(x, y) {
    return [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ].reduce((count, [dx, dy]) => count + (set.has(keyOf(x + dx, y + dy)) ? 1 : 0), 0);
  }

  // 1方向だけで繋がる細い首・飛び出しをなるべく消す。
  let adjusted = [...cells];
  for (let pass = 0; pass < 2; pass++) {
    adjusted = adjusted.filter(c => {
      if (adjusted.length <= Math.max(3, targetSize - 1)) return true;
      const n = neighborCount(c.x, c.y);
      const isEdge = c.x === 0 || c.y === 0 || c.x === w - 1 || c.y === h - 1;
      return !(isEdge && n <= 1);
    });

    set.clear();
    adjusted.forEach(c => set.add(key(c)));

    if (adjusted.length < targetSize) {
      const cx = (w - 1) / 2;
      const cy = (h - 1) / 2;
      const additions = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (set.has(keyOf(x, y))) continue;
          const n = neighborCount(x, y);
          if (n >= 2) {
            additions.push({
              x,
              y,
              deep: false,
              score: Math.hypot(x - cx, y - cy) - n * 0.35
            });
          }
        }
      }
      additions.sort((a, b) => a.score - b.score);
      while (adjusted.length < targetSize && additions.length) {
        const add = additions.shift();
        adjusted.push({ x: add.x, y: add.y, deep: false });
        set.add(keyOf(add.x, add.y));
      }
    }
  }

  return adjusted.slice(0, targetSize);
}

function addDeepCellsIfLarge(pattern, targetSize) {
  if (targetSize < 15) return pattern;

  const maxX = Math.max(...pattern.map(c => c.x));
  const maxY = Math.max(...pattern.map(c => c.y));
  const cx = maxX / 2;
  const cy = maxY / 2;

  const sorted = [...pattern].sort((a, b) => {
    const da = Math.hypot(a.x - cx, a.y - cy);
    const db = Math.hypot(b.x - cx, b.y - cy);
    return da - db;
  });

  const deepCount = Math.max(2, Math.floor(pattern.length * 0.28));
  const deepKeys = new Set(sorted.slice(0, deepCount).map(c => keyOf(c.x, c.y)));

  return pattern.map(c => ({ ...c, deep: deepKeys.has(keyOf(c.x, c.y)) }));
}

function chooseWaterSizeBands(count) {
  const bands = ["small", "medium", "large"];
  if (count === 1) return [choose(bands)];

  return choose([
    ["small", "medium"],
    ["small", "large"],
    ["medium", "large"]
  ]);
}

function sizeForBand(band) {
  if (band === "small") return randomInt(3, 4);
  if (band === "medium") return randomInt(8, 11);
  return randomInt(15, 20);
}

function canPlaceWaterPattern(tx, ty, pattern) {
  return pattern.every(cell => {
    const px = tx + cell.x;
    const py = ty + cell.y;
    const key = keyOf(px, py);

    return isInnerLandTile(px, py, 3) && !occupied.has(key) && !isBlockedTile(px, py) && !isOccupiedByWater(px, py);
  });
}

function commitWaterOccupied(water) {
  water.pattern.forEach(cell => {
    occupied.add(keyOf(water.tx + cell.x, water.ty + cell.y));
  });
}

function generateWater() {
  objects.waters = [];
  objects.water = null;

  const count = chance(0.5) ? 1 : 2;
  const bands = chooseWaterSizeBands(count);

  bands.forEach((band, index) => {
    const targetSize = sizeForBand(band);
    let placed = false;

    for (let i = 0; i < 1500; i++) {
      const pattern = addDeepCellsIfLarge(makeWaterBlob(targetSize), targetSize);
      const maxX = Math.max(...pattern.map(c => c.x));
      const maxY = Math.max(...pattern.map(c => c.y));
      const tx = randomInt(3, MAP_W - maxX - 4);
      const ty = randomInt(3, MAP_H - maxY - 4);

      if (!canPlaceWaterPattern(tx, ty, pattern)) continue;

      const water = {
        id: `water-${index}`,
        tx,
        ty,
        band,
        pattern,
        state: "still",
        changedAt: null,
        lastForce: 1
      };

      objects.waters.push(water);
      commitWaterOccupied(water);
      placed = true;
      break;
    }

    if (!placed && objects.waters.length === 0) {
      const fallback = randomFreeTile();
      const water = {
        id: `water-${index}`,
        tx: fallback.tx,
        ty: fallback.ty,
        band: "small",
        pattern: [{ x: 0, y: 0, deep: false }],
        state: "still",
        changedAt: null,
        lastForce: 1
      };
      objects.waters.push(water);
      commitWaterOccupied(water);
    }
  });

  objects.water = objects.waters[0] || null;
}

function generateGrasses() {
  objects.grasses = [];
  const grassKeys = new Set();
  const clusterCount = randomInt(6, 11);

  for (let i = 0; i < clusterCount; i++) {
    const center = randomDryInnerTile(2);
    const radius = randomInt(2, 5);

    for (let y = center.ty - radius; y <= center.ty + radius; y++) {
      for (let x = center.tx - radius; x <= center.tx + radius; x++) {
        if (!isLandTile(x, y) || beachDistance(x, y) <= 1 || isOccupiedByWater(x, y)) continue;

        const d = Math.hypot(x - center.tx, y - center.ty);
        const probability = Math.max(0.08, 0.72 - d * 0.15);

        if (chance(probability)) {
          grassKeys.add(keyOf(x, y));
        }
      }
    }
  }

  objects.grasses = [...grassKeys].map(key => {
    const [tx, ty] = key.split(",").map(Number);
    return { tx, ty, variant: randomInt(0, 4), phase: Math.random() * Math.PI * 2 };
  });
}

function randomDryInnerTile(margin = 2) {
  for (let i = 0; i < 1000; i++) {
    const tx = randomInt(margin, MAP_W - margin - 1);
    const ty = randomInt(margin, MAP_H - margin - 1);
    if (isInnerLandTile(tx, ty, margin) && !isOccupiedByWater(tx, ty) && !isBlockedTile(tx, ty)) {
      return { tx, ty };
    }
  }
  return { tx: Math.floor(MAP_W / 2), ty: Math.floor(MAP_H / 2) };
}

function randomFlowerTile() {
  const grassCandidates = objects.grasses
    .filter(g => !occupied.has(keyOf(g.tx, g.ty)) && !isOccupiedByWater(g.tx, g.ty) && !isBlockedTile(g.tx, g.ty));

  if (grassCandidates.length > 0 && chance(0.72)) {
    const g = choose(grassCandidates);
    occupied.add(keyOf(g.tx, g.ty));
    return { tx: g.tx, ty: g.ty };
  }

  return randomFreeDryTile();
}

function generateTrees() {
  objects.trees = [];

  const roll = Math.random();
  let count;
  if (roll < 0.18) count = randomInt(3, 6);
  else if (roll < 0.68) count = randomInt(7, 15);
  else if (roll < 0.94) count = randomInt(16, 25);
  else count = randomInt(26, 35);

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const tx = randomInt(3, MAP_W - 4);
      const ty = randomInt(4, MAP_H - 4);
      const key = keyOf(tx, ty);

      if (!isInnerLandTile(tx, ty, 2)) continue;
      if (occupied.has(key) || isOccupiedByWater(tx, ty) || beachDistance(tx, ty) <= 1) continue;
      if (!isLandTile(tx, ty - 1) || !isLandTile(tx, ty - 2)) continue;
      if (objects.trees.some(t => Math.max(Math.abs(t.tx - tx), Math.abs(t.ty - ty)) <= 1)) continue;

      occupied.add(key);
      objects.trees.push({ tx, ty, variant: randomInt(0, 2), phase: Math.random() * Math.PI * 2 });
      break;
    }
  }
}


function generateFragments() {
  objects.fragments = [];
  const count = weightedChoice([
    { value: 0, weight: 35 },
    { value: 1, weight: 45 },
    { value: 2, weight: 17 },
    { value: 3, weight: 3 }
  ]);

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const tx = randomInt(1, MAP_W - 2);
      const ty = randomInt(1, MAP_H - 2);
      const key = keyOf(tx, ty);

      if (!isLandTile(tx, ty)) continue;
      if (!isBeachTile(tx, ty) || isWaveEdgeTile(tx, ty)) continue;
      if (occupied.has(key) || isOccupiedByWater(tx, ty) || isBlockedTile(tx, ty)) continue;

      occupied.add(key);
      objects.fragments.push({
        tx,
        ty,
        state: "onGround",
        phase: Math.random() * Math.PI * 2
      });
      break;
    }
  }
}


function generateCampfire() {
  let pos = null;

  for (let i = 0; i < 1000; i++) {
    const candidate = randomDryInnerTile(2);
    const key = keyOf(candidate.tx, candidate.ty);

    if (occupied.has(key)) continue;
    if (beachDistance(candidate.tx, candidate.ty) < 2) continue;

    occupied.add(key);
    pos = candidate;
    break;
  }

  if (!pos) {
    pos = randomFreeDryTile();
  }

  objects.campfire = {
    tx: pos.tx,
    ty: pos.ty,
    state: "lit",
    unattendedStrongWindStartedAt: null,
    unattendedStrongWindDelay: null
  };
}

function isPlayerNearCampfire() {
  const fire = objects.campfire;
  if (!fire) return false;

  const p = playerTile();

  return Math.max(
    Math.abs(p.tx - fire.tx),
    Math.abs(p.ty - fire.ty)
  ) <= 1;
}

function updateCampfireByWind(now) {
  const fire = objects.campfire;
  if (!fire || fire.state !== "lit") return;

  const elapsed = elapsedSeconds(now);

  if (game.activeWind !== "strong") {
    fire.unattendedStrongWindStartedAt = null;
    return;
  }

  if (isPlayerNearCampfire()) {
    fire.unattendedStrongWindStartedAt = null;
    return;
  }

  if (fire.unattendedStrongWindStartedAt === null) {
    fire.unattendedStrongWindStartedAt = elapsed;
    fire.unattendedStrongWindDelay = randomInt(TIMING.campfireOutMin, TIMING.campfireOutMax);
    return;
  }

  if (elapsed - fire.unattendedStrongWindStartedAt >= fire.unattendedStrongWindDelay) {
    fire.state = "out";
    fire.unattendedStrongWindStartedAt = null;
    fire.unattendedStrongWindDelay = null;
    showMessage("火は、いつの間にか消えていた。");
  }
}


function updateFlowerField() {
  const flowers = objects.flowers;

  function adjacent(a, b) {
    const dx = Math.abs(a.tx - b.tx);
    const dy = Math.abs(a.ty - b.ty);
    return dx <= 1 && dy <= 1;
  }

  game.flowerField =
    adjacent(flowers[0], flowers[1]) &&
    adjacent(flowers[1], flowers[2]);
}

function elapsedSeconds(now = performance.now()) {
  return (now - game.startedAt) / 1000;
}

function getSunIndex(now) {
  const elapsed = elapsedSeconds(now);
  return (game.sunIndex + Math.floor(elapsed / TIMING.sunStep)) % 8;
}

function updateTimeSystems(now) {
  const elapsed = elapsedSeconds(now);

  if (elapsed - game.lastWindChange >= TIMING.windChange) {
    game.lastWindChange = elapsed;
    game.externalWind = chance(2 / 3) ? "breeze" : "strong";
  }

  if (elapsed - game.lastHungerDrop >= TIMING.hungerDrop) {
    game.lastHungerDrop = elapsed;
    game.hunger = Math.max(0, game.hunger - 25);
  }

  updateActiveWind();
  updateFlowersByWindAndTime(now);
  updateWaterByTime(now);
  updateCampfireByWind(now);
}

function updateActiveWind() {
  const door = objects.door;

  if (door.state === "open" || door.state === "broken_open") {
    game.activeWind = game.externalWind;
  } else {
    game.activeWind = "none";
  }
}

function updateFlowersByWindAndTime(now) {
  const elapsed = elapsedSeconds(now);

  objects.flowers.forEach(flower => {
    if (flower.state === "picked" && flower.pickedAt !== null) {
      if (elapsed - flower.pickedAt >= TIMING.wiltAfter) {
        flower.state = "wilted";
      }
    }

    if (flower.state === "normal" || flower.state === "swaying") {
      if (game.activeWind === "breeze") {
        flower.state = "swaying";
      }

      if (game.activeWind === "none") {
        flower.state = "normal";
      }
    }
  });

  objects.petals.forEach(petal => {
    if (petal.state === "collected" && petal.collectedAt !== null) {
      if (elapsed - petal.collectedAt >= TIMING.wiltAfter) {
        petal.state = "wilted";
      }
    }
  });

  if (game.activeWind === "strong") {
    if (elapsed - game.lastStrongWindFlowerCheck >= TIMING.strongWindFlowerCheck) {
      game.lastStrongWindFlowerCheck = elapsed;

      objects.flowers.forEach(flower => {
        if (flower.state === "normal" || flower.state === "swaying") {
          if (chance(0.5)) {
            flower.state = "scattered";
            createPetalNear(flower.tx, flower.ty, flower.color);
          }
        }
      });
    }
  }
}

function createPetalNear(tx, ty, color = "red") {
  const candidates = [
    { tx: tx + 1, ty },
    { tx: tx - 1, ty },
    { tx, ty: ty + 1 },
    { tx, ty: ty - 1 },
    { tx: tx + 1, ty: ty + 1 },
    { tx: tx - 1, ty: ty - 1 },
    { tx: tx + 1, ty: ty - 1 },
    { tx: tx - 1, ty: ty + 1 }
  ].filter(p => p.tx >= 0 && p.tx < MAP_W && p.ty >= 0 && p.ty < MAP_H && isLandTile(p.tx, p.ty));

  const p = candidates.length > 0 ? choose(candidates) : { tx, ty };

  objects.petals.push({
    tx: p.tx,
    ty: p.ty,
    color,
    state: "onGround",
    collectedAt: null
  });
}

function updateWaterByTime(now) {
  const elapsed = elapsedSeconds(now);

  getWaters().forEach(water => {
    if ((water.state === "rippling" || water.state === "splashed") && water.changedAt !== null) {
      if (elapsed - water.changedAt >= TIMING.waterRecover) {
        water.state = "still";
        water.changedAt = null;
      }
    }

    if (water.state === "still" || water.state === "windRough") {
      water.state = game.activeWind === "strong" ? "windRough" : "still";
    }
  });
}

function getForce() {
  const nextActionIndex = game.forceActionCount + 1;

  let base = 1;
  if (nextActionIndex === 1) base = 3;
  else if (nextActionIndex === 2) base = 2;
  else base = 1;

  const hungerModifier = game.hunger === 0 || game.hunger === 100 ? 1 : 0;

  return base + hungerModifier;
}

function registerForceAction() {
  const force = getForce();
  game.forceActionCount += 1;
  return force;
}

function getPlayerSpeed() {
  let speed = player.speed;

  if (game.hunger === 0) speed = player.speed / 3;
  else if (game.hunger === 25) speed = player.speed * 2 / 3;

  const p = playerTile();
  if (isDeepWaterTile(p.tx, p.ty)) {
    speed *= 0.68;
  }

  return speed;
}

function playerTile() {
  return {
    tx: Math.floor((player.x + player.w / 2) / TILE),
    ty: Math.floor((player.y + player.h / 2) / TILE)
  };
}

function distanceFromPlayerTile(tx, ty) {
  const p = playerTile();
  return Math.max(Math.abs(p.tx - tx), Math.abs(p.ty - ty));
}

function visibilityForTile(tx, ty) {
  const distance = distanceFromPlayerTile(tx, ty);

  if (distance <= VISION.full) return "full";
  if (distance <= VISION.hint) return "hint";
  return "hidden";
}

function sameTile(a, b) {
  return a.tx === b.tx && a.ty === b.ty;
}

function getWaterCellAt(tx, ty) {
  for (const water of getWaters()) {
    const cell = water.pattern.find(cell => water.tx + cell.x === tx && water.ty + cell.y === ty);
    if (cell) return { water, cell };
  }
  return null;
}

function isWaterTile(tx, ty) {
  return !!getWaterCellAt(tx, ty);
}

function isDeepWaterTile(tx, ty) {
  const hit = getWaterCellAt(tx, ty);
  return !!(hit && hit.cell.deep);
}

function checkWaterPassage() {
  const p = playerTile();
  const hit = getWaterCellAt(p.tx, p.ty);

  if (hit) {
    const water = hit.water;
    if (water.state !== "rippling" && water.state !== "splashed") {
      water.state = "rippling";
      water.changedAt = elapsedSeconds();
      showMessage(hit.cell.deep ? "水の中で、足が少し重くなった。" : "水面に、波紋ができた。");
    }
  }
}

function getObjectAtTile(tx, ty) {
  const flower = objects.flowers.find(flower => {
    return flower.tx === tx && flower.ty === ty;
  });

  if (flower) {
    return { kind: "flower", data: flower };
  }

  const petal = objects.petals.find(petal => {
    return petal.tx === tx && petal.ty === ty && petal.state === "onGround";
  });

  if (petal) {
    return { kind: "petal", data: petal };
  }

  const waterHit = getWaterCellAt(tx, ty);
  if (waterHit) {
    return { kind: "water", data: waterHit.water };
  }

  const fragment = objects.fragments.find(fragment => {
    return fragment.tx === tx && fragment.ty === ty && fragment.state === "onGround";
  });

  if (fragment) {
    return { kind: "fragment", data: fragment };
  }

  if (objects.door.tx === tx && objects.door.ty === ty) {
    return { kind: "door", data: objects.door };
  }

  if (objects.campfire && objects.campfire.tx === tx && objects.campfire.ty === ty) {
    return { kind: "campfire", data: objects.campfire };
  }

  if (objects.stone.tx === tx && objects.stone.ty === ty) {
    return { kind: "stone", data: objects.stone };
  }

  return null;
}

function getOverlappedTarget() {
  const p = playerTile();
  return getObjectAtTile(p.tx, p.ty);
}

function handleAction() {
  if (game.paused) return;

  const target = getOverlappedTarget();

  if (!target) {
    showMessage("何もない。");
    return;
  }

  actTarget(target);
}

function actTarget(target) {
  if (target.kind === "flower") {
    actFlower(target.data);
    return;
  }

  if (target.kind === "petal") {
    actPetal(target.data);
    return;
  }

  if (target.kind === "water") {
    actWater(target.data);
    return;
  }

  if (target.kind === "fragment") {
    actFragment(target.data);
    return;
  }

  if (target.kind === "door") {
    actDoor();
    return;
  }

  if (target.kind === "campfire") {
    actCampfire();
    return;
  }

  if (target.kind === "stone") {
    actStone();
    return;
  }
}

function getInventoryFirstEmptyIndex() {
  return inventory.slots.findIndex(slot => slot === null);
}

function addItemToInventory(item) {
  const index = getInventoryFirstEmptyIndex();

  if (index === -1) {
    return false;
  }

  inventory.slots[index] = item;
  return true;
}

function useInventorySlot(index) {
  const item = inventory.slots[index];

  if (!item) {
    showMessage("そこには、何も入っていない。");
    return;
  }

  if (item.kind === "sandwich") {
    eatSandwichFromSlot(index);
    return;
  }

  if (item.kind === "petal") {
    showMessage("花びらは、ポケットにある。");
    return;
  }

  if (item.kind === "fragment") {
    showMessage("曇った欠片は、ポケットにある。");
    return;
  }
}

function eatSandwichFromSlot(index) {
  if (!objects.sandwich.available) {
    showMessage("サンドウィッチは、もうない。");
    return;
  }

  inventory.slots[index] = null;
  objects.sandwich.available = false;
  game.sandwichUsed = true;
  game.hunger = Math.min(100, game.hunger + 50);

  showMessage("サンドウィッチを食べた。パンの匂いが少し残った。");
}

function actFlower(flower) {
  if (flower.state === "picked") {
    showMessage("花は、手の中にある。");
    return;
  }

  if (flower.state === "wilted") {
    showMessage("花は、少し萎れている。");
    return;
  }

  if (flower.state === "crushed") {
    showMessage("花は、もう形を戻さない。");
    return;
  }

  if (flower.state === "scattered") {
    showMessage("花びらは、もう離れている。");
    return;
  }

  const crushProbability = 0.12;

  if (chance(crushProbability)) {
    flower.state = "crushed";
    showMessage("花は、手の中で形を失った。");
  } else {
    flower.state = "picked";
    flower.pickedAt = elapsedSeconds();
    showMessage("花に触れた。匂いが、少し手に残った。");
  }
}

function actPetal(petal) {
  const added = addItemToInventory({
    kind: "petal",
    color: petal.color,
    collectedAt: elapsedSeconds()
  });

  if (!added) {
    showMessage("もう、ポケットには入らない。");
    return;
  }

  petal.state = "collected";
  petal.collectedAt = elapsedSeconds();
  showMessage("花びらを拾った。色だけが、手元に残った。");
}

function actFragment(fragment) {
  const added = addItemToInventory({
    kind: "fragment",
    collectedAt: elapsedSeconds()
  });

  if (!added) {
    showMessage("もう、ポケットには入らない。");
    return;
  }

  fragment.state = "collected";
  showMessage("曇った欠片を拾った。少しだけ、光を覚えていた。");
}

function actWater(water = objects.water) {
  water.state = "splashed";
  water.changedAt = elapsedSeconds();
  water.lastForce = 1;

  showMessage("水が跳ねた。波紋が広がっていく。");
}

function actDoor() {
  const door = objects.door;

  if (door.state === "locked") {
    showMessage("扉は閉じたままだった。向こう側のことは、まだ分からない。");
    return;
  }

  if (door.state === "broken_open") {
    showMessage("扉は開いたまま、もう動かない。風だけが通っている。");
    return;
  }

  if (door.state === "broken_closed") {
    showMessage("扉は閉じたまま、もう動かない。");
    return;
  }

  const breakProbability = 0.2;

  if (door.state === "open") {
    if (chance(breakProbability)) {
      door.state = "broken_closed";
      showMessage("扉は閉じたところで、動かなくなった。");
    } else {
      door.state = "closed";
      showMessage("扉を閉めた。空気は少し留まった。");
    }

    updateActiveWind();
    return;
  }

  if (door.state === "closed") {
    if (chance(breakProbability)) {
      door.state = "broken_open";
      showMessage("扉は開いたところで、動かなくなった。");
    } else {
      door.state = "open";
      showMessage("扉を開けた。外の空気が入ってきた。");
    }

    updateActiveWind();
  }
}

function actCampfire() {
  const fire = objects.campfire;

  if (!fire) {
    showMessage("そこには、何もない。");
    return;
  }

  if (fire.state === "lit") {
    showMessage("火は、まだ小さく残っている。");
    return;
  }

  showMessage("火は、もう消えている。");
}

function actStone() {
  const text = generateInscription();
  inscriptionText.textContent = text;
  overlay.classList.remove("hidden");

  game.paused = true;
  game.endingShown = true;
}

function canPlayerMoveTo(px, py) {
  const tx = Math.floor((px + player.w / 2) / TILE);
  const ty = Math.floor((py + player.h / 2) / TILE);
  return isLandTile(tx, ty) && !isBlockedTile(tx, ty);
}

function movePlayer() {
  if (game.paused) return;

  let dirX = 0;
  let dirY = 0;

  if (input.keys.left) dirX -= 1;
  if (input.keys.right) dirX += 1;
  if (input.keys.up) dirY -= 1;
  if (input.keys.down) dirY += 1;

  if (input.moveActive) {
    const len = Math.hypot(input.dx, input.dy);

    if (len >= 12) {
      dirX += input.dx / len;
      dirY += input.dy / len;
    }
  }

  const len = Math.hypot(dirX, dirY);
  if (len === 0) return;

  dirX /= len;
  dirY /= len;

  const currentSpeed = getPlayerSpeed();
  const nextX = player.x + dirX * currentSpeed;
  const nextY = player.y + dirY * currentSpeed;

  // Slide along tree trunks and other blocking objects instead of sticking.
  if (canPlayerMoveTo(nextX, nextY)) {
    player.x = nextX;
    player.y = nextY;
  } else {
    if (canPlayerMoveTo(nextX, player.y)) player.x = nextX;
    if (canPlayerMoveTo(player.x, nextY)) player.y = nextY;
  }

  player.x = Math.max(0, Math.min(MAP_W * TILE - player.w, player.x));
  player.y = Math.max(0, Math.min(MAP_H * TILE - player.h, player.y));

  checkWaterPassage();
}

function updateCamera() {
  const viewW = screen.w / camera.zoom;
  const viewH = screen.h / camera.zoom;

  camera.x = player.x + player.w / 2 - viewW / 2;
  camera.y = player.y + player.h / 2 - viewH / 2;

  camera.x = Math.max(0, Math.min(MAP_W * TILE - viewW, camera.x));
  camera.y = Math.max(0, Math.min(MAP_H * TILE - viewH, camera.y));
}

function showMessage(text) {
  game.message = text;
  game.messageTimer = 210;
}

function getTileScreen(tx, ty) {
  return {
    x: tx * TILE - camera.x,
    y: ty * TILE - camera.y
  };
}

function screenToWorld(x, y) {
  return {
    x: x / camera.zoom + camera.x,
    y: y / camera.zoom + camera.y
  };
}

function screenToTile(x, y) {
  const world = screenToWorld(x, y);

  return {
    tx: Math.floor(world.x / TILE),
    ty: Math.floor(world.y / TILE)
  };
}

function beachDistance(tx, ty) {
  if (!isLandTile(tx, ty)) return 0;

  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isLandTile(tx + dx, ty + dy)) return r;
      }
    }
  }

  return 7;
}

function isBeachTile(tx, ty) {
  const d = beachDistance(tx, ty);
  if (d === 1 || d === 2) return true;

  // Rare, shallow sand tongues. Keep them modest so the island does not feel all beach.
  const n = Math.sin(tx * 1.91 + ty * 0.77) + Math.cos(tx * 0.41 - ty * 1.63);
  return d === 3 && n > 1.65;
}

function isWaveEdgeTile(tx, ty) {
  return beachDistance(tx, ty) === 1;
}

function sandColorForSun(sun) {
  const colors = [
    "#bcae83",
    "#c4b789",
    "#cabd8f",
    "#bdae83",
    "#9b8f6d",
    "#55534e",
    "#464d50",
    "#505653"
  ];
  return colors[sun] || colors[0];
}

function drawGround(now) {
  const sun = getSunIndex(now);

  const seaColors = [
    "#4f7f96",
    "#54889d",
    "#5b93a8",
    "#587f92",
    "#536b78",
    "#213846",
    "#1b303c",
    "#223944"
  ];

  const landColors = [
    "#6f9468",
    "#759b66",
    "#7ca36a",
    "#748f62",
    "#69664f",
    "#354749",
    "#2d4048",
    "#33464a"
  ];

  ctx.fillStyle = seaColors[sun];
  ctx.fillRect(0, 0, screen.w / camera.zoom, screen.h / camera.zoom);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const s = getTileScreen(x, y);

      if (!isLandTile(x, y)) {
        continue;
      }

      const beach = isBeachTile(x, y);
      ctx.fillStyle = beach ? sandColorForSun(sun) : landColors[sun];
      ctx.fillRect(s.x, s.y, TILE, TILE);

      ctx.fillStyle = (x + y) % 2 === 0
        ? "rgba(255,255,255,0.014)"
        : "rgba(0,0,0,0.018)";

      ctx.fillRect(s.x, s.y, TILE, TILE);

      const nearSea =
        !isLandTile(x - 1, y) ||
        !isLandTile(x + 1, y) ||
        !isLandTile(x, y - 1) ||
        !isLandTile(x, y + 1);

      if (isWaveEdgeTile(x, y)) {
        const wave = (Math.sin(now / 900 + x * 0.55 + y * 0.4) + 1) / 2;
        ctx.fillStyle = `rgba(230,245,245,${0.10 + wave * 0.22})`;
        ctx.fillRect(s.x, s.y, TILE, TILE);

        ctx.fillStyle = `rgba(80,120,130,${0.08 + (1 - wave) * 0.16})`;
        ctx.fillRect(s.x, s.y, TILE, TILE);
      }
    }
  }
}

function drawShadows(now) {
  const sun = getSunIndex(now);

  const shadowMap = {
    0: { dx: -1, dy: 0, len: 2 },
    1: { dx: -1, dy: -1, len: 1 },
    2: null,
    3: { dx: 1, dy: -1, len: 1 },
    4: { dx: 1, dy: 0, len: 2 },
    5: null,
    6: null,
    7: null
  };

  const playerPos = playerTile();

  function isNormallyVisible(obj) {
    return Math.max(
      Math.abs(playerPos.tx - obj.tx),
      Math.abs(playerPos.ty - obj.ty)
    ) <= VISION.full;
  }

  const objectShadowSources = [
    ...objects.flowers
      .filter(f => (f.state === "normal" || f.state === "swaying") && isNormallyVisible(f))
      .map(f => ({ tx: f.tx, ty: f.ty, kind: "flower" })),
    ...(isNormallyVisible(objects.door) ? [{ ...objects.door, kind: "door" }] : []),
    ...(isNormallyVisible(objects.stone) ? [{ ...objects.stone, kind: "stone" }] : []),
    ...objects.trees
      .filter(tree => isNormallyVisible(tree))
      .map(tree => ({ tx: tree.tx, ty: tree.ty, kind: "tree" }))
  ];

  const playerShadowSource = {
    tx: playerPos.tx,
    ty: playerPos.ty,
    kind: "player"
  };

  const allShadowSources = [
    ...objectShadowSources,
    playerShadowSource
  ];

  // Sun shadows can exist independently of campfire shadows.
  const sunRule = shadowMap[sun];
  if (sunRule) {
    allShadowSources.forEach(obj => {
      drawShadowFromRule(obj, sunRule, "rgba(0,0,0,0.20)");
    });
  }

  // Campfire shadows occur from evening through night to morning.
  // West → Northwest → North → Northeast → East.
  const fire = objects.campfire;
  const campfireShadowTime = sun === 4 || sun === 5 || sun === 6 || sun === 7 || sun === 0;

  if (campfireShadowTime && fire && fire.state === "lit") {
    drawCampfireShadows(allShadowSources, fire);
  }
}

function drawShadowFromRule(obj, rule, color) {
  ctx.fillStyle = color;

  for (let i = 1; i <= rule.len; i++) {
    const tx = obj.tx + rule.dx * i;
    const ty = obj.ty + rule.dy * i;

    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
    if (!isLandTile(tx, ty)) continue;

    const s = getTileScreen(tx, ty);

    if (obj.kind === "player") {
      ctx.fillRect(s.x + 6, s.y + 6, TILE - 12, TILE - 12);
    } else if (obj.kind === "tree") {
      ctx.fillRect(s.x + 1, s.y + 1, TILE - 2, TILE - 2);
    } else {
      ctx.fillRect(s.x + 4, s.y + 4, TILE - 8, TILE - 8);
    }
  }
}

function drawCampfireShadows(shadowSources, fire) {
  const lightRange = 4;
  const shadowLength = 2;

  shadowSources.forEach(obj => {
    if (obj.tx === fire.tx && obj.ty === fire.ty) return;

    const dxFromFire = obj.tx - fire.tx;
    const dyFromFire = obj.ty - fire.ty;
    const distance = Math.max(Math.abs(dxFromFire), Math.abs(dyFromFire));

    if (distance > lightRange) return;

    const rule = {
      dx: Math.sign(dxFromFire),
      dy: Math.sign(dyFromFire),
      len: shadowLength
    };

    // If somehow exactly same tile, no shadow.
    if (rule.dx === 0 && rule.dy === 0) return;

    // "campfire -> object/player -> shadow"
    drawShadowFromRule(obj, rule, obj.kind === "player" ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.48)");
  });
}

function drawWater(now) {
  const sun = getSunIndex(now);
  const isNight = sun === 5 || sun === 6 || sun === 7;
  const isDuskOrDawn = sun === 4 || sun === 0;

  getWaters().forEach(water => {
    const visibleCells = water.pattern
      .map(cell => ({
        cell,
        tx: water.tx + cell.x,
        ty: water.ty + cell.y
      }))
      .filter(item => visibilityForTile(item.tx, item.ty) === "full");

    if (visibleCells.length === 0) return;

    function hasWaterCell(tx, ty) {
      return water.pattern.some(cell => water.tx + cell.x === tx && water.ty + cell.y === ty);
    }

    visibleCells.forEach(({ cell, tx, ty }) => {
      const s = getTileScreen(tx, ty);

      // 水たまりは「タイルの集合」ではなく、地面に残った一続きの面として描く。
      // そのためセルごとの台形・個別輪郭は廃止し、隣接セル同士はぴったり繋げる。
      let base = cell.deep ? "#2f6a83" : "#4f8994";
      if (water.state === "windRough") base = cell.deep ? "#2b5f78" : "#4d7f88";
      if (water.state === "rippling") base = cell.deep ? "#357185" : "#5d9298";
      if (water.state === "splashed") base = cell.deep ? "#437f8c" : "#72a5a4";

      if (isNight) {
        base = cell.deep ? "#263f4e" : "#344f56";
      } else if (isDuskOrDawn) {
        base = cell.deep ? "#315866" : "#4b7477";
      }

      ctx.fillStyle = base;
      ctx.fillRect(s.x, s.y, TILE, TILE);

      // マス感を消すためのごく弱い濃淡。形は変えず、色だけ少し揺らす。
      const seed = (tx * 17 + ty * 31) % 7;
      ctx.fillStyle = seed % 2 === 0
        ? "rgba(255,255,255,0.025)"
        : "rgba(0,0,0,0.025)";
      ctx.fillRect(s.x, s.y, TILE, TILE);

      if (cell.deep) {
        ctx.fillStyle = isNight ? "rgba(0,12,20,0.14)" : "rgba(0,20,35,0.12)";
        ctx.fillRect(s.x, s.y, TILE, TILE);
      }

      // 外周だけを泥っぽく馴染ませる。内側のセル境界には線を引かない。
      ctx.strokeStyle = isNight ? "rgba(18,28,32,0.24)" : "rgba(55,80,62,0.20)";
      ctx.lineWidth = 2;
      ctx.beginPath();

      if (!hasWaterCell(tx, ty - 1)) {
        ctx.moveTo(s.x + 2, s.y + 1);
        ctx.lineTo(s.x + TILE - 2, s.y + 1);
      }
      if (!hasWaterCell(tx + 1, ty)) {
        ctx.moveTo(s.x + TILE - 1, s.y + 2);
        ctx.lineTo(s.x + TILE - 1, s.y + TILE - 2);
      }
      if (!hasWaterCell(tx, ty + 1)) {
        ctx.moveTo(s.x + TILE - 2, s.y + TILE - 1);
        ctx.lineTo(s.x + 2, s.y + TILE - 1);
      }
      if (!hasWaterCell(tx - 1, ty)) {
        ctx.moveTo(s.x + 1, s.y + TILE - 2);
        ctx.lineTo(s.x + 1, s.y + 2);
      }
      ctx.stroke();

      // 角だけ少し削る。セル単位の台形にはせず、外周の硬さだけを薄める。
      ctx.fillStyle = isNight ? "rgba(34,48,40,0.12)" : "rgba(100,125,85,0.12)";
      if (!hasWaterCell(tx - 1, ty) && !hasWaterCell(tx, ty - 1)) ctx.fillRect(s.x, s.y, 3, 3);
      if (!hasWaterCell(tx + 1, ty) && !hasWaterCell(tx, ty - 1)) ctx.fillRect(s.x + TILE - 3, s.y, 3, 3);
      if (!hasWaterCell(tx - 1, ty) && !hasWaterCell(tx, ty + 1)) ctx.fillRect(s.x, s.y + TILE - 3, 3, 3);
      if (!hasWaterCell(tx + 1, ty) && !hasWaterCell(tx, ty + 1)) ctx.fillRect(s.x + TILE - 3, s.y + TILE - 3, 3, 3);

      // 水面の揺らぎ線は虫のように見えやすいため、Ver.0.4では表示しない。
    });
  });
}

function getAirSideForVisual(now) {
  const fire = objects.campfire;
  if (game.activeWind === "strong") {
    return fire?.smokeSide || 1;
  }

  if (game.activeWind === "breeze") {
    return Math.sin(now / 1400) >= 0 ? 1 : -1;
  }

  return 0;
}

function drawWaterSurfaceStreaks(water, cell, s, now) {
  const side = getAirSideForVisual(now);
  const seed = (water.tx + cell.x * 7 + water.ty * 3 + cell.y * 11);
  const phase = now / 780 + seed;

  let count = 0;
  let alpha = 0.0;
  let len = 9;

  if (water.state === "still") {
    // 無風時は基本的に動かさない。深い部分だけ、ほぼ見えない縦の濃淡を置く。
    count = cell.deep ? 1 : 0;
    alpha = 0.055;
    len = 7;
  } else if (water.state === "rippling") {
    count = cell.deep ? 2 : 1;
    alpha = 0.15;
    len = 10;
  } else if (water.state === "windRough") {
    count = cell.deep ? 3 : 2;
    alpha = 0.18;
    len = 12;
  } else if (water.state === "splashed") {
    count = cell.deep ? 4 : 3;
    alpha = 0.24;
    len = 11;
  }

  if (count <= 0) return;

  ctx.save();
  ctx.lineWidth = cell.deep ? 1.2 : 1;
  ctx.lineCap = "round";

  // Wind from right -> fine vertical marks gather on left.
  // Wind from left -> fine vertical marks gather on right.
  const sideBandX = side > 0 ? 8 : side < 0 ? 22 : 15;

  for (let i = 0; i < count; i++) {
    const px = s.x + sideBandX + ((seed * 3 + i * 5) % 5) - 2;
    const py = s.y + 7 + ((seed * 5 + i * 7) % 18);
    const wobble = Math.sin(phase + i * 1.3) * (game.activeWind === "strong" ? 1.1 : 0.55);

    const strokeAlpha = alpha * (1 - i * 0.13);
    ctx.strokeStyle = cell.deep
      ? `rgba(165,195,198,${strokeAlpha * 0.62})`
      : `rgba(205,220,214,${strokeAlpha})`;

    ctx.beginPath();
    ctx.moveTo(px + wobble * 0.25, py - len / 2);
    ctx.quadraticCurveTo(px + wobble, py, px + wobble * 0.2, py + len / 2);
    ctx.stroke();
  }

  // 踏んだ直後だけ、短い縦方向の乱れを少し足す。円にはしない。
  if (water.state === "splashed") {
    ctx.strokeStyle = "rgba(218,230,226,0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const px = s.x + 10 + ((seed + i * 6) % 14);
      const py = s.y + 8 + ((seed * 2 + i * 5) % 15);
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px + Math.sin(phase + i) * 1.4, py + 5);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function visibilityForWater(water) {
  const distances = water.pattern.map(cell => distanceFromPlayerTile(water.tx + cell.x, water.ty + cell.y));
  const min = Math.min(...distances);

  if (min <= VISION.full) return "full";
  return "hidden";
}

function drawFlowers() {
  objects.flowers.forEach(flower => {
    const visibility = visibilityForTile(flower.tx, flower.ty);
    if (visibility === "hidden") return;

    const s = getTileScreen(flower.tx, flower.ty);
    const color = flowerColors[flower.color] || flowerColors.red;

if (visibility === "hint") return;

    if (flower.state === "crushed") {
      ctx.fillStyle = shadeColor(color.petal, -35);
      ctx.beginPath();
      ctx.ellipse(s.x + 16, s.y + 18, 10, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (flower.state === "scattered") {
      ctx.fillStyle = color.petal;
      ctx.fillRect(s.x + 8, s.y + 10, 5, 4);
      ctx.fillRect(s.x + 19, s.y + 16, 5, 4);
      ctx.fillRect(s.x + 15, s.y + 24, 5, 4);
      return;
    }

    if (flower.state === "picked") {
      return;
    }

    if (flower.state === "wilted") {
      return;
    }

    const offset = flower.state === "swaying"
      ? Math.sin(performance.now() / 180 + flower.tx) * 2
      : 0;

    ctx.strokeStyle = "#355f36";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x + 16, s.y + 26);
    ctx.lineTo(s.x + 16 + offset, s.y + 14);
    ctx.stroke();

    ctx.fillStyle = color.petal;
    ctx.beginPath();
    ctx.arc(s.x + 16 + offset, s.y + 11, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color.center;
    ctx.beginPath();
    ctx.arc(s.x + 16 + offset, s.y + 11, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));

  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function drawPetals() {
  objects.petals.forEach(petal => {
    if (petal.state !== "onGround") return;

    const visibility = visibilityForTile(petal.tx, petal.ty);
    if (visibility !== "full") return;

    const s = getTileScreen(petal.tx, petal.ty);
    const color = flowerColors[petal.color] || flowerColors.red;

    ctx.fillStyle = color.petal;
    ctx.fillRect(s.x + 10, s.y + 14, 5, 4);
    ctx.fillRect(s.x + 17, s.y + 18, 5, 4);
  });
}

function drawFragments(now) {
  objects.fragments.forEach(fragment => {
    if (fragment.state !== "onGround") return;

    const visibility = visibilityForTile(fragment.tx, fragment.ty);
    if (visibility !== "full") return;

    const s = getTileScreen(fragment.tx, fragment.ty);
    const sun = getSunIndex(now);
    const fire = objects.campfire;
    const fireNear = fire && fire.state === "lit" && Math.max(Math.abs(fragment.tx - fire.tx), Math.abs(fragment.ty - fire.ty)) <= 4;
    const glimmer = (sun === 0 || sun === 1 || sun === 3 || sun === 4 || fireNear)
      ? 0.18 + Math.max(0, Math.sin(now / 900 + fragment.phase)) * 0.12
      : 0.08;

    ctx.fillStyle = `rgba(205,220,218,${0.46 + glimmer})`;
    ctx.beginPath();
    ctx.ellipse(s.x + 16, s.y + 17, 5.5, 4.0, -0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,245,${glimmer})`;
    ctx.fillRect(s.x + 14, s.y + 14, 2, 2);
  });
}

function drawDoor() {
  const door = objects.door;
  const visibility = visibilityForTile(door.tx, door.ty);
  if (visibility === "hidden") return;

  const s = getTileScreen(door.tx, door.ty);

  if (visibility === "hint") {
    ctx.fillStyle = "rgba(55,40,30,0.55)";
    ctx.fillRect(s.x + 13, s.y + 5, 6, TILE - 10);
    return;
  }

  if (door.state === "open") {
    ctx.fillStyle = "#79583c";
    ctx.fillRect(s.x + 4, s.y + 6, 6, TILE - 8);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(s.x + 13, s.y + 5, TILE - 18, TILE - 10);
  }

  if (door.state === "closed") {
    ctx.fillStyle = "#6b4a2f";
    ctx.fillRect(s.x + 5, s.y + 4, TILE - 10, TILE - 8);
    ctx.fillStyle = "#d6b25e";
    ctx.fillRect(s.x + 21, s.y + 15, 4, 4);
  }

  if (door.state === "locked") {
    ctx.fillStyle = "#4c3929";
    ctx.fillRect(s.x + 5, s.y + 4, TILE - 10, TILE - 8);
    ctx.fillStyle = "#c8b77a";
    ctx.fillRect(s.x + 14, s.y + 14, 6, 8);
  }

  if (door.state === "broken_open") {
    ctx.fillStyle = "#5b3c28";
    ctx.fillRect(s.x + 5, s.y + 20, TILE - 10, 6);
    ctx.fillRect(s.x + 12, s.y + 8, 5, TILE - 12);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(s.x + 3, s.y + 3, TILE - 6, TILE - 6);
  }

  if (door.state === "broken_closed") {
    ctx.fillStyle = "#4b3526";
    ctx.fillRect(s.x + 5, s.y + 4, TILE - 10, TILE - 8);
    ctx.fillStyle = "rgba(20,15,12,0.35)";
    ctx.fillRect(s.x + 9, s.y + 9, TILE - 18, 3);
    ctx.fillRect(s.x + 14, s.y + 6, 4, TILE - 12);
  }
}

function drawStone() {
  const stone = objects.stone;
  const visibility = visibilityForTile(stone.tx, stone.ty);
  if (visibility === "hidden") return;

  const s = getTileScreen(stone.tx, stone.ty);

  if (visibility === "hint") {
    ctx.fillStyle = "rgba(120,122,112,0.38)";
    ctx.fillRect(s.x + 10, s.y + 9, TILE - 19, TILE - 15);
    return;
  }

  // Ver.0.4-final: older, chipped, slightly swallowed by the island.
  ctx.save();
  ctx.translate(s.x, s.y);

  ctx.fillStyle = "#8d8b7e";
  ctx.beginPath();
  ctx.moveTo(7, 6);
  ctx.lineTo(24, 4);
  ctx.lineTo(26, 27);
  ctx.lineTo(5, 28);
  ctx.lineTo(6, 16);
  ctx.closePath();
  ctx.fill();

  // chipped corner and age marks
  ctx.fillStyle = "rgba(45,48,44,0.20)";
  ctx.beginPath();
  ctx.moveTo(22, 4);
  ctx.lineTo(26, 7);
  ctx.lineTo(22, 10);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(48,50,46,0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(13, 7);
  ctx.lineTo(11, 14);
  ctx.lineTo(14, 19);
  ctx.stroke();

  ctx.fillStyle = "#696a61";
  ctx.fillRect(10, 12, 12, 2);
  ctx.fillRect(9, 19, 11, 2);

  // moss/grass swallowing the base
  ctx.fillStyle = "rgba(48,86,45,0.42)";
  ctx.fillRect(5, 25, 7, 3);
  ctx.fillRect(18, 25, 8, 3);
  ctx.strokeStyle = "rgba(42,88,42,0.50)";
  ctx.beginPath();
  ctx.moveTo(8, 28); ctx.lineTo(7, 23);
  ctx.moveTo(13, 28); ctx.lineTo(14, 24);
  ctx.moveTo(23, 28); ctx.lineTo(22, 23);
  ctx.stroke();

  ctx.restore();
}


function drawCampfireLight() {
  const fire = objects.campfire;
  if (!fire || fire.state !== "lit") return;

  const sun = getSunIndex(performance.now());
  const shouldLight = sun === 4 || sun === 5 || sun === 6 || sun === 7 || sun === 0;
  if (!shouldLight) return;

  const visibility = visibilityForTile(fire.tx, fire.ty);
  if (visibility === "hidden") return;

  // Ver.0.4-H: small warm light that pools on the ground.
  // Not a circular spotlight; a few low, uneven ellipses around the fire.
  const s = getTileScreen(fire.tx, fire.ty);
  const now = performance.now();
  const cx = s.x + TILE / 2;
  const cy = s.y + TILE / 2 + 8;
  const flicker = 0.90 + 0.10 * Math.sin(now / 150);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  function groundGlow(dx, dy, sx, sy, radius, stops, alpha = 1) {
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.scale(sx, sy);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
    stops.forEach(stop => g.addColorStop(stop[0], stop[1]));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // Ver.0.4-final: a little brighter and wider; still uneven, not a circular spotlight.
  groundGlow(0, 3, 1.90, 0.78, TILE * 2.70, [
    [0, `rgba(255,188,72,${0.34 * flicker})`],
    [0.32, `rgba(235,132,48,${0.195 * flicker})`],
    [0.70, `rgba(172,75,28,${0.074 * flicker})`],
    [1, "rgba(172,75,28,0)"]
  ]);

  groundGlow(-6, 1, 1.18, 0.60, TILE * 1.48, [
    [0, `rgba(255,210,112,${0.22 * flicker})`],
    [0.55, `rgba(226,118,45,${0.078 * flicker})`],
    [1, "rgba(226,118,45,0)"]
  ], 0.90);

  groundGlow(7, 6, 1.10, 0.54, TILE * 1.28, [
    [0, `rgba(244,143,52,${0.145 * flicker})`],
    [0.65, `rgba(190,80,35,${0.054 * flicker})`],
    [1, "rgba(190,80,35,0)"]
  ], 0.80);

  ctx.restore();
}

function drawCampfire() {
  const fire = objects.campfire;
  if (!fire) return;

  const visibility = visibilityForTile(fire.tx, fire.ty);
  if (visibility === "hidden") return;

  const s = getTileScreen(fire.tx, fire.ty);
  const cx = s.x + TILE / 2;
  const now = performance.now();

  if (visibility === "hint") {
    ctx.fillStyle = fire.state === "lit"
      ? "rgba(230,112,45,0.54)"
      : "rgba(70,64,58,0.48)";
    ctx.beginPath();
    ctx.arc(cx, s.y + TILE / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // Small stone ring. The base is wider than the old two-log mark,
  // so the flame feels seated in the ground.
  const stones = [
    [5, 22, 4, 3], [10, 20, 5, 4], [16, 20, 5, 4], [23, 22, 4, 3],
    [8, 25, 5, 3], [15, 26, 5, 3], [22, 25, 4, 3]
  ];
  stones.forEach(([x, y, w, h], i) => {
    ctx.fillStyle = i % 2 === 0 ? "#5e5549" : "#706557";
    ctx.beginPath();
    ctx.ellipse(s.x + x, s.y + y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(s.x + x - 1, s.y + y - 2, 2, 1);
  });

  // Crossed logs inside the stones.
  ctx.strokeStyle = "#5b3620";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s.x + 9, s.y + 24);
  ctx.lineTo(s.x + 23, s.y + 20);
  ctx.moveTo(s.x + 10, s.y + 20);
  ctx.lineTo(s.x + 24, s.y + 24);
  ctx.stroke();

  if (fire.state === "lit") {
    const windLift = game.activeWind === "strong" ? 2.0 : 0.8;
    const flicker = Math.sin(now / 95) * windLift;
    const side = Math.sin(now / 170) * (game.activeWind === "strong" ? 1.8 : 0.8);

    // Outer orange flame: pointed, narrower at bottom, taller than old blob.
    const outer = ctx.createLinearGradient(cx, s.y + 7, cx, s.y + 25);
    outer.addColorStop(0, "rgba(255,200,85,0.92)");
    outer.addColorStop(0.45, "#f07a2d");
    outer.addColorStop(1, "#a43c22");
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.moveTo(cx - 5, s.y + 23);
    ctx.bezierCurveTo(cx - 8 + side, s.y + 17, cx - 3 + side, s.y + 11 + flicker, cx + 1 + side, s.y + 7 + flicker);
    ctx.bezierCurveTo(cx + 7 + side, s.y + 14, cx + 8, s.y + 19, cx + 5, s.y + 24);
    ctx.closePath();
    ctx.fill();

    // Inner yellow-white flame.
    const inner = ctx.createLinearGradient(cx, s.y + 12, cx, s.y + 24);
    inner.addColorStop(0, "#fff1a8");
    inner.addColorStop(0.55, "#f7b64a");
    inner.addColorStop(1, "rgba(239,97,36,0.45)");
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(cx - 2.8, s.y + 23);
    ctx.bezierCurveTo(cx - 4.2 + side * 0.45, s.y + 18, cx - 1.6 + side * 0.35, s.y + 14 + flicker * 0.45, cx + 0.8 + side * 0.25, s.y + 11 + flicker * 0.45);
    ctx.bezierCurveTo(cx + 3.8 + side * 0.35, s.y + 17, cx + 4.0, s.y + 20, cx + 2.4, s.y + 23);
    ctx.closePath();
    ctx.fill();

    // A few small embers, not enough to become noise.
    ctx.fillStyle = "rgba(255,150,52,0.72)";
    ctx.fillRect(s.x + 11, s.y + 18 + Math.sin(now / 180), 1.5, 1.5);
    ctx.fillRect(s.x + 21, s.y + 17 + Math.cos(now / 210), 1.5, 1.5);
  } else {
    ctx.fillStyle = "rgba(35,35,35,0.65)";
    ctx.beginPath();
    ctx.arc(cx, s.y + 18, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(80,80,80,0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x + 13, s.y + 13);
    ctx.lineTo(s.x + 17, s.y + 9);
    ctx.stroke();
  }
}


function drawGrasses(now) {
  objects.grasses.forEach(grass => {
    const visibility = visibilityForTile(grass.tx, grass.ty);
    if (visibility === "hidden") return;

    const s = getTileScreen(grass.tx, grass.ty);
    const swayAmount = game.activeWind === "strong" ? 3.0 : game.activeWind === "breeze" ? 1.7 : 0;
    const sway = Math.sin(now / 260 + grass.phase) * swayAmount;

    ctx.strokeStyle = visibility === "hint" ? "rgba(45,90,45,0.22)" : "rgba(42,93,46,0.62)";
    ctx.lineWidth = 1;

    const patterns = [
      [{ x: 7, h: 12, lean: -1.4 }, { x: 15, h: 17, lean: 0.6 }, { x: 23, h: 10, lean: 1.2 }],
      [{ x: 9, h: 15, lean: 1.0 }, { x: 17, h: 11, lean: -0.8 }, { x: 25, h: 18, lean: 0.3 }],
      [{ x: 6, h: 10, lean: -0.5 }, { x: 14, h: 14, lean: 1.5 }, { x: 22, h: 16, lean: -1.1 }],
      [{ x: 10, h: 18, lean: -1.0 }, { x: 18, h: 12, lean: 0.9 }, { x: 26, h: 14, lean: 1.6 }],
      [{ x: 8, h: 13, lean: 1.4 }, { x: 16, h: 18, lean: -0.3 }, { x: 24, h: 11, lean: -1.2 }]
    ];

    const blades = patterns[grass.variant % patterns.length];
    blades.forEach((blade, i) => {
      const tipX = blade.x + blade.lean + sway * (0.55 + i * 0.16);
      ctx.beginPath();
      ctx.moveTo(s.x + blade.x, s.y + 26);
      ctx.lineTo(s.x + tipX, s.y + 26 - blade.h);
      ctx.stroke();
    });
  });
}

function drawTrees(now) {
  objects.trees.forEach(tree => {
    const visibility = visibilityForTile(tree.tx, tree.ty);
    if (visibility === "hidden") return;

    const s = getTileScreen(tree.tx, tree.ty);
    const swayAmount = game.activeWind === "strong" ? 2.4 : game.activeWind === "breeze" ? 1.2 : 0;
    const sway = Math.sin(now / 380 + tree.phase) * swayAmount;

    // trunk/root tile. Draw it high enough that the canopy and trunk read as one tree.
    ctx.fillStyle = visibility === "hint" ? "rgba(80,55,35,0.34)" : "#6a4931";
    ctx.fillRect(s.x + 12, s.y + 6, 8, 26);

    const leafColor = visibility === "hint" ? "rgba(36,86,45,0.36)" : "#2f6f3b";
    ctx.fillStyle = leafColor;

    const canopyY = s.y - TILE * 0.82;
    const canopyX = s.x + 16 + sway;
    const r1 = tree.variant === 0 ? 18 : tree.variant === 1 ? 21 : 16;
    const r2 = tree.variant === 2 ? 15 : 18;

    ctx.beginPath();
    ctx.arc(canopyX, canopyY + 18, r1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(canopyX - 10, canopyY + 27, r2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(canopyX + 11, canopyY + 27, r2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.beginPath();
    ctx.arc(canopyX - 6, canopyY + 12, 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawCampfireSmoke(now) {
  const fire = objects.campfire;
  if (!fire || fire.state !== "lit") return;

  const s = getTileScreen(fire.tx, fire.ty);
  const baseX = s.x + TILE / 2;
  const baseY = s.y + 7;

  // Ver.0.4-H: one calm smoke column.
  // Slightly thicker than 0.4-G, but not a stormy plume.
  let height = 132;
  let topDrift = Math.sin(now / 1500 + fire.tx) * 2.2;
  let midDrift = Math.sin(now / 980 + fire.ty) * 1.4;
  let alpha = 0.24;
  let width = 2.85;

  if (game.activeWind === "breeze") {
    height = 136;
    topDrift = Math.sin(now / 1250 + fire.tx) * 3.2;
    midDrift = Math.sin(now / 900 + fire.ty) * 2.0;
    alpha = 0.23;
    width = 2.95;
  } else if (game.activeWind === "strong") {
    const side = fire.smokeSide || (fire.smokeSide = chance(0.5) ? -1 : 1);
    height = 128;
    topDrift = side * 5.2 + Math.sin(now / 900) * 1.6;
    midDrift = side * 2.8 + Math.sin(now / 760) * 1.2;
    alpha = 0.21;
    width = 3.05;
  }

  const topX = baseX + topDrift;
  const topY = baseY - height;
  const cp1X = baseX + midDrift * 0.30;
  const cp1Y = baseY - height * 0.34;
  const cp2X = baseX + midDrift;
  const cp2Y = baseY - height * 0.70;

  const gradient = ctx.createLinearGradient(baseX, baseY, topX, topY);
  gradient.addColorStop(0, `rgba(188,184,170,${alpha})`);
  gradient.addColorStop(0.45, `rgba(176,176,166,${alpha * 0.56})`);
  gradient.addColorStop(0.78, `rgba(165,165,158,${alpha * 0.28})`);
  gradient.addColorStop(1, "rgba(160,160,154,0)");

  ctx.save();
  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, topX, topY);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const x = player.x - camera.x;
  const y = player.y - camera.y;
  const now = performance.now();

  ctx.fillStyle = "#2f5e8f";
  ctx.fillRect(x, y, player.w, player.h);

  // Occasional blink: mostly open, briefly closed.
  const blinkCycle = (now / 1000 + player.blinkSeed) % 4.8;
  const blinking = blinkCycle > 4.58;

  ctx.fillStyle = "#fff";
  if (blinking) {
    ctx.fillRect(x + 6, y + 9, 4, 1);
    ctx.fillRect(x + 15, y + 9, 4, 1);
  } else {
    ctx.fillRect(x + 6, y + 7, 4, 4);
    ctx.fillRect(x + 15, y + 7, 4, 4);
  }
}

function drawVirtualStick() {
  if (!input.moveActive || game.paused) return;

  ctx.globalAlpha = 0.35;

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(input.startX, input.startY, 44, 0, Math.PI * 2);
  ctx.fill();

  const len = Math.min(36, Math.hypot(input.dx, input.dy));
  const angle = Math.atan2(input.dy, input.dx);
  const kx = input.startX + Math.cos(angle) * len;
  const ky = input.startY + Math.sin(angle) * len;

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(kx, ky, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

function getInventoryLayout() {
  const pocketW = 178;
  const pocketH = 58;
  const startX = (screen.w - pocketW) / 2;
  const y = screen.h - pocketH - 18;

  return {
    pocketW,
    pocketH,
    startX,
    y
  };
}

function getInventorySlotAtScreen(x, y) {
  const layout = getInventoryLayout();

  if (
    x >= layout.startX &&
    x <= layout.startX + layout.pocketW &&
    y >= layout.y &&
    y <= layout.y + layout.pocketH
  ) {
    const firstItemIndex = inventory.slots.findIndex(slot => slot !== null);
    return firstItemIndex === -1 ? 0 : firstItemIndex;
  }

  return -1;
}

function drawPocketItem(item, cx, cy) {
  if (!item) return;

  if (item.kind === "sandwich") {
    ctx.font = "24px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🥪", cx, cy + 1);
    return;
  }

  if (item.kind === "petal") {
    const color = flowerColors[item.color] || flowerColors.red;
    ctx.fillStyle = color.petal;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, 10, 7, -0.45, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (item.kind === "fragment") {
    ctx.fillStyle = "rgba(210,225,222,0.78)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, 11, 8, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,245,0.16)";
    ctx.fillRect(cx - 3, cy - 4, 3, 3);
  }
}

function drawInventory() {
  const layout = getInventoryLayout();
  const x = layout.startX;
  const y = layout.y;
  const w = layout.pocketW;
  const h = layout.pocketH;

  ctx.save();
  ctx.globalAlpha = 0.70;
  ctx.fillStyle = "rgba(16,17,16,0.82)";
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();

  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = "rgba(230,220,190,0.75)";
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 13);
  ctx.stroke();

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 18, y + 12);
  ctx.quadraticCurveTo(x + w / 2, y + 22, x + w - 18, y + 12);
  ctx.stroke();

  ctx.globalAlpha = 1;
  const items = inventory.slots.filter(Boolean);
  const positions = items.length <= 1
    ? [x + w / 2]
    : items.length === 2
      ? [x + w / 2 - 24, x + w / 2 + 24]
      : [x + w / 2 - 42, x + w / 2, x + w / 2 + 42];

  items.forEach((item, i) => drawPocketItem(item, positions[i], y + h / 2 + 2));

  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function drawMessage() {
  if (game.messageTimer <= 0) return;

  const boxH = 74;
  const inventoryTop = getInventoryLayout().y;
  const y = Math.min(screen.h - boxH - 16, inventoryTop - boxH - 12);

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(12, y, screen.w - 24, boxH);

  ctx.fillStyle = "#fff";
  ctx.font = "15px system-ui";
  wrapText(game.message, 26, y + 28, screen.w - 52, 22);

  game.messageTimer -= 1;
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  let line = "";

  for (let i = 0; i < text.length; i++) {
    const test = line + text[i];

    if (ctx.measureText(test).width > maxWidth && line !== "") {
      ctx.fillText(line, x, y);
      line = text[i];
      y += lineHeight;
    } else {
      line = test;
    }
  }

  ctx.fillText(line, x, y);
}

function drawDebug(now) {
  const target = getOverlappedTarget();
  const sun = getSunIndex(now);

  ctx.fillStyle = "rgba(0,0,0,0.48)";
  ctx.fillRect(10, 10, 390, 190);

  ctx.fillStyle = "#fff";
  ctx.font = "12px system-ui";
  ctx.fillText("ここにあったもの Ver.0.4-final", 20, 30);
  ctx.fillText(`風 外:${game.externalWind} / 中:${game.activeWind}`, 20, 50);
  ctx.fillText(`太陽:${sunNames[sun]} / 空腹:${game.hunger} / 速度:${getPlayerSpeed().toFixed(2)}`, 20, 70);
  ctx.fillText(`力アクション:${game.forceActionCount}`, 20, 90);
  ctx.fillText(`扉:${objects.door.state} / 花畑:${game.flowerField ? "yes" : "no"}`, 20, 110);
  ctx.fillText(`overlap:${target ? target.kind : "none"}`, 20, 130);
  ctx.fillText(`火:${objects.campfire ? objects.campfire.state : "none"} / 近接:${isPlayerNearCampfire() ? "yes" : "no"}`, 20, 150);
  ctx.fillText(`花:${objects.flowers.map(f => `${f.color}:${f.state}`).join(" / ")}`, 20, 170);
  ctx.fillText(`水:${getWaters().map(w => w.band + ":" + w.pattern.length).join(" / ")} / 草:${objects.grasses.length} / 木:${objects.trees.length} / 欠片:${objects.fragments.length}`, 20, 190);
}

function drawNightObjectVeil(now) {
  const sun = getSunIndex(now);
  const isNight = sun === 5 || sun === 6 || sun === 7;
  const isDuskOrDawn = sun === 4 || sun === 0;

  if (!isNight && !isDuskOrDawn) return;

  // Ver.0.4-F:
  // Do not cut a circular transparent hole around the campfire.
  // The previous destination-out mask made a large green spotlight.
  // Night simply darkens objects; campfireLight then adds a small warm pool.
  ctx.save();
  ctx.fillStyle = isNight ? "rgba(3,8,18,0.58)" : "rgba(8,14,22,0.22)";
  ctx.fillRect(0, 0, screen.w / camera.zoom, screen.h / camera.zoom);
  ctx.restore();
}

function drawNightOverlay(now) {
  const sun = getSunIndex(now);

  if (sun === 5 || sun === 6 || sun === 7) {
    // Ver.0.3-C: one step darker than 0.3-B.
    ctx.fillStyle = "rgba(3,8,18,0.72)";
    ctx.fillRect(0, 0, screen.w, screen.h);
  }

  if (sun === 4 || sun === 0) {
    // Evening / morning are dimmer too, but not fully night.
    ctx.fillStyle = "rgba(8,14,22,0.24)";
    ctx.fillRect(0, 0, screen.w, screen.h);
  }
}

function drawAll(now) {
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);

  drawGround(now);
  drawNightOverlay(now);
  drawShadows(now);

  drawGrasses(now);
  drawWater(now);
  drawFragments(now);
  drawPetals();
  drawFlowers();
  drawDoor();
  drawStone();
  drawTrees(now);
  drawNightObjectVeil(now);
  drawCampfireLight();
  drawCampfireSmoke(now);
  drawCampfire();
  drawPlayer();

  ctx.restore();

  drawVirtualStick();
  drawInventory();
  drawMessage();

  if (game.debug) {
    drawDebug(now);
  }
}

function generateInscription() {
  const situation = getFlowerSituationText();
  const scent = getScentText();
  const fire = getCampfireInscriptionText();

  return `${situation}\n\n${scent}\n\n${fire}`;
}

function getCampfireInscriptionText() {
  const fire = objects.campfire;

  if (!fire) {
    return "火のことは、\n誰も覚えていない。";
  }

  if (fire.state === "lit") {
    return "火は、\nまだ小さく残っていた。";
  }

  return "火は、\nいつの間にか消えていた。";
}

function getFlowerSituationText() {
  const states = objects.flowers.map(flower => normalizeFlowerStateForInscription(flower));
  const counts = countBy(states);

  const majority = Object.entries(counts).find(([, count]) => count >= 2);
  const selected = majority
    ? majority[0]
    : chooseStateByPriority(states);

  const lines = {
    wilted: "花は、\n少し萎れていた。",
    swaying: "花は、\n風の中で揺れていた。",
    scattered: "花は、\n風の中で形をほどいていた。",
    normal: "花は、\nまだ咲いていた。",
    picked: "花は、\n手の中にあった。",
    crushed: "花は、\n形を失っていた。"
  };

  return lines[selected] || lines.normal;
}

function normalizeFlowerStateForInscription(flower) {
  if (flower.state === "wilted") return "wilted";
  if (flower.state === "swaying") return "swaying";
  if (flower.state === "scattered") return "scattered";
  if (flower.state === "picked") return "picked";
  if (flower.state === "crushed") return "crushed";
  return "normal";
}

function chooseStateByPriority(states) {
  const priority = ["wilted", "swaying", "scattered", "normal", "picked", "crushed"];
  return priority.find(state => states.includes(state)) || "normal";
}

function countBy(list) {
  return list.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function getHeldColorItems() {
  const handItems = objects.flowers
    .filter(flower => flower.state === "picked" || flower.state === "wilted")
    .map(flower => ({
      source: "hand",
      kind: "flower",
      color: flower.color,
      wilted: flower.state === "wilted"
    }));

  const pocketItems = inventory.slots
    .filter(item => item && item.kind === "petal")
    .map(item => ({
      source: "pocket",
      kind: "petal",
      color: item.color,
      wilted: false
    }));

  return [...handItems, ...pocketItems];
}

function getScentText() {
  const items = getHeldColorItems();

  if (items.length === 0) {
    return "香りは、\n風の中にまぎれていた。";
  }

  if (items.length === 1) {
    return scentForColor(items[0].color, items[0].source, items[0].wilted);
  }

  if (items.length === 2) {
    return scentForTwoItems(items);
  }

  return scentForThreeOrMoreItems(items);
}

function scentForColor(color, source, wilted) {
  if (wilted) {
    return "香りは、\n手の中で少しほどけていた。";
  }

  const base = flowerColors[color]?.scent || flowerColors.red.scent;

  if (source === "pocket") {
    return "香りは、\nポケットの底でかすかに残っていた。";
  }

  return base;
}

function scentForTwoItems(items) {
  const handItems = items.filter(item => item.source === "hand");
  const pocketItems = items.filter(item => item.source === "pocket");

  if (handItems.length === 0 && pocketItems.length === 2) {
    return "香りは、\nポケットの底でかすかに残っていた。";
  }

  if (handItems.length === 1) {
    const hand = handItems[0];
    if (hand.wilted) {
      return "香りは、\n手の中で少しほどけていた。";
    }
    return scentForColor(hand.color, "hand", false);
  }

  if (handItems.length === 2) {
    const fresh = handItems.filter(item => !item.wilted);

    if (fresh.length === 2) {
      return "香りは、\nまだ鮮やかに立っていた。";
    }

    if (fresh.length === 1) {
      return scentForColor(fresh[0].color, "hand", false);
    }

    return "香りは、\n手の中で少し迷っていた。";
  }

  return "香りは、\nどこか曖昧に残っていた。";
}

function scentForThreeOrMoreItems(items) {
  const colors = items.slice(0, 3).map(item => item.color);
  const counts = countBy(colors);
  const majority = Object.entries(counts).find(([, count]) => count >= 2);

  if (majority) {
    const color = majority[0];
    return scentForColor(color, "hand", false);
  }

  const scentColor = chance(0.05) ? "white" : "black";
  return flowerColors[scentColor].scent;
}

function getTouchPos(e) {
  const t = e.touches[0] || e.changedTouches[0];
  return { x: t.clientX, y: t.clientY };
}

window.addEventListener("keydown", e => {
  requestFullscreenIfPossible();
  const key = e.key.toLowerCase();

  if (e.key === "F2") {
    e.preventDefault();
    if (!e.repeat) {
      game.debug = !game.debug;
    }
    return;
  }

  if (e.key === "ArrowUp" || key === "w") {
    input.keys.up = true;
  }

  if (e.key === "ArrowDown" || key === "s") {
    input.keys.down = true;
  }

  if (e.key === "ArrowLeft" || key === "a") {
    input.keys.left = true;
  }

  if (e.key === "ArrowRight" || key === "d") {
    input.keys.right = true;
  }

  if (!e.repeat && e.code === "Space") {
    e.preventDefault();
    handleAction();
  }

  if (!e.repeat && key === "7") {
    useInventorySlot(0);
  }

  if (!e.repeat && key === "8") {
    useInventorySlot(1);
  }

  if (!e.repeat && key === "9") {
    useInventorySlot(2);
  }
});

window.addEventListener("keyup", e => {
  const key = e.key.toLowerCase();

  if (e.key === "ArrowUp" || key === "w") {
    input.keys.up = false;
  }

  if (e.key === "ArrowDown" || key === "s") {
    input.keys.down = false;
  }

  if (e.key === "ArrowLeft" || key === "a") {
    input.keys.left = false;
  }

  if (e.key === "ArrowRight" || key === "d") {
    input.keys.right = false;
  }
});

canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  requestFullscreenIfPossible();
  if (game.paused) return;

  const pos = getTouchPos(e);

  const inventoryIndex = getInventorySlotAtScreen(pos.x, pos.y);
  if (inventoryIndex !== -1) {
    useInventorySlot(inventoryIndex);
    return;
  }

  const tappedTile = screenToTile(pos.x, pos.y);
  const tappedObject = getObjectAtTile(tappedTile.tx, tappedTile.ty);
  const playerPos = playerTile();

  if (tappedObject && sameTile(playerPos, tappedTile)) {
    actTarget(tappedObject);
    return;
  }

  input.moveActive = true;
  input.startX = pos.x;
  input.startY = pos.y;
  input.currentX = pos.x;
  input.currentY = pos.y;
  input.dx = 0;
  input.dy = 0;
}, { passive: false });

canvas.addEventListener("touchmove", e => {
  e.preventDefault();

  if (!input.moveActive || game.paused) return;

  const pos = getTouchPos(e);

  input.currentX = pos.x;
  input.currentY = pos.y;
  input.dx = input.currentX - input.startX;
  input.dy = input.currentY - input.startY;
}, { passive: false });

canvas.addEventListener("touchend", e => {
  e.preventDefault();

  input.moveActive = false;
  input.dx = 0;
  input.dy = 0;
}, { passive: false });

overlay.addEventListener("click", () => {
  overlay.classList.add("hidden");
});

function loop(now) {
  if (!game.paused) {
    updateTimeSystems(now);
    movePlayer();
    updateCamera();
  }

  ctx.clearRect(0, 0, screen.w, screen.h);
  drawAll(now);

  requestAnimationFrame(loop);
}

game.externalWind = chance(2 / 3) ? "breeze" : "strong";
generateWorld();
updateActiveWind();
requestAnimationFrame(loop);
