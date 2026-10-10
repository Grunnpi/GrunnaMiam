import { useState, useMemo, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type IngredientRole = "required" | "optional" | "excluded";

interface IngredientFilter {
  name: string;
  role: IngredientRole;
}

interface Step {
  title: string;
  instruction: string;
  photos: string[];
}

interface Ingredient {
  name: string;
  quantity: string;
}

interface Recipe {
  id: number;
  title: string;
  image: string;
  time: string;
  servings: number;
  difficulty: "Facile" | "Moyen" | "Difficile";
  tags: string[];
  ingredients: Ingredient[];
  description: string;
  steps: Step[];
}

interface PreferenceList {
  id: number;
  name: string;
  recipeIds: number[];
}

type ImportMode = "replace" | "duplicate";

interface RecipeArchive {
  version: 1 | 2;
  exportedAt: string;
  recipes: Recipe[];
  preferenceLists?: PreferenceList[];
}

interface ImportedArchive {
  recipes: Recipe[];
  preferenceLists: PreferenceList[];
}

// ── Sample Data ────────────────────────────────────────────────────────────
const ALL_RECIPES: Recipe[] = [
  {
    id: 1,
    title: "Risotto aux champignons sauvages",
    image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=800&h=500&fit=crop&auto=format",
    time: "35 min",
    servings: 4,
    difficulty: "Moyen",
    tags: ["végétarien", "réconfortant", "automne"],
    ingredients: [
      { name: "riz arborio", quantity: "300 g" },
      { name: "champignons sauvages", quantity: "400 g" },
      { name: "parmesan", quantity: "80 g" },
      { name: "oignon", quantity: "1" },
      { name: "ail", quantity: "2 gousses" },
      { name: "beurre", quantity: "60 g" },
      { name: "vin blanc", quantity: "15 cl" },
      { name: "bouillon de légumes", quantity: "1 litre" },
    ],
    description: "Un risotto crémeux aux arômes de forêt, parfait pour les soirées d'automne.",
    steps: [
      {
        title: "Préparer les champignons",
        instruction: "Nettoyez les champignons sauvages avec un pinceau ou un chiffon humide. Émincez-les grossièrement. Faites-les revenir dans une poêle avec une noix de beurre à feu vif, 4–5 minutes, jusqu'à ce qu'ils soient dorés. Salez, poivrez et réservez.",
        photos: [
          "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Faire suer les aromates",
        instruction: "Dans une casserole à fond épais, faites fondre 30 g de beurre à feu moyen. Ajoutez l'oignon émincé et faites-le suer 5 minutes sans coloration. Ajoutez l'ail haché et faites revenir encore 1 minute.",
        photos: [],
      },
      {
        title: "Nacrer le riz",
        instruction: "Ajoutez le riz arborio dans la casserole et remuez pendant 2 minutes pour qu'il devienne translucide et nacré. Versez le vin blanc et laissez absorber complètement en remuant constamment.",
        photos: [
          "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Cuire par absorption",
        instruction: "Ajoutez le bouillon chaud louche par louche, en attendant que chaque ajout soit absorbé avant le suivant. Remuez souvent. Comptez environ 18 minutes. Le riz doit rester légèrement ferme (al dente).",
        photos: [],
      },
      {
        title: "Mantecatura & dressage",
        instruction: "Hors du feu, incorporez les champignons, le parmesan râpé et le reste du beurre froid. Remuez vigoureusement pour obtenir une texture crémeuse (mantecatura). Rectifiez l'assaisonnement. Servez immédiatement avec quelques copeaux de parmesan.",
        photos: [
          "https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=600&h=400&fit=crop&auto=format",
        ],
      },
    ],
  },
  {
    id: 2,
    title: "Poulet rôti au citron & thym",
    image: "https://images.unsplash.com/photo-1615557960916-5f4791effe9d?w=800&h=500&fit=crop&auto=format",
    time: "1h20",
    servings: 4,
    difficulty: "Facile",
    tags: ["classique", "dimanche", "famille"],
    ingredients: [
      { name: "poulet entier", quantity: "1,5 kg" },
      { name: "citron", quantity: "2" },
      { name: "thym", quantity: "4 branches" },
      { name: "ail", quantity: "5 gousses" },
      { name: "beurre", quantity: "50 g" },
      { name: "huile d'olive", quantity: "2 c. à soupe" },
      { name: "sel", quantity: "à goût" },
      { name: "poivre", quantity: "à goût" },
    ],
    description: "Le grand classique du dimanche, juteux et parfumé.",
    steps: [
      {
        title: "Préparer le beurre aromatisé",
        instruction: "Mélangez 50 g de beurre ramolli avec le zeste d'un citron, 2 gousses d'ail écrasées, quelques branches de thym effeuillé, sel et poivre. Travaillez jusqu'à obtenir une pâte homogène.",
        photos: [],
      },
      {
        title: "Habiller le poulet",
        instruction: "Glissez le beurre aromatisé sous la peau de la poitrine du poulet, en la décollant délicatement. Farcissez l'intérieur du poulet avec le citron coupé en deux, quelques gousses d'ail entières et des branches de thym. Ficelez si nécessaire.",
        photos: [
          "https://images.unsplash.com/photo-1615557960916-5f4791effe9d?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Rôtir au four",
        instruction: "Préchauffez le four à 200 °C. Posez le poulet sur un lit d'oignons émincés dans un plat à rôtir. Arrosez d'huile d'olive. Enfournez pour 1h–1h15, en arrosant toutes les 20 minutes avec le jus de cuisson.",
        photos: [
          "https://images.unsplash.com/photo-1518492104633-130d0cc84637?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Repos & service",
        instruction: "Sortez le poulet du four et laissez-le reposer 10 minutes sous un papier aluminium avant de le découper. Déglacez le plat avec un peu de bouillon ou d'eau pour obtenir un jus de rôti savoureux.",
        photos: [],
      },
    ],
  },
  {
    id: 3,
    title: "Soupe miso aux légumes",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&h=500&fit=crop&auto=format",
    time: "20 min",
    servings: 2,
    difficulty: "Facile",
    tags: ["végétarien", "rapide", "umami", "japonais"],
    ingredients: [
      { name: "pâte miso", quantity: "2 c. à soupe" },
      { name: "tofu soyeux", quantity: "150 g" },
      { name: "wakamé séché", quantity: "10 g" },
      { name: "champignons enoki", quantity: "100 g" },
      { name: "oignon vert", quantity: "2 tiges" },
      { name: "dashi", quantity: "600 ml" },
    ],
    description: "Une soupe réconfortante et légère, prête en 20 minutes.",
    steps: [
      {
        title: "Préparer le dashi",
        instruction: "Portez 600 ml d'eau à frémissement. Ajoutez le kombu et laissez infuser 5 minutes. Retirez le kombu, ajoutez les flocons de bonite si vous en avez, laissez 3 minutes, filtrez.",
        photos: [],
      },
      {
        title: "Hydrater le wakamé et le tofu",
        instruction: "Réhydratez le wakamé séché dans un bol d'eau froide pendant 5 minutes, puis égouttez. Coupez le tofu soyeux en dés de 1 cm.",
        photos: [
          "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Dissoudre le miso",
        instruction: "Hors du feu, prélevez une louche de dashi chaud et délayez-y la pâte miso (2 c. à soupe) sans grumeau. Versez dans la casserole. Ne faites jamais bouillir la soupe après l'ajout du miso pour préserver ses arômes.",
        photos: [],
      },
      {
        title: "Assembler et servir",
        instruction: "Répartissez le tofu, le wakamé et les champignons dans les bols. Versez la soupe miso chaude. Garnissez d'oignons verts émincés et servez immédiatement.",
        photos: [
          "https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=400&fit=crop&auto=format",
        ],
      },
    ],
  },
  {
    id: 4,
    title: "Tarte tatin aux pommes",
    image: "https://images.unsplash.com/photo-1621743478914-cc8a86d7e7b5?w=800&h=500&fit=crop&auto=format",
    time: "50 min",
    servings: 6,
    difficulty: "Moyen",
    tags: ["dessert", "classique", "automne", "français"],
    ingredients: [
      { name: "pommes Golden", quantity: "6 (±1,2 kg)" },
      { name: "beurre", quantity: "80 g" },
      { name: "sucre", quantity: "150 g" },
      { name: "pâte feuilletée", quantity: "1 rouleau" },
      { name: "vanille", quantity: "1 gousse" },
      { name: "cannelle", quantity: "1 pincée" },
    ],
    description: "Caramel ambré et pommes fondantes sous un feuilletage doré.",
    steps: [
      {
        title: "Préparer les pommes",
        instruction: "Pelez et épépinez 6 pommes type Golden ou Reine des Reinettes. Coupez-les en quartiers. Arrosez de jus de citron pour éviter l'oxydation.",
        photos: [],
      },
      {
        title: "Faire le caramel",
        instruction: "Dans une poêle allant au four (Ø 26 cm), faites fondre 80 g de beurre avec 150 g de sucre à feu moyen. Laissez caraméliser sans remuer jusqu'à obtenir une couleur ambrée. Ajoutez la vanille et une pincée de cannelle.",
        photos: [
          "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Disposer les pommes",
        instruction: "Disposez les quartiers de pommes debout, bien serrés, dans le caramel encore chaud. Faites cuire 10 minutes à feu doux pour les compoter légèrement.",
        photos: [
          "https://images.unsplash.com/photo-1621743478914-cc8a86d7e7b5?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Couvrir et cuire",
        instruction: "Recouvrez les pommes de la pâte feuilletée en rentrant les bords autour des fruits. Enfournez à 200 °C pour 25 minutes, jusqu'à ce que la pâte soit bien dorée.",
        photos: [],
      },
      {
        title: "Retourner et servir",
        instruction: "Sortez du four et laissez reposer 5 minutes. Posez une assiette plus grande que la poêle dessus et retournez d'un geste décidé. Servez tiède avec une boule de glace vanille ou une cuillère de crème fraîche.",
        photos: [],
      },
    ],
  },
  {
    id: 5,
    title: "Pâtes à la carbonara",
    image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=800&h=500&fit=crop&auto=format",
    time: "25 min",
    servings: 2,
    difficulty: "Moyen",
    tags: ["rapide", "italien", "réconfortant"],
    ingredients: [
      { name: "spaghetti", quantity: "200 g" },
      { name: "guanciale", quantity: "150 g" },
      { name: "parmesan", quantity: "40 g" },
      { name: "pecorino", quantity: "40 g" },
      { name: "œufs", quantity: "3 jaunes + 1 entier" },
      { name: "poivre noir", quantity: "généreusement" },
    ],
    description: "La vraie carbonara — sans crème, juste l'art de l'émulsion.",
    steps: [
      {
        title: "Préparer la liaison",
        instruction: "Dans un bol, mélangez 3 jaunes d'œufs et 1 œuf entier. Ajoutez 40 g de parmesan râpé, 40 g de pecorino râpé et une généreuse quantité de poivre noir fraîchement moulu. Fouettez et réservez.",
        photos: [],
      },
      {
        title: "Cuire le guanciale",
        instruction: "Coupez le guanciale en lardons de 5 mm. Faites-les dorer à sec dans une poêle à feu moyen jusqu'à ce que le gras soit fondu et les lardons légèrement croustillants. Éteignez le feu.",
        photos: [
          "https://images.unsplash.com/photo-1551892589-865f69869476?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Cuire les pâtes",
        instruction: "Faites cuire les spaghetti dans une grande quantité d'eau salée al dente, selon les indications du paquet moins 1 minute. Réservez une louche d'eau de cuisson avant d'égoutter.",
        photos: [],
      },
      {
        title: "Émulsionner hors du feu",
        instruction: "Ajoutez les pâtes égouttées dans la poêle avec le guanciale (feu éteint). Versez le mélange œufs-fromage et remuez énergiquement en ajoutant l'eau de cuisson petit à petit pour obtenir une sauce crémeuse et nappante. La chaleur résiduelle suffit — si la poêle est trop froide, passez-la 10 secondes sur feu très doux.",
        photos: [
          "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&h=400&fit=crop&auto=format",
        ],
      },
    ],
  },
  {
    id: 6,
    title: "Buddha bowl au quinoa",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&h=500&fit=crop&auto=format",
    time: "30 min",
    servings: 2,
    difficulty: "Facile",
    tags: ["végétarien", "healthy", "coloré"],
    ingredients: [
      { name: "quinoa", quantity: "150 g" },
      { name: "avocat", quantity: "1" },
      { name: "pois chiches", quantity: "400 g (1 boîte)" },
      { name: "épinards frais", quantity: "100 g" },
      { name: "tomate", quantity: "2" },
      { name: "tahini", quantity: "3 c. à soupe" },
      { name: "citron", quantity: "1" },
      { name: "carotte", quantity: "2" },
    ],
    description: "Un bol complet, coloré et nutritif.",
    steps: [
      {
        title: "Cuire le quinoa",
        instruction: "Rincez le quinoa sous l'eau froide. Faites cuire dans 2 fois son volume d'eau salée pendant 12 minutes. Égouttez et laissez refroidir légèrement.",
        photos: [],
      },
      {
        title: "Rôtir les pois chiches",
        instruction: "Égouttez et séchez les pois chiches en conserve. Enrobez-les d'huile d'olive, de cumin, de paprika fumé, sel et poivre. Étalez sur une plaque et enfournez à 200 °C pour 20 minutes jusqu'à ce qu'ils soient croustillants.",
        photos: [
          "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Préparer les légumes",
        instruction: "Épluchez et râpez les carottes. Coupez les tomates en quartiers. Tranchez l'avocat. Lavez les épinards.",
        photos: [],
      },
      {
        title: "Sauce tahini citronnée",
        instruction: "Mélangez 2 c. à soupe de tahini, le jus d'un citron, 1 gousse d'ail râpée, sel et un peu d'eau pour obtenir une consistance crémeuse et coulante.",
        photos: [],
      },
      {
        title: "Assembler les bols",
        instruction: "Disposez le quinoa au fond des bols. Rangez les légumes, les pois chiches croustillants et les tranches d'avocat en sections. Arrosez de sauce tahini et parsemez de graines de sésame.",
        photos: [
          "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop&auto=format",
        ],
      },
    ],
  },
  {
    id: 7,
    title: "Tajine d'agneau aux pruneaux",
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=500&fit=crop&auto=format",
    time: "2h",
    servings: 4,
    difficulty: "Moyen",
    tags: ["marocain", "épicé", "hiver", "festif"],
    ingredients: [
      { name: "épaule d'agneau", quantity: "800 g" },
      { name: "pruneaux dénoyautés", quantity: "200 g" },
      { name: "oignon", quantity: "2" },
      { name: "ail", quantity: "3 gousses" },
      { name: "gingembre en poudre", quantity: "1 c. à café" },
      { name: "cannelle", quantity: "1 bâton" },
      { name: "cumin", quantity: "1 c. à café" },
      { name: "miel", quantity: "2 c. à soupe" },
      { name: "amandes effilées", quantity: "50 g" },
    ],
    description: "Mijoté lentement avec épices et fruits secs, un voyage culinaire.",
    steps: [
      {
        title: "Mariner l'agneau",
        instruction: "Coupez l'agneau en gros cubes. Mélangez avec le gingembre râpé, le cumin, la cannelle, le curcuma, le sel et un filet d'huile d'olive. Laissez mariner 1h minimum (idéalement la nuit).",
        photos: [],
      },
      {
        title: "Faire revenir la viande",
        instruction: "Dans le fond du tajine ou une cocotte, faites chauffer de l'huile d'olive à feu vif. Saisissez les morceaux d'agneau sur toutes les faces jusqu'à bien dorés. Réservez.",
        photos: [
          "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Cuire les oignons",
        instruction: "Dans la même cocotte, faites revenir les oignons émincés jusqu'à caramélisation légère. Ajoutez l'ail haché et faites revenir 1 minute.",
        photos: [],
      },
      {
        title: "Mijoter",
        instruction: "Remettez la viande. Ajoutez les pruneaux dénoyautés, le miel et assez d'eau ou de bouillon pour couvrir à mi-hauteur. Couvrez et laissez mijoter à feu très doux pendant 1h30, en remuant de temps en temps.",
        photos: [],
      },
      {
        title: "Finition & service",
        instruction: "Faites griller les amandes effilées à sec dans une poêle. Parsemez-les sur le tajine avec de la coriandre fraîche. Servez avec de la semoule ou du pain khobz.",
        photos: [
          "https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?w=600&h=400&fit=crop&auto=format",
        ],
      },
    ],
  },
  {
    id: 8,
    title: "Gaspacho andalou",
    image: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=800&h=500&fit=crop&auto=format",
    time: "15 min",
    servings: 4,
    difficulty: "Facile",
    tags: ["végétarien", "été", "frais", "espagnol"],
    ingredients: [
      { name: "tomates mûres", quantity: "1 kg" },
      { name: "concombre", quantity: "1/2" },
      { name: "poivron rouge", quantity: "1/2" },
      { name: "ail", quantity: "1 gousse" },
      { name: "oignon", quantity: "1/2" },
      { name: "huile d'olive", quantity: "4 c. à soupe" },
      { name: "vinaigre de Xérès", quantity: "1 c. à soupe" },
      { name: "pain de mie", quantity: "2 tranches" },
    ],
    description: "Soupe froide d'été, fraîche et estivale.",
    steps: [
      {
        title: "Préparer les légumes",
        instruction: "Épépinez et coupez grossièrement les tomates (1 kg), le concombre (1/2), le poivron rouge (1/2). Pelez et émincez l'oignon et l'ail.",
        photos: [
          "https://images.unsplash.com/photo-1562059390-a761a084768e?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Mixer",
        instruction: "Placez tous les légumes dans un blender avec 2 tranches de pain de mie sans croûte (préalablement trempées dans l'eau), 4 c. à soupe d'huile d'olive extra vierge et 1 c. à soupe de vinaigre de Xérès. Mixez jusqu'à consistance lisse.",
        photos: [],
      },
      {
        title: "Assaisonner & réfrigérer",
        instruction: "Salez, poivrez, rectifiez l'acidité avec un peu de vinaigre si nécessaire. Passez au tamis si vous souhaitez une texture plus lisse. Réfrigérez au moins 2 heures avant de servir.",
        photos: [],
      },
      {
        title: "Servir",
        instruction: "Servez bien frais dans des bols ou des verres. Garnissez de dés de tomate, de concombre et de poivron, d'un filet d'huile d'olive et de quelques feuilles de basilic.",
        photos: [
          "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&h=400&fit=crop&auto=format",
        ],
      },
    ],
  },
  {
    id: 9,
    title: "Crème brûlée à la vanille",
    image: "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=800&h=500&fit=crop&auto=format",
    time: "1h",
    servings: 4,
    difficulty: "Moyen",
    tags: ["dessert", "classique", "français", "crémeux"],
    ingredients: [
      { name: "crème entière", quantity: "50 cl" },
      { name: "jaunes d'œuf", quantity: "5" },
      { name: "sucre en poudre", quantity: "80 g" },
      { name: "vanille", quantity: "1 gousse" },
    ],
    description: "La légèreté d'une crème prise sous un caramel craquant.",
    steps: [
      {
        title: "Infuser la vanille",
        instruction: "Fendez la gousse de vanille, grattez les grains. Dans une casserole, portez 50 cl de crème entière avec la gousse et les grains à frémissement. Couvrez et laissez infuser 15 minutes hors du feu.",
        photos: [],
      },
      {
        title: "Blanchir les jaunes",
        instruction: "Fouettez 5 jaunes d'œufs avec 80 g de sucre en poudre jusqu'à ce que le mélange blanchisse et soit légèrement mousseux.",
        photos: [],
      },
      {
        title: "Assembler & cuire au bain-marie",
        instruction: "Versez la crème chaude (sans la gousse) en filet sur les jaunes en fouettant constamment. Répartissez dans 4 ramequins. Enfournez au bain-marie à 150 °C pour 35–40 minutes — la crème doit être tremblotante au centre.",
        photos: [
          "https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Réfrigérer & caraméliser",
        instruction: "Laissez refroidir puis réfrigérez au moins 3 heures. Au moment de servir, saupoudrez d'une fine couche de sucre et caramélisez au chalumeau en maintenant une distance de 5 cm pour un caramel uniforme.",
        photos: [],
      },
    ],
  },
  {
    id: 10,
    title: "Curry de pois chiches épinards",
    image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=800&h=500&fit=crop&auto=format",
    time: "30 min",
    servings: 3,
    difficulty: "Facile",
    tags: ["végétarien", "indien", "épicé", "rapide"],
    ingredients: [
      { name: "pois chiches", quantity: "800 g (2 boîtes)" },
      { name: "épinards frais", quantity: "200 g" },
      { name: "tomates concassées", quantity: "400 g (1 boîte)" },
      { name: "oignon", quantity: "1" },
      { name: "ail", quantity: "3 gousses" },
      { name: "gingembre frais", quantity: "1 c. à café râpé" },
      { name: "curry en poudre", quantity: "2 c. à café" },
      { name: "lait de coco", quantity: "200 ml" },
    ],
    description: "Un curry végétarien riche et parfumé, prêt en 30 minutes.",
    steps: [
      {
        title: "Faire revenir les épices",
        instruction: "Faites chauffer 2 c. à soupe d'huile dans une cocotte à feu moyen. Ajoutez l'oignon émincé et faites-le suer 5 minutes. Ajoutez l'ail et le gingembre râpés, puis la poudre de curry (2 c. à café), le cumin et le garam masala. Remuez 1 minute pour torréfier les épices.",
        photos: [],
      },
      {
        title: "Ajouter les tomates",
        instruction: "Incorporez les tomates concassées (400 g en conserve ou 4 tomates fraîches). Laissez mijoter 8 minutes à feu moyen jusqu'à ce que la sauce réduise et épaississe.",
        photos: [
          "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=600&h=400&fit=crop&auto=format",
        ],
      },
      {
        title: "Ajouter les pois chiches",
        instruction: "Égouttez et rincez les pois chiches. Ajoutez-les à la sauce. Versez le lait de coco (200 ml). Mélangez, couvrez et laissez mijoter 10 minutes.",
        photos: [],
      },
      {
        title: "Finir avec les épinards",
        instruction: "Ajoutez les épinards frais (une grosse poignée) et remuez jusqu'à ce qu'ils tombent, 2 minutes. Rectifiez l'assaisonnement. Servez avec du riz basmati ou du pain naan, garni de coriandre fraîche.",
        photos: [],
      },
    ],
  },
];

function imageExtension(mimeType: string) {
  const extensions: Record<string, string> = {
    "image/gif": "gif",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return extensions[mimeType] ?? "jpg";
}

function imageMimeType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    gif: "image/gif",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return extension ? (mimeTypes[extension] ?? "image/jpeg") : "image/jpeg";
}

async function exportRecipesArchive(recipes: Recipe[], preferenceLists: PreferenceList[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const archivedRecipes: Recipe[] = JSON.parse(JSON.stringify(recipes));

  async function archiveImage(source: string, basePath: string, description: string) {
    if (!source.trim()) return "";
    const resolvedSource = source.replace(
      "photo-1598103442097-8b74394b95c3",
      "photo-1615557960916-5f4791effe9d"
    );
    try {
      const response = await fetch(resolvedSource);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
      }
      const blob = await response.blob();
      const path = `${basePath}.${imageExtension(blob.type)}`;
      zip.file(path, blob);
      return path;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "erreur réseau inconnue";
      throw new Error(
        `Export interrompu : impossible de récupérer ${description}. ${reason}. URL : ${resolvedSource}`
      );
    }
  }

  for (let recipeIndex = 0; recipeIndex < archivedRecipes.length; recipeIndex += 1) {
    const recipe = archivedRecipes[recipeIndex];
    const folder = `images/recipe-${recipeIndex + 1}`;
    recipe.image = await archiveImage(
      recipe.image,
      `${folder}/principale`,
      `la photo principale de « ${recipe.title} » (ID ${recipe.id})`
    );

    for (let stepIndex = 0; stepIndex < recipe.steps.length; stepIndex += 1) {
      const step = recipe.steps[stepIndex];
      step.photos = await Promise.all(
        step.photos.map((photo, photoIndex) =>
          archiveImage(
            photo,
            `${folder}/etape-${stepIndex + 1}-${photoIndex + 1}`,
            `la photo ${photoIndex + 1} de l'étape ${stepIndex + 1} « ${step.title || "Sans titre"} » de la recette « ${recipe.title} » (ID ${recipe.id})`
          )
        )
      );
    }
  }

  const archive: RecipeArchive = {
    version: 2,
    exportedAt: new Date().toISOString(),
    recipes: archivedRecipes,
    preferenceLists,
  };
  zip.file("recipes.json", JSON.stringify(archive, null, 2));

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `recettes-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Partial<Recipe>;
  return (
    typeof recipe.id === "number" &&
    typeof recipe.title === "string" &&
    typeof recipe.image === "string" &&
    typeof recipe.time === "string" &&
    typeof recipe.servings === "number" &&
    ["Facile", "Moyen", "Difficile"].includes(recipe.difficulty ?? "") &&
    typeof recipe.description === "string" &&
    Array.isArray(recipe.tags) &&
    recipe.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(recipe.ingredients) &&
    recipe.ingredients.every(
      (ingredient) =>
        ingredient &&
        typeof ingredient.name === "string" &&
        typeof ingredient.quantity === "string"
    ) &&
    Array.isArray(recipe.steps) &&
    recipe.steps.every(
      (step) =>
        step &&
        typeof step.title === "string" &&
        typeof step.instruction === "string" &&
        Array.isArray(step.photos) &&
        step.photos.every((photo) => typeof photo === "string")
    )
  );
}

function isPreferenceList(value: unknown): value is PreferenceList {
  if (!value || typeof value !== "object") return false;
  const list = value as Partial<PreferenceList>;
  return (
    typeof list.id === "number" &&
    typeof list.name === "string" &&
    Array.isArray(list.recipeIds) &&
    list.recipeIds.every((recipeId) => typeof recipeId === "number")
  );
}

async function importRecipesArchive(file: File): Promise<ImportedArchive> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("recipes.json");
  if (!manifestFile) throw new Error("Le fichier recipes.json est absent de l'archive.");

  let archive: unknown;
  try {
    archive = JSON.parse(await manifestFile.async("string"));
  } catch {
    throw new Error("Le fichier recipes.json n'est pas un JSON valide.");
  }

  if (
    !archive ||
    typeof archive !== "object" ||
    ![1, 2].includes((archive as Partial<RecipeArchive>).version ?? 0) ||
    !Array.isArray((archive as Partial<RecipeArchive>).recipes) ||
    !(archive as Partial<RecipeArchive>).recipes!.every(isRecipe) ||
    ((archive as Partial<RecipeArchive>).preferenceLists !== undefined &&
      (!Array.isArray((archive as Partial<RecipeArchive>).preferenceLists) ||
        !(archive as Partial<RecipeArchive>).preferenceLists!.every(isPreferenceList)))
  ) {
    throw new Error("Cette archive de recettes n'est pas dans un format compatible.");
  }

  async function restoreImage(path: string) {
    if (!path.startsWith("images/")) return path;
    const imageFile = zip.file(path);
    if (!imageFile) throw new Error(`L'image « ${path} » est absente de l'archive.`);
    const base64 = await imageFile.async("base64");
    return `data:${imageMimeType(path)};base64,${base64}`;
  }

  const recipes = await Promise.all(
    (archive as RecipeArchive).recipes.map(async (recipe) => ({
      ...recipe,
      image: await restoreImage(recipe.image),
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      steps: await Promise.all(
        recipe.steps.map(async (step) => ({
          ...step,
          photos: await Promise.all(step.photos.map(restoreImage)),
        }))
      ),
    }))
  );

  return {
    recipes,
    preferenceLists: (archive as RecipeArchive).preferenceLists?.map((list) => ({
      ...list,
      recipeIds: [...list.recipeIds],
    })) ?? [],
  };
}

// ── Shared style helpers ───────────────────────────────────────────────────
const inputCls = "w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition placeholder:text-[var(--muted-foreground)]";
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
const btnOutline = "text-xs border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] px-3 py-1.5 rounded-lg hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors";

async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Ce fichier n'est pas une image.");
  }

  const bitmap = await createImageBitmap(file);
  const maxSize = 1600;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("Impossible de préparer cette image.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.84);
}

function ImagePicker({
  multiple = false,
  onImages,
  compact = false,
}: {
  multiple?: boolean;
  onImages: (images: string[]) => void;
  compact?: boolean;
}) {
  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setIsLoading(true);
    setError("");

    try {
      const selectedFiles = multiple ? Array.from(files) : [files[0]];
      const images = await Promise.all(selectedFiles.map(imageFileToDataUrl));
      onImages(images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'image n'a pas pu être ajoutée.");
    } finally {
      setIsLoading(false);
      if (libraryInput.current) libraryInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  const buttonClass = compact
    ? btnOutline
    : "flex-1 sm:flex-none border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] px-4 py-2.5 rounded-xl text-sm font-medium hover:border-[var(--primary)] transition-colors";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => libraryInput.current?.click()}
          disabled={isLoading}
          className={`${buttonClass} disabled:opacity-50`}
        >
          {isLoading ? "Import en cours…" : multiple ? "Choisir des images" : "Choisir une image"}
        </button>
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          disabled={isLoading}
          className={`${buttonClass} disabled:opacity-50`}
        >
          Prendre une photo
        </button>
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          multiple={multiple}
          onChange={(event) => importFiles(event.target.files)}
          className="sr-only"
          tabIndex={-1}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => importFiles(event.target.files)}
          className="sr-only"
          tabIndex={-1}
        />
      </div>
      {error && <p className="text-xs text-[var(--accent)]">{error}</p>}
    </div>
  );
}

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
function RecipeCard({
  recipe,
  recipes,
  preferenceLists,
  onOpen,
  onCreateList,
  onToggleListRecipe,
  onDeleteList,
}: {
  recipe: Recipe;
  recipes: Recipe[];
  preferenceLists: PreferenceList[];
  onOpen: () => void;
  onCreateList: (name: string, recipeId?: number) => void;
  onToggleListRecipe: (listId: number, recipeId: number) => void;
  onDeleteList: (listId: number) => void;
}) {
  return (
    <div className="group bg-[var(--card)] rounded-xl overflow-hidden border border-[var(--border)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
      <button onClick={onOpen} className="relative h-44 overflow-hidden bg-[var(--muted)] w-full text-left">
        {recipe.image.trim() ? (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
            Sans photo
          </span>
        )}
        <div className="absolute top-2 right-2">
          <DifficultyBadge difficulty={recipe.difficulty} />
        </div>
      </button>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <button onClick={onOpen} className="text-left">
          <h3 className="font-display text-lg leading-snug text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
            {recipe.title}
          </h3>
        </button>
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2">
          {recipe.description}
        </p>
        <div className="flex gap-3 mt-auto pt-2 text-xs text-[var(--muted-foreground)]">
          <span>⏱ {recipe.time}</span>
          <span>👤 {recipe.servings} pers.</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {recipe.tags.slice(0, 3).map((t, i) => (
            <span key={i} className="text-[10px] bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={onOpen}
            className="text-xs font-medium text-[var(--primary)] hover:underline text-left flex items-center gap-1"
          >
            Voir la recette <span aria-hidden>→</span>
          </button>
          <PreferenceListsPanel
            recipes={recipes}
            lists={preferenceLists}
            recipeId={recipe.id}
            onCreate={onCreateList}
            onToggleRecipe={onToggleListRecipe}
            onDelete={onDeleteList}
          />
        </div>
      </div>
    </div>
  );
}

// ── Quick Preview Modal ────────────────────────────────────────────────────
function PreviewModal({ recipe, onClose, onOpen }: { recipe: Recipe; onClose: () => void; onOpen: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--card)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto hide-scroll shadow-2xl">
        <div className="h-48 sm:h-56 overflow-hidden bg-[var(--muted)] rounded-t-2xl">
          {recipe.image.trim() ? (
            <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
              Sans photo
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center text-sm hover:bg-white transition-colors shadow"
        >
          ✕
        </button>
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl leading-tight">{recipe.title}</h2>
            <DifficultyBadge difficulty={recipe.difficulty} />
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{recipe.description}</p>
          <div className="flex gap-4 text-sm text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3">
            <span>⏱ {recipe.time}</span>
            <span>👤 {recipe.servings} personnes</span>
            <span>📋 {recipe.steps.length} étapes</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {recipe.tags.map((t, i) => (
              <span key={i} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
          <button
            onClick={onOpen}
            className="w-full mt-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl py-3 font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            Voir la recette complète <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recipe Form (create & edit) ────────────────────────────────────────────
function RecipeForm({
  recipe,
  tagSuggestions,
  ingredientSuggestions,
  onSave,
  onCancel,
}: {
  recipe: Recipe | null;
  tagSuggestions: string[];
  ingredientSuggestions: string[];
  onSave: (r: Recipe) => void;
  onCancel: () => void;
}) {
  const blank = (): Omit<Recipe, "id"> => ({
    title: "",
    image: "",
    time: "",
    servings: 4,
    difficulty: "Facile",
    tags: [],
    ingredients: [{ name: "", quantity: "" }],
    description: "",
    steps: [{ title: "", instruction: "", photos: [] }],
  });

  const [draft, setDraft] = useState<Omit<Recipe, "id">>(
    () => recipe ? { ...recipe, steps: recipe.steps.map((s) => ({ ...s, photos: [...s.photos] })) } : blank()
  );
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const filteredTagSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    return tagSuggestions
      .filter((tag) => !draft.tags.includes(tag))
      .filter((tag) => !query || tag.includes(query))
      .slice(0, 8);
  }, [tagInput, tagSuggestions, draft.tags]);

  function patch<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
  }

  // ── Ingredients ────────────────────────────────────────────────────────
  function setIng(i: number, field: keyof Ingredient, val: string) {
    setDraft((p) => {
      const ings = p.ingredients.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing);
      return { ...p, ingredients: ings };
    });
  }
  const addIng = () => setDraft((p) => ({ ...p, ingredients: [...p.ingredients, { name: "", quantity: "" }] }));
  const rmIng = (i: number) => setDraft((p) => ({ ...p, ingredients: p.ingredients.filter((_, idx) => idx !== i) }));

  // ── Steps ──────────────────────────────────────────────────────────────
  function setStep(i: number, field: "title" | "instruction", val: string) {
    setDraft((p) => {
      const steps = p.steps.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
      return { ...p, steps };
    });
  }
  function moveStep(i: number, dir: -1 | 1) {
    setDraft((p) => {
      const steps = [...p.steps];
      [steps[i], steps[i + dir]] = [steps[i + dir], steps[i]];
      return { ...p, steps };
    });
  }
  const addStep = () => setDraft((p) => ({ ...p, steps: [...p.steps, { title: "", instruction: "", photos: [] }] }));
  const rmStep = (i: number) => setDraft((p) => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }));

  // ── Step photos ────────────────────────────────────────────────────────
  function addPhotos(si: number, images: string[]) {
    setDraft((p) => {
      const steps = p.steps.map((s, idx) => {
        if (idx !== si) return s;
        return { ...s, photos: [...s.photos, ...images] };
      });
      return { ...p, steps };
    });
  }
  const rmPhoto = (si: number, pi: number) =>
    setDraft((p) => {
      const steps = p.steps.map((s, idx) =>
        idx !== si ? s : { ...s, photos: s.photos.filter((_, pidx) => pidx !== pi) }
      );
      return { ...p, steps };
    });

  // ── Tags ───────────────────────────────────────────────────────────────
  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (!t || draft.tags.includes(t)) return;
    setDraft((p) => ({ ...p, tags: [...p.tags, t] }));
    setTagInput("");
  }
  const rmTag = (t: string) => setDraft((p) => ({ ...p, tags: p.tags.filter((x) => x !== t) }));

  // ── Save ───────────────────────────────────────────────────────────────
  function handleSave() {
    const errs: string[] = [];
    if (!draft.title.trim()) errs.push("Le titre est obligatoire.");
    if (!draft.ingredients.some((i) => i.name.trim())) errs.push("Au moins un ingrédient est requis.");
    setErrors(errs);
    if (errs.length) return;
    onSave({
      ...draft,
      id: recipe?.id ?? Date.now(),
      title: draft.title.trim(),
      ingredients: draft.ingredients.filter((i) => i.name.trim()),
      steps: draft.steps
        .filter((s) => s.title.trim() || s.instruction.trim())
        .map((s) => ({ ...s, photos: s.photos.filter((photo) => photo.trim()) })),
    });
  }

  const isNew = !recipe;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-[var(--card)] border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shrink-0"
          >
            <span>←</span>
            <span className="hidden sm:inline">Annuler</span>
          </button>
          <span className="text-[var(--border)]">/</span>
          <span className="text-sm font-medium flex-1 truncate text-[var(--foreground)]">
            {isNew ? "Nouvelle recette" : `Modifier « ${recipe.title} »`}
          </span>
          <button
            onClick={handleSave}
            className="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            Enregistrer
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="bg-[#b84c4c18] border border-[#b84c4c40] rounded-xl p-4 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-sm text-[#b84c4c]">{e}</p>
            ))}
          </div>
        )}

        {/* Photo principale */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-lg">Photo principale</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            L'image est optimisée et enregistrée directement avec la recette.
          </p>
          <ImagePicker onImages={([image]) => patch("image", image)} />
          {draft.image && (
            <div className="relative h-48 rounded-xl overflow-hidden bg-[var(--muted)] group">
              <img src={draft.image} alt="Aperçu de la recette" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => patch("image", "")}
                className="absolute top-2 right-2 rounded-lg bg-[var(--card)]/95 px-3 py-1.5 text-xs font-medium text-[var(--accent)] shadow-sm hover:bg-[var(--card)] transition-colors"
              >
                Supprimer
              </button>
            </div>
          )}
        </section>

        {/* Informations générales */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-lg">Informations</h2>
          <div>
            <label className={labelCls}>Titre *</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder="Nom de la recette"
              className={`${inputCls} font-display text-base`}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => patch("description", e.target.value)}
              placeholder="Courte description de la recette…"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Temps</label>
              <input
                type="text"
                value={draft.time}
                onChange={(e) => patch("time", e.target.value)}
                placeholder="ex: 30 min"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Portions</label>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.servings}
                onChange={(e) => patch("servings", Math.max(1, parseInt(e.target.value) || 1))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Difficulté</label>
              <select
                value={draft.difficulty}
                onChange={(e) => patch("difficulty", e.target.value as Recipe["difficulty"])}
                className={inputCls}
              >
                <option>Facile</option>
                <option>Moyen</option>
                <option>Difficile</option>
              </select>
            </div>
          </div>
        </section>

        {/* Tags */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-lg">Tags</h2>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setShowTagSuggestions(true);
                }}
                onFocus={() => setShowTagSuggestions(true)}
                onBlur={() => setShowTagSuggestions(false)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                placeholder="Rechercher ou créer un tag…"
                className={inputCls}
                autoComplete="off"
              />
              {showTagSuggestions && filteredTagSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-20 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
                  {filteredTagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addTag(tag);
                        setShowTagSuggestions(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--muted)] transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => addTag(tagInput)} className="bg-[var(--muted)] border border-[var(--border)] text-sm px-3 py-2 rounded-xl hover:border-[var(--primary)] transition-colors">
              Ajouter
            </button>
          </div>
          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draft.tags.map((t, i) => (
                <span key={i} className="flex items-center gap-1.5 bg-[var(--muted)] text-sm px-3 py-1 rounded-full">
                  {t}
                  <button onClick={() => rmTag(t)} className="text-[var(--muted-foreground)] hover:text-[var(--accent)] text-xs leading-none">✕</button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Ingrédients */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-lg">Ingrédients *</h2>
          <datalist id="existing-ingredient-names">
            {ingredientSuggestions.map((ingredient) => (
              <option key={ingredient} value={ingredient} />
            ))}
          </datalist>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_9rem_1.75rem] gap-2">
              <span className={labelCls}>Nom</span>
              <span className={labelCls}>Quantité</span>
              <span />
            </div>
            {draft.ingredients.map((ing, i) => (
              <div key={i} className="grid grid-cols-[1fr_9rem_1.75rem] gap-2 items-center">
                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => setIng(i, "name", e.target.value)}
                  placeholder="Rechercher ou créer…"
                  list="existing-ingredient-names"
                  autoComplete="off"
                  className={inputCls}
                />
                <input
                  type="text"
                  value={ing.quantity}
                  onChange={(e) => setIng(i, "quantity", e.target.value)}
                  placeholder="200 g"
                  className={inputCls}
                />
                <button
                  onClick={() => rmIng(i)}
                  disabled={draft.ingredients.length === 1}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--muted-foreground)] hover:text-[var(--accent)] hover:bg-[var(--muted)] disabled:opacity-30 transition-colors text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button onClick={addIng} className={btnOutline}>+ Ajouter un ingrédient</button>
        </section>

        {/* Étapes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Étapes de préparation</h2>
            <button
              onClick={addStep}
              className="bg-[var(--primary)] text-[var(--primary-foreground)] px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              + Étape
            </button>
          </div>

          <div className="space-y-4">
            {draft.steps.map((step, i) => (
              <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
                {/* Step header bar */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--muted)]">
                  <span className="w-7 h-7 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-sm font-semibold shrink-0">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={step.title}
                    onChange={(e) => setStep(i, "title", e.target.value)}
                    placeholder="Titre de l'étape"
                    className="flex-1 bg-transparent border-none outline-none font-display text-base placeholder:text-[var(--muted-foreground)]"
                  />
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => moveStep(i, -1)}
                      disabled={i === 0}
                      className="w-6 h-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--border)] disabled:opacity-30 text-[10px] transition-colors"
                      title="Monter"
                    >▲</button>
                    <button
                      onClick={() => moveStep(i, 1)}
                      disabled={i === draft.steps.length - 1}
                      className="w-6 h-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--border)] disabled:opacity-30 text-[10px] transition-colors"
                      title="Descendre"
                    >▼</button>
                    <button
                      onClick={() => rmStep(i)}
                      disabled={draft.steps.length === 1}
                      className="w-6 h-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--accent)] hover:bg-[var(--border)] disabled:opacity-30 text-xs transition-colors"
                      title="Supprimer"
                    >✕</button>
                  </div>
                </div>

                {/* Step body */}
                <div className="p-4 space-y-4">
                  <div>
                    <label className={labelCls}>Instruction</label>
                    <textarea
                      value={step.instruction}
                      onChange={(e) => setStep(i, "instruction", e.target.value)}
                      placeholder="Décrivez cette étape en détail…"
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  </div>

                  {/* Photos */}
                  <div className="space-y-2">
                    <label className={labelCls}>Photos de l'étape</label>
                    {step.photos.map((url, pi) => (
                      <div key={pi} className="relative h-28 rounded-xl overflow-hidden bg-[var(--muted)]">
                        {url.trim() ? (
                          <img
                            src={url}
                            alt={`Aperçu de l'étape ${i + 1}, photo ${pi + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]">
                            Photo indisponible
                          </span>
                        )}
                          <button
                            type="button"
                            onClick={() => rmPhoto(i, pi)}
                            aria-label={`Supprimer la photo ${pi + 1}`}
                            className="absolute top-2 right-2 rounded-lg bg-[var(--card)]/95 px-2.5 py-1 text-xs font-medium text-[var(--accent)] shadow-sm hover:bg-[var(--card)] transition-colors"
                          >
                            Supprimer
                          </button>
                      </div>
                    ))}
                    <ImagePicker multiple compact onImages={(images) => addPhotos(i, images)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom action */}
        <div className="pb-8 flex gap-3 justify-end">
          <button onClick={onCancel} className={btnOutline + " px-4 py-2"}>Annuler</button>
          <button
            onClick={handleSave}
            className="bg-[var(--primary)] text-[var(--primary-foreground)] px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {isNew ? "Créer la recette" : "Enregistrer les modifications"}
          </button>
        </div>
      </main>
    </div>
  );
}

// ── Recipe Detail View ─────────────────────────────────────────────────────
function RecipeDetail({
  recipe,
  recipes,
  preferenceLists,
  onBack,
  onEdit,
  onCreateList,
  onToggleListRecipe,
  onDeleteList,
}: {
  recipe: Recipe;
  recipes: Recipe[];
  preferenceLists: PreferenceList[];
  onBack: () => void;
  onEdit: () => void;
  onCreateList: (name: string, recipeId?: number) => void;
  onToggleListRecipe: (listId: number, recipeId: number) => void;
  onDeleteList: (listId: number) => void;
}) {
  const [openSteps, setOpenSteps] = useState<Set<number>>(
    () => new Set(recipe.steps.map((_, i) => i))
  );

  function toggleStep(i: number) {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Nav header */}
      <header className="sticky top-0 z-30 bg-[var(--card)] border-b border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shrink-0"
          >
            <span className="text-base">←</span>
            <span className="hidden sm:inline">Chercher par ingrédients</span>
            <span className="sm:hidden">Retour</span>
          </button>
          <span className="text-[var(--border)]">/</span>
          <span className="text-sm text-[var(--foreground)] truncate font-medium flex-1">{recipe.title}</span>
          <PreferenceListsPanel
            recipes={recipes}
            lists={preferenceLists}
            recipeId={recipe.id}
            onCreate={onCreateList}
            onToggleRecipe={onToggleListRecipe}
            onDelete={onDeleteList}
          />
          <button
            onClick={onEdit}
            className="shrink-0 text-xs border border-[var(--border)] text-[var(--muted-foreground)] px-3 py-1.5 rounded-lg hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            ✏ Modifier
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        {/* Hero */}
        <section className="space-y-5">
          <div className="rounded-2xl overflow-hidden h-64 sm:h-80 bg-[var(--muted)]">
            {recipe.image.trim() ? (
              <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">
                Aucune photo pour cette recette
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <DifficultyBadge difficulty={recipe.difficulty} />
              {recipe.tags.map((t, i) => (
                <span key={i} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl leading-tight">{recipe.title}</h1>
            <p className="text-[var(--muted-foreground)] leading-relaxed">{recipe.description}</p>
            <div className="flex gap-5 text-sm text-[var(--muted-foreground)] pt-1">
              <span className="flex items-center gap-1.5">⏱ <strong className="text-[var(--foreground)]">{recipe.time}</strong></span>
              <span className="flex items-center gap-1.5">👤 <strong className="text-[var(--foreground)]">{recipe.servings} personnes</strong></span>
              <span className="flex items-center gap-1.5">📋 <strong className="text-[var(--foreground)]">{recipe.steps.length} étapes</strong></span>
            </div>
          </div>
        </section>

        {/* Ingredients */}
        <section className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-5 sm:p-6">
          <h2 className="font-display text-xl mb-4">Ingrédients</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0" />
                <span className="capitalize flex-1">{ing.name}</span>
                <span className="text-xs text-[var(--muted-foreground)] font-medium tabular-nums">{ing.quantity}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Steps */}
        <section className="space-y-4">
          <h2 className="font-display text-xl">Étapes de préparation</h2>

          {/* Collapse all / expand all */}
          <div className="flex justify-end">
            <button
              onClick={() =>
                setOpenSteps(
                  openSteps.size === recipe.steps.length
                    ? new Set()
                    : new Set(recipe.steps.map((_, i) => i))
                )
              }
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              {openSteps.size === recipe.steps.length ? "Tout réduire" : "Tout déplier"}
            </button>
          </div>

          {/* Step cards */}
          <div className="space-y-3">
            {recipe.steps.map((step, i) => {
              const isOpen = openSteps.has(i);
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--card)]"
                >
                  <button
                    onClick={() => toggleStep(i)}
                    className="w-full text-left p-5 flex items-start gap-4 hover:bg-[var(--muted)] transition-colors"
                  >
                    <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-base leading-tight">{step.title}</h3>
                      {!isOpen && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-1">{step.instruction}</p>
                      )}
                    </div>
                    <span className={`text-[var(--muted-foreground)] text-xs mt-1 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 space-y-4">
                      <p className="text-sm leading-relaxed text-[var(--foreground)] pl-11">{step.instruction}</p>

                      {step.photos.some((url) => url.trim()) && (
                        <div className={`pl-11 grid gap-3 ${step.photos.filter((url) => url.trim()).length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {step.photos.filter((url) => url.trim()).map((url, pi) => (
                            <div key={pi} className="rounded-xl overflow-hidden bg-[var(--muted)] h-44 sm:h-52">
                              <img
                                src={url}
                                alt={`${step.title} — photo ${pi + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {i === recipe.steps.length - 1 && (
                        <div className="pl-11 text-sm text-[var(--muted-foreground)] flex items-center gap-2">
                          <span className="text-base">🎉</span> Bonne dégustation !
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Preference lists ───────────────────────────────────────────────────────
function PreferenceListsPanel({
  recipes,
  lists,
  recipeId,
  selectedListId,
  onCreate,
  onToggleRecipe,
  onDelete,
  onSelectList,
}: {
  recipes: Recipe[];
  lists: PreferenceList[];
  recipeId?: number;
  selectedListId?: number | null;
  onCreate: (name: string, recipeId?: number) => void;
  onToggleRecipe: (listId: number, recipeId: number) => void;
  onDelete: (listId: number) => void;
  onSelectList?: (listId: number | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const selectedRecipe = recipeId === undefined
    ? null
    : recipes.find((recipe) => recipe.id === recipeId) ?? null;
  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;

  function createList() {
    const name = newListName.trim();
    if (!name) return;
    onCreate(name, recipeId);
    setNewListName("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={recipeId === undefined
          ? "text-xs border border-[var(--border)] text-[var(--muted-foreground)] px-3 py-1.5 rounded-lg hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          : "text-xs text-[var(--primary)] border border-[var(--primary)]/30 px-2.5 py-1.5 rounded-lg hover:bg-[var(--primary)]/5 transition-colors"}
      >
        {recipeId === undefined ? (
          selectedList ? `Liste : ${selectedList.name}` : `Mes listes${lists.length ? ` (${lists.length})` : ""}`
        ) : (
          <>
            <span className="hidden sm:inline">Ajouter à une liste</span>
            <span className="sm:hidden">Listes</span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border)]">
              <div>
                <h2 className="font-display text-xl">
                  {selectedRecipe ? "Classer la recette" : "Mes listes"}
                </h2>
                {selectedRecipe && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">{selectedRecipe.title}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                Fermer
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newListName}
                  onChange={(event) => setNewListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      createList();
                    }
                  }}
                  placeholder="Nom de la nouvelle liste"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={createList}
                  disabled={!newListName.trim()}
                  className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-40"
                >
                  Créer
                </button>
              </div>

              {lists.length === 0 ? (
                <p className="rounded-xl bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
                  Aucune liste pour le moment.
                </p>
              ) : selectedRecipe ? (
                <div className="space-y-2">
                  {lists.map((list) => {
                    const containsRecipe = list.recipeIds.includes(selectedRecipe.id);
                    return (
                      <label
                        key={list.id}
                        className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 cursor-pointer hover:bg-[var(--muted)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={containsRecipe}
                          onChange={() => onToggleRecipe(list.id, selectedRecipe.id)}
                          className="accent-[var(--primary)]"
                        />
                        <span className="flex-1 text-sm font-medium">{list.name}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {list.recipeIds.length} recette{list.recipeIds.length !== 1 ? "s" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {onSelectList && selectedList && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectList(null);
                        setIsOpen(false);
                      }}
                      className="w-full rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-4 py-3 text-left text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors"
                    >
                      Afficher toutes les recettes
                    </button>
                  )}
                  {lists.map((list) => {
                    const listRecipes = list.recipeIds
                      .map((id) => recipes.find((recipe) => recipe.id === id))
                      .filter((recipe): recipe is Recipe => Boolean(recipe));
                    const isSelected = list.id === selectedList?.id;
                    return (
                      <section
                        key={list.id}
                        className={`rounded-xl border overflow-hidden ${
                          isSelected ? "border-[var(--primary)]" : "border-[var(--border)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 bg-[var(--muted)] px-4 py-3">
                          <div>
                            <h3 className="font-display text-base">{list.name}</h3>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {listRecipes.length} recette{listRecipes.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {onSelectList && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectList(isSelected ? null : list.id);
                                  setIsOpen(false);
                                }}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                                    : "border border-[var(--primary)]/30 text-[var(--primary)] hover:bg-[var(--primary)]/5"
                                }`}
                              >
                                {isSelected ? "Affichée" : "Afficher"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDelete(list.id)}
                              className="text-xs text-[var(--accent)] hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                        {listRecipes.length > 0 ? (
                          <ul className="divide-y divide-[var(--border)]">
                            {listRecipes.map((recipe) => (
                              <li key={recipe.id} className="flex items-center gap-3 px-4 py-2.5">
                                <span className="flex-1 truncate text-sm">{recipe.title}</span>
                                <button
                                  type="button"
                                  onClick={() => onToggleRecipe(list.id, recipe.id)}
                                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--accent)]"
                                >
                                  Retirer
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-4 py-3 text-xs text-[var(--muted-foreground)]">Cette liste est vide.</p>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Recipe data import/export ──────────────────────────────────────────────
function RecipeDataManager({
  recipeCount,
  listCount,
  onExport,
  onImport,
  onDeleteAll,
}: {
  recipeCount: number;
  listCount: number;
  onExport: () => Promise<void>;
  onImport: (file: File, mode: ImportMode) => Promise<{ recipeCount: number; listCount: number }>;
  onDeleteAll: () => void;
}) {
  const importInput = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("replace");
  const [isWorking, setIsWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleExport() {
    setIsWorking(true);
    setMessage(null);
    try {
      await onExport();
      setMessage({
        type: "success",
        text: `${recipeCount} recette${recipeCount !== 1 ? "s" : ""} et ${listCount} liste${listCount !== 1 ? "s" : ""} exportées.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "L'export a échoué." });
    } finally {
      setIsWorking(false);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setIsWorking(true);
    setMessage(null);
    try {
      const counts = await onImport(file, mode);
      setMessage({
        type: "success",
        text: `${counts.recipeCount} recette${counts.recipeCount !== 1 ? "s" : ""} et ${counts.listCount} liste${counts.listCount !== 1 ? "s" : ""} importées.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "L'import a échoué." });
    } finally {
      setIsWorking(false);
      if (importInput.current) importInput.current.value = "";
    }
  }

  function handleDeleteAll() {
    onDeleteAll();
    setConfirmDelete(false);
    setMessage({ type: "success", text: "Toutes les recettes ont été supprimées." });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs border border-[var(--border)] text-[var(--muted-foreground)] px-3 py-1.5 rounded-lg hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
      >
        Gérer
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border)]">
              <div>
                <h2 className="font-display text-xl">Gérer les recettes</h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {recipeCount} recette{recipeCount !== 1 ? "s" : ""} · {listCount} liste{listCount !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                Fermer
              </button>
            </div>

            <div className="p-5 space-y-6">
              {message && (
                <div className={`rounded-xl border p-3 text-sm ${
                  message.type === "success"
                    ? "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
                }`}>
                  {message.text}
                </div>
              )}

              <section className="space-y-2">
                <h3 className="font-display text-base">Exporter</h3>
                <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                  Télécharge un ZIP contenant les recettes, leurs images et les listes de préférences.
                </p>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isWorking || (recipeCount === 0 && listCount === 0)}
                  className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {isWorking ? "Traitement en cours…" : "Exporter recettes et listes"}
                </button>
              </section>

              <section className="space-y-3 border-t border-[var(--border)] pt-5">
                <div>
                  <h3 className="font-display text-base">Importer un ZIP</h3>
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)] mt-1">
                    Choisissez le comportement à appliquer aux identifiants déjà présents.
                  </p>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">Remplacer les recettes du même ID</span>
                    <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
                      Les autres recettes importées conservent leur identifiant.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3 cursor-pointer">
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === "duplicate"}
                    onChange={() => setMode("duplicate")}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">Ajouter comme nouvelles recettes</span>
                    <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
                      Un nouvel ID est créé pour chaque recette importée.
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => importInput.current?.click()}
                  disabled={isWorking}
                  className="w-full rounded-xl border border-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/5 disabled:opacity-40 transition-colors"
                >
                  Choisir un fichier ZIP
                </button>
                <input
                  ref={importInput}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => handleImport(event.target.files?.[0])}
                  className="sr-only"
                  tabIndex={-1}
                />
              </section>

              <section className="space-y-3 border-t border-[var(--border)] pt-5">
                <div>
                  <h3 className="font-display text-base text-[var(--accent)]">Supprimer toutes les recettes</h3>
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)] mt-1">
                    Cette action vide entièrement la collection en mémoire.
                  </p>
                </div>
                {confirmDelete ? (
                  <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-3 space-y-3">
                    <p className="text-sm text-[var(--accent)]">Confirmez-vous la suppression des {recipeCount} recettes ?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmDelete(false)} className={`${btnOutline} flex-1 py-2`}>
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAll}
                        className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
                      >
                        Confirmer la suppression
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={recipeCount === 0 || isWorking}
                    className="w-full rounded-xl border border-[var(--accent)]/50 px-4 py-2.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/5 disabled:opacity-40 transition-colors"
                  >
                    Supprimer toutes les recettes
                  </button>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Search & List View ─────────────────────────────────────────────────────
function SearchView({
  recipes,
  preferenceLists,
  onOpenRecipe,
  onNewRecipe,
  onCreateList,
  onToggleListRecipe,
  onDeleteList,
  onExport,
  onImport,
  onDeleteAll,
}: {
  recipes: Recipe[];
  preferenceLists: PreferenceList[];
  onOpenRecipe: (r: Recipe) => void;
  onNewRecipe: () => void;
  onCreateList: (name: string, recipeId?: number) => void;
  onToggleListRecipe: (listId: number, recipeId: number) => void;
  onDeleteList: (listId: number) => void;
  onExport: () => Promise<void>;
  onImport: (file: File, mode: ImportMode) => Promise<{ recipeCount: number; listCount: number }>;
  onDeleteAll: () => void;
}) {
  const [filters, setFilters] = useState<IngredientFilter[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [tagSearch, setTagSearch] = useState("");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [previewRecipe, setPreviewRecipe] = useState<Recipe | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const availableIngredients = useMemo(
    () =>
      Array.from(
        new Set(
          recipes.flatMap((recipe) =>
            recipe.ingredients
              .map((ingredient) => ingredient.name.trim().toLowerCase())
              .filter(Boolean)
          )
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [recipes]
  );

  const availableTags = useMemo(
    () =>
      Array.from(
        new Set(
          recipes.flatMap((recipe) =>
            recipe.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
          )
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [recipes]
  );

  const visibleTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    return availableTags.filter((tag) => !query || tag.includes(query));
  }, [availableTags, tagSearch]);

  const selectedList = useMemo(
    () => preferenceLists.find((list) => list.id === selectedListId) ?? null,
    [preferenceLists, selectedListId]
  );

  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const q = inputValue.trim().toLowerCase();
    const existing = filters.map((f) => f.name.toLowerCase());
    return availableIngredients.filter(
      (i) => i.includes(q) && !existing.includes(i)
    ).slice(0, 8);
  }, [inputValue, filters, availableIngredients]);

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
        f.name === name ? { ...f, role: cycle[(cycle.indexOf(f.role) + 1) % cycle.length] } : f
      )
    );
  }

  function removeIngredient(name: string) {
    setFilters((prev) => prev.filter((f) => f.name !== name));
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  }

  const filteredRecipes = useMemo(() => {
    if (filters.length === 0 && selectedTags.length === 0 && !selectedList) return recipes;

    const required = filters.filter((f) => f.role === "required").map((f) => f.name);
    const optional = filters.filter((f) => f.role === "optional").map((f) => f.name);
    const excluded = filters.filter((f) => f.role === "excluded").map((f) => f.name);
    const selectedRecipeIds = selectedList ? new Set(selectedList.recipeIds) : null;

    return recipes.filter((recipe) => {
      const ings = recipe.ingredients.map((i) => i.name.toLowerCase());
      const recipeTags = recipe.tags.map((t) => t.toLowerCase());

      if (selectedRecipeIds && !selectedRecipeIds.has(recipe.id)) return false;
      if (required.length > 0 && !required.every((r) => ings.some((i) => i.includes(r)))) return false;
      if (excluded.some((e) => ings.some((i) => i.includes(e)))) return false;
      if (optional.length > 0 && !optional.some((o) => ings.some((i) => i.includes(o)))) return false;
      if (selectedTags.length > 0 && !selectedTags.every((tag) => recipeTags.includes(tag))) return false;

      return true;
    });
  }, [filters, selectedTags, selectedList, recipes]);

  const requiredCount = filters.filter((f) => f.role === "required").length;
  const optionalCount = filters.filter((f) => f.role === "optional").length;
  const excludedCount = filters.filter((f) => f.role === "excluded").length;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl text-[var(--foreground)] leading-none">Recettes</h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">par ingrédients</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-1 rounded-full hidden sm:inline">
              {filteredRecipes.length} recette{filteredRecipes.length !== 1 ? "s" : ""}
            </span>
            <RecipeDataManager
              recipeCount={recipes.length}
              listCount={preferenceLists.length}
              onExport={onExport}
              onImport={onImport}
              onDeleteAll={onDeleteAll}
            />
            <PreferenceListsPanel
              recipes={recipes}
              lists={preferenceLists}
              selectedListId={selectedListId}
              onCreate={onCreateList}
              onToggleRecipe={onToggleListRecipe}
              onDelete={onDeleteList}
              onSelectList={setSelectedListId}
            />
            <button
              onClick={onNewRecipe}
              className="bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <span className="text-sm leading-none">+</span>
              <span>Nouvelle recette</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Search panel */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-5 shadow-sm">
          <div>
            <h2 className="font-display text-xl">Chercher par ingrédients</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Cliquez sur le badge pour changer le rôle : requis → optionnel → exclu.
            </p>
          </div>

          {selectedList && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--primary)]">
                  Liste sélectionnée
                </p>
                <p className="truncate text-sm font-medium">
                  {selectedList.name}
                  <span className="ml-2 font-normal text-[var(--muted-foreground)]">
                    {selectedList.recipeIds.length} recette{selectedList.recipeIds.length !== 1 ? "s" : ""}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedListId(null)}
                className="shrink-0 text-xs text-[var(--primary)] hover:underline"
              >
                Voir toutes
              </button>
            </div>
          )}

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

            <div className="flex flex-wrap gap-1.5 mt-3">
              {availableIngredients.filter((s) => !filters.some((f) => f.name === s)).slice(0, 8).map((s) => (
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
                <p className="text-sm font-medium text-[var(--muted-foreground)]">
                  Filtres actifs
                  {requiredCount > 0 && <span className="ml-1 text-[var(--primary)]">· {requiredCount} requis</span>}
                  {optionalCount > 0 && <span className="ml-1 text-[var(--secondary)]">· {optionalCount} optionnel{optionalCount > 1 ? "s" : ""}</span>}
                  {excludedCount > 0 && <span className="ml-1 text-[var(--accent)]">· {excludedCount} exclu{excludedCount > 1 ? "s" : ""}</span>}
                </p>
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

          {/* Existing recipe tags */}
          <div className="border-t border-[var(--border)] pt-4 space-y-3">
            <button
              type="button"
              onClick={() => setTagsExpanded((expanded) => !expanded)}
              aria-expanded={tagsExpanded}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <span className="text-xs text-[var(--muted-foreground)] font-medium uppercase tracking-wide">
                Filtrer par tags
                {selectedTags.length > 0 && (
                  <span className="ml-2 normal-case text-[var(--secondary)]">
                    {selectedTags.length} sélectionné{selectedTags.length > 1 ? "s" : ""}
                  </span>
                )}
              </span>
              <span className={`text-xs text-[var(--muted-foreground)] transition-transform ${tagsExpanded ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>

            {tagsExpanded && (
              <div className="space-y-3">
                <input
                  type="search"
                  value={tagSearch}
                  onChange={(event) => setTagSearch(event.target.value)}
                  placeholder="Rechercher un tag existant…"
                  className={inputCls}
                  autoComplete="off"
                />
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {visibleTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selectedTags.includes(tag)
                          ? "bg-[var(--secondary)] text-white border-[var(--secondary)]"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--secondary)] hover:text-[var(--secondary)]"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                  {visibleTags.length === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)]">Aucun tag correspondant.</p>
                  )}
                </div>
                {selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Effacer les tags sélectionnés
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Results */}
        <section>
          {filteredRecipes.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <p className="text-5xl">🥕</p>
              <h3 className="font-display text-2xl">Aucune recette trouvée</h3>
              <p className="text-[var(--muted-foreground)] text-sm max-w-xs mx-auto">
                Essayez de changer les rôles des ingrédients ou d'en retirer quelques-uns.
              </p>
              <button
                onClick={() => {
                  setFilters([]);
                  setSelectedTags([]);
                  setSelectedListId(null);
                }}
                className="mt-2 text-sm text-[var(--primary)] hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-display text-xl">
                  {filters.length === 0 && selectedTags.length === 0 && !selectedList
                    ? "Toutes les recettes"
                    : selectedList && filters.length === 0 && selectedTags.length === 0
                      ? selectedList.name
                      : "Résultats"}
                </h2>
                <span className="text-sm text-[var(--muted-foreground)]">
                  {filteredRecipes.length} recette{filteredRecipes.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    recipes={recipes}
                    preferenceLists={preferenceLists}
                    onOpen={() => onOpenRecipe(recipe)}
                    onCreateList={onCreateList}
                    onToggleListRecipe={onToggleListRecipe}
                    onDeleteList={onDeleteList}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Quick preview modal */}
      {previewRecipe && (
        <PreviewModal
          recipe={previewRecipe}
          onClose={() => setPreviewRecipe(null)}
          onOpen={() => { onOpenRecipe(previewRecipe); setPreviewRecipe(null); }}
        />
      )}

      {showSuggestions && (
        <div className="fixed inset-0 z-10" onClick={() => setShowSuggestions(false)} />
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
type AppView =
  | { name: "list" }
  | { name: "detail"; recipe: Recipe }
  | { name: "form"; recipe: Recipe | null };  // null = new recipe

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>(ALL_RECIPES);
  const [preferenceLists, setPreferenceLists] = useState<PreferenceList[]>([]);
  const [view, setView] = useState<AppView>({ name: "list" });
  const tagSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          recipes.flatMap((recipe) =>
            recipe.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
          )
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [recipes]
  );
  const ingredientSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          recipes.flatMap((recipe) =>
            recipe.ingredients
              .map((ingredient) => ingredient.name.trim().toLowerCase())
              .filter(Boolean)
          )
        )
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [recipes]
  );

  function handleSave(saved: Recipe) {
    if (view.name === "form" && view.recipe) {
      // edit: replace in list
      setRecipes((prev) => prev.map((r) => r.id === saved.id ? saved : r));
      setView({ name: "detail", recipe: saved });
    } else {
      // new
      setRecipes((prev) => [...prev, saved]);
      setView({ name: "detail", recipe: saved });
    }
  }

  function createPreferenceList(name: string, recipeId?: number) {
    setPreferenceLists((currentLists) => {
      const id = Math.max(Date.now(), ...currentLists.map((list) => list.id)) + 1;
      return [
        ...currentLists,
        {
          id,
          name: name.trim(),
          recipeIds: recipeId === undefined ? [] : [recipeId],
        },
      ];
    });
  }

  function toggleRecipeInList(listId: number, recipeId: number) {
    setPreferenceLists((currentLists) =>
      currentLists.map((list) => {
        if (list.id !== listId) return list;
        return {
          ...list,
          recipeIds: list.recipeIds.includes(recipeId)
            ? list.recipeIds.filter((id) => id !== recipeId)
            : [...list.recipeIds, recipeId],
        };
      })
    );
  }

  function deletePreferenceList(listId: number) {
    setPreferenceLists((currentLists) => currentLists.filter((list) => list.id !== listId));
  }

  async function handleImport(file: File, mode: ImportMode) {
    const imported = await importRecipesArchive(file);

    if (mode === "duplicate") {
      let nextRecipeId = Math.max(Date.now(), ...recipes.map((recipe) => recipe.id)) + 1;
      const recipeIdMap = new Map<number, number>();
      const duplicatedRecipes = imported.recipes.map((recipe) => {
        const id = nextRecipeId++;
        recipeIdMap.set(recipe.id, id);
        return { ...recipe, id };
      });

      let nextListId = Math.max(Date.now(), ...preferenceLists.map((list) => list.id)) + 1;
      const duplicatedLists = imported.preferenceLists.map((list) => ({
        ...list,
        id: nextListId++,
        recipeIds: list.recipeIds
          .map((recipeId) => recipeIdMap.get(recipeId))
          .filter((recipeId): recipeId is number => recipeId !== undefined),
      }));

      setRecipes((currentRecipes) => [...currentRecipes, ...duplicatedRecipes]);
      setPreferenceLists((currentLists) => [...currentLists, ...duplicatedLists]);
    } else {
      setRecipes((currentRecipes) => {
        const importedById = new Map(imported.recipes.map((recipe) => [recipe.id, recipe]));
        const currentIds = new Set(currentRecipes.map((recipe) => recipe.id));
        return [
          ...currentRecipes.map((recipe) => importedById.get(recipe.id) ?? recipe),
          ...imported.recipes.filter((recipe) => !currentIds.has(recipe.id)),
        ];
      });
      setPreferenceLists((currentLists) => {
        const importedById = new Map(imported.preferenceLists.map((list) => [list.id, list]));
        const currentIds = new Set(currentLists.map((list) => list.id));
        return [
          ...currentLists.map((list) => importedById.get(list.id) ?? list),
          ...imported.preferenceLists.filter((list) => !currentIds.has(list.id)),
        ];
      });
    }

    return {
      recipeCount: imported.recipes.length,
      listCount: imported.preferenceLists.length,
    };
  }

  if (view.name === "form") {
    const fromDetail = view.recipe !== null;
    return (
      <RecipeForm
        recipe={view.recipe}
        tagSuggestions={tagSuggestions}
        ingredientSuggestions={ingredientSuggestions}
        onSave={handleSave}
        onCancel={() =>
          fromDetail
            ? setView({ name: "detail", recipe: view.recipe! })
            : setView({ name: "list" })
        }
      />
    );
  }

  if (view.name === "detail") {
    return (
      <RecipeDetail
        recipe={view.recipe}
        recipes={recipes}
        preferenceLists={preferenceLists}
        onBack={() => setView({ name: "list" })}
        onEdit={() => setView({ name: "form", recipe: view.recipe })}
        onCreateList={createPreferenceList}
        onToggleListRecipe={toggleRecipeInList}
        onDeleteList={deletePreferenceList}
      />
    );
  }

  return (
    <SearchView
      recipes={recipes}
      preferenceLists={preferenceLists}
      onOpenRecipe={(r) => setView({ name: "detail", recipe: r })}
      onNewRecipe={() => setView({ name: "form", recipe: null })}
      onCreateList={createPreferenceList}
      onToggleListRecipe={toggleRecipeInList}
      onDeleteList={deletePreferenceList}
      onExport={() => exportRecipesArchive(recipes, preferenceLists)}
      onImport={handleImport}
      onDeleteAll={() => {
        setRecipes([]);
        setPreferenceLists((currentLists) =>
          currentLists.map((list) => ({ ...list, recipeIds: [] }))
        );
      }}
    />
  );
}
