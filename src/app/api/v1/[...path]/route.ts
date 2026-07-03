import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const pathStr = resolvedParams.path.join("/");
  const backendUrl = `http://127.0.0.1:8000/api/v1/${pathStr}${request.nextUrl.search}`;
  
  try {
    const response = await fetch(backendUrl, {
      method: "GET",
      headers: request.headers,
    });
    
    const data = await response.arrayBuffer();
    return new NextResponse(data, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    return NextResponse.json({ error: "Backend proxy connection failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const pathStr = resolvedParams.path.join("/");
  const backendUrl = `http://127.0.0.1:8000/api/v1/${pathStr}${request.nextUrl.search}`;
  
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
      headers: response.headers,
    });
  } catch (error) {
    return NextResponse.json({ error: "Backend proxy connection failed" }, { status: 502 });
  }
}
