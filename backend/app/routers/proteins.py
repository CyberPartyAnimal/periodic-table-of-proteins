from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.chemistry import anatomy
from app.models import Family, Interaction, Location, Pathway, Protein
from app.schemas import (
    AnatomyOut, AssemblyOut, CompareOut, ComplexOut, ComplexParticipant, FamilyOut, InteractionOut, LocationOut,
    OrganismOut, Partner, PathwayOut, ProteinDetail, ProteinSummary, TableOut,
)
from app.serializers import detail, summary
from seed.curated import ORGANISMS

router = APIRouter(prefix="/api", tags=["proteins"])

# Every value a client sends is checked against a tight shape before it reaches the database.
KEY_PATTERN = r"^[A-Za-z0-9-]{1,20}$"  # id, symbol (p53), gene (HLA-A) or UniProt accession (P04637)
CODE_PATTERN = r"^[A-Za-z0-9_]{1,24}$"  # family / location / pathway codes
ProteinKey = Annotated[str, Path(pattern=KEY_PATTERN)]
CompareKey = Annotated[str, Query(pattern=KEY_PATTERN)]
Code = Annotated[str | None, Query(pattern=CODE_PATTERN)]


@router.get("/table", response_model=TableOut)
async def get_table(session: AsyncSession = Depends(get_session)):
    """Everything needed to draw the periodic table in one request."""
    families = (await session.scalars(select(Family).order_by(Family.column_index))).all()
    locations = (await session.scalars(select(Location).order_by(Location.row_index))).all()
    pathways = (await session.scalars(select(Pathway).order_by(Pathway.id))).all()
    proteins = (await session.scalars(select(Protein).order_by(Protein.number))).unique().all()
    interactions = (await session.scalars(select(Interaction))).all()
    return TableOut(
        families=[FamilyOut.model_validate(f) for f in families],
        locations=[LocationOut.model_validate(l) for l in locations],
        pathways=[PathwayOut.model_validate(p) for p in pathways],
        organisms=[OrganismOut(code=c, name=n, latin=l) for c, n, l in ORGANISMS],
        proteins=[summary(p) for p in proteins],
        interactions=[InteractionOut(a=i.protein_a_id, b=i.protein_b_id, score=i.score, a_to_b=i.a_to_b,
                                     b_to_a=i.b_to_a) for i in interactions],
    )


@router.get("/proteins", response_model=list[ProteinSummary])
async def list_proteins(
    q: Annotated[str | None, Query(max_length=60, description="Search symbol, name or gene")] = None,
    family: Code = None,
    location: Code = None,
    pathway: Code = None,
    organism: Literal["human", "mouse", "yeast", "ecoli"] | None = None,
    drug_target: bool | None = None,
    misfolds: bool | None = None,
    discovered_by: Annotated[int | None, Query(ge=1000, le=3000, description="Only proteins identified by this year")] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Protein).join(Protein.family).join(Protein.location).order_by(Protein.number)
    if q:
        # autoescape: "%" and "_" in the search are matched literally, not as wildcards.
        stmt = stmt.where(or_(Protein.symbol.icontains(q, autoescape=True), Protein.name.icontains(q, autoescape=True),
                              Protein.gene.icontains(q, autoescape=True)))
    if family:
        stmt = stmt.where(Family.code == family)
    if location:
        stmt = stmt.where(Location.code == location)
    if pathway:
        stmt = stmt.where(Protein.pathways.any(Pathway.code == pathway))
    if organism:
        stmt = stmt.where(Protein.orthologs[organism].astext.is_not(None))
    if drug_target is not None:
        has_drugs = func.cardinality(Protein.drugs) > 0
        stmt = stmt.where(has_drugs if drug_target else ~has_drugs)
    if misfolds is not None:
        stmt = stmt.where(Protein.misfolded.has() if misfolds else ~Protein.misfolded.has())
    if discovered_by:
        stmt = stmt.where(Protein.discovery_year <= discovered_by)
    return [summary(p) for p in (await session.scalars(stmt)).unique().all()]


async def _load(session: AsyncSession, key: str) -> Protein:
    # Short digit strings are ids; longer ones can't be and would overflow the integer column.
    cond = Protein.id == int(key) if key.isdigit() and len(key) <= 9 else or_(
        func.lower(Protein.symbol) == key.lower(), func.lower(Protein.gene) == key.lower(),
        Protein.uniprot_id == key.upper())
    protein = (await session.scalars(select(Protein).where(cond))).unique().first()
    if not protein:
        raise HTTPException(404, "Protein not found")  # don't echo client input back
    return protein


async def _partners(session: AsyncSession, protein_id: int) -> list[Partner]:
    rows = (await session.execute(
        select(Protein.id, Protein.symbol, Protein.name, Interaction)
        .join(Interaction, or_(
            (Interaction.protein_a_id == protein_id) & (Interaction.protein_b_id == Protein.id),
            (Interaction.protein_b_id == protein_id) & (Interaction.protein_a_id == Protein.id)))
        .order_by(Interaction.score.desc(), Protein.symbol)
    )).all()
    partners = []
    for r in rows:
        i = r.Interaction
        mine_is_a = i.protein_a_id == protein_id
        partners.append(Partner(
            id=r.id, symbol=r.symbol, name=r.name, score=i.score,
            effect_out=i.a_to_b if mine_is_a else i.b_to_a,
            effect_in=i.b_to_a if mine_is_a else i.a_to_b))
    return partners


@router.get("/proteins/{key}", response_model=ProteinDetail)
async def get_protein(key: ProteinKey, session: AsyncSession = Depends(get_session)):
    """Look up by id, symbol (p53), gene (TP53) or UniProt accession (P04637)."""
    protein = await _load(session, key)
    return detail(protein, await _partners(session, protein.id))


@router.get("/proteins/{key}/anatomy", response_model=AnatomyOut)
async def get_anatomy(key: ProteinKey, session: AsyncSession = Depends(get_session)):
    """Chemical formula, elements, metals and the bonds that hold the chain together."""
    p = await _load(session, key)
    return AnatomyOut(**anatomy(p.sequence, p.features or {}, p.cofactors or []), alphafold_url=p.alphafold_url)


@router.get("/proteins/{key}/assembly", response_model=AssemblyOut)
async def get_assembly(key: ProteinKey, session: AsyncSession = Depends(get_session)):
    """Which proteins come together to form the working unit (EBI Complex Portal), plus processed chains."""
    p = await _load(session, key)
    await session.refresh(p, ["complexes"])
    on_table = dict((await session.execute(select(Protein.uniprot_id, Protein.id))).all())

    def partners_on_table(c):
        return sum(1 for x in c.participants if x["id"] in on_table and x["id"] != p.uniprot_id)

    complexes = sorted(p.complexes, key=lambda c: (-partners_on_table(c), len(c.participants), c.ac))
    return AssemblyOut(
        subunit=p.subunit,
        chains=anatomy(p.sequence, p.features or {}, [])["chains"],
        complexes=[ComplexOut(
            ac=c.ac, name=c.name, function=c.function, properties=c.properties, pdb_ids=c.pdb_ids,
            participants=[ComplexParticipant(**x, protein_id=on_table.get(x["id"])) for x in c.participants],
        ) for c in complexes],
    )


@router.get("/compare", response_model=CompareOut)
async def compare(a: CompareKey, b: CompareKey, session: AsyncSession = Depends(get_session)):
    pa, pb = await _load(session, a), await _load(session, b)
    da = detail(pa, await _partners(session, pa.id))
    db = detail(pb, await _partners(session, pb.id))
    score = next((p.score for p in da.partners if p.id == pb.id), None)
    b_partner_ids = {p.id for p in db.partners}
    return CompareOut(
        a=da, b=db, interaction_score=score,
        shared_pathways=sorted(set(da.pathways) & set(db.pathways)),
        shared_partners=[p for p in da.partners if p.id in b_partner_ids],
        shared_organisms=[o for o, _, _ in ORGANISMS if da.orthologs.get(o) and db.orthologs.get(o)],
    )
