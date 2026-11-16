// Analyse du texte d'une recette (copié depuis le « Texte en direct » de l'iPhone, un OCR, un site…)
// et conversion en recette structurée : titre, ingrédients, étapes, personnes, temps.
// Les ingrédients sont rapprochés de ceux qui existent déjà dans l'application.

import type { Recipe } from "./App";

// ── Image par défaut ────────────────────────────────────────────────────────
// Une recette créée depuis du texte n'a pas de photo : on met une petite vignette neutre
// (l'utilisateur pourra la remplacer avec « Modifier »).
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
  '<rect width="800" height="600" fill="#efe6d8"/>' +
  '<circle cx="400" cy="300" r="130" fill="none" stroke="#c9b79c" stroke-width="10"/>' +
  '<circle cx="400" cy="300" r="85" fill="none" stroke="#c9b79c" stroke-width="6"/>' +
  "</svg>";

export const PLACEHOLDER_IMAGE = `data:image/svg+xml;base64,${btoa(PLACEHOLDER_SVG)}`;

/** Vrai si l'image est une vraie photo (pas la vignette par défaut). */
export function hasRealPhoto(src: string) {
  return Boolean(src) && !src.startsWith("data:image/svg") && !/\.svg(?:\?|$)/i.test(src);
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface ParsedRecipe {
  title: string;
  description: string;
  servings: number | null;
  time: string;
  /** true si le temps a été estimé en additionnant les durées citées dans les étapes. */
  timeEstimated: boolean;
  difficulty: Recipe["difficulty"] | null;
  ingredients: { quantity: string; name: string }[];
  steps: { title: string; instruction: string }[];
}

// ── Nettoyage du texte ──────────────────────────────────────────────────────
/** Retire les caractères invisibles de l'OCR, les puces et les signes parasites ; une ligne par ligne non vide. */
// « 2o min », « 1O0 g » : l'OCR confond parfois la lettre o (ou l) avec un chiffre. On ne corrige que devant une unité.
const DIGIT_LOOKALIKES =
  /\b(\d+[oOlI]+\d*|[oO]\d+)(?=\s*(?:min(?:utes?)?|mn|h|heures?|g|kg|mg|cl|ml|dl|cm|l)(?![a-zà-ÿ]))/g;

export function cleanOcrText(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u00A0\u202F\u2009\u2007]/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^[\s•·▪●○◦‣▫■□☐☑✓✔*–—-]+(?=\S)/, "")
        .replace(/\s*[‹›]\s+/g, ", ")
        .replace(/[ \t]+/g, " ")
        .replace(DIGIT_LOOKALIKES, (token) => token.replace(/[oO]/g, "0").replace(/[lI]/g, "1"))
        .trim()
    )
    .filter(Boolean)
    .join("\n");
}

// ── Expressions régulières ──────────────────────────────────────────────────
const FR = "a-zàâäçéèêëîïôöûùüÿœæ";
const FRACTIONS = "½¼¾⅓⅔⅛⅜⅝⅞";
const NUM = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*[${FRACTIONS}])?|[${FRACTIONS}])`;
const QTY_RE = new RegExp(String.raw`^(${NUM}(?:\s*(?:-|–|à|ou)\s*${NUM})?)(?!\d)\s*`, "i");

const UNITS = String.raw`(?:kg|g|mg|l|cl|dl|ml|litres?|grammes?|c\.?\s?à\.?\s?(?:soupe|café|cafe|s|c)|cuill[èe]res?(?:\s+à\s+(?:soupe|café|cafe))?|càs|càc|cs|cc|pinc[ée]es?|sachets?|tasses?|verres?|pots?|bo[iî]tes?|gousses?|tranches?|branches?|brins?|feuilles?|bouquets?|poign[ée]es?|morceaux?|rondelles?|paquets?|barquettes?|dosettes?|cubes?|filets?|noix|noisettes?|bottes?|traits?|pav[ée]s?|carr[ée]s?|gouttes?|boules?|plaques?|bâtons?|tiges?|pi[èe]ces?|louches?|c[œo]e?urs?)`;
const UNIT_RE = new RegExp(String.raw`^(${UNITS})(?![${FR}])\.?\s*`, "i");

const SPECIAL_QTY = new RegExp(
  String.raw`^(un peu|quelques|une? pointe|un soupçon|une pinc[ée]e|une noix|une goutte|un trait|un filet|une poign[ée]e|une branche|un bouquet)(?![${FR}])\s*(?:de\s+|d['’]|du\s+|des\s+)?`,
  "i"
);

const MODIFIER_RE = new RegExp(
  String.raw`^(?:(?:le|la|les)\s+|l['’])?(zestes?|jus|pulpe|chair|blancs?|jaunes?|feuilles?|brins?|gousses?|rondelles?)\s+(?:de\s+|d['’]|du\s+|des\s+)`,
  "i"
);

const LEADING_DE = /^(?:de la\s+|de l['’]|des\s+|du\s+|de\s+|d['’])/i;
const LEADING_ARTICLE = /^(?:(?:le|la|les)\s+|l['’])/i;

const NOT_AN_INGREDIENT = /^\d+(?:[.,]\d+)?\s*(?:min|minutes?|mn|heures?|h|secondes?|sec|°|degrés?|jours?)(?![a-zà-ÿ])/i;
const NUMBERED_STEP = /^(?:[ée]tape\s*)?\d+\s*[.)\-–:]\s*(?=[^\s\d])/i;
const ING_HEADER = /^(?:les\s+)?ingr[ée]dients?\b/i;
const STEP_HEADER =
  /^(?:la\s+)?(?:pr[ée]paration(?:\s+de\s+la\s+recette)?|[ée]tapes?(?:\s+de\s+pr[ée]paration)?|instructions?|d[ée]roulement|m[ée]thode|directions?|recette)\s*:?$/i;

const SERVINGS_LINE = /^(?:pour\s+)?(\d{1,2})(?:\s*(?:à|-|–)\s*\d{1,2})?\s*(?:personnes?|pers\.?|parts?|portions?|convives)(?![a-zà-ÿ])/i;
const SERVINGS_LABEL = /^(?:nombre\s+de\s+(?:personnes|parts|portions)|portions?|parts?|personnes?|convives)\s*:\s*(\d{1,2})/i;
const SERVINGS_BARE = /^pour\s+(\d{1,2})$/i;
const SERVINGS_ANYWHERE = /(\d{1,2})\s*(?:personnes?|pers\.?|parts?|portions?|convives)(?![a-zà-ÿ])/i;
const TIME_LINE = /^(?:temps\s+(?:de\s+)?)?(pr[ée]paration|cuisson|repos|total|dur[ée]e)\b[^\d\n]*\d/i;
const DIFFICULTY_LINE = /^difficult[ée]\s*:?\s*(?:tr[èe]s\s+)?(facile|moyen(?:ne)?|difficile)/i;

const INFINITIVES = new Set(
  "melanger ajouter verser cuire couper eplucher mixer prechauffer battre faire laisser mettre servir deposer etaler enfourner incorporer fouetter hacher emincer rotir saisir reserver decouper laver rincer egoutter chauffer".split(" ")
);

const words = (value: string) => value.split(/\s+/).filter(Boolean);

function isImperative(word: string) {
  const plain = normalizeKey(word);
  return /^[a-z]{3,}ez(?:-\S+)?$/.test(plain) || plain === "faites" || INFINITIVES.has(plain);
}

const isSentence = (line: string) => /[.!?…]$/.test(line);
const looksLikeTitle = (line: string) =>
  words(line).length <= 12 &&
  !/[.!?:…]$/.test(line) &&
  !isImperative(words(line)[0] ?? "") &&
  !ING_HEADER.test(line) &&
  !STEP_HEADER.test(line);
const isGroupHeader = (line: string) =>
  (/:$/.test(line) && words(line).length <= 8) ||
  (/^pour\s+(?:la|le|les|l['’]|une?|des|du)\s/i.test(line) && words(line).length <= 7 && !isSentence(line));

function isStrongIngredient(line: string) {
  const count = words(line).length;
  // Une ligne qui commence par une quantité peut être longue (« 250 g de farine + un peu plus pour… ») ;
  // une phrase qui se termine par un point, en revanche, est une étape.
  if (count > 40 || NUMBERED_STEP.test(line) || NOT_AN_INGREDIENT.test(line)) return false;
  if (isSentence(line) && count > 8) return false;
  return QTY_RE.test(line) || SPECIAL_QTY.test(line) || MODIFIER_RE.test(line);
}

function isWeakIngredient(line: string) {
  return (
    words(line).length <= 6 &&
    !/[.!?:…]$/.test(line) &&
    !isImperative(words(line)[0] ?? "") &&
    !NUMBERED_STEP.test(line) &&
    !STEP_HEADER.test(line)
  );
}

const isIngredientLike = (line: string) => isGroupHeader(line) || isStrongIngredient(line) || isWeakIngredient(line);

// ── Durées ──────────────────────────────────────────────────────────────────
function durationsInMinutes(text: string): number[] {
  const re =
    /(\d+)\s*(?:h|heures?)(?![a-zà-ÿ])(?:(\d{2})(?!\d)|\s+(\d{1,2})\s*(?:min(?:utes?)?|mn)(?![a-zà-ÿ]))?|(\d+(?:[.,]\d+)?)\s*(?:min(?:utes?)?|mn)(?![a-zà-ÿ])/gi;
  const result: number[] = [];
  for (const match of text.matchAll(re)) {
    if (match[1] !== undefined) result.push(Number(match[1]) * 60 + Number(match[2] ?? match[3] ?? 0));
    else result.push(Math.round(Number(match[4].replace(",", "."))));
  }
  return result;
}

function formatMinutes(total: number) {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${hours} h`;
}

// ── Titre et étapes ─────────────────────────────────────────────────────────
function formatTitle(line: string) {
  let title = line.replace(/^recette\s*:\s*/i, "").replace(/^[“"«]\s*|\s*[”"»]$/g, "").trim();
  if (/[A-ZÀ-Ý]/.test(title) && title === title.toUpperCase()) title = title.toLowerCase();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const TRAILING_CONNECTORS = /\s+(?:et|puis|de|du|des|la|le|les|l['’]|d['’]|à|au|aux|en|un|une|pour|avec|ou|dans|sur)$/i;

/** Titre court d'une étape : le début de sa première phrase. */
function stepTitle(instruction: string) {
  const sentence = instruction.match(/^.+?[.!?](?:\s|$)/)?.[0] ?? instruction;
  let head = words(sentence).slice(0, 8).join(" ");
  const comma = head.indexOf(",");
  if (comma > 0) head = head.slice(0, comma);
  head = head.replace(/[\s,;:.!?…]+$/, "");
  while (TRAILING_CONNECTORS.test(head)) head = head.replace(TRAILING_CONNECTORS, "");
  return head.charAt(0).toUpperCase() + head.slice(1);
}

const TIP_RE = /^(astuce|conseil|note|remarque|variante|bon à savoir)\s*:\s*/i;

/** Regroupe les lignes en étapes : une étape par paragraphe, les lignes coupées par l'OCR sont recollées. */
function buildSteps(lines: string[]) {
  const instructions: string[] = [];
  for (const line of lines) {
    if (STEP_HEADER.test(line)) continue;
    const numbered = NUMBERED_STEP.test(line);
    const text = line.replace(NUMBERED_STEP, "").trim();
    if (!text) continue;
    const previous = instructions[instructions.length - 1];
    const continuation = !numbered && previous !== undefined && !/[.!?…:]$/.test(previous) && /^[a-zà-ÿ]/.test(text);
    if (continuation) instructions[instructions.length - 1] = `${previous} ${text}`;
    else instructions.push(text);
  }
  return instructions.map((instruction) => {
    // « Astuce : … » devient une étape intitulée « Astuce »
    const tip = instruction.match(TIP_RE);
    if (tip && instruction.length > tip[0].length) {
      const label = tip[1].charAt(0).toUpperCase() + tip[1].slice(1).toLowerCase();
      return { title: label, instruction: instruction.slice(tip[0].length) };
    }
    return { title: stepTitle(instruction), instruction };
  });
}

// ── Une ligne d'ingrédient ──────────────────────────────────────────────────
function withPreposition(head: string, name: string) {
  return /^[aeiouyhàâéèêëîïôûœ]/i.test(name) ? `${head} d’${name}` : `${head} de ${name}`;
}

function parseIngredientLine(line: string): { quantity: string; name: string } | null {
  let rest = line.replace(/\s+/g, " ").trim().replace(/[;,.]+$/, "").trim();
  if (!rest) return null;

  // « 250 g de farine + un peu plus pour saupoudrer… » : ce qui suit le « + » devient une précision entre parenthèses
  let note = "";
  const plus = rest.indexOf(" + ");
  if (plus > 0) {
    note = rest.slice(plus + 1).trim();
    rest = rest.slice(0, plus).trim();
  }

  let modifier = "";
  const modifierMatch = rest.match(MODIFIER_RE);
  if (modifierMatch) {
    modifier = modifierMatch[1].toLowerCase();
    rest = rest.slice(modifierMatch[0].length).trim();
  }

  const quantityParts: string[] = [];
  const takeUnit = () => {
    const unit = rest.match(UNIT_RE);
    if (!unit) return;
    quantityParts.push(unit[0].trim().replace(/\.$/, ""));
    rest = rest.slice(unit[0].length);
  };

  const special = rest.match(SPECIAL_QTY);
  if (special) {
    quantityParts.push(special[1].toLowerCase());
    rest = rest.slice(special[0].length);
  } else {
    const quantity = rest.match(QTY_RE);
    const one = quantity ? null : rest.match(/^(?:un|une)\s+(?=\S)/i);
    if (quantity) {
      quantityParts.push(quantity[1].replace(/\s+/g, " ").trim());
      rest = rest.slice(quantity[0].length);
      takeUnit();
    } else if (one) {
      quantityParts.push("1");
      rest = rest.slice(one[0].length);
      takeUnit();
    }
  }

  rest = rest.replace(LEADING_DE, "");
  if (quantityParts.length === 0) rest = rest.replace(LEADING_ARTICLE, "");
  let name = rest.trim().toLowerCase();
  if (!name) return null;
  if (modifier) name = withPreposition(modifier, name);
  if (note) name = `${name} (${note})`;

  return { quantity: quantityParts.join(" ").trim() || "au goût", name };
}

// ── Rapprochement avec les ingrédients connus ───────────────────────────────
export function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Mots sans importance pour comparer deux ingrédients
const STOP = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "au", "aux", "en", "et", "a", "un", "une"]);
// Qualificatifs qui ne changent pas l'ingrédient : « poivre du moulin » = « poivre »
const SAFE = new Set(
  "bio frais fraiche non traite traitee moulin moulu moulue entier entiere mur mure gros grosse petit petite fin fine doux douce bien quelque rape rapee hache hachee emince emincee cisele ciselee".split(" ")
);

/** Sépare une précision finale entre parenthèses : « farine (+ un peu plus) » → { main: « farine », note: « (+ un peu plus) » }. */
export function splitNote(name: string) {
  const match = name.trim().match(/^(.*?)\s*(\([^)]*\))$/);
  return match ? { main: match[1].trim(), note: match[2] } : { main: name.trim(), note: "" };
}

/** Remplace le nom d'un ingrédient en conservant sa précision entre parenthèses. */
export function replaceMainName(name: string, known: string) {
  const { note } = splitNote(name);
  return note ? `${known} ${note}` : known;
}

const singular = (token: string) => (token.length > 3 && /[sx]$/.test(token) && !token.endsWith("ss") ? token.slice(0, -1) : token);
const tokensOf = (key: string) => key.split(" ").filter(Boolean).map(singular);
const coreOf = (key: string) => new Set(tokensOf(key).filter((token) => !STOP.has(token) && !SAFE.has(token)));

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((item) => b.has(item));
const isSubset = (small: Set<string>, large: Set<string>) => [...small].every((item) => large.has(item));

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

export interface IngredientIndex {
  byKey: Map<string, string>;
  entries: { name: string; core: Set<string> }[];
}

export function buildIngredientIndex(names: string[]): IngredientIndex {
  const byKey = new Map<string, string>();
  const entries: IngredientIndex["entries"] = [];
  for (const name of names) {
    const key = normalizeKey(splitNote(name).main);
    const canonical = tokensOf(key).join(" ");
    if (!canonical || byKey.has(canonical)) continue;
    byKey.set(canonical, name);
    entries.push({ name, core: coreOf(key) });
  }
  return { byKey, entries };
}

export interface IngredientMatch {
  known: string;
  /** exact : même ingrédient (pluriel, accents, « bio », « du moulin »… près) ; suggest : ingrédient proche. */
  level: "exact" | "suggest";
}

export function matchIngredient(name: string, index: IngredientIndex): IngredientMatch | null {
  const key = normalizeKey(splitNote(name).main);
  if (!key) return null;

  const direct = index.byKey.get(tokensOf(key).join(" "));
  if (direct) return { known: direct, level: "exact" };

  const core = coreOf(key);
  if (core.size === 0) return null;

  let best: { name: string; score: number } | null = null;
  for (const entry of index.entries) {
    if (entry.core.size === 0) continue;
    let score = 0;
    if (sameSet(core, entry.core)) {
      score = 1;
    } else if (isSubset(entry.core, core) || isSubset(core, entry.core)) {
      score = (Math.min(core.size, entry.core.size) / Math.max(core.size, entry.core.size)) * 0.9;
    } else if (core.size === 1 && entry.core.size === 1) {
      // Faute de frappe ou d'OCR : « ricota » ≈ « ricotta »
      const a = [...core][0];
      const b = [...entry.core][0];
      const allowed = Math.max(a.length, b.length) >= 9 ? 2 : 1;
      if (Math.min(a.length, b.length) >= 5 && levenshtein(a, b) <= allowed) score = 0.85;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && entry.name.length < best.name.length))) {
      best = { name: entry.name, score };
    }
  }

  if (!best || best.score < 0.4) return null;
  return { known: best.name, level: best.score === 1 ? "exact" : "suggest" };
}

// ── Analyse complète ────────────────────────────────────────────────────────
export function parseRecipeText(raw: string, knownIngredients: string[]): ParsedRecipe {
  const index = buildIngredientIndex(knownIngredients);

  // 1. Métadonnées (personnes, temps, difficulté) : on les retire du texte
  let servings: number | null = null;
  let difficulty: ParsedRecipe["difficulty"] = null;
  const times: Record<string, number> = {};
  const lines: string[] = [];

  for (const line of cleanOcrText(raw).split("\n")) {
    const servingsMatch = line.match(SERVINGS_LINE) ?? line.match(SERVINGS_LABEL) ?? line.match(SERVINGS_BARE);
    if (servingsMatch) {
      servings ??= Number(servingsMatch[1]);
      continue;
    }
    const timeMatch = line.match(TIME_LINE);
    if (timeMatch) {
      const label = timeMatch[1].toLowerCase().replace("é", "e");
      times[label.startsWith("prep") ? "prep" : label] = durationsInMinutes(line).reduce((sum, value) => sum + value, 0);
      continue;
    }
    const difficultyMatch = line.match(DIFFICULTY_LINE);
    if (difficultyMatch) {
      const level = difficultyMatch[1].toLowerCase();
      difficulty = level.startsWith("fac") ? "Facile" : level.startsWith("moy") ? "Moyen" : "Difficile";
      continue;
    }
    if (ING_HEADER.test(line)) servings ??= Number(line.match(SERVINGS_ANYWHERE)?.[1]) || null;
    lines.push(line);
  }

  // 2. Découpage : en-tête (titre…), ingrédients, étapes
  const ingHeader = lines.findIndex((line) => ING_HEADER.test(line) && words(line).length <= 8);
  const stepHeader = lines.findIndex((line, i) => i > ingHeader && STEP_HEADER.test(line));
  const ingStart = ingHeader >= 0 ? ingHeader + 1 : lines.findIndex(isStrongIngredient);

  let head: string[] = [];
  let ingredientLines: string[] = [];
  let stepLines: string[] = [];

  if (ingStart >= 0) {
    let ingEnd: number;
    if (stepHeader >= ingStart) {
      ingEnd = stepHeader;
    } else {
      ingEnd = ingStart;
      while (ingEnd < lines.length && isIngredientLike(lines[ingEnd])) ingEnd++;
    }
    head = lines.slice(0, ingHeader >= 0 ? ingHeader : ingStart);
    ingredientLines = lines.slice(ingStart, ingEnd);
    stepLines = lines.slice(stepHeader >= ingStart ? stepHeader + 1 : ingEnd);
  } else {
    // Pas d'ingrédients reconnus : tout le texte est considéré comme des étapes (titre mis à part)
    head = lines.length > 1 && stepHeader < 0 && looksLikeTitle(lines[0]) ? lines.slice(0, 1) : [];
    stepLines = lines.slice(Math.max(head.length, stepHeader + 1));
  }

  // 3. Titre et description
  let title = "";
  let description = "";
  const first = head[0];
  const firstLooksLikeTitle = first !== undefined && looksLikeTitle(first);
  if (firstLooksLikeTitle) title = formatTitle(first);
  description = head
    .slice(firstLooksLikeTitle ? 1 : 0)
    .filter((line) => words(line).length >= 6 && isSentence(line))
    .join(" ");

  // 4. Ingrédients, avec rapprochement des ingrédients connus
  const ingredients = ingredientLines
    .filter((line) => !isGroupHeader(line))
    .map(parseIngredientLine)
    .filter((ingredient): ingredient is { quantity: string; name: string } => ingredient !== null)
    .map((ingredient) => {
      const match = matchIngredient(ingredient.name, index);
      return match?.level === "exact" ? { ...ingredient, name: replaceMainName(ingredient.name, match.known) } : ingredient;
    });

  // 5. Étapes et temps
  const steps = buildSteps(stepLines);

  let time = "";
  let timeEstimated = false;
  const explicit = times.total ?? times.duree ?? ((times.prep ?? 0) + (times.cuisson ?? 0) + (times.repos ?? 0) || 0);
  if (explicit > 0) {
    time = formatMinutes(explicit);
  } else {
    const estimate = steps.flatMap((step) => durationsInMinutes(step.instruction)).reduce((sum, value) => sum + value, 0);
    if (estimate > 0) {
      time = formatMinutes(estimate);
      timeEstimated = true;
    }
  }

  return { title, description, servings, time, timeEstimated, difficulty, ingredients, steps };
}
