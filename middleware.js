// Temporary gate: the marketing site is live but still being tweaked, so
// only the site owner should be able to see it for now. Vercel's built-in
// "Vercel Authentication" (deployment protection) only covers production
// custom domains on paid plans - this project is on the free Hobby plan -
// so this does the same job at the edge with plain HTTP Basic Auth
// instead, which works on any plan and needs no extra service.
//
// To remove the gate later: delete this file and redeploy (or just push
// any commit - it only takes effect while the file exists).
export const config = {
  matcher: "/((?!_vercel).*)",
};

const USER = "eliran";
const PASS = "morePrivate2026";

export default function middleware(request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);
    if (user === USER && pass === PASS) {
      return;
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Private site"' },
  });
}
