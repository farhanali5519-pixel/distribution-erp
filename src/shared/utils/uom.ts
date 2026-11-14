/**
 * 3-Tier Flexible Packaging & UOM Conversion Utility
 * Base Unit: Piece (PCS)
 * Middle Unit: Box (BOX)
 * Outer Unit: Carton (CTN)
 *
 * Example:
 * 1 Carton = 12 Boxes
 * 1 Box = 10 Pieces
 * 1 Carton = 120 Pieces
 */

export interface UOMBreakdown {
  cartons: number;
  boxes: number;
  pieces: number;
  totalPieces: number;
  piecesPerBox: number;
  boxesPerCarton: number;
  piecesPerCarton: number;
  formatted: string;
  summary: string;
}

/**
 * Calculates pieces per carton given packaging ratios
 */
export function calculatePiecesPerCarton(boxesPerCarton: number, piecesPerBox: number): number {
  const bpc = Math.max(1, Math.floor(Number(boxesPerCarton) || 1));
  const ppb = Math.max(1, Math.floor(Number(piecesPerBox) || 1));
  return bpc * ppb;
}

/**
 * Converts Cartons, Boxes, and Loose Pieces into total base Pieces
 */
export function toBasePieces(
  cartons: number = 0,
  boxes: number = 0,
  pieces: number = 0,
  boxesPerCarton: number = 1,
  piecesPerBox: number = 1
): number {
  const ctn = Math.max(0, Math.floor(Number(cartons) || 0));
  const box = Math.max(0, Math.floor(Number(boxes) || 0));
  const pcs = Math.max(0, Math.floor(Number(pieces) || 0));

  const bpc = Math.max(1, Math.floor(Number(boxesPerCarton) || 1));
  const ppb = Math.max(1, Math.floor(Number(piecesPerBox) || 1));
  const ppc = bpc * ppb;

  return ctn * ppc + box * ppb + pcs;
}

/**
 * Breaks down total base pieces into Carton, Box, and Loose Piece units
 */
export function breakdownStock(
  totalPieces: number = 0,
  boxesPerCarton: number = 1,
  piecesPerBox: number = 1
): UOMBreakdown {
  const base = Math.floor(Number(totalPieces) || 0);
  const bpc = Math.max(1, Math.floor(Number(boxesPerCarton) || 1));
  const ppb = Math.max(1, Math.floor(Number(piecesPerBox) || 1));
  const ppc = bpc * ppb;

  const isNegative = base < 0;
  const absBase = Math.abs(base);

  const cartons = Math.floor(absBase / ppc);
  const remainderAfterCartons = absBase % ppc;
  const boxes = Math.floor(remainderAfterCartons / ppb);
  const pieces = remainderAfterCartons % ppb;

  const sign = isNegative ? '-' : '';

  // Clean structured string: "2 CTN • 3 BOX • 4 PCS"
  const formatted = `${sign}${cartons} CTN • ${boxes} BOX • ${pieces} PCS`;

  // Dynamic human readable summary: "2 Cartons, 3 Boxes, 4 Pieces"
  const parts: string[] = [];
  if (cartons > 0) parts.push(`${cartons} CTN`);
  if (boxes > 0) parts.push(`${boxes} BOX`);
  if (pieces > 0 || parts.length === 0) parts.push(`${pieces} PCS`);

  const summary = `${sign}${parts.join(' ')}`;

  return {
    cartons: isNegative ? -cartons : cartons,
    boxes: isNegative ? -boxes : boxes,
    pieces: isNegative ? -pieces : pieces,
    totalPieces: base,
    piecesPerBox: ppb,
    boxesPerCarton: bpc,
    piecesPerCarton: ppc,
    formatted,
    summary,
  };
}

/**
 * Generates ratio string like: "1 CTN = 12 BOX = 120 PCS"
 */
export function formatPackagingRatio(boxesPerCarton: number = 1, piecesPerBox: number = 1): string {
  const bpc = Math.max(1, Math.floor(Number(boxesPerCarton) || 1));
  const ppb = Math.max(1, Math.floor(Number(piecesPerBox) || 1));
  const ppc = bpc * ppb;
  return `1 CTN = ${bpc} BOX = ${ppc} PCS`;
}
