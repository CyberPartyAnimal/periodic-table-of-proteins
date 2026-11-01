"""Export every API answer as static JSON for the published (static) website.

The data is read-only, so the public site doesn't need a running API or database: this script asks the real
API (in-process, no server started) for everything and saves it under frontend/public/data/, which the
production build serves as plain files.

Needs Postgres running with the seeded database.  Run:  uv run python -m seed.export_static
Re-run it whenever the data changes (after seed.enrich / seed.load), then rebuild the frontend.
"""

import asyncio
import json
import shutil
from pathlib import Path

import httpx

from app.config import settings

# The export makes ~530 requests in a few seconds; lift the per-client rate limit for this process only.
settings.rate_limit_per_minute = 10**9

from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data"


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


async def main():
    if OUT.exists():
        shutil.rmtree(OUT)  # no stale files from proteins that were removed
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        async def get(path):
            r = await client.get(f"/api{path}")
            r.raise_for_status()
            return r.json()

        table = await get("/table")
        write(OUT / "table.json", table)
        sem = asyncio.Semaphore(8)

        async def one(pid):
            async with sem:
                for kind, suffix in (("proteins", ""), ("anatomy", "/anatomy"), ("assembly", "/assembly")):
                    write(OUT / kind / f"{pid}.json", await get(f"/proteins/{pid}{suffix}"))

        await asyncio.gather(*(one(p["id"]) for p in table["proteins"]))
    await engine.dispose()
    files = [f for f in OUT.rglob("*.json")]
    size = sum(f.stat().st_size for f in files)
    print(f"Exported {len(files)} files ({len(table['proteins'])} proteins) to {OUT} ({size / 1e6:.1f} MB)")


if __name__ == "__main__":
    asyncio.run(main())
