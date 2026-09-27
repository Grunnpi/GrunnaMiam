import { useState, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type IngredientRole = "required" | "optional" | "excluded";

interface IngredientFilter {
  name: string;
  role: IngredientRole;
  fun?: string; // fun tag
}

interface Recipe {
  id: number;
  title: string;
  image: string;
  time: string;
  servings: number;
  difficulty: "Facile" | "Moyen" | "Difficile";
  tags: string[];
  ingredients: string[];
  description: string;
}

// ── Sample Data ────────────────────────────────────────────────────────────
const ALL_RECIPES: Recipe[] = [
  {
    id: 1,
    title: "Risotto aux champignons sauvages",
    image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600&h=400&fit=crop&auto=format",
    time: "35 min",
    servings: 4,
    difficulty: "Moyen",
    tags: ["végétarien", "réconfortant", "automne"],
    ingredients: ["riz arborio", "champignons", "parmesan", "oignon", "ail", "beurre", "vin blanc", "bouillon"],
    description: "Un risotto crémeux aux arômes de forêt, parfait pour les soirées d'automne.",
  },
  {
    id: 2,
    title: "Poulet rôti au citron & thym",
    image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=600&h=400&fit=crop&auto=format",
    time: "1h20",
    servings: 4,
    difficulty: "Facile",
    tags: ["classique", "dimanche", "famille"],
    ingredients: ["poulet", "citron", "thym", "ail", "beurre", "huile d'olive", "sel", "poivre"],
    description: "Le grand classique du dimanche, juteux et parfumé.",
  },
  {
    id: 3,
    title: "Soupe miso aux légumes",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&h=400&fit=crop&auto=format",
    time: "20 min",
    servings: 2,
    difficulty: "Facile",
    tags: ["végétarien", "rapide", "umami", "japonais"],
    ingredients: ["pâte miso", "tofu", "wakamé", "champignons", "oignon vert", "dashi"],
    description: "Une soupe réconfortante et légère, prête en 20 minutes.",
  },
  {
    id: 4,
    title: "Tarte tatin aux pommes",
    image: "https://images.unsplash.com/photo-1621743478914-cc8a86d7e7b5?w=600&h=400&fit=crop&auto=format",
    time: "50 min",
    servings: 6,
    difficulty: "Moyen",
    tags: ["dessert", "classique", "automne", "français"],
    ingredients: ["pommes", "beurre", "sucre", "pâte feuilletée", "vanille", "cannelle"],
    description: "Caramel ambré et pommes fondantes sous un feuilletage doré.",
  },
  {
    id: 5,
    title: "Pâtes à la carbonara",
    image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&h=400&fit=crop&auto=format",
    time: "25 min",
    servings: 2,
    difficulty: "Moyen",
    tags: ["rapide", "italien", "réconfortant"],
    ingredients: ["spaghetti", "guanciale", "parmesan", "pecorino", "œuf", "poivre noir"],
    description: "La vraie carbonara — sans crème, juste l'art de l'émulsion.",
  },
  {
    id: 6,
    title: "Buddha bowl au quinoa",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop&auto=format",
    time: "30 min",
    servings: 2,
    difficulty: "Facile",
    tags: ["végétarien", "healthy", "coloré"],
    ingredients: ["quinoa", "avocat", "pois chiche", "épinards", "tomate", "tahini", "citron", "carotte"],
    description: "Un bol complet, coloré et nutritif.",
  },
  {
    id: 7,
    title: "Tajine d'agneau aux pruneaux",
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=400&fit=crop&auto=format",
    time: "2h",
    servings: 4,
    difficulty: "Moyen",
    tags: ["marocain", "épicé", "hiver", "festif"],
    ingredients: ["agneau", "pruneaux", "oignon", "ail", "gingembre", "cannelle", "cumin", "miel", "amandes"],
    description: "Mijoté lentement avec épices et fruits secs, un voyage culinaire.",
  },
  {
    id: 8,
    title: "Gaspacho andalou",
    image: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&h=400&fit=crop&auto=format",
    time: "15 min",
    servings: 4,
    difficulty: "Facile",
    tags: ["végétarien", "été", "frais", "espagnol"],
    ingredients: ["tomate", "concombre", "poivron", "ail", "oignon", "huile d'olive", "vinaigre", "pain"],
    description: "Soupe froide d'été, fraîche et estivale.",
  },
  {
    id: 9,
    title: "Crème brûlée à la vanille",
    image: "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=600&h=400&fit=crop&auto=format",
    time: "1h",
    servings: 4,
    difficulty: "Moyen",
    tags: ["dessert", "classique", "français", "crémeux"],
    ingredients: ["crème entière", "jaune d'œuf", "sucre", "vanille"],
    description: "La légèreté d'une crème prise sous un caramel craquant.",
  },
  {
    id: 10,
    title: "Curry de pois chiches épinards",
    image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=600&h=400&fit=crop&auto=format",
    time: "30 min",
    servings: 3,
    difficulty: "Facile",
    tags: ["végétarien", "indien", "épicé", "rapide"],
    ingredients: ["pois chiche", "épinards", "tomate", "oignon", "ail", "gingembre", "curry", "lait de coco"],
    description: "Un curry végétarien riche et parfumé, prêt en 30 minutes.",
  },
];

const SUGGESTED_INGREDIENTS = [
  "poulet", "tomate", "ail", "oignon", "champignons", "parmesan", "citron",
  "avocat", "quinoa", "épinards", "beurre", "crème", "thym", "basilic", "pâtes",
  "riz", "pommes de terre", "carottes", "courgette", "poivron",
];

const FUN_TAGS = ["🌶️ piquant", "🥑 healthy", "⚡ rapide", "🎉 festif", "🧀 fromage", "🍫 chocolat", "🌿 herbes"];

// ── Pill component ─────────────────────────────────────────────────────────
function RolePill({ role, onClick }: { role: IngredientRole; onClick: () => void }) {
  const styles: Record<IngredientRole, string> = {
    required: "bg-[#4a7c59] text-[#f5f0e8]",
    optional: "bg-[#c8956c] text-white",
    excluded: "bg-[#b84c4c] text-white",
  };
  const labels: Record<IngredientRole, string> = {
    required: "✓ requis",
    optional: "◎ optionnel",
    excluded: "✕ exclu",
  };
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-2 py-0.5 rounded-full transition-opacity hover:opacity-80 ${styles[role]}`}
    >
      {labels[role]}
    </button>
  );
}

// ── Difficulty badge ───────────────────────────────────────────────────────
function DifficultyBadge({ difficulty }: { difficulty: Recipe["difficulty"] }) {
  const colors = {
    Facile: "text-[#4a7c59] bg-[#4a7c5918]",
    Moyen: "text-[#c8956c] bg-[#c8956c18]",
    Difficile: "text-[#b84c4c] bg-[#b84c4c18]",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[difficulty]}`}>
      {difficulty}
    </span>
  );
}

// ── Recipe Card ────────────────────────────────────────────────────────────
function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-[var(--card)] rounded-xl overflow-hidden border border-[var(--border)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
    >
      <div className="relative h-44 overflow-hidden bg-[var(--muted)]">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-2 right-2">
          <DifficultyBadge difficulty={recipe.difficulty} />
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-display text-lg leading-snug text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
          {recipe.title}
        </h3>
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2">
          {recipe.description}
        </p>
        <div className="flex gap-3 mt-auto pt-2 text-xs text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1">⏱ {recipe.time}</span>
          <span className="flex items-center gap-1">👤 {recipe.servings} pers.</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {recipe.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

// ── Recipe Detail Modal ────────────────────────────────────────────────────
function RecipeModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--card)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto hide-scroll shadow-2xl">
        <div className="h-56 sm:h-72 overflow-hidden bg-[var(--muted)] rounded-t-2xl sm:rounded-t-2xl">
          <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center text-sm hover:bg-white transition-colors shadow"
        >
          ✕
        </button>
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl sm:text-3xl leading-tight">{recipe.title}</h2>
            <DifficultyBadge difficulty={recipe.difficulty} />
          </div>
          <p className="text-[var(--muted-foreground)] leading-relaxed">{recipe.description}</p>
          <div className="flex gap-4 text-sm text-[var(--muted-foreground)] border-t border-[var(--border)] pt-4">
            <span>⏱ {recipe.time}</span>
            <span>👤 {recipe.servings} personnes</span>
          </div>
          <div>
            <h4 className="font-display text-lg mb-2">Ingrédients</h4>
            <ul className="grid grid-cols-2 gap-1">
              {recipe.ingredients.map((ing) => (
                <li key={ing} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0" />
                  {ing}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-1 pt-2 border-t border-[var(--border)]">
            {recipe.tags.map((t) => (
              <span key={t} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [filters, setFilters] = useState<IngredientFilter[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [funTags, setFunTags] = useState<string[]>([]);
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const q = inputValue.toLowerCase();
    const existing = filters.map((f) => f.name.toLowerCase());
    return SUGGESTED_INGREDIENTS.filter(
      (i) => i.includes(q) && !existing.includes(i.toLowerCase())
    ).slice(0, 6);
  }, [inputValue, filters]);

  function addIngredient(name: string, role: IngredientRole = "required") {
    const clean = name.trim().toLowerCase();
    if (!clean) return;
    if (filters.some((f) => f.name === clean)) return;
    setFilters((prev) => [...prev, { name: clean, role }]);
    setInputValue("");
    setShowSuggestions(false);
  }

  function cycleRole(name: string) {
    const cycle: IngredientRole[] = ["required", "optional", "excluded"];
    setFilters((prev) =>
      prev.map((f) =>
        f.name === name
          ? { ...f, role: cycle[(cycle.indexOf(f.role) + 1) % cycle.length] }
          : f
      )
    );
  }

  function setFunTag(filter: IngredientFilter, tag: string) {
    setFilters((prev) =>
      prev.map((f) => (f.name === filter.name ? { ...f, fun: f.fun === tag ? undefined : tag } : f))
    );
  }

  function removeIngredient(name: string) {
    setFilters((prev) => prev.filter((f) => f.name !== name));
  }

  function toggleFunTag(tag: string) {
    setFunTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const filteredRecipes = useMemo(() => {
    if (filters.length === 0 && funTags.length === 0) return ALL_RECIPES;

    const required = filters.filter((f) => f.role === "required").map((f) => f.name);
    const optional = filters.filter((f) => f.role === "optional").map((f) => f.name);
    const excluded = filters.filter((f) => f.role === "excluded").map((f) => f.name);

    return ALL_RECIPES.filter((recipe) => {
      const ings = recipe.ingredients.map((i) => i.toLowerCase());

      if (required.length > 0 && !required.every((r) => ings.some((i) => i.includes(r)))) return false;
      if (excluded.some((e) => ings.some((i) => i.includes(e)))) return false;
      if (optional.length > 0) {
        const hasOptional = optional.some((o) => ings.some((i) => i.includes(o)));
        if (!hasOptional) return false;
      }

      return true;
    });
  }, [filters, funTags]);

  const requiredCount = filters.filter((f) => f.role === "required").length;
  const optionalCount = filters.filter((f) => f.role === "optional").length;
  const excludedCount = filters.filter((f) => f.role === "excluded").length;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl text-[var(--foreground)] leading-none">
              Recettes
            </h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">par ingrédients</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <span className="bg-[var(--muted)] px-2 py-1 rounded-full">{filteredRecipes.length} recette{filteredRecipes.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Search panel */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-5 shadow-sm">
          <div className="space-y-1">
            <h2 className="font-display text-xl">Chercher par ingrédients</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Ajoutez des ingrédients, puis cliquez sur leur badge pour changer leur rôle (requis → optionnel → exclu).
            </p>
          </div>

          {/* Input */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); setShowSuggestions(true); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addIngredient(inputValue);
                    if (e.key === "Escape") setShowSuggestions(false);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="ex: poulet, tomate, ail…"
                  className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg z-20 overflow-hidden">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onMouseDown={() => addIngredient(s)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--muted)] transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => addIngredient(inputValue)}
                className="bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
              >
                Ajouter
              </button>
            </div>

            {/* Quick add suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {SUGGESTED_INGREDIENTS.filter((s) => !filters.some((f) => f.name === s)).slice(0, 8).map((s) => (
                <button
                  key={s}
                  onClick={() => addIngredient(s)}
                  className="text-xs border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] px-2.5 py-1 rounded-full hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Active filters */}
          {filters.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--muted-foreground)]">
                  Filtres actifs
                  {requiredCount > 0 && <span className="ml-1 text-[var(--primary)]">· {requiredCount} requis</span>}
                  {optionalCount > 0 && <span className="ml-1 text-[var(--secondary)]">· {optionalCount} optionnel{optionalCount > 1 ? "s" : ""}</span>}
                  {excludedCount > 0 && <span className="ml-1 text-[var(--accent)]">· {excludedCount} exclu{excludedCount > 1 ? "s" : ""}</span>}
                </h3>
                <button
                  onClick={() => setFilters([])}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
                >
                  Tout effacer
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {filters.map((f) => (
                  <div key={f.name} className="flex items-center gap-1.5 bg-[var(--muted)] rounded-full pl-3 pr-1 py-1">
                    <span className="text-sm font-medium capitalize">{f.name}</span>
                    {f.fun && (
                      <span className="text-xs bg-[var(--card)] px-1.5 py-0.5 rounded-full">{f.fun}</span>
                    )}
                    <RolePill role={f.role} onClick={() => cycleRole(f.name)} />
                    <button
                      onClick={() => removeIngredient(f.name)}
                      className="w-5 h-5 flex items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--border)] hover:text-[var(--accent)] transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fun tags */}
          <div className="border-t border-[var(--border)] pt-4 space-y-2">
            <p className="text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wide">Tags fun</p>
            <div className="flex flex-wrap gap-2">
              {FUN_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleFunTag(tag)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    funTags.includes(tag)
                      ? "bg-[var(--secondary)] text-white border-[var(--secondary)]"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--secondary)] hover:text-[var(--secondary)]"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Results */}
        <section>
          {filteredRecipes.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <p className="text-5xl">🥕</p>
              <h3 className="font-display text-2xl text-[var(--foreground)]">Aucune recette trouvée</h3>
              <p className="text-[var(--muted-foreground)] text-sm max-w-xs mx-auto">
                Essayez de changer les rôles des ingrédients ou d'en retirer quelques-uns.
              </p>
              <button
                onClick={() => setFilters([])}
                className="mt-2 text-sm text-[var(--primary)] hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-display text-xl text-[var(--foreground)]">
                  {filters.length === 0 && funTags.length === 0 ? "Toutes les recettes" : "Résultats"}
                </h2>
                <span className="text-sm text-[var(--muted-foreground)]">{filteredRecipes.length} recette{filteredRecipes.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecipes.map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe} onClick={() => setActiveRecipe(recipe)} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Recipe detail modal */}
      {activeRecipe && (
        <RecipeModal recipe={activeRecipe} onClose={() => setActiveRecipe(null)} />
      )}

      {/* Click outside to close suggestions */}
      {showSuggestions && (
        <div className="fixed inset-0 z-10" onClick={() => setShowSuggestions(false)} />
      )}
    </div>
  );
}
