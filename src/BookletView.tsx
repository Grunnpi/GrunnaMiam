import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PreferenceList, Recipe } from "./App";
import "./booklet.css";

// ── Constantes de mise en page ──────────────────────────────────────────────
const MM = 96 / 25.4; // pixels CSS par millimètre
const PAGE_W_MM = 148; // A5
const PAGE_H_MM = 210;
const SHEET_W_MM = 297; // A4 paysage = deux pages A5
const TOC_PER_PAGE = 24;

type Layout = "booklet" | "sequential";

interface Options {
  title: string;
  cover: boolean;
  toc: boolean;
  mainPhoto: boolean;
  stepPhotos: boolean;
  sort: "title" | "app";
  layout: Layout;
}

type PageSpec =
  | { kind: "cover" }
  | { kind: "toc"; entries: { title: string; page: number }[]; continued: boolean }
  | { kind: "recipe"; title: string; keys: string[]; continued: boolean }
  | { kind: "notes" }
  | { kind: "back" };

interface Block {
  key: string;
  recipeId: number;
  node: ReactNode;
}

interface PageContext {
  nodeByKey: Map<string, ReactNode>;
  title: string;
  recipeCount: number;
  coverImages: string[];
  dateLabel: string;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// ── Contenu des blocs d'une recette ─────────────────────────────────────────
function buildBlocks(recipe: Recipe, options: Pick<Options, "mainPhoto" | "stepPhotos">): Block[] {
  const blocks: Block[] = [];

  const meta = [
    recipe.time ? `Temps : ${recipe.time}` : "",
    `${recipe.servings} personne${recipe.servings > 1 ? "s" : ""}`,
    recipe.difficulty,
  ].filter(Boolean);

  blocks.push({
    key: `${recipe.id}:head`,
    recipeId: recipe.id,
    node: (
      <div>
        {recipe.tags.length > 0 && <p className="bk-kicker">{recipe.tags.slice(0, 4).join(" · ")}</p>}
        <h2 className="bk-title font-display">{recipe.title}</h2>
        <p className="bk-meta">
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
        {options.mainPhoto && recipe.image && <img className="bk-photo" src={recipe.image} alt="" />}
        {recipe.description && <p className="bk-desc">{recipe.description}</p>}
      </div>
    ),
  });

  if (recipe.ingredients.length > 0) {
    blocks.push({
      key: `${recipe.id}:ingredients`,
      recipeId: recipe.id,
      node: (
        <div className="bk-ing">
          <h3 className="bk-h3">Ingrédients</h3>
          <ul className={recipe.ingredients.length > 8 ? "bk-cols" : undefined}>
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index}>
                <span className="bk-qty">{ingredient.quantity}</span>
                <span>{ingredient.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  recipe.steps.forEach((step, index) => {
    const photos = options.stepPhotos ? step.photos.filter(Boolean).slice(0, 6) : [];
    blocks.push({
      key: `${recipe.id}:step:${index}`,
      recipeId: recipe.id,
      node: (
        <div>
          {index === 0 && <h3 className="bk-h3">Préparation</h3>}
          <div className="bk-step">
            <div className="bk-step-n">{index + 1}</div>
            <div>
              {step.title && <h4>{step.title}</h4>}
              <p>{step.instruction}</p>
              {photos.length > 0 && (
                <div className={`bk-photos bk-photos-${Math.min(photos.length, 3)}`}>
                  {photos.map((photo, photoIndex) => (
                    <img key={photoIndex} src={photo} alt="" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    });
  });

  return blocks;
}

// ── Une page A5 ─────────────────────────────────────────────────────────────
function PageView({ spec, index, ctx }: { spec: PageSpec; index: number; ctx: PageContext }) {
  // Page 1 (index 0) = page de droite ; la marge de reliure alterne ensuite.
  const side = index % 2 === 0 ? "bk-right" : "bk-left";
  const number = index + 1;

  let content: ReactNode = null;
  let footerTitle = "";
  let showFooter = true;

  switch (spec.kind) {
    case "cover":
      showFooter = false;
      content = (
        <div className="bk-cover">
          <div className="bk-cover-frame">
            <p className="bk-kicker">Recettes</p>
            <h1 className="bk-cover-title font-display">{ctx.title}</h1>
            <div className="bk-rule" />
            <p className="bk-cover-sub">
              {ctx.recipeCount} recette{ctx.recipeCount > 1 ? "s" : ""} · {ctx.dateLabel}
            </p>
          </div>
          {ctx.coverImages.length > 0 && (
            <div className="bk-cover-photos">
              {ctx.coverImages.map((src, i) => (
                <img key={i} src={src} alt="" />
              ))}
            </div>
          )}
        </div>
      );
      break;

    case "toc":
      content = (
        <div className="bk-toc">
          <h2 className="bk-title font-display" style={{ marginBottom: "5mm" }}>
            {spec.continued ? "Sommaire (suite)" : "Sommaire"}
          </h2>
          <ol>
            {spec.entries.map((entry, i) => (
              <li key={i}>
                <span className="bk-toc-t">{entry.title}</span>
                <span className="bk-toc-dots" />
                <span>{entry.page}</span>
              </li>
            ))}
          </ol>
        </div>
      );
      break;

    case "recipe":
      footerTitle = spec.title;
      content = spec.keys.map((key) => (
        <div key={key} className="bk-block">
          {ctx.nodeByKey.get(key)}
        </div>
      ));
      break;

    case "notes":
      content = (
        <div>
          <h2 className="bk-title font-display" style={{ marginBottom: "5mm" }}>
            Notes
          </h2>
          <div className="bk-lines" />
        </div>
      );
      break;

    case "back":
      showFooter = false;
      content = <div className="bk-back">{ctx.title}</div>;
      break;
  }

  return (
    <div className={`bk-page bk-body ${side}`}>
      <div className="bk-content">{content}</div>
      {showFooter && (
        <div className="bk-footer">
          <span className="bk-footer-title">{footerTitle}</span>
          <span>{number}</span>
        </div>
      )}
    </div>
  );
}

// ── Écran du livret ─────────────────────────────────────────────────────────
function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--primary)]"
      />
      {children}
    </label>
  );
}

const fieldCls =
  "w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition";

export default function BookletView({
  recipes,
  preferenceLists,
  onClose,
}: {
  recipes: Recipe[];
  preferenceLists: PreferenceList[];
  onClose: () => void;
}) {
  const [options, setOptions] = useState<Options>({
    title: "Mon livre de recettes",
    cover: true,
    toc: true,
    mainPhoto: true,
    stepPhotos: true,
    sort: "title",
    layout: "booklet",
  });
  const [selected, setSelected] = useState<Set<number>>(() => new Set(recipes.map((recipe) => recipe.id)));
  const [query, setQuery] = useState("");
  const [previewWidth, setPreviewWidth] = useState(800);

  const previewRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Map<string, number> | null>(null);
  const [capacity, setCapacity] = useState(0);

  const setOption = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  // ── Recettes choisies ────────────────────────────────────────────────────
  const selectedRecipes = useMemo(() => {
    const chosen = recipes.filter((recipe) => selected.has(recipe.id));
    return options.sort === "title"
      ? [...chosen].sort((a, b) => a.title.localeCompare(b.title, "fr"))
      : chosen;
  }, [recipes, selected, options.sort]);

  const checklist = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return [...recipes]
      .sort((a, b) => a.title.localeCompare(b.title, "fr"))
      .filter((recipe) => words.every((word) => normalize(recipe.title).includes(word)));
  }, [recipes, query]);

  // ── Blocs de contenu et mesure de leur hauteur ───────────────────────────
  const blocksByRecipe = useMemo(() => {
    const map = new Map<number, Block[]>();
    for (const recipe of selectedRecipes) {
      map.set(recipe.id, buildBlocks(recipe, { mainPhoto: options.mainPhoto, stepPhotos: options.stepPhotos }));
    }
    return map;
  }, [selectedRecipes, options.mainPhoto, options.stepPhotos]);

  const blocks = useMemo(() => Array.from(blocksByRecipe.values()).flat(), [blocksByRecipe]);

  const nodeByKey = useMemo(() => new Map(blocks.map((block) => [block.key, block.node] as const)), [blocks]);

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      const root = measureRef.current;
      const probe = probeRef.current;
      if (cancelled || !root || !probe) return;
      const next = new Map<string, number>();
      root.querySelectorAll<HTMLElement>("[data-bk-key]").forEach((element) => {
        next.set(element.dataset.bkKey!, element.getBoundingClientRect().height);
      });
      setHeights(next);
      setCapacity(probe.getBoundingClientRect().height);
    };
    measure();
    // Les polices web changent la hauteur du texte : on remesure quand elles sont prêtes.
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [blocks]);

  // ── Pagination des recettes ──────────────────────────────────────────────
  const paginated = useMemo(() => {
    if (!heights || capacity <= 0) return null;
    const pages: Extract<PageSpec, { kind: "recipe" }>[] = [];
    const starts = new Map<number, number>();
    const tooTall = new Set<string>();

    for (const recipe of selectedRecipes) {
      let current: Extract<PageSpec, { kind: "recipe" }> | null = null;
      let used = 0;
      let count = 0;
      for (const block of blocksByRecipe.get(recipe.id) ?? []) {
        const height = heights.get(block.key) ?? 0;
        if (!current || (current.keys.length > 0 && used + height > capacity - 1)) {
          current = { kind: "recipe", title: recipe.title, keys: [], continued: count > 0 };
          if (count === 0) starts.set(recipe.id, pages.length);
          pages.push(current);
          used = 0;
          count++;
        }
        current.keys.push(block.key);
        used += height;
        if (height > capacity) tooTall.add(recipe.title);
      }
    }
    return { pages, starts, tooTall: Array.from(tooTall) };
  }, [heights, capacity, selectedRecipes, blocksByRecipe]);

  // ── Assemblage : couverture, sommaire, recettes, pages de notes, dos ─────
  const pages = useMemo<PageSpec[] | null>(() => {
    if (!paginated) return null;
    const front: PageSpec[] = [];
    if (options.cover) front.push({ kind: "cover" });

    const tocCount = options.toc && selectedRecipes.length > 0 ? Math.ceil(selectedRecipes.length / TOC_PER_PAGE) : 0;
    const offset = front.length + tocCount;
    const entries = selectedRecipes.map((recipe) => ({
      title: recipe.title,
      page: offset + (paginated.starts.get(recipe.id) ?? 0) + 1,
    }));
    for (let i = 0; i < tocCount; i++) {
      front.push({ kind: "toc", entries: entries.slice(i * TOC_PER_PAGE, (i + 1) * TOC_PER_PAGE), continued: i > 0 });
    }

    const base: PageSpec[] = [...front, ...paginated.pages];
    if (options.layout === "sequential" || base.length === 0) return base;

    // Cahier : le nombre de pages doit être un multiple de 4 ; la dernière page est le dos.
    const total = Math.ceil((base.length + 1) / 4) * 4;
    const notes: PageSpec[] = Array.from({ length: total - base.length - 1 }, () => ({ kind: "notes" }) as PageSpec);
    return [...base, ...notes, { kind: "back" }];
  }, [paginated, options.cover, options.toc, options.layout, selectedRecipes]);

  // ── Faces imprimées : feuille recto/verso (cahier) ou page seule ─────────
  const units = useMemo(() => {
    if (!pages) return [];
    const count = pages.length;
    if (options.layout === "sequential") {
      return pages.map((_, i) => ({ label: `Page ${i + 1}`, slots: [i] }));
    }
    const result: { label: string; slots: number[] }[] = [];
    for (let sheet = 0; sheet < count / 4; sheet++) {
      result.push({ label: `Feuille ${sheet + 1} · recto`, slots: [count - 1 - 2 * sheet, 2 * sheet] });
      result.push({ label: `Feuille ${sheet + 1} · verso`, slots: [2 * sheet + 1, count - 2 - 2 * sheet] });
    }
    return result;
  }, [pages, options.layout]);

  // ── Aperçu à l'échelle ───────────────────────────────────────────────────
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const booklet = options.layout === "booklet";
  const unitWidth = (booklet ? SHEET_W_MM : PAGE_W_MM) * MM;
  const unitHeight = PAGE_H_MM * MM;
  const scale = booklet
    ? Math.max(0.2, Math.min(1, previewWidth / unitWidth))
    : Math.max(0.2, Math.min(0.9, (previewWidth - 18) / 2 / unitWidth));

  const ctx: PageContext = useMemo(
    () => ({
      nodeByKey,
      title: options.title.trim() || "Recettes",
      recipeCount: selectedRecipes.length,
      coverImages: options.mainPhoto
        ? selectedRecipes
            .map((recipe) => recipe.image)
            .filter(Boolean)
            .slice(0, 3)
        : [],
      dateLabel: new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    }),
    [nodeByKey, options.title, options.mainPhoto, selectedRecipes]
  );

  // ── Sélection ────────────────────────────────────────────────────────────
  function toggleRecipe(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectFromList(listId: number) {
    const list = preferenceLists.find((item) => item.id === listId);
    if (!list) return;
    const existing = new Set(recipes.map((recipe) => recipe.id));
    setSelected(new Set(list.recipeIds.filter((id) => existing.has(id))));
  }

  const pageCount = pages?.length ?? 0;
  const canPrint = pageCount > 0;

  return (
    <div className="bk-root min-h-screen bg-[var(--background)]">
      {/* Format de papier de l'impression */}
      <style>{`@page { size: ${booklet ? "A4 landscape" : "A5 portrait"}; margin: 0; }`}</style>

      <header className="bk-noprint sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            ← Retour
          </button>
          <h1 className="font-display min-w-0 flex-1 truncate text-xl">Livret de recettes</h1>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!canPrint}
            className="shrink-0 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Imprimer
          </button>
        </div>
      </header>

      <div className="bk-layout mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[22rem_1fr]">
        {/* ── Réglages ── */}
        <aside className="bk-noprint space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="font-display text-base">Mise en page</h2>

            <div className="space-y-2">
              {(
                [
                  ["booklet", "Cahier (A4 plié en deux)", "Feuilles A4 paysage, pages dans l'ordre d'imposition, à imprimer en recto verso puis à plier."],
                  ["sequential", "Pages A5 à la suite", "Une page A5 par page, dans l'ordre. Pour un PDF A5, ou si votre imprimante sait faire un livret."],
                ] as const
              ).map(([value, label, help]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm transition-colors ${
                    options.layout === value ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="layout"
                    checked={options.layout === value}
                    onChange={() => setOption("layout", value)}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-xs leading-relaxed text-[var(--muted-foreground)]">{help}</span>
                  </span>
                </label>
              ))}
            </div>

            <input
              type="text"
              value={options.title}
              onChange={(event) => setOption("title", event.target.value)}
              maxLength={80}
              placeholder="Titre du livret"
              aria-label="Titre du livret"
              className={fieldCls}
            />

            <div className="space-y-2">
              <Check checked={options.cover} onChange={(value) => setOption("cover", value)}>Couverture</Check>
              <Check checked={options.toc} onChange={(value) => setOption("toc", value)}>Sommaire</Check>
              <Check checked={options.mainPhoto} onChange={(value) => setOption("mainPhoto", value)}>Photo principale de chaque recette</Check>
              <Check checked={options.stepPhotos} onChange={(value) => setOption("stepPhotos", value)}>Photos des étapes</Check>
            </div>

            <select
              value={options.sort}
              onChange={(event) => setOption("sort", event.target.value as Options["sort"])}
              aria-label="Ordre des recettes"
              className={fieldCls}
            >
              <option value="title">Ordre alphabétique</option>
              <option value="app">Ordre de l'application</option>
            </select>
          </section>

          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-base">Recettes</h2>
              <span className="text-xs text-[var(--muted-foreground)]">
                {selected.size} sur {recipes.length}
              </span>
            </div>

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer par titre…"
              aria-label="Filtrer la liste par titre"
              autoComplete="off"
              className={fieldCls}
            />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              <button
                type="button"
                onClick={() => setSelected(new Set(recipes.map((recipe) => recipe.id)))}
                className="text-[var(--primary)] hover:underline"
              >
                Tout cocher
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-[var(--primary)] hover:underline">
                Tout décocher
              </button>
              {preferenceLists.length > 0 && (
                <select
                  value=""
                  onChange={(event) => event.target.value && selectFromList(Number(event.target.value))}
                  aria-label="Cocher uniquement les recettes d'une liste"
                  className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-xs"
                >
                  <option value="">Seulement une liste…</option>
                  {preferenceLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.recipeIds.length})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {checklist.map((recipe) => (
                <li key={recipe.id}>
                  <Check checked={selected.has(recipe.id)} onChange={() => toggleRecipe(recipe.id)}>
                    <span className="truncate">{recipe.title}</span>
                  </Check>
                </li>
              ))}
              {checklist.length === 0 && <li className="text-xs text-[var(--muted-foreground)]">Aucune recette correspondante.</li>}
            </ul>
          </section>

          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
            <p>
              <strong>{pageCount}</strong> page{pageCount > 1 ? "s" : ""} A5
              {booklet && pageCount > 0 && (
                <>
                  {" "}
                  · <strong>{pageCount / 4}</strong> feuille{pageCount / 4 > 1 ? "s" : ""} A4 recto verso
                </>
              )}
            </p>

            {paginated && paginated.tooTall.length > 0 && (
              <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs leading-relaxed text-[var(--accent)]">
                Un passage est trop long pour une page et sera coupé : {paginated.tooTall.join(", ")}. Raccourcissez le texte de cette étape ou décochez les photos.
              </p>
            )}

            <div className="space-y-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
              <p className="font-medium text-[var(--foreground)]">Réglages dans la fenêtre d'impression</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Papier : {booklet ? "A4, orientation paysage" : "A5 (ou « Enregistrer en PDF » au format A5)"}</li>
                <li>Marges : « Aucune » · Échelle : 100 %</li>
                <li>Cochez « Graphiques d'arrière-plan » pour les couleurs</li>
                {booklet && (
                  <li>
                    Recto verso : <strong>retourner sur le bord court</strong>
                  </li>
                )}
              </ul>
              {booklet ? (
                <p>Une fois imprimé, empilez les feuilles dans l'ordre (la feuille 1 dessus), pliez en deux et agrafez au pli.</p>
              ) : (
                <p>Pour faire un cahier avec ce mode, utilisez la fonction « livret » de votre imprimante ou de votre lecteur PDF.</p>
              )}
            </div>
          </section>
        </aside>

        {/* ── Aperçu et pages à imprimer ── */}
        <div ref={previewRef} className="min-w-0">
          {recipes.length === 0 ? (
            <p className="bk-noprint py-20 text-center text-sm text-[var(--muted-foreground)]">Aucune recette à imprimer.</p>
          ) : !pages ? (
            <p className="bk-noprint py-20 text-center text-sm text-[var(--muted-foreground)]">Mise en page…</p>
          ) : pages.length === 0 ? (
            <p className="bk-noprint py-20 text-center text-sm text-[var(--muted-foreground)]">
              Cochez au moins une recette, ou activez la couverture.
            </p>
          ) : (
            <div className="bk-units">
              {units.map((unit) => (
                <div key={unit.label} className="bk-unit">
                  <p className="bk-unit-label bk-noprint">{unit.label}</p>
                  <div className="bk-scaled" style={{ width: unitWidth * scale, height: unitHeight * scale }}>
                    <div
                      className="bk-scaled-inner"
                      style={{ width: unitWidth, height: unitHeight, transform: `scale(${scale})` }}
                    >
                      <div className={booklet ? "bk-sheet" : "bk-single"}>
                        {unit.slots.map((index) => (
                          <PageView key={index} spec={pages[index]} index={index} ctx={ctx} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mesure de la hauteur des blocs : invisible, même largeur et même typographie qu'une page */}
      <div ref={measureRef} className="bk-measure bk-body" aria-hidden="true">
        {blocks.map((block) => (
          <div key={block.key} data-bk-key={block.key} className="bk-block">
            {block.node}
          </div>
        ))}
      </div>
      <div ref={probeRef} className="bk-probe" aria-hidden="true" />
    </div>
  );
}
