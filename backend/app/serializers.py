from app.models import Protein
from app.schemas import MisfoldedOut, Partner, ProteinDetail, ProteinSummary, VariantOut


def summary(p: Protein) -> ProteinSummary:
    return ProteinSummary(
        id=p.id, number=p.number, symbol=p.symbol, name=p.name, gene=p.gene,
        family=p.family.code, location=p.location.code, other_locations=p.other_locations,
        cell_rank=p.cell_rank, mass_kda=p.mass_kda, length_aa=p.length_aa,
        discovery_year=p.discovery_year, milestone=p.milestone, blurb=p.blurb,
        drugs=p.drugs, therapeutic=p.therapeutic, pathways=[pw.code for pw in p.pathways],
        orthologs=p.orthologs, variant_count=len(p.variants),
        misfolded=MisfoldedOut.model_validate(p.misfolded) if p.misfolded else None,
    )


def detail(p: Protein, partners: list[Partner]) -> ProteinDetail:
    return ProteinDetail(
        **summary(p).model_dump(),
        uniprot_id=p.uniprot_id, function=p.function, sequence=p.sequence, pdb_ids=p.pdb_ids,
        alphafold_url=p.alphafold_url, variants=[VariantOut.model_validate(v) for v in p.variants],
        partners=partners,
    )
