/*
 * Minimal QR Code encoder — byte mode only, error correction level M,
 * versions 1–7 (up to 122 bytes of input), full mask selection.
 *
 * Written for readingroom to avoid a dependency; the matrix-building and
 * masking structure follows the QR spec as documented by Project Nayuki's
 * MIT-licensed qrcodegen reference (https://www.nayuki.com/page/qr-code-generator-library).
 */

// Per-version constants for level M.
// INDEX 0 = version 1 … INDEX 6 = version 7.
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196];
const NUM_BLOCKS = [1, 1, 1, 2, 2, 4, 4];
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18];
const DATA_PER_BLOCK = [16, 28, 44, 32, 43, 27, 31];
const ALIGNMENT = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38]];
const CAPACITY = DATA_PER_BLOCK.map((d, i) => Math.floor((d * NUM_BLOCKS[i] * 8 - 12) / 8));

export const MAX_INPUT_BYTES = CAPACITY[CAPACITY.length - 1];

// ---- GF(256) arithmetic (field polynomial 0x11D) ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/** Reed–Solomon remainder (error correction codewords) for one block. */
export function rsEncode(data, degree) {
  const g = rsGenerator(degree);
  const res = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < degree; i++) res[i] ^= mul(g[i + 1], factor);
    }
  }
  return res;
}

/** Syndromes of a codeword sequence; all zero iff the block is a valid
 * RS codeword. Exported for tests. */
export function rsSyndromes(codewords, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    let acc = 0;
    for (const c of codewords) acc = mul(acc, EXP[i - 1]) ^ c;
    out.push(acc);
  }
  return out;
}

// ---- bit stream ----
function bytesToDataCodewords(bytes, version) {
  const capacityBits = DATA_PER_BLOCK[version] * NUM_BLOCKS[version] * 8;
  const bits = [];
  const push = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8); // v1–9 use an 8-bit count
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const pads = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < capacityBits) push(pads[padIdx++ % 2], 8);

  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  return out;
}

function interleave(data, version) {
  const blocks = NUM_BLOCKS[version];
  const per = DATA_PER_BLOCK[version];
  const eccLen = ECC_PER_BLOCK[version];
  const dataBlocks = [];
  const eccBlocks = [];
  for (let b = 0; b < blocks; b++) {
    const chunk = data.slice(b * per, (b + 1) * per);
    dataBlocks.push(chunk);
    eccBlocks.push(rsEncode(chunk, eccLen));
  }
  const out = [];
  for (let i = 0; i < per; i++) for (const b of dataBlocks) out.push(b[i]);
  for (let i = 0; i < eccLen; i++) for (const b of eccBlocks) out.push(b[i]);
  return { codewords: out, blocks: dataBlocks.map((d, i) => ({ data: d, ecc: eccBlocks[i] })) };
}

// ---- matrix construction ----
function getBit(x, i) {
  return ((x >>> i) & 1) !== 0;
}

function buildFunctionPatterns(version) {
  // `version` is a zero-based index into the per-version tables; the actual
  // QR version number (and all formulas below) is one-based.
  const v = version + 1;
  const size = v * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  };

  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const centers = ALIGNMENT[version];
  for (const cy of centers) {
    for (const cx of centers) {
      if (
        (cx === 6 && cy === 6) ||
        (cx === 6 && cy === centers[centers.length - 1]) ||
        (cx === centers[centers.length - 1] && cy === 6)
      ) {
        continue; // these would overlap finder patterns
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, bit);
      setFn(b, a, bit);
    }
  }

  // Reserve the format-info cells (placeholder bits) so data placement
  // skips them; the real values are drawn once the mask is chosen.
  drawFormatBits(modules, isFunction, size, 0);

  return { modules, isFunction, size };
}

function drawFormatBits(modules, isFunction, size, mask) {
  const setFn = (x, y, dark) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  // Level M = 0b00.
  const data = 0 << 3 | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = (data << 10 | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
  setFn(8, 7, getBit(bits, 6));
  setFn(8, 8, getBit(bits, 7));
  setFn(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));
  for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
  setFn(8, size - 8, true); // always-dark module
}

function drawCodewords(modules, isFunction, size, codewords) {
  let i = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < totalBits) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function applyMask(modules, isFunction, size, mask) {
  const invert = (x, y) => {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (invert(x, y) && !isFunction[y][x]) modules[y][x] = !modules[y][x];
    }
  }
}

function penaltyScore(modules, size) {
  let penalty = 0;

  // P1: runs of 5+ same-color modules in rows and columns.
  const scanRuns = (get) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        if (get(b, a) === get(b - 1, a)) run++;
        else {
          if (run >= 5) penalty += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) penalty += 3 + (run - 5);
    }
  };
  scanRuns((x, y) => modules[y][x]);
  scanRuns((y, x) => modules[y][x]);

  // P2: 2×2 blocks of a single color.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (modules[y][x + 1] === c && modules[y + 1][x] === c && modules[y + 1][x + 1] === c) {
        penalty += 3;
      }
    }
  }

  // P3: finder-like patterns 1011101 with a light run of 4 beside them.
  const finder1 = [true, false, true, true, true, false, true, false, false, false, false];
  const finder2 = [...finder1].reverse();
  const match = (get, a, b, pattern) => {
    for (let i = 0; i < 11; i++) {
      if (b + i >= size || get(b + i, a) !== pattern[i]) return false;
    }
    return true;
  };
  for (let a = 0; a < size; a++) {
    for (let b = 0; b <= size - 11; b++) {
      if (match((x, y) => modules[y][x], a, b, finder1)) penalty += 40;
      if (match((x, y) => modules[y][x], a, b, finder2)) penalty += 40;
      if (match((y, x) => modules[y][x], a, b, finder1)) penalty += 40;
      if (match((y, x) => modules[y][x], a, b, finder2)) penalty += 40;
    }
  }

  // P4: deviation from 50% dark modules.
  let dark = 0;
  for (const row of modules) for (const c of row) if (c) dark++;
  penalty += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;

  return penalty;
}

/**
 * Encode `text` (UTF-8) as a QR code. Throws if the input exceeds the
 * capacity of version 7-M (MAX_INPUT_BYTES bytes).
 *
 * Returns { matrix, size, version, mask, codewords, blocks } where
 * matrix[y][x] is true for dark modules and blocks carries the per-block
 * data/ecc codewords (for tests).
 */
export function qrEncode(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = -1;
  for (let v = 0; v < CAPACITY.length; v++) {
    if (bytes.length <= CAPACITY[v]) {
      version = v;
      break;
    }
  }
  if (version === -1) {
    throw new Error(`QR input too long (${bytes.length} bytes, max ${MAX_INPUT_BYTES})`);
  }

  const data = bytesToDataCodewords(bytes, version);
  const { codewords, blocks } = interleave(data, version);

  const { modules, isFunction, size } = buildFunctionPatterns(version);
  drawCodewords(modules, isFunction, size, codewords);

  let best = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row) => row.slice());
    drawFormatBits(candidate, isFunction, size, mask);
    applyMask(candidate, isFunction, size, mask);
    const score = penaltyScore(candidate, size);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = mask;
    }
  }

  return { matrix: best, size, version: version + 1, mask: bestMask, codewords, blocks };
}

/** Convenience: just the module matrix for an input string. */
export function qrMatrix(text) {
  return qrEncode(text).matrix;
}
