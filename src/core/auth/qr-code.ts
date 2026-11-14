/**
 * Self-contained SVG QR Code Generator for TOTP URI (RFC 6238)
 * Generates standards-compliant QR Code matrix and outputs SVG string or Data URI.
 * Zero external npm dependencies.
 */

// QR Code Constants & Tables
const PAD0 = 0xec;
const PAD1 = 0x11;

// GF(256) Math for Reed-Solomon error correction
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
for (let i = 0, x = 1; i < 256; i++) {
  EXP_TABLE[i] = x;
  LOG_TABLE[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}

function gmult(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function getRsGeneratorPoly(errorCorrectionLength: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < errorCorrectionLength; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmult(poly[j], factor);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function calculateReedSolomon(data: Uint8Array, ecLength: number): Uint8Array {
  const genPoly = getRsGeneratorPoly(ecLength);
  const result = new Uint8Array(ecLength);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[ecLength - 1] = 0;
    for (let j = 0; j < ecLength; j++) {
      result[j] ^= gmult(genPoly[j], factor);
    }
  }

  return result;
}

// Version table configurations (Version 4 Low EC = 80 data bytes, Vers 5 Low = 108 data bytes, Vers 6 Low = 136 bytes)
interface QrVersionConfig {
  version: number;
  size: number;
  dataBytes: number;
  ecBytes: number;
  alignmentPositions: number[];
}

const QR_VERSIONS: QrVersionConfig[] = [
  { version: 1, size: 21, dataBytes: 19, ecBytes: 7, alignmentPositions: [] },
  { version: 2, size: 25, dataBytes: 34, ecBytes: 10, alignmentPositions: [6, 18] },
  { version: 3, size: 29, dataBytes: 55, ecBytes: 15, alignmentPositions: [6, 22] },
  { version: 4, size: 33, dataBytes: 80, ecBytes: 20, alignmentPositions: [6, 26] },
  { version: 5, size: 37, dataBytes: 108, ecBytes: 26, alignmentPositions: [6, 30] },
  { version: 6, size: 41, dataBytes: 136, ecBytes: 36, alignmentPositions: [6, 34] },
  { version: 7, size: 45, dataBytes: 156, ecBytes: 40, alignmentPositions: [6, 22, 38] },
];

function selectVersion(byteLength: number): QrVersionConfig {
  for (const v of QR_VERSIONS) {
    // 4 bits mode + 8 bits char count = 2 header bytes + 1 terminator byte padding
    if (v.dataBytes >= byteLength + 3) {
      return v;
    }
  }
  return QR_VERSIONS[QR_VERSIONS.length - 1];
}

export function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes = Buffer.from(text, 'utf8');
  const config = selectVersion(utf8Bytes.length);
  const size = config.size;

  // 1. Initialize matrix (-1 for unset, 0 for white, 1 for black)
  const matrix: number[][] = Array.from({ length: size }, () => Array(size).fill(-1));
  const isFunctionModule: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: number, isFunc = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (isFunc) isFunctionModule[r][c] = true;
    }
  };

  // 2. Finder patterns (top-left, top-right, bottom-left)
  const addFinderPattern = (startRow: number, startCol: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = startRow + r;
        const col = startCol + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;

        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            setModule(row, col, 1);
          } else {
            setModule(row, col, 0);
          }
        } else {
          setModule(row, col, 0); // Separator
        }
      }
    }
  };

  addFinderPattern(0, 0);
  addFinderPattern(0, size - 7);
  addFinderPattern(size - 7, 0);

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    if (matrix[6][i] === -1) setModule(6, i, val);
    if (matrix[i][6] === -1) setModule(i, 6, val);
  }

  // 4. Alignment patterns (Version >= 2)
  if (config.alignmentPositions.length > 0) {
    const pos = config.alignmentPositions;
    for (const r of pos) {
      for (const c of pos) {
        if (
          (r === 6 && c === 6) ||
          (r === 6 && c === pos[pos.length - 1] && c === size - 7) ||
          (r === pos[pos.length - 1] && c === 6 && r === size - 7)
        ) {
          continue; // Overlaps finder pattern
        }
        // Check if overlaps finder
        if (
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= size - 9) ||
          (r >= size - 9 && c <= 8)
        ) {
          continue;
        }

        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter ? 1 : 0);
          }
        }
      }
    }
  }

  // 5. Dark module (4 * V + 9, 8)
  setModule(4 * config.version + 9, 8, 1);

  // 6. Format info reservation (dummy placeholders for timing)
  for (let i = 0; i <= 8; i++) {
    if (matrix[8][i] === -1) setModule(8, i, 0);
    if (matrix[i][8] === -1) setModule(i, 8, 0);
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === -1) setModule(8, i, 0);
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[i][8] === -1) setModule(i, 8, 0);
  }

  // 7. Encode data stream (Byte mode: 0100)
  const bitStream: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  };

  // Mode: 8-bit byte (0100)
  pushBits(0b0100, 4);
  // Character count (8 bits for Version 1-9)
  pushBits(utf8Bytes.length, 8);
  // Payload
  for (let i = 0; i < utf8Bytes.length; i++) {
    pushBits(utf8Bytes[i], 8);
  }
  // Terminator (up to 4 zeroes)
  const termLen = Math.min(4, config.dataBytes * 8 - bitStream.length);
  for (let i = 0; i < termLen; i++) bitStream.push(0);

  // Pad to 8-bit boundary
  while (bitStream.length % 8 !== 0) bitStream.push(0);

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bitStream[i + j];
    dataBytes.push(b);
  }

  // Pad to required capacity
  let padToggle = true;
  while (dataBytes.length < config.dataBytes) {
    dataBytes.push(padToggle ? PAD0 : PAD1);
    padToggle = !padToggle;
  }

  // 8. Reed-Solomon Error Correction
  const ecBytes = calculateReedSolomon(new Uint8Array(dataBytes), config.ecBytes);
  const fullCodewords = [...dataBytes, ...ecBytes];

  // 9. Place Codewords into matrix
  const codewordBits: number[] = [];
  for (const byte of fullCodewords) {
    for (let i = 7; i >= 0; i--) {
      codewordBits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column

    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const col of [right, right - 1]) {
        if (!isFunctionModule[r][col]) {
          const bit = bitIdx < codewordBits.length ? codewordBits[bitIdx++] : 0;
          // Apply Standard Mask 0: (row + col) % 2 === 0
          const mask = (r + col) % 2 === 0 ? 1 : 0;
          matrix[r][col] = bit ^ mask;
        }
      }
    }
    upwards = !upwards;
  }

  // 10. Write Format Info (Mask 0, Low Error Correction = 0x77c4 with BCH code)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  // Coordinates for format info
  const fCoords1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  const fCoords2 = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
  ];

  for (let i = 0; i < 15; i++) {
    const bit = formatBits[i];
    const [r1, c1] = fCoords1[i];
    setModule(r1, c1, bit, true);
    const [r2, c2] = fCoords2[i];
    setModule(r2, c2, bit, true);
  }

  return matrix.map((row) => row.map((cell) => cell === 1));
}

/**
 * Returns complete SVG string representing the QR code.
 */
export function generateQrSvg(text: string, options: { size?: number; margin?: number; fgColor?: string; bgColor?: string } = {}): string {
  const matrix = generateQrMatrix(text);
  const matrixSize = matrix.length;
  const margin = options.margin ?? 2;
  const viewBoxSize = matrixSize + margin * 2;
  const pixelSize = options.size ?? 256;
  const fgColor = options.fgColor ?? '#000000';
  const bgColor = options.bgColor ?? '#ffffff';

  let rects = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${fgColor}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bgColor}"/>${rects}</svg>`;
}

/**
 * Returns data URL (data:image/svg+xml;base64,...) for embedding directly in <img src="..." />
 */
export function generateQrDataUrl(text: string, options?: { size?: number; margin?: number; fgColor?: string; bgColor?: string }): string {
  const svg = generateQrSvg(text, options);
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}
