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

export type StockPlacementFormRow = {
  location: string;
  quantity: string;
  zone: string;
  aisle: string;
  shelf: string;
  box: string;
  storage_code: string;
  notes: string;
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
  if (bin) {
    parts.push(bin.startsWith('Box') || bin.startsWith('Cell') || bin.startsWith('Tote') ? bin : `Box ${bin}`);
  }
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

export function parsePlacementsFromItem(item: {
  locations?: StockPlacement[];
  location?: string;
  quantity?: number;
}): StockPlacement[] {
  if (item.locations && item.locations.length > 0) {
    return item.locations.map((raw) => ({
      location: raw.location || item.location || 'Store',
      quantity: Number(raw.quantity) || 0,
      zone: trimOpt(raw.zone),
      aisle: trimOpt(raw.aisle),
      shelf: trimOpt(raw.shelf),
      box: trimOpt(raw.box),
      storage_code: trimOpt(raw.storage_code),
      notes: trimOpt(raw.notes),
    }));
  }
  return [{ location: item.location || 'Store', quantity: Number(item.quantity) || 0 }];
}

export function placementFormFromApi(raw: StockPlacement): StockPlacementFormRow {
  return {
    location: raw.location,
    quantity: String(raw.quantity),
    zone: raw.zone || '',
    aisle: raw.aisle || '',
    shelf: raw.shelf || '',
    box: raw.box || '',
    storage_code: raw.storage_code || '',
    notes: raw.notes || '',
  };
}

export function emptyPlacementFormRow(defaultLocation: string): StockPlacementFormRow {
  return {
    location: defaultLocation,
    quantity: '0',
    zone: '',
    aisle: '',
    shelf: '',
    box: '',
    storage_code: '',
    notes: '',
  };
}

export function placementFormToApi(row: StockPlacementFormRow): StockPlacement {
  const placement: StockPlacement = {
    location: row.location,
    quantity: parseInt(row.quantity, 10) || 0,
  };
  const zone = row.zone.trim();
  const aisle = row.aisle.trim();
  const shelf = row.shelf.trim();
  const box = row.box.trim();
  const storage_code = row.storage_code.trim();
  const notes = row.notes.trim();
  if (zone) placement.zone = zone;
  if (aisle) placement.aisle = aisle;
  if (shelf) placement.shelf = shelf;
  if (box) placement.box = box;
  if (storage_code) placement.storage_code = storage_code;
  if (notes) placement.notes = notes;
  return placement;
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

export function validatePlacementsRequireBin(
  placements: StockPlacement[],
  requireBinForLocations: string[],
): string | null {
  const requireSet = new Set(requireBinForLocations.map((l) => l.toLowerCase()));
  for (const p of placements) {
    if (p.quantity <= 0) continue;
    if (!requireSet.has(p.location.toLowerCase())) continue;
    if (!p.box && !p.storage_code) {
      return `Box or storage code is required for ${p.location} placements`;
    }
  }
  return null;
}
