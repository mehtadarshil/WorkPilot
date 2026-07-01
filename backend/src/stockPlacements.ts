export type StockPlacement = {
  location: string;
  quantity: number;
  zone?: string;
  aisle?: string;
  shelf?: string;
  box?: string;
  storage_code?: string;
  notes?: string;
};

function trimOpt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export function formatPlacementLabel(placement: StockPlacement): string {
  const parts: string[] = [placement.location];
  if (placement.zone) parts.push(placement.zone);
  if (placement.aisle) parts.push(`Aisle ${placement.aisle}`);
  if (placement.shelf) parts.push(`Shelf ${placement.shelf}`);
  const bin = placement.box || placement.storage_code;
  if (bin) parts.push(bin.startsWith('Box') || bin.startsWith('Cell') || bin.startsWith('Tote') ? bin : `Box ${bin}`);
  return parts.join(' · ');
}

export function placementSearchBlob(placement: StockPlacement): string {
  return [
    placement.location,
    placement.zone,
    placement.aisle,
    placement.shelf,
    placement.box,
    placement.storage_code,
    placement.notes,
    formatPlacementLabel(placement),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function normalizeStockPlacement(raw: unknown, fallbackLocation = 'Store'): StockPlacement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const location = trimOpt(r.location) || fallbackLocation;
  const qtyRaw = r.quantity;
  const quantity = typeof qtyRaw === 'number'
    ? Math.max(0, Math.trunc(qtyRaw))
    : Math.max(0, parseInt(String(qtyRaw ?? '0'), 10) || 0);

  const zone = trimOpt(r.zone);
  const aisle = trimOpt(r.aisle);
  const shelf = trimOpt(r.shelf);
  let box = trimOpt(r.box);
  const storage_code = trimOpt(r.storage_code);
  const notes = trimOpt(r.notes);

  if (!box && storage_code) {
    box = storage_code;
  }

  const placement: StockPlacement = { location, quantity };
  if (zone) placement.zone = zone;
  if (aisle) placement.aisle = aisle;
  if (shelf) placement.shelf = shelf;
  if (box) placement.box = box;
  if (storage_code) placement.storage_code = storage_code;
  if (notes) placement.notes = notes;
  return placement;
}

export function normalizeStockPlacements(
  raw: unknown,
  fallbackLocation: string,
  fallbackQuantity: number,
  requireBinForLocations: string[] = [],
): StockPlacement[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ location: fallbackLocation, quantity: Math.max(0, fallbackQuantity) }];
  }

  const placements = raw
    .map((item) => normalizeStockPlacement(item, fallbackLocation))
    .filter((p): p is StockPlacement => p !== null);

  if (placements.length === 0) {
    return [{ location: fallbackLocation, quantity: Math.max(0, fallbackQuantity) }];
  }

  const requireSet = new Set(requireBinForLocations.map((l) => l.toLowerCase()));
  for (const p of placements) {
    if (p.quantity <= 0) continue;
    if (!requireSet.has(p.location.toLowerCase())) continue;
    if (!p.box && !p.storage_code) {
      throw new Error(`Box or storage code is required for ${p.location} placements`);
    }
  }

  return placements;
}

export function pickDefaultPlacementIndex(placements: StockPlacement[]): number {
  if (placements.length === 0) return 0;
  let bestIdx = 0;
  let bestQty = placements[0]?.quantity ?? 0;
  for (let i = 1; i < placements.length; i++) {
    const q = placements[i]?.quantity ?? 0;
    if (q > bestQty) {
      bestQty = q;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function parseLocationsFromDb(raw: unknown, fallbackLocation: string, fallbackQuantity: number): StockPlacement[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const parsed = raw
      .map((item) => normalizeStockPlacement(item, fallbackLocation))
      .filter((p): p is StockPlacement => p !== null);
    if (parsed.length > 0) return parsed;
  }
  return [{ location: fallbackLocation, quantity: Math.max(0, fallbackQuantity) }];
}

export function applyPlacementQuantityDelta(
  placements: StockPlacement[],
  placementIndex: number,
  delta: number,
): { placements: StockPlacement[]; label: string } | null {
  if (placements.length === 0 || placementIndex < 0 || placementIndex >= placements.length) {
    return null;
  }
  const next = placements.map((p) => ({ ...p }));
  const current = next[placementIndex];
  const newQty = current.quantity + delta;
  if (newQty < 0) return null;
  next[placementIndex] = { ...current, quantity: newQty };
  return { placements: next, label: formatPlacementLabel(current) };
}

export function totalPlacementQuantity(placements: StockPlacement[]): number {
  return placements.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
}
