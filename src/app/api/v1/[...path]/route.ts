import { NextRequest, NextResponse } from "next/server";

// Render backend URL — set RENDER_BACKEND_URL in Vercel environment variables
// e.g. https://your-app-name.onrender.com
const BACKEND_URL = process.env.RENDER_BACKEND_URL || "";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!BACKEND_URL) {
    return NextResponse.json({ error: "RENDER_BACKEND_URL not configured" }, { status: 502 });
  }
  const resolvedParams = await params;
  const pathStr = resolvedParams.path.join("/");
  const backendUrl = `${BACKEND_URL}/api/v1/${pathStr}${request.nextUrl.search}`;

  try {
    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { "Accept": request.headers.get("Accept") || "*/*" },
    });

    const data = await response.arrayBuffer();
    return new NextResponse(data, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    console.error("[Proxy GET Error]", error);
    return NextResponse.json({ error: "Backend proxy connection failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!BACKEND_URL) {
    return NextResponse.json({ error: "RENDER_BACKEND_URL not configured" }, { status: 502 });
  }
  const resolvedParams = await params;
  const pathStr = resolvedParams.path.join("/");
  const backendUrl = `${BACKEND_URL}/api/v1/${pathStr}${request.nextUrl.search}`;

  try {
    const body = await request.arrayBuffer();
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
      },
      body: body,
    });

    const data = await response.arrayBuffer();
    return new NextResponse(data, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    });
  } catch (error) {
    console.error("[Proxy POST Error]", error);
    return NextResponse.json({ error: "Backend proxy connection failed" }, { status: 502 });
  }
}

export const maxDuration = 300;
export const dynamic = "force-dynamic";
