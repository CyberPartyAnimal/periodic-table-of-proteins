from datetime import datetime

from sqlalchemy import (
    CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

protein_complexes = Table(
    "protein_complexes",
    Base.metadata,
    Column("protein_id", ForeignKey("proteins.id", ondelete="CASCADE"), primary_key=True),
    Column("complex_id", ForeignKey("complexes.id", ondelete="CASCADE"), primary_key=True),
)

protein_pathways = Table(
    "protein_pathways",
    Base.metadata,
    Column("protein_id", ForeignKey("proteins.id", ondelete="CASCADE"), primary_key=True),
    Column("pathway_id", ForeignKey("pathways.id", ondelete="CASCADE"), primary_key=True),
)


class Family(Base):
    """A column of the table (like a group of elements)."""
    __tablename__ = "families"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(9))
    column_index: Mapped[int] = mapped_column(unique=True)
    description: Mapped[str] = mapped_column(Text)


class Location(Base):
    """A row of the table (like a period): where in the cell the protein works."""
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(4), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    row_index: Mapped[int] = mapped_column(unique=True)
    description: Mapped[str] = mapped_column(Text)


class Pathway(Base):
    __tablename__ = "pathways"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(9))
    description: Mapped[str] = mapped_column(Text)

    proteins: Mapped[list["Protein"]] = relationship(secondary=protein_pathways, back_populates="pathways")


class Protein(Base):
    __tablename__ = "proteins"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(unique=True)  # "atomic number": order of discovery
    symbol: Mapped[str] = mapped_column(String(12), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    gene: Mapped[str] = mapped_column(String(32), unique=True)
    uniprot_id: Mapped[str] = mapped_column(String(16), unique=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), index=True)
    other_locations: Mapped[list[str]] = mapped_column(ARRAY(String(4)), default=list)
    cell_rank: Mapped[int] = mapped_column(default=0)  # 0 = the face of its cell
    mass_kda: Mapped[float] = mapped_column(Float)
    length_aa: Mapped[int] = mapped_column(Integer)
    sequence: Mapped[str] = mapped_column(Text)
    function: Mapped[str | None] = mapped_column(Text)
    blurb: Mapped[str] = mapped_column(Text)
    discovery_year: Mapped[int] = mapped_column(index=True)
    milestone: Mapped[str] = mapped_column(Text)
    pdb_ids: Mapped[list[str]] = mapped_column(ARRAY(String(8)), default=list)
    alphafold_url: Mapped[str | None] = mapped_column(String(300))
    orthologs: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"mouse": "Trp53", "yeast": None, ...}
    drugs: Mapped[list[str]] = mapped_column(ARRAY(String(80)), default=list)
    therapeutic: Mapped[str | None] = mapped_column(String(200))
    # What holds it together (UniProt): disulfides, helix/strand/turn ranges, ligand sites, processed chains.
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    cofactors: Mapped[list[str]] = mapped_column(ARRAY(String(120)), default=list)
    subunit: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    family: Mapped[Family] = relationship(lazy="joined")
    location: Mapped[Location] = relationship(lazy="joined")
    pathways: Mapped[list[Pathway]] = relationship(secondary=protein_pathways, back_populates="proteins",
                                                   lazy="selectin")
    variants: Mapped[list["Variant"]] = relationship(back_populates="protein", cascade="all, delete-orphan",
                                                     lazy="selectin", order_by="Variant.id")
    misfolded: Mapped["MisfoldedForm | None"] = relationship(back_populates="protein", uselist=False,
                                                             cascade="all, delete-orphan", lazy="selectin")
    complexes: Mapped[list["Complex"]] = relationship(secondary=protein_complexes, back_populates="members")


class Variant(Base):
    """A disease-linked mutation: the protein's 'isotope'."""
    __tablename__ = "variants"

    id: Mapped[int] = mapped_column(primary_key=True)
    protein_id: Mapped[int] = mapped_column(ForeignKey("proteins.id", ondelete="CASCADE"), index=True)
    change: Mapped[str] = mapped_column(String(120))
    disease: Mapped[str] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(Text)

    protein: Mapped[Protein] = relationship(back_populates="variants")


class MisfoldedForm(Base):
    """A disease conformer: the protein's 'allotrope' (same sequence, different fold)."""
    __tablename__ = "misfolded_forms"
    __table_args__ = (CheckConstraint("kind IN ('prion', 'prion-like', 'amyloid', 'polymer')", name="kind_valid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    protein_id: Mapped[int] = mapped_column(ForeignKey("proteins.id", ondelete="CASCADE"), unique=True)
    symbol: Mapped[str] = mapped_column(String(12), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    diseases: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    description: Mapped[str] = mapped_column(Text)
    pdb_id: Mapped[str | None] = mapped_column(String(8))
    drugs: Mapped[list[str]] = mapped_column(ARRAY(String(80)), default=list)
    block_order: Mapped[int] = mapped_column(default=0)

    protein: Mapped[Protein] = relationship(back_populates="misfolded")


class Interaction(Base):
    """A physical interaction from STRING, optionally with a curated effect (OmniPath).

    a_to_b / b_to_a: 'activates', 'inhibits', 'both' or 'regulates' (direction known, sign unclear).
    """
    __tablename__ = "interactions"
    __table_args__ = (
        UniqueConstraint("protein_a_id", "protein_b_id"),
        CheckConstraint("protein_a_id < protein_b_id", name="ordered_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    protein_a_id: Mapped[int] = mapped_column(ForeignKey("proteins.id", ondelete="CASCADE"), index=True)
    protein_b_id: Mapped[int] = mapped_column(ForeignKey("proteins.id", ondelete="CASCADE"), index=True)
    score: Mapped[float] = mapped_column(Float)
    a_to_b: Mapped[str | None] = mapped_column(String(12))
    b_to_a: Mapped[str | None] = mapped_column(String(12))


class Complex(Base):
    """An expert-curated complex from the EBI Complex Portal: proteins that assemble into one machine."""
    __tablename__ = "complexes"

    id: Mapped[int] = mapped_column(primary_key=True)
    ac: Mapped[str] = mapped_column(String(16), unique=True)  # e.g. CPX-2158
    name: Mapped[str] = mapped_column(String(300))
    function: Mapped[str | None] = mapped_column(Text)
    properties: Mapped[str | None] = mapped_column(Text)
    pdb_ids: Mapped[list[str]] = mapped_column(ARRAY(String(8)), default=list)
    participants: Mapped[list[dict]] = mapped_column(JSONB, default=list)  # [{id, name, description, stoichiometry, type}]

    members: Mapped[list[Protein]] = relationship(secondary=protein_complexes, back_populates="complexes")
