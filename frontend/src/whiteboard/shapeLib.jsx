// Bibliothèque de formes (viewBox 0-100). `d` = contour rempli, `x` = traits additionnels, `open` = contour non rempli.
const poly = (n, r = 48, rot = -90, cy = 50) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return `${i ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join("") + "Z";
const star = (n, inner, r = 48) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const rr = i % 2 === 0 ? r : inner;
    const a = (Math.PI / n) * i - Math.PI / 2;
    return `${i ? "L" : "M"}${(50 + rr * Math.cos(a)).toFixed(1)} ${(52 + rr * Math.sin(a)).toFixed(1)}`;
  }).join("") + "Z";
const circle = "M50 2A48 48 0 1 1 49.9 2Z";

export const SHAPE_CATEGORIES = [
  { id: "basic", label: "Formes de base" },
  { id: "arrows", label: "Flèches" },
  { id: "flow", label: "Logigramme" },
  { id: "symbols", label: "Symboles" },
];

// legacy: ces identifiants existent déjà comme types d'éléments à part entière
export const SHAPE_LIB = [
  // ── Formes de base
  { id: "rect", label: "Rectangle", cat: "basic", legacy: true, d: "M2 6H98V94H2Z" },
  { id: "rounded", label: "Rectangle arrondi", cat: "basic", d: "M14 4H86A12 12 0 0 1 98 16V84A12 12 0 0 1 86 96H14A12 12 0 0 1 2 84V16A12 12 0 0 1 14 4Z" },
  { id: "ellipse", label: "Ellipse", cat: "basic", legacy: true, d: circle },
  { id: "triangle", label: "Triangle", cat: "basic", legacy: true, d: "M50 4L97 96H3Z" },
  { id: "diamond", label: "Losange", cat: "basic", legacy: true, d: "M50 2L98 50L50 98L2 50Z" },
  { id: "bubble", label: "Bulle", cat: "basic", d: "M10 4H90Q98 4 98 12V62Q98 70 90 70H46L24 96L28 70H10Q2 70 2 62V12Q2 4 10 4Z" },
  { id: "bubbleRound", label: "Bulle ronde", cat: "basic", d: "M50 4C22 4 2 20 2 38C2 54 16 66 34 70L22 96L52 72C78 70 98 56 98 38C98 20 78 4 50 4Z" },
  { id: "parallelogram", label: "Parallélogramme", cat: "basic", d: "M22 6H98L78 94H2Z" },
  { id: "star", label: "Étoile", cat: "basic", legacy: true, d: star(5, 20) },
  { id: "pentagon", label: "Pentagone", cat: "basic", d: "M50 3L97 38L79 96H21L3 38Z" },
  { id: "hexagon", label: "Hexagone", cat: "basic", legacy: true, d: "M25 4H75L98 50L75 96H25L2 50Z" },
  { id: "heptagon", label: "Heptagone", cat: "basic", d: poly(7) },
  { id: "octagon", label: "Octogone", cat: "basic", d: "M30 3H70L97 30V70L70 97H30L3 70V30Z" },
  { id: "decagon", label: "Décagone", cat: "basic", d: poly(10) },
  { id: "trapezoid", label: "Trapèze", cat: "basic", d: "M20 6H80L98 94H2Z" },
  { id: "rtriangle", label: "Triangle rectangle", cat: "basic", d: "M2 4V96H98Z" },
  { id: "semicircle", label: "Demi-cercle", cat: "basic", d: "M2 88A48 80 0 0 1 98 88Z" },
  { id: "pacman", label: "Secteur", cat: "basic", d: "M50 50L98 50A48 48 0 1 0 50 98Z" },
  { id: "ring", label: "Anneau", cat: "basic", d: circle + "M50 24A26 26 0 1 0 50.1 24Z", evenodd: true },
  { id: "cross", label: "Croix", cat: "basic", d: "M35 2H65V35H98V65H65V98H35V65H2V35H35Z" },
  { id: "cloud", label: "Nuage", cat: "basic", d: "M25 82C6 82 0 62 14 52C6 36 22 24 36 32C42 14 68 14 74 32C90 28 100 46 88 58C98 72 88 84 74 82Z" },
  { id: "cylinder", label: "Cylindre", cat: "basic", d: "M2 16C2 4 98 4 98 16V84C98 96 2 96 2 84Z", x: "M2 16C2 28 98 28 98 16" },
  { id: "banner", label: "Bannière", cat: "basic", d: "M2 20H98L86 50L98 80H2L14 50Z" },
  { id: "braceL", label: "Accolade gauche", cat: "basic", open: true, d: "M70 2C40 2 55 45 25 50C55 55 40 98 70 98" },
  { id: "braceR", label: "Accolade droite", cat: "basic", open: true, d: "M30 2C60 2 45 45 75 50C45 55 60 98 30 98" },
  { id: "bracketL", label: "Crochet gauche", cat: "basic", open: true, d: "M70 2H30V98H70" },
  { id: "bracketR", label: "Crochet droit", cat: "basic", open: true, d: "M30 2H70V98H30" },
  { id: "folder", label: "Dossier", cat: "basic", d: "M2 16Q2 8 10 8H38L48 20H90Q98 20 98 28V88Q98 94 90 94H10Q2 94 2 86Z" },
  { id: "note", label: "Note", cat: "basic", d: "M2 2H72L98 28V98H2Z", x: "M72 2V28H98" },
  // ── Flèches
  { id: "arrowR", label: "Flèche droite", cat: "arrows", d: "M2 30H60V4L98 50L60 96V70H2Z" },
  { id: "arrowL", label: "Flèche gauche", cat: "arrows", d: "M98 30H40V4L2 50L40 96V70H98Z" },
  { id: "arrowU", label: "Flèche haut", cat: "arrows", d: "M30 98V40H4L50 2L96 40H70V98Z" },
  { id: "arrowD", label: "Flèche bas", cat: "arrows", d: "M30 2V60H4L50 98L96 60H70V2Z" },
  { id: "arrowLR", label: "Double flèche", cat: "arrows", d: "M2 50L28 6V30H72V6L98 50L72 94V70H28V94Z" },
  { id: "arrowUD", label: "Double flèche verticale", cat: "arrows", d: "M50 2L94 28H70V72H94L50 98L6 72H30V28H6Z" },
  { id: "arrowNotch", label: "Flèche encochée", cat: "arrows", d: "M2 30H60V4L98 50L60 96V70H2L18 50Z" },
  { id: "chevron", label: "Chevron", cat: "arrows", d: "M2 4H66L98 50L66 96H2L34 50Z" },
  { id: "tag", label: "Pentagone fléché", cat: "arrows", d: "M2 6H70L98 50L70 94H2Z" },
  { id: "arrowBent", label: "Flèche coudée", cat: "arrows", d: "M2 98V40Q2 22 20 22H66V2L98 32L66 62V42H28V98Z" },
  { id: "arrowU2", label: "Flèche retour", cat: "arrows", d: "M2 98V40A32 32 0 0 1 34 8H58V0L98 22L58 44V36H34A8 8 0 0 0 26 44V98Z" },
  { id: "arrowQuad", label: "Flèche 4 directions", cat: "arrows", d: "M50 2L68 22H56V44H78V32L98 50L78 68V56H56V78H68L50 98L32 78H44V56H22V68L2 50L22 32V44H44V22H32Z" },
  // ── Logigramme
  { id: "process", label: "Processus", cat: "flow", d: "M2 10H98V90H2Z" },
  { id: "terminator", label: "Début / Fin", cat: "flow", d: "M26 8H74A24 42 0 0 1 74 92H26A24 42 0 0 1 26 8Z" },
  { id: "predefined", label: "Processus prédéfini", cat: "flow", d: "M2 10H98V90H2Z", x: "M14 10V90M86 10V90" },
  { id: "data", label: "Données", cat: "flow", d: "M22 10H98L78 90H2Z" },
  { id: "document", label: "Document", cat: "flow", d: "M2 6H98V82C74 66 52 100 2 84Z" },
  { id: "multidoc", label: "Documents", cat: "flow", d: "M2 22H82V94C58 80 30 106 2 92Z", x: "M16 22V8H98V76H82" },
  { id: "manualInput", label: "Saisie manuelle", cat: "flow", d: "M2 26L98 6V94H2Z" },
  { id: "manualOp", label: "Opération manuelle", cat: "flow", d: "M2 8H98L80 92H20Z" },
  { id: "display", label: "Affichage", cat: "flow", d: "M2 50L22 8H78A20 42 0 0 1 78 92H22Z" },
  { id: "delay", label: "Délai", cat: "flow", d: "M2 8H58A40 42 0 0 1 58 92H2Z" },
  { id: "merge", label: "Fusion", cat: "flow", d: "M2 6H98L50 94Z" },
  { id: "offpage", label: "Renvoi de page", cat: "flow", d: "M2 6H98V62L50 94L2 62Z" },
  { id: "storedData", label: "Données stockées", cat: "flow", d: "M16 8H98C86 8 86 92 98 92H16C4 92 4 8 16 8Z" },
  { id: "internal", label: "Stockage interne", cat: "flow", d: "M2 6H98V94H2Z", x: "M18 6V94M2 22H98" },
  { id: "card", label: "Carte perforée", cat: "flow", d: "M24 6H98V94H2V28Z" },
  { id: "tape", label: "Papier ondulé", cat: "flow", d: "M2 16C30 2 70 30 98 16V84C70 98 30 70 2 84Z" },
  { id: "orCircle", label: "OU", cat: "flow", d: circle, x: "M2 50H98M50 2V98" },
  { id: "sumCircle", label: "Jonction", cat: "flow", d: circle, x: "M16 16L84 84M84 16L16 84" },
  { id: "database", label: "Base de données", cat: "flow", d: "M2 16C2 4 98 4 98 16V84C98 96 2 96 2 84Z", x: "M2 16C2 28 98 28 98 16M2 38C2 50 98 50 98 38" },
  // ── Symboles
  { id: "heart", label: "Cœur", cat: "symbols", d: "M50 92C10 62 2 40 2 28C2 12 14 4 26 4C38 4 46 12 50 22C54 12 62 4 74 4C86 4 98 12 98 28C98 40 90 62 50 92Z" },
  { id: "star4", label: "Étoile 4 branches", cat: "symbols", d: star(4, 14) },
  { id: "star6", label: "Étoile 6 branches", cat: "symbols", d: star(6, 26) },
  { id: "star8", label: "Étoile 8 branches", cat: "symbols", d: star(8, 32) },
  { id: "burst", label: "Explosion", cat: "symbols", d: star(12, 34) },
  { id: "lightning", label: "Éclair", cat: "symbols", d: "M58 2L16 54H44L36 98L84 42H56Z" },
  { id: "moon", label: "Lune", cat: "symbols", d: "M64 4A46 46 0 1 0 96 70A38 38 0 0 1 64 4Z" },
  { id: "sun", label: "Soleil", cat: "symbols", d: "M50 28A22 22 0 1 1 49.9 28Z", x: "M50 2V14M50 86V98M2 50H14M86 50H98M16 16L24 24M76 76L84 84M84 16L76 24M24 76L16 84" },
  { id: "check", label: "Coche", cat: "symbols", d: "M4 54L20 38L40 58L80 10L96 26L40 90Z" },
  { id: "xmark", label: "Croix X", cat: "symbols", d: "M20 4L50 34L80 4L96 20L66 50L96 80L80 96L50 66L20 96L4 80L34 50L4 20Z" },
  { id: "forbidden", label: "Interdit", cat: "symbols", d: circle, x: "M16 16L84 84" },
  { id: "person", label: "Personne", cat: "symbols", d: "M50 4A20 20 0 1 1 49.9 4ZM10 98C10 62 90 62 90 98Z" },
  { id: "pin", label: "Repère", cat: "symbols", d: "M50 98C20 60 8 46 8 32A42 30 0 0 1 92 32C92 46 80 60 50 98Z" },
  { id: "flag", label: "Drapeau", cat: "symbols", d: "M10 2V98H20V60C40 48 56 76 90 56V8C56 28 40 0 20 12V2Z" },
  { id: "shield", label: "Bouclier", cat: "symbols", d: "M50 2L94 16V50C94 76 70 92 50 98C30 92 6 76 6 50V16Z" },
  { id: "droplet", label: "Goutte", cat: "symbols", d: "M50 2C50 2 90 44 90 66A40 32 0 0 1 10 66C10 44 50 2 50 2Z" },
];

export const SHAPE_BY_ID = Object.fromEntries(SHAPE_LIB.map(s => [s.id, s]));

export function ShapeThumb({ shape, size = 34, color = "#e8e8f5" }) {
  const s = typeof shape === "string" ? SHAPE_BY_ID[shape] : shape;
  if (!s) return null;
  return (
    <svg width={size} height={size} viewBox="-4 -4 108 108" style={{ display: "block" }}>
      <path d={s.d} fill={s.open ? "none" : color + "22"} fillRule={s.evenodd ? "evenodd" : "nonzero"} stroke={color} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      {s.x && <path d={s.x} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />}
    </svg>
  );
}
