"""Fetch public data for every curated protein and cache it in enriched.json.

Sources:
  UniProt   – name check, mass, length, sequence, function text, PDB IDs, HGNC ID,
              and what holds it together: disulfides, helices/strands, metal sites,
              cofactors, processed chains and the subunit description
  AlphaFold – predicted 3D model URL
  Alliance of Genome Resources – mouse and yeast orthologs
  STRING    – high-confidence physical interactions between tiles
  OmniPath  – whether an interaction activates or inhibits (literature-curated consensus)
  EBI Complex Portal – expert-curated complexes each protein assembles into

Run once (needs internet):  uv run python -m seed.enrich
The database loader only reads the cached JSON, so seeding works offline.
"""

import asyncio
import json
import re
from pathlib import Path

import httpx

from seed.curated import PROTEINS

OUT = Path(__file__).with_name("enriched.json")
STRING_MIN_SCORE = 700  # STRING "high confidence"
MIN_ORTHOLOG_METHODS = 5  # of ~10 DIOPT methods the Alliance aggregates
MAX_COMPLEXES = 6  # per protein; the smallest curated complexes are the most instructive


def strip_refs(text: str) -> str:
    text = re.sub(r"\s*\((?:PubMed|By similarity|Microbial infection|Ref\.)[^)]*\)", "", text)
    return re.sub(r"\s+", " ", text).strip()


def clean_function(text: str) -> str:
    # Keep the full text; the frontend collapses long passages behind "Show more" instead of cutting them.
    return strip_refs(text)


async def fetch_uniprot(client, acc):
    r = await client.get(f"https://rest.uniprot.org/uniprotkb/{acc}.json")
    r.raise_for_status()
    d = r.json()
    desc = d.get("proteinDescription", {})
    rec = desc.get("recommendedName") or (desc.get("submissionNames") or [{}])[0]
    func = next((c for c in d.get("comments", []) if c.get("commentType") == "FUNCTION"), None)
    xrefs = d.get("uniProtKBCrossReferences", [])
    pdbs = []
    for x in xrefs:
        if x["database"] == "PDB":
            props = {p["key"]: p["value"] for p in x.get("properties", [])}
            res = props.get("Resolution", "")
            m = re.match(r"([\d.]+)", res)
            pdbs.append((x["id"], props.get("Method", ""), float(m.group(1)) if m else 99.0))
    # Prefer X-ray/EM structures with the best resolution first.
    pdbs.sort(key=lambda p: (p[1] not in ("X-ray", "EM"), p[2]))
    hgnc = next((x["id"] for x in xrefs if x["database"] == "HGNC"), None)
    seq = d["sequence"]
    comments = d.get("comments", [])
    subunit = next((c for c in comments if c.get("commentType") == "SUBUNIT"), None)
    return {
        "uniprot_name": rec.get("fullName", {}).get("value"),
        "organism": d.get("organism", {}).get("scientificName"),
        "gene_uniprot": (d.get("genes") or [{}])[0].get("geneName", {}).get("value"),
        "mass_kda": round(seq["molWeight"] / 1000, 1),
        "length_aa": seq["length"],
        "sequence": seq["value"],
        "function": clean_function(func["texts"][0]["value"]) if func else None,
        "pdb_ids": [p[0] for p in pdbs],
        "hgnc": hgnc,
        "features": extract_features(d.get("features", [])),
        "cofactors": sorted({cf["name"] for c in comments if c.get("commentType") == "COFACTOR"
                             for cf in c.get("cofactors", [])}),
        "subunit": strip_refs(" ".join(t["value"] for t in subunit["texts"])) if subunit else None,
    }


def extract_features(features):
    """Keep the structural features: bonds, secondary structure, metal/ligand sites and chains."""
    pos = lambda f, k: f["location"][k].get("value")  # noqa: E731
    out = {"disulfides": [], "helix": [], "strand": [], "turn": [], "binding": [], "chains": []}
    for f in features:
        t = f["type"]
        if t == "Disulfide bond":
            out["disulfides"].append([pos(f, "start"), pos(f, "end"), f.get("description") or None])
        elif t in ("Helix", "Beta strand", "Turn"):
            key = {"Helix": "helix", "Beta strand": "strand", "Turn": "turn"}[t]
            out[key].append([pos(f, "start"), pos(f, "end")])
        elif t == "Binding site" and f.get("ligand"):
            out["binding"].append([pos(f, "start"), pos(f, "end"), f["ligand"]["name"]])
        elif t in ("Chain", "Peptide", "Signal", "Propeptide", "Transit peptide"):
            out["chains"].append([t, pos(f, "start"), pos(f, "end"), f.get("description") or None])
    return out


async def fetch_alphafold(client, acc):
    r = await client.get(f"https://alphafold.ebi.ac.uk/api/prediction/{acc}")
    if r.status_code != 200:
        return None
    entries = r.json()
    # Use the canonical model (entry ID AF-<acc>-F1), not an isoform.
    for e in entries:
        if e.get("uniprotAccession") == acc:
            return e.get("pdbUrl")
    return entries[0].get("pdbUrl") if entries else None


async def fetch_orthologs(client, hgnc):
    if not hgnc:
        return {}
    r = await client.get(f"https://www.alliancegenome.org/api/gene/{hgnc}/orthologs", params={"limit": 200})
    if r.status_code != 200:
        return {}
    found = {}
    for row in r.json().get("results", []):
        o = row.get("geneToGeneOrthologyGenerated") or row
        g = o.get("objectGene", {})
        taxon = (g.get("taxon") or {}).get("name", "")
        key = "mouse" if taxon.startswith("Mus musculus") else "yeast" if taxon.startswith("Saccharomyces") else None
        if not key:
            continue
        symbol = (g.get("geneSymbol") or {}).get("displayText")
        best = (o.get("isBestScore") or {}).get("name") == "Yes"
        methods = len(o.get("predictionMethodsMatched") or [])
        # Keep only well-supported calls: best match, agreed by at least 5 prediction methods.
        if best and methods >= MIN_ORTHOLOG_METHODS:
            found.setdefault(key, []).append((-methods, symbol))
    return {k: ", ".join(s for _, s in sorted(v)[:3]) for k, v in found.items()}


async def fetch_string_network(client, genes):
    r = await client.post("https://string-db.org/api/json/get_string_ids",
                          data={"identifiers": "\r".join(genes), "species": 9606, "limit": 1, "echo_query": 1})
    r.raise_for_status()
    to_gene = {row["stringId"]: row["queryItem"] for row in r.json()}
    r = await client.post("https://string-db.org/api/json/network",
                          data={"identifiers": "\r".join(to_gene), "species": 9606,
                                "required_score": STRING_MIN_SCORE, "network_type": "physical"})
    r.raise_for_status()
    edges = {}
    for e in r.json():
        a, b = to_gene.get(e["stringId_A"]), to_gene.get(e["stringId_B"])
        if a and b and a != b:
            key = tuple(sorted((a, b)))
            edges[key] = max(edges.get(key, 0), e["score"])
    return [{"a": a, "b": b, "score": round(s, 3)} for (a, b), s in sorted(edges.items())]


def stoichiometry(text):
    m = re.search(r"minValue:\s*(\d+)", text or "")
    return int(m.group(1)) if m and int(m.group(1)) > 0 else None


async def fetch_complexes(client, acc, cache, sem):
    """Curated (not predicted) human complexes containing this protein, smallest first."""
    async with sem:
        r = await client.get(f"https://www.ebi.ac.uk/intact/complex-ws/search/{acc}",
                             params={"format": "json", "number": 200, "facets": "species_f",
                                     "filters": 'species_f:("Homo sapiens")'})
    if r.status_code != 200:
        return []
    hits = [e for e in r.json().get("elements", [])
            if not e.get("predictedComplex") and any(i.get("identifier") == acc for i in e.get("interactors") or [])]
    hits.sort(key=lambda e: (len(e.get("interactors") or []), e["complexAC"]))
    out = []
    for e in hits[:MAX_COMPLEXES]:
        ac = e["complexAC"]
        if ac not in cache:
            async with sem:
                rd = await client.get(f"https://www.ebi.ac.uk/intact/complex-ws/complex/{ac}")
            if rd.status_code != 200:
                continue
            d = rd.json()
            cache[ac] = {
                "ac": ac,
                "name": d.get("name") or e["complexName"],
                "function": strip_refs((d.get("functions") or [e.get("description") or ""])[0]) or None,
                "properties": strip_refs((d.get("properties") or [""])[0]) or None,
                "pdb_ids": [x["identifier"].upper() for x in d.get("crossReferences", [])
                            if x.get("database") == "wwpdb"][:6],
                "participants": [{
                    "id": p.get("identifier"), "name": p.get("name"), "description": p.get("description"),
                    "stoichiometry": stoichiometry(p.get("stochiometry")),
                    "type": p.get("interactorType"),
                } for p in d.get("participants", [])],
            }
        out.append(ac)
    return out


async def fetch_effects(client, accessions):
    """Directed, signed interactions among our proteins from OmniPath's curated core."""
    acc = ",".join(accessions)
    r = await client.get("https://omnipathdb.org/interactions",
                         params={"sources": acc, "targets": acc, "source_target": "AND", "format": "json",
                                 "directed": "yes", "genesymbols": "yes"})
    r.raise_for_status()
    wanted = set(accessions)
    effects = {}
    for row in r.json():
        s, t = row["source"], row["target"]
        if s not in wanted or t not in wanted or s == t:
            continue
        stim, inh = row.get("consensus_stimulation"), row.get("consensus_inhibition")
        effect = ("both" if stim and inh else "activates" if stim else "inhibits" if inh else "regulates")
        effects[f"{s}>{t}"] = effect
    return effects


async def main():
    sem = asyncio.Semaphore(6)
    async with httpx.AsyncClient(timeout=60, follow_redirects=True,
                                 headers={"User-Agent": "periodic-table-of-proteins/1.0"}) as client:

        async def one(p):
            async with sem:
                for attempt in range(3):
                    try:
                        u = await fetch_uniprot(client, p["uniprot"])
                        af = await fetch_alphafold(client, p["uniprot"])
                        orth = await fetch_orthologs(client, u["hgnc"])
                        break
                    except httpx.HTTPError as e:
                        if attempt == 2:
                            raise RuntimeError(f"{p['gene']}: {e}") from e
                        await asyncio.sleep(2 * (attempt + 1))
                print(f"  {p['gene']:<10} {u['uniprot_name']}  [{u['organism']}]  mouse={orth.get('mouse')} yeast={orth.get('yeast')}")
                return p["gene"], {**u, "alphafold_url": af, "orthologs": orth}

        print(f"Fetching {len(PROTEINS)} proteins…")
        results = dict(await asyncio.gather(*(one(p) for p in PROTEINS)))
        print("Fetching STRING interactions…")
        interactions = await fetch_string_network(client, [p["gene"] for p in PROTEINS])
        print("Fetching OmniPath effects…")
        effects = await fetch_effects(client, [p["uniprot"] for p in PROTEINS])
        print("Fetching Complex Portal complexes…")
        complex_cache = {}
        complex_sem = asyncio.Semaphore(4)
        memberships = await asyncio.gather(*(fetch_complexes(client, p["uniprot"], complex_cache, complex_sem)
                                             for p in PROTEINS))
        for p, acs in zip(PROTEINS, memberships):
            results[p["gene"]]["complexes"] = acs

    OUT.write_text(json.dumps({"proteins": results, "interactions": interactions, "effects": effects,
                               "complexes": complex_cache}, indent=1, ensure_ascii=False))
    print(f"Wrote {OUT.name}: {len(results)} proteins, {len(interactions)} interactions, "
          f"{len(effects)} directed effects, {len(complex_cache)} complexes")


if __name__ == "__main__":
    asyncio.run(main())
