import { NextRequest, NextResponse } from "next/server";

declare global {
  // eslint-disable-next-line no-var
  var __projects_db: Record<string, unknown>;
}
if (!global.__projects_db) {
  global.__projects_db = {};
}
const projectsDb = global.__projects_db;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = projectsDb[id];
  if (!project) {
    return NextResponse.json(
      { error: "Project not found or expired after 24 hours" },
      { status: 404 }
    );
  }
  return NextResponse.json(project);
}

export const dynamic = "force-dynamic";
