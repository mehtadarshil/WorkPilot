import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Proxy to OpenStreetMap Nominatim (no API key). Used only for map preview on customer pages. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ lat: null, lon: null });
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', q);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WorkPilotCRM/1.0 (+https://work-pilot.co)',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ lat: null, lon: null });
    }

    const data = (await res.json()) as { lat?: string; lon?: string }[];
    const hit = Array.isArray(data) ? data[0] : undefined;
    if (!hit?.lat || !hit?.lon) {
      return NextResponse.json({ lat: null, lon: null });
    }

    const lat = parseFloat(hit.lat);
    const lon = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ lat: null, lon: null });
    }

    return NextResponse.json({ lat, lon });
  } catch {
    return NextResponse.json({ lat: null, lon: null });
  }
}
