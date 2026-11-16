import { useMemo, useRef, useState, type ReactNode } from "react";
import type { Recipe } from "./App";
import {
  PLACEHOLDER_IMAGE,
  buildIngredientIndex,
  matchIngredient,
  parseRecipeText,
  replaceMainName,
  splitNote,
  type IngredientIndex,
} from "./recipeText";

interface DraftIngredient {
  id: number;
  quantity: string;
  name: string;
}

interface DraftStep {
  id: number;
  title: string;
  instruction: string;
}

const fieldCls =
  "w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition";

const iconBtn =
  "shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg">{title}</h2>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Indique si l'ingrédient existe déjà dans la liste, ou propose l'ingrédient existant le plus proche. */
function MatchStatus({ name, index, onUse }: { name: string; index: IngredientIndex; onUse: (known: string) => void }) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const match = matchIngredient(trimmed, index);
  if (!match) return <span className="text-xs text-[var(--muted-foreground)]">Nouvel ingrédient</span>;

  // La précision entre parenthèses (« farine (+ un peu plus) ») ne compte pas dans la comparaison
  if (match.known.trim().toLowerCase() === splitNote(trimmed).main.toLowerCase()) {
    return <span className="text-xs font-medium text-[var(--primary)]">✓ Dans votre liste</span>;
  }

  return (
    <span className="text-xs text-[var(--secondary)]">
      {match.level === "exact" ? "Équivaut à" : "Proche de"} « {match.known} »{" "}
      <button type="button" onClick={() => onUse(match.known)} className="font-medium underline hover:no-underline">
        Utiliser
      </button>
    </span>
  );
}

export default function TextImportView({
  knownIngredients,
  knownTags,
  onCancel,
  onCreate,
}: {
  knownIngredients: string[];
  knownTags: string[];
  onCancel: () => void;
  onCreate: (recipe: Omit<Recipe, "id">) => void;
}) {
  const [phase, setPhase] = useState<"input" | "review">("input");
  const [raw, setRaw] = useState("");
  const [pasteError, setPasteError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("4");
  const [time, setTime] = useState("");
  const [timeEstimated, setTimeEstimated] = useState(false);
  const [difficulty, setDifficulty] = useState<Recipe["difficulty"]>("Facile");
  const [tags, setTags] = useState("");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const nextId = useRef(1);

  const index = useMemo(() => buildIngredientIndex(knownIngredients), [knownIngredients]);

  function analyse() {
    const parsed = parseRecipeText(raw, knownIngredients);
    setTitle(parsed.title);
    setDescription(parsed.description);
    setServings(String(parsed.servings ?? 4));
    setTime(parsed.time);
    setTimeEstimated(parsed.timeEstimated);
    setDifficulty(parsed.difficulty ?? "Facile");
    setTags("");
    setIngredients(parsed.ingredients.map((ingredient) => ({ id: nextId.current++, ...ingredient })));
    setSteps(parsed.steps.map((step) => ({ id: nextId.current++, ...step })));
    setPhase("review");
    window.scrollTo({ top: 0 });
  }

  async function pasteFromClipboard() {
    setPasteError("");
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setRaw(text);
      else setPasteError("Le presse-papiers est vide.");
    } catch {
      setPasteError("Collage automatique impossible : appuyez longuement dans la zone de texte, puis « Coller ».");
    }
  }

  // ── Ingrédients ──
  const updateIngredient = (id: number, patch: Partial<DraftIngredient>) =>
    setIngredients((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const addIngredient = () =>
    setIngredients((current) => [...current, { id: nextId.current++, quantity: "", name: "" }]);

  // ── Étapes ──
  const updateStep = (id: number, patch: Partial<DraftStep>) =>
    setSteps((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const addStep = () => setSteps((current) => [...current, { id: nextId.current++, title: "", instruction: "" }]);

  function moveStep(position: number, direction: -1 | 1) {
    setSteps((current) => {
      const target = position + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[position], next[target]] = [next[target], next[position]];
      return next;
    });
  }

  // ── Création ──
  const validIngredients = ingredients.filter((item) => item.name.trim());
  const validSteps = steps.filter((item) => item.instruction.trim());
  const knownCount = validIngredients.filter(
    (item) => matchIngredient(item.name, index)?.known.trim().toLowerCase() === splitNote(item.name).main.toLowerCase()
  ).length;
  const canCreate = title.trim() !== "" && validIngredients.length > 0 && validSteps.length > 0;

  function create() {
    if (!canCreate) return;
    onCreate({
      title: title.trim(),
      image: PLACEHOLDER_IMAGE,
      time: time.trim(),
      servings: Math.max(1, Math.round(Number(servings)) || 4),
      difficulty,
      tags: Array.from(
        new Set(
          tags
            .split(/[,;]/)
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean)
        )
      ),
      ingredients: validIngredients.map((item) => ({ name: item.name.trim(), quantity: item.quantity.trim() })),
      description: description.trim(),
      steps: validSteps.map((item) => ({
        title: item.title.trim() || item.instruction.trim().split(/\s+/).slice(0, 5).join(" "),
        instruction: item.instruction.trim(),
        photos: [],
      })),
    });
  }

  return (
    <div className="min-h-screen bg-[var(--background)] pb-28">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            ← Retour
          </button>
          <h1 className="font-display min-w-0 flex-1 truncate text-xl">Recette depuis du texte</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {phase === "input" ? (
          <>
            <Section
              title="Collez le texte de la recette"
              hint="Le titre (s'il y en a un), les ingrédients et les étapes seront reconnus automatiquement ; vous pourrez tout corriger avant de créer la recette."
            >
              <textarea
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                rows={14}
                placeholder={"350 g de potimarron\n50 g de ricotta\n…\nÉpluchez le potimarron…"}
                aria-label="Texte de la recette"
                className={`${fieldCls} font-mono text-[13px] leading-relaxed`}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={pasteFromClipboard}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  Coller depuis le presse-papiers
                </button>
                {raw && (
                  <button type="button" onClick={() => setRaw("")} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--accent)]">
                    Effacer
                  </button>
                )}
              </div>
              {pasteError && <p className="text-xs text-[var(--accent)]">{pasteError}</p>}
            </Section>

            <div className="space-y-1 rounded-2xl bg-[var(--muted)] p-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
              <p className="font-medium text-[var(--foreground)]">Sur iPhone</p>
              <p>
                Ouvrez l'appareil photo et visez la recette, touchez le bouton « Texte en direct » (en bas à droite), faites « Tout
                sélectionner » puis « Copier ». Revenez ici et collez. Cela fonctionne aussi avec une capture d'écran ou une photo (touchez le
                bouton « Texte en direct » dans Photos).
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-4 py-3 text-sm">
              <p className="min-w-0 flex-1">
                Vérifiez et corrigez, puis créez la recette. Vous pourrez ajouter une photo ensuite avec « Modifier ».
              </p>
              <button type="button" onClick={() => setPhase("input")} className="shrink-0 text-xs text-[var(--primary)] hover:underline">
                ← Modifier le texte
              </button>
            </div>

            <Section title="Informations">
              <div className="space-y-1">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Titre de la recette"
                  aria-label="Titre de la recette"
                  className={`${fieldCls} ${title.trim() ? "" : "border-[var(--accent)]"}`}
                />
                {!title.trim() && <p className="text-xs text-[var(--accent)]">Aucun titre trouvé dans le texte : saisissez-le.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs text-[var(--muted-foreground)]">
                  Personnes
                  <input type="number" min={1} value={servings} onChange={(event) => setServings(event.target.value)} className={fieldCls} />
                </label>
                <label className="space-y-1 text-xs text-[var(--muted-foreground)]">
                  Temps
                  <input type="text" value={time} onChange={(event) => setTime(event.target.value)} placeholder="ex : 35 min" className={fieldCls} />
                </label>
                <label className="col-span-2 space-y-1 text-xs text-[var(--muted-foreground)] sm:col-span-1">
                  Difficulté
                  <select
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value as Recipe["difficulty"])}
                    className={fieldCls}
                  >
                    <option value="Facile">Facile</option>
                    <option value="Moyen">Moyen</option>
                    <option value="Difficile">Difficile</option>
                  </select>
                </label>
              </div>
              {timeEstimated && time && (
                <p className="text-xs text-[var(--muted-foreground)]">Temps estimé en additionnant les durées citées dans les étapes.</p>
              )}

              <input
                type="text"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                list="text-import-tags"
                placeholder="Tags séparés par des virgules (ex : végétarien, entrée)"
                aria-label="Tags"
                className={fieldCls}
              />
              <datalist id="text-import-tags">
                {knownTags.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                placeholder="Description (facultatif)"
                aria-label="Description"
                className={fieldCls}
              />
            </Section>

            <Section
              title={`Ingrédients (${validIngredients.length})`}
              hint={
                validIngredients.length > 0
                  ? `${knownCount} déjà dans votre liste, ${validIngredients.length - knownCount} à vérifier ou nouveau${validIngredients.length - knownCount > 1 ? "x" : ""}.`
                  : "Aucun ingrédient reconnu : ajoutez-les ci-dessous."
              }
            >
              <ul className="space-y-2">
                {ingredients.map((item) => (
                  <li key={item.id} className="space-y-1.5 rounded-xl border border-[var(--border)] p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.quantity}
                        onChange={(event) => updateIngredient(item.id, { quantity: event.target.value })}
                        placeholder="Quantité"
                        aria-label="Quantité"
                        className={`${fieldCls} !w-28 shrink-0`}
                      />
                      <input
                        type="text"
                        value={item.name}
                        onChange={(event) => updateIngredient(item.id, { name: event.target.value })}
                        list="text-import-ingredients"
                        placeholder="Ingrédient"
                        aria-label="Ingrédient"
                        className={`${fieldCls} min-w-0 flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() => setIngredients((current) => current.filter((other) => other.id !== item.id))}
                        aria-label="Supprimer l'ingrédient"
                        className={iconBtn}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="px-1">
                      <MatchStatus
                        name={item.name}
                        index={index}
                        onUse={(known) => updateIngredient(item.id, { name: replaceMainName(item.name, known) })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <datalist id="text-import-ingredients">
                {knownIngredients.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <button type="button" onClick={addIngredient} className="text-xs text-[var(--primary)] hover:underline">
                + Ajouter un ingrédient
              </button>
            </Section>

            <Section title={`Étapes (${validSteps.length})`} hint="Une étape par paragraphe. Le titre court est proposé d'après le début de la phrase.">
              <ol className="space-y-3">
                {steps.map((step, position) => (
                  <li key={step.id} className="space-y-2 rounded-xl border border-[var(--border)] p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-medium text-[var(--primary-foreground)]">
                        {position + 1}
                      </span>
                      <input
                        type="text"
                        value={step.title}
                        onChange={(event) => updateStep(step.id, { title: event.target.value })}
                        placeholder="Titre de l'étape"
                        aria-label="Titre de l'étape"
                        className={`${fieldCls} min-w-0 flex-1`}
                      />
                      <button type="button" onClick={() => moveStep(position, -1)} disabled={position === 0} aria-label="Monter" className={iconBtn}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(position, 1)}
                        disabled={position === steps.length - 1}
                        aria-label="Descendre"
                        className={iconBtn}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => setSteps((current) => current.filter((other) => other.id !== step.id))}
                        aria-label="Supprimer l'étape"
                        className={iconBtn}
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={step.instruction}
                      onChange={(event) => updateStep(step.id, { instruction: event.target.value })}
                      rows={Math.min(10, Math.max(3, Math.ceil(step.instruction.length / 55)))}
                      aria-label="Texte de l'étape"
                      className={fieldCls}
                    />
                  </li>
                ))}
              </ol>
              <button type="button" onClick={addStep} className="text-xs text-[var(--primary)] hover:underline">
                + Ajouter une étape
              </button>
            </Section>
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {phase === "input" ? (
            <button
              type="button"
              onClick={analyse}
              disabled={!raw.trim()}
              className="flex-1 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Analyser le texte
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={create}
                disabled={!canCreate}
                className="flex-1 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Créer la recette
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
