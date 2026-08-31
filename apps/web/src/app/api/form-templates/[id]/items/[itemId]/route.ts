import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/api/v1';

async function token() {
  const cookieStore = await cookies();
  return cookieStore.get('tc_token')?.value ?? null;
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const tok = await token();
  if (!tok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, itemId } = await params;
  const res = await fetch(`${API_BASE}/form-templates/${id}/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tok}` },
  });
  return new NextResponse(null, { status: res.status });
}
