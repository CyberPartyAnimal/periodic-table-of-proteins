"""Load curated.py + enriched.json into Postgres (replaces existing rows).

Run:  uv run python -m seed.load
"""

import asyncio
import json
from collections import defaultdict
from pathlib import Path

from sqlalchemy import text

from app.db import SessionLocal, engine
from app.models import Complex, Family, Interaction, Location, MisfoldedForm, Pathway, Protein, Variant
from seed.curated import FAMILIES, LOCATIONS, PATHWAYS, PROTEINS

ENRICHED = json.loads(Path(__file__).with_name("enriched.json").read_text())


async def main():
    async with SessionLocal() as s:
        await s.execute(text(
            "TRUNCATE interactions, variants, misfolded_forms, protein_pathways, protein_complexes, complexes, "
            "proteins, pathways, locations, families RESTART IDENTITY CASCADE"))

        families = {code: Family(code=code, name=name, color=color, column_index=i + 1, description=desc)
                    for i, (code, name, color, desc) in enumerate(FAMILIES)}
        locations = {code: Location(code=code, name=name, row_index=i + 1, description=desc)
                     for i, (code, name, desc) in enumerate(LOCATIONS)}
        pathways = {code: Pathway(code=code, name=name, color=color, description=desc)
                    for code, name, color, desc in PATHWAYS}
        complexes = {ac: Complex(ac=ac, name=c["name"], function=c["function"], properties=c["properties"],
                                 pdb_ids=c["pdb_ids"], participants=c["participants"])
                     for ac, c in ENRICHED["complexes"].items()}
        s.add_all([*families.values(), *locations.values(), *pathways.values(), *complexes.values()])

        # "Atomic number" = order of discovery (ties broken by gene name).
        numbers = {p["gene"]: n for n, p in
                   enumerate(sorted(PROTEINS, key=lambda p: (p["year"], p["gene"])), start=1)}
        cell_counts = defaultdict(int)
        by_gene = {}
        misfold_order = 0

        for c in PROTEINS:
            e = ENRICHED["proteins"][c["gene"]]
            cell = (c["family"], c["location"])
            orthologs = {"human": c["gene"], **e["orthologs"], "ecoli": c["ecoli"]}
            if c["yeast_override"]:
                orthologs["yeast"] = c["yeast_override"]
            protein = Protein(
                number=numbers[c["gene"]], symbol=c["symbol"], name=c["name"], gene=c["gene"],
                uniprot_id=c["uniprot"], family=families[c["family"]], location=locations[c["location"]],
                other_locations=c["other_locations"], cell_rank=cell_counts[cell],
                mass_kda=c["mass_override"] or e["mass_kda"], length_aa=c["length_override"] or e["length_aa"],
                sequence=e["sequence"], function=e["function"], blurb=c["blurb"],
                discovery_year=c["year"], milestone=c["milestone"], pdb_ids=e["pdb_ids"][:12],
                alphafold_url=e["alphafold_url"], orthologs=orthologs, drugs=c["drugs"],
                therapeutic=c["therapeutic"],
                pathways=[pathways[code] for code in c["pathways"]],
                variants=[Variant(**v) for v in c["variants"]],
                features=e["features"], cofactors=e["cofactors"], subunit=e["subunit"],
                complexes=[complexes[ac] for ac in e["complexes"]],
            )
            if m := c["misfold"]:
                protein.misfolded = MisfoldedForm(
                    symbol=m["symbol"], name=m["name"], kind=m["kind"], diseases=m["diseases"],
                    description=m["description"], pdb_id=m["pdb"], drugs=m["drugs"], block_order=misfold_order)
                misfold_order += 1
            cell_counts[cell] += 1
            by_gene[c["gene"]] = protein
            s.add(protein)

        await s.flush()
        effects = ENRICHED["effects"]  # "P04637>Q00987" -> "activates" | "inhibits" | "both" | "regulates"
        annotated = 0
        for i in ENRICHED["interactions"]:
            pa, pz = sorted((by_gene[i["a"]], by_gene[i["b"]]), key=lambda p: p.id)
            a_to_b = effects.get(f"{pa.uniprot_id}>{pz.uniprot_id}")
            b_to_a = effects.get(f"{pz.uniprot_id}>{pa.uniprot_id}")
            annotated += bool(a_to_b or b_to_a)
            s.add(Interaction(protein_a_id=pa.id, protein_b_id=pz.id, score=i["score"], a_to_b=a_to_b, b_to_a=b_to_a))
        await s.commit()

    print(f"Loaded {len(PROTEINS)} proteins, {misfold_order} misfolded forms, {len(ENRICHED['interactions'])} "
          f"interactions ({annotated} with a curated effect), {len(ENRICHED['complexes'])} complexes.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
