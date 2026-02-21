import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

function sign(password: string): string {
  const secret = process.env.AUTH_SECRET!;
  return createHmac("sha256", secret).update(password).digest("hex");
}

/** POST /api/auth — verify password and set auth cookie */
export async function POST(request: NextRequest) {
  try {
    const { password } = (await request.json()) as { password: string };
    const sitePassword = process.env.SITE_PASSWORD;

    if (!sitePassword || !process.env.AUTH_SECRET) {
      return NextResponse.json(
        { error: "Auth not configured" },
        { status: 500 }
      );
    }

    if (password !== sitePassword) {
      return NextResponse.json(
        { error: "Wrong password" },
        { status: 401 }
      );
    }

    const token = sign(password);
    const response = NextResponse.json({ ok: true });

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

/** DELETE /api/auth — logout (clear cookie) */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
