from pydantic import BaseModel, ConfigDict


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class FamilyOut(ORM):
    code: str
    name: str
    color: str
    column_index: int
    description: str


class LocationOut(ORM):
    code: str
    name: str
    row_index: int
    description: str


class PathwayOut(ORM):
    code: str
    name: str
    color: str
    description: str


class OrganismOut(BaseModel):
    code: str
    name: str
    latin: str


class VariantOut(ORM):
    change: str
    disease: str
    note: str | None


class MisfoldedOut(ORM):
    symbol: str
    name: str
    kind: str
    diseases: list[str]
    description: str
    pdb_id: str | None
    drugs: list[str]
    block_order: int


class ProteinSummary(BaseModel):
    """Everything a tile needs."""
    id: int
    number: int
    symbol: str
    name: str
    gene: str
    family: str
    location: str
    other_locations: list[str]
    cell_rank: int
    mass_kda: float
    length_aa: int
    discovery_year: int
    milestone: str
    blurb: str
    drugs: list[str]
    therapeutic: str | None
    pathways: list[str]
    orthologs: dict[str, str | None]
    variant_count: int
    misfolded: MisfoldedOut | None


class Partner(BaseModel):
    id: int
    symbol: str
    name: str
    score: float
    effect_out: str | None = None  # what this protein does to the partner
    effect_in: str | None = None   # what the partner does to this protein


class ProteinDetail(ProteinSummary):
    uniprot_id: str
    function: str | None
    sequence: str
    pdb_ids: list[str]
    alphafold_url: str | None
    variants: list[VariantOut]
    partners: list[Partner]


class InteractionOut(BaseModel):
    a: int
    b: int
    score: float
    a_to_b: str | None
    b_to_a: str | None


class TableOut(BaseModel):
    families: list[FamilyOut]
    locations: list[LocationOut]
    pathways: list[PathwayOut]
    organisms: list[OrganismOut]
    proteins: list[ProteinSummary]
    interactions: list[InteractionOut]


class CompareOut(BaseModel):
    a: ProteinDetail
    b: ProteinDetail
    interaction_score: float | None
    shared_pathways: list[str]
    shared_partners: list[Partner]
    shared_organisms: list[str]


class AnatomyOut(BaseModel):
    """What the protein is made of and what holds it together."""
    length: int
    formula: dict[str, int]
    total_atoms: int
    sulfur_sources: dict[str, int]
    metals: list[dict]
    other_ligands: list[dict]
    cofactors: list[str]
    composition: list[dict]
    groups: dict[str, int]
    bonds: dict
    secondary: dict[str, list[list[int]]]
    chains: list[dict]
    alphafold_url: str | None


class ComplexParticipant(BaseModel):
    id: str | None
    name: str | None
    description: str | None
    stoichiometry: int | None
    type: str | None
    protein_id: int | None  # set when this participant is on our table


class ComplexOut(BaseModel):
    ac: str
    name: str
    function: str | None
    properties: str | None
    pdb_ids: list[str]
    participants: list[ComplexParticipant]


class AssemblyOut(BaseModel):
    """How the protein comes together with others (or is cut into chains) to form the working unit."""
    subunit: str | None
    chains: list[dict]
    complexes: list[ComplexOut]
