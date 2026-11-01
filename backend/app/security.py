"""HTTP hardening for the API: browser-navigation blocking, rate limiting and security headers."""

import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    # The API only ever returns JSON: nothing in a response may load or run anything.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
}


def install(app: FastAPI) -> None:
    hits: dict[str, deque[float]] = defaultdict(deque)
    window = 60.0

    @app.middleware("http")
    async def harden(request: Request, call_next):
        # Opening an /api URL in the address bar (a "document" navigation) gets a 404. The app's own
        # fetch() calls are not navigations, so they still work. This keeps the raw API out of casual
        # view; it is not access control, because anything a web page loads is visible in DevTools.
        if request.url.path.startswith("/api") and (
            request.headers.get("sec-fetch-dest") == "document" or request.headers.get("sec-fetch-mode") == "navigate"
        ):
            return JSONResponse({"detail": "Not Found"}, status_code=404, headers=SECURITY_HEADERS)

        # Sliding-window rate limit per client address.
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = hits[client]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= settings.rate_limit_per_minute:
            retry = int(window - (now - q[0])) + 1
            return JSONResponse({"detail": "Too many requests"}, status_code=429,
                                headers={**SECURITY_HEADERS, "Retry-After": str(retry)})
        q.append(now)

        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response
