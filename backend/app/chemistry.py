"""What a protein is made of and what holds it together, computed from its sequence and UniProt features."""

import re
from collections import Counter

# Free amino-acid formulas (C, H, N, O, S, Se). Joining two releases one H2O.
AMINO_ACIDS = {
    "A": ("Ala", "Alanine", (3, 7, 1, 2, 0, 0)),
    "R": ("Arg", "Arginine", (6, 14, 4, 2, 0, 0)),
    "N": ("Asn", "Asparagine", (4, 8, 2, 3, 0, 0)),
    "D": ("Asp", "Aspartate", (4, 7, 1, 4, 0, 0)),
    "C": ("Cys", "Cysteine", (3, 7, 1, 2, 1, 0)),
    "E": ("Glu", "Glutamate", (5, 9, 1, 4, 0, 0)),
    "Q": ("Gln", "Glutamine", (5, 10, 2, 3, 0, 0)),
    "G": ("Gly", "Glycine", (2, 5, 1, 2, 0, 0)),
    "H": ("His", "Histidine", (6, 9, 3, 2, 0, 0)),
    "I": ("Ile", "Isoleucine", (6, 13, 1, 2, 0, 0)),
    "L": ("Leu", "Leucine", (6, 13, 1, 2, 0, 0)),
    "K": ("Lys", "Lysine", (6, 14, 2, 2, 0, 0)),
    "M": ("Met", "Methionine", (5, 11, 1, 2, 1, 0)),
    "F": ("Phe", "Phenylalanine", (9, 11, 1, 2, 0, 0)),
    "P": ("Pro", "Proline", (5, 9, 1, 2, 0, 0)),
    "S": ("Ser", "Serine", (3, 7, 1, 3, 0, 0)),
    "T": ("Thr", "Threonine", (4, 9, 1, 3, 0, 0)),
    "W": ("Trp", "Tryptophan", (11, 12, 2, 2, 0, 0)),
    "Y": ("Tyr", "Tyrosine", (9, 11, 1, 3, 0, 0)),
    "V": ("Val", "Valine", (5, 11, 1, 2, 0, 0)),
    "U": ("Sec", "Selenocysteine", (3, 7, 1, 2, 0, 1)),
}
ELEMENTS = ("C", "H", "N", "O", "S", "Se")

# A simplified textbook grouping of side chains.
GROUPS = {
    "hydrophobic": set("AVLIMFWP"),
    "polar": set("STNQYCGU"),
    "positive": set("KRH"),
    "negative": set("DE"),
}

# Metal (or metal-containing) ligands named in UniProt binding sites and cofactors.
METALS = [
    (r"\bZn|zinc", "Zn"), (r"\bCu\b|Cu\(|Cu cation|copper", "Cu"), (r"\bFe\b|Fe\(|iron|heme|[2-4]Fe-[2-4]S", "Fe"),
    (r"\bMg\b|Mg\(|magnesium", "Mg"), (r"\bCa\b|Ca\(|calcium", "Ca"), (r"\bMn\b|Mn\(|manganese", "Mn"),
    (r"\bNa\(|sodium", "Na"), (r"\bK\(|potassium", "K"), (r"\bNi\b|Ni\(|nickel", "Ni"), (r"\bCo\b|Co\(|cobalt", "Co"),
    (r"molybd", "Mo"),
]


def metal_of(ligand: str) -> str | None:
    return next((el for pattern, el in METALS if re.search(pattern, ligand, re.IGNORECASE)), None)


def formula(sequence: str) -> dict[str, int]:
    """Formula of the full encoded chain, as one unmodified polypeptide."""
    counts = Counter(sequence)
    totals = [0] * len(ELEMENTS)
    for aa, n in counts.items():
        if aa in AMINO_ACIDS:
            for i, v in enumerate(AMINO_ACIDS[aa][2]):
                totals[i] += v * n
    waters = max(len(sequence) - 1, 0)  # one H2O lost per peptide bond
    totals[1] -= 2 * waters
    totals[3] -= waters
    return {el: n for el, n in zip(ELEMENTS, totals) if n}


def residues_in(ranges) -> int:
    return sum(end - start + 1 for start, end in ranges if start and end)


def anatomy(sequence: str, features: dict, cofactors: list[str]) -> dict:
    counts = Counter(sequence)
    n = len(sequence)
    f = formula(sequence)

    metals: dict[str, dict] = {}
    other_ligands: dict[str, list[int]] = {}
    for start, end, ligand in features.get("binding", []):
        el = metal_of(ligand)
        if el:
            entry = metals.setdefault(el, {"element": el, "ligands": set(), "residues": []})
            entry["ligands"].add(ligand)
            entry["residues"].append(start)
        else:
            other_ligands.setdefault(ligand, []).append(start)
    for cf in cofactors:
        el = metal_of(cf)
        if el:
            metals.setdefault(el, {"element": el, "ligands": set(), "residues": []})["ligands"].add(cf)

    return {
        "length": n,
        "formula": f,
        "total_atoms": sum(f.values()),
        "sulfur_sources": {"Cys": counts["C"], "Met": counts["M"]},
        "metals": [{**m, "ligands": sorted(m["ligands"]), "residues": sorted(set(m["residues"]))}
                   for m in sorted(metals.values(), key=lambda m: m["element"])],
        "other_ligands": [{"name": k, "residues": sorted(set(v))} for k, v in other_ligands.items()],
        "cofactors": cofactors,
        "composition": [
            {"code": aa, "abbr": AMINO_ACIDS[aa][0], "name": AMINO_ACIDS[aa][1], "count": counts[aa],
             "group": next(g for g, members in GROUPS.items() if aa in members)}
            for aa in sorted(AMINO_ACIDS, key=lambda a: -counts[a]) if counts[aa]
        ],
        "groups": {g: sum(counts[a] for a in members) for g, members in GROUPS.items()},
        "bonds": {
            "peptide": max(n - 1, 0),
            "disulfides": [{"from": a, "to": b, "note": note} for a, b, note in features.get("disulfides", [])],
            "helices": len(features.get("helix", [])),
            "helix_residues": residues_in(features.get("helix", [])),
            "strands": len(features.get("strand", [])),
            "strand_residues": residues_in(features.get("strand", [])),
            "turns": len(features.get("turn", [])),
        },
        "secondary": {k: features.get(k, []) for k in ("helix", "strand", "turn")},
        "chains": [{"type": t, "start": a, "end": b, "name": name} for t, a, b, name in features.get("chains", [])],
    }
