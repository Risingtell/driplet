/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard for the creator-only areas. Auth is real (Supabase) and the
 * authoritative check still happens server-side in the studio layout + server
 * actions; this just gives logged-out users a clean redirect at the edge
 * instead of streaming an empty shell. We only check for the presence of a
 * Supabase auth cookie (sb-<ref>-auth-token, possibly chunked) — cheap, no
 * async call — and let the layout do the real validation.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies
    .getAll()
    .some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));

  if (!hasSession) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // "/" and /watch are public. Guard the creator studio and broadcast studio.
  // Retired paths (/login, /dashboard, /creator, /go-live) are plain redirect
  // stubs and don't need guarding.
  matcher: ["/studio/:path*", "/broadcast/:path*"],
};
