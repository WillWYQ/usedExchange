// Self-contained copy for the project-introduction page (components/intro/ProjectIntro.tsx).
//
// This is intentionally separate from siteConfig.i18n: that config controls
// translations of the SELLER's own listings (item name/description), and a
// seller may only enable one or two locales for their audience. This page
// describes the *template itself* to a broader audience (developers deciding
// whether to fork it, or visitors curious what the project is), so it ships
// with a fixed set of major languages regardless of the seller's i18n setup.

export const PROJECT_INTRO_LOCALES = ["en", "zh", "fr", "es", "ja", "ko"] as const;

export type ProjectIntroLocale = (typeof PROJECT_INTRO_LOCALES)[number];

export type ProjectIntroCopy = {
  eyebrow: string;
  title: string;
  tagline: string;
  whyTitle: string;
  whyPrefix: string;
  whyWords: string[];
  whyComparisonsTitle: string;
  whyComparisons: { title: string; points: string[] }[];
  githubLabel: string;
  languageLabel: string;
  intro: string;
  featuresTitle: string;
  features: { title: string; description: string }[];
  uiTitle: string;
  uiDescription: string;
  uiSlots: { name: string; description: string }[];
  workflowTitle: string;
  workflowCaption: string;
  getStartedTitle: string;
  getStartedSteps: string[];
};

const PROJECT_INTRO_DICTIONARY: Record<ProjectIntroLocale, ProjectIntroCopy> = {
  en: {
    eyebrow: "Open-source storefront template",
    title: "UsedExchange",
    tagline:
      "A file-driven, database-free storefront for selling your second-hand things — fork it, fill in a folder, and ship a fast static site.",
    whyTitle: "Why fork this template?",
    whyPrefix: "Because your storefront should be",
    whyWords: [
      "free to host",
      "yours to keep — forever",
      "fast as plain HTML",
      "simple to translate",
      "easy to reshape",
    ],
    whyComparisonsTitle: "Why not just use a spreadsheet or a marketplace app?",
    whyComparisons: [
      {
        title: "Instead of a spreadsheet and group chats",
        points: [
          "A real {{storefront}} buyers can search and filter by category, price, and distance.",
          "Not a scroll of {{chat messages}}.",
          "Indexed by {{Google}}, with link previews handled automatically.",
          "Sold-item history and {{translations}}, too.",
          "Share {{a link}}, not your phone number.",
          "Keep contact details for buyers who are {{serious}}.",
        ],
      },
      {
        title: "Instead of eBay or Facebook Marketplace",
        points: [
          "No {{listing fees}} and no cut of your sale.",
          "A {{free}} static site, not a platform that takes {{a percentage}}.",
          "Your listings and photos live in {{your own git repo}}.",
          "Yours to keep, export, or move — {{immune}} to algorithm or policy changes.",
          "{{Reshape}} the whole look: background, grid, gallery, and card.",
          "Run it on {{your own domain}}, not buried in someone else's feed.",
        ],
      },
    ],
    githubLabel: "View on GitHub",
    languageLabel: "Language",
    intro:
      "You're seeing this page because the store hasn't been configured yet. Once someone points baseUrl at a real domain in content/config.ts, the catalog takes over the home page automatically, and this introduction moves to /about so visitors can still learn what the project is.",
    featuresTitle: "What you get",
    features: [
      {
        title: "Zero database, just files",
        description:
          "Every listing is a content/items/*/item.json file, written by hand or generated from photos with AI. No backend, no admin panel, nothing to host but static files.",
      },
      {
        title: "Static export, deploy anywhere",
        description:
          "The whole site builds down to plain HTML, CSS and JS — perfect for GitHub Pages — while photos live on Cloudflare R2 at zero egress cost.",
      },
      {
        title: "Distance-aware pricing",
        description:
          "Item prices can shift based on how far the buyer is from you, calculated entirely in the browser from coordinates you publish.",
      },
      {
        title: "Search, SEO and i18n included",
        description:
          "Full-text search, sitemaps, Open Graph tags, JSON-LD, and a locale switcher all ship ready to use.",
      },
      {
        title: "AI skills that do the busywork",
        description:
          "Setup, listing generation, and translation are guided step by step by Claude Code skill files — describe your item, get a finished listing.",
      },
    ],
    uiTitle: "Reshape the interface without touching code",
    uiDescription:
      "Four independent slots — background, item grid, gallery, and item card — each draw from a library of 27 pre-installed Aceternity UI components. Pick a different combination in content/config.ts and the whole look of the store changes, with no component code to write or maintain.",
    uiSlots: [
      { name: "Background", description: "From a plain black canvas to animated particle fields, auroras, and beams." },
      { name: "Item grid", description: "Simple grids, bento layouts, or animated carousels for the catalog view." },
      { name: "Gallery", description: "Lightboxes, carousels, or focus-card viewers for item photos." },
      { name: "Item card", description: "Minimal, glass-morphic, or hover-animated tiles for each listing." },
    ],
    workflowTitle: "See the seller's workflow",
    workflowCaption:
      "From a fresh clone to a published listing — no code, just a few commands.",
    getStartedTitle: "Make it your own",
    getStartedSteps: [
      "Clone the repository, then run pnpm install and pnpm setup-ui (installs the 27 UI components, once).",
      "Run the /setup skill in Claude Code, or edit content/config.ts by hand — name, location, currency, contact details, and the four UI slots above.",
      "Before going live: enable GitHub Pages (Settings → Pages → Source → GitHub Actions) and set up photo hosting — see the CDN setup guide in docs/setup_instruction.md.",
      "Add your first listings to content/items/ — generate them with /update-items from photos, or write item.json by hand — then run pnpm upload-images and push to the release branch.",
      "Later, pull template updates from the source repo using docs/UPDATE_GUIDE.md without losing anything in your content/ folder.",
    ],
  },
  zh: {
    eyebrow: "开源二手商店模板",
    title: "UsedExchange",
    tagline:
      "一个以文件驱动、无需数据库的二手物品商店模板——复刻仓库、填好一个文件夹，即可上线一个快速的静态网站。",
    whyTitle: "为什么要复刻这个模板？",
    whyPrefix: "因为你的商店理应",
    whyWords: [
      "免费托管",
      "完全归你所有",
      "和纯静态网页一样快",
      "轻松支持多语言",
      "随心所欲地换装",
    ],
    whyComparisonsTitle: "为什么不直接用表格或电商平台？",
    whyComparisons: [
      {
        title: "比起 Excel 表格和群聊",
        points: [
          "买家能搜索、按分类、价格、距离筛选，看到{{真正的相册}}。",
          "而不是在{{聊天记录}}里来回翻找。",
          "页面会被 {{Google}} 收录，分享时自带链接预览。",
          "已售记录和{{多语言翻译}}也都自动处理。",
          "你分享的是{{一个链接}}，而不是手机号。",
          "只在买家{{认真}}时才交换联系方式。",
        ],
      },
      {
        title: "比起 eBay 或 Facebook Marketplace",
        points: [
          "没有{{上架费}}，也不抽成。",
          "这是一个{{免费}}的静态网站，而不是要{{分走你利润}}的平台。",
          "你的商品和照片都保存在{{自己的 git 仓库}}里。",
          "可以随时{{导出、迁移}}，不受平台算法或规则变化影响。",
          "界面完全由你{{重塑}}——背景、网格、相册、卡片都能自由组合。",
          "跑在{{你自己的域名}}上，而不是淹没在别人的信息流里。",
        ],
      },
    ],
    githubLabel: "在 GitHub 上查看",
    languageLabel: "语言",
    intro:
      "你现在看到的是商店尚未配置完成时显示的页面。当有人在 content/config.ts 中把 baseUrl 改成真实域名后，目录页会自动接管首页，这篇介绍则会移动到 /about，方便访客继续了解这个项目。",
    featuresTitle: "你将获得什么",
    features: [
      {
        title: "零数据库，只有文件",
        description:
          "每件商品都是一个 content/items/*/item.json 文件，可手动编写，也可以用 AI 根据照片生成。没有后端、没有管理后台，需要托管的只有静态文件。",
      },
      {
        title: "静态导出，随处部署",
        description:
          "整个网站会构建成纯 HTML、CSS 和 JS——非常适合 GitHub Pages；图片则托管在 Cloudflare R2 上，出站流量零费用。",
      },
      {
        title: "按距离调整价格",
        description:
          "商品价格可以根据买家与你的距离自动浮动，所有计算都在浏览器端基于你公开的坐标完成。",
      },
      {
        title: "内置搜索、SEO 与多语言",
        description:
          "全文搜索、网站地图、Open Graph 标签、JSON-LD 结构化数据，以及语言切换器，开箱即用。",
      },
      {
        title: "AI 技能包揽琐事",
        description:
          "设置、商品生成与翻译都由 Claude Code 的技能文件逐步引导——描述一下你的物品，就能得到一份完整的商品信息。",
      },
    ],
    uiTitle: "无需写代码即可重塑界面",
    uiDescription:
      "背景、商品网格、图片画廊与商品卡片——四个相互独立的「插槽」，各自从一个包含 27 个预装 Aceternity UI 组件的库中取用。只需在 content/config.ts 里换一种搭配，整个商店的外观就会随之改变，无需编写或维护任何组件代码。",
    uiSlots: [
      { name: "背景", description: "从纯黑画布到动态粒子场、极光与光束效果，任你选择。" },
      { name: "商品网格", description: "简洁网格、便当式布局，或带动画的轮播，用于目录页展示。" },
      { name: "图片画廊", description: "灯箱、轮播，或聚焦卡片式的商品照片浏览方式。" },
      { name: "商品卡片", description: "极简、玻璃拟态，或带悬停动画的商品列表卡片样式。" },
    ],
    workflowTitle: "看看卖家的操作流程",
    workflowCaption: "从克隆仓库到发布商品——全程无需写代码，只需几条命令。",
    getStartedTitle: "把它变成你自己的商店",
    getStartedSteps: [
      "克隆仓库后运行 pnpm install 和 pnpm setup-ui（一次性安装 27 个 UI 组件）。",
      "在 Claude Code 中运行 /setup 技能，或手动编辑 content/config.ts——填写名称、所在地、货币、联系方式，以及上面提到的四个 UI 插槽。",
      "上线前：开启 GitHub Pages（Settings → Pages → Source → GitHub Actions），并配置照片托管——参见 docs/setup_instruction.md 中的 CDN 配置指南。",
      "把第一批商品添加到 content/items/——可用 /update-items 从照片生成，也可手动编写 item.json——然后运行 pnpm upload-images 并推送到 release 分支。",
      "之后可参照 docs/UPDATE_GUIDE.md 从源仓库拉取模板更新，content/ 文件夹中的内容不会受影响。",
    ],
  },
  fr: {
    eyebrow: "Modèle de boutique open source",
    title: "UsedExchange",
    tagline:
      "Une boutique pilotée par fichiers, sans base de données, pour vendre vos articles d'occasion — clonez le dépôt, remplissez un dossier, et publiez un site statique rapide.",
    whyTitle: "Pourquoi forker ce modèle ?",
    whyPrefix: "Parce que votre boutique mérite d'être",
    whyWords: [
      "gratuite à héberger",
      "entièrement à vous, pour de bon",
      "aussi rapide qu'une page statique",
      "facile à traduire",
      "simple à personnaliser",
    ],
    whyComparisonsTitle:
      "Pourquoi ne pas simplement utiliser un tableur ou une appli de petites annonces ?",
    whyComparisons: [
      {
        title: "Plutôt qu'un tableur et des groupes de discussion",
        points: [
          "Une vraie {{boutique}} que les acheteurs peuvent parcourir et filtrer par catégorie, prix et distance.",
          "Pas un défilement de {{messages}}.",
          "Indexée par {{Google}}, avec des aperçus de liens gérés automatiquement.",
          "Historique des articles vendus et {{traductions}}, aussi.",
          "Vous partagez {{un lien}}, pas votre numéro.",
          "Gardez vos coordonnées pour les acheteurs {{sérieux}}.",
        ],
      },
      {
        title: "Plutôt qu'eBay ou Facebook Marketplace",
        points: [
          "Aucuns {{frais de mise en vente}}, aucune commission.",
          "Un site statique {{gratuit}}, pas une plateforme qui prend {{sa part}}.",
          "Vos annonces et photos vivent dans {{votre propre dépôt git}}.",
          "À vous de les garder, exporter ou déplacer — {{à l'abri}} des changements d'algorithme ou de règles.",
          "{{Redessinez}} tout l'aspect : fond, grille, galerie et cartes.",
          "Publiez sous {{votre propre domaine}}, pas noyé dans le fil d'un autre.",
        ],
      },
    ],
    githubLabel: "Voir sur GitHub",
    languageLabel: "Langue",
    intro:
      "Vous voyez cette page parce que la boutique n'a pas encore été configurée. Dès que quelqu'un renseigne un vrai domaine dans baseUrl (content/config.ts), le catalogue prend automatiquement la place de la page d'accueil, et cette présentation est déplacée vers /about afin que les visiteurs puissent toujours découvrir le projet.",
    featuresTitle: "Ce que vous obtenez",
    features: [
      {
        title: "Aucune base de données, juste des fichiers",
        description:
          "Chaque annonce est un fichier content/items/*/item.json, rédigé à la main ou généré par IA à partir de photos. Pas de backend, pas de panneau d'administration — rien à héberger à part des fichiers statiques.",
      },
      {
        title: "Export statique, déployable partout",
        description:
          "Le site entier se construit en HTML, CSS et JS — parfait pour GitHub Pages — tandis que les photos résident sur Cloudflare R2 sans frais de sortie.",
      },
      {
        title: "Tarification selon la distance",
        description:
          "Les prix peuvent varier selon la distance entre l'acheteur et vous, calculée entièrement dans le navigateur à partir des coordonnées que vous publiez.",
      },
      {
        title: "Recherche, SEO et i18n inclus",
        description:
          "Recherche plein texte, sitemaps, balises Open Graph, JSON-LD et sélecteur de langue sont prêts à l'emploi.",
      },
      {
        title: "Des compétences IA qui font le travail fastidieux",
        description:
          "La configuration, la création d'annonces et la traduction sont guidées pas à pas par les fichiers de compétences Claude Code — décrivez votre article, obtenez une annonce complète.",
      },
    ],
    uiTitle: "Remodelez l'interface sans toucher au code",
    uiDescription:
      "Quatre emplacements indépendants — arrière-plan, grille d'articles, galerie et carte d'article — puisent chacun dans une bibliothèque de 27 composants Aceternity UI préinstallés. Choisissez une autre combinaison dans content/config.ts et toute l'apparence de la boutique change, sans code de composant à écrire ni à maintenir.",
    uiSlots: [
      { name: "Arrière-plan", description: "D'une toile noire unie à des champs de particules animés, des aurores et des faisceaux lumineux." },
      { name: "Grille d'articles", description: "Grilles simples, mises en page « bento » ou carrousels animés pour la vue catalogue." },
      { name: "Galerie", description: "Visionneuses en lightbox, carrousel ou cartes en gros plan pour les photos d'articles." },
      { name: "Carte d'article", description: "Vignettes minimalistes, en verre dépoli, ou animées au survol pour chaque annonce." },
    ],
    workflowTitle: "Découvrez le flux de travail du vendeur",
    workflowCaption:
      "Du clonage du dépôt à la publication d'une annonce — sans code, juste quelques commandes.",
    getStartedTitle: "Faites-en votre propre boutique",
    getStartedSteps: [
      "Clonez le dépôt, puis exécutez pnpm install et pnpm setup-ui (installe les 27 composants d'interface, une seule fois).",
      "Exécutez la compétence /setup dans Claude Code, ou modifiez content/config.ts à la main : nom, localisation, devise, coordonnées de contact, et les quatre emplacements d'interface ci-dessus.",
      "Avant la mise en ligne : activez GitHub Pages (Settings → Pages → Source → GitHub Actions) et configurez l'hébergement des photos — voir le guide CDN dans docs/setup_instruction.md.",
      "Ajoutez vos premières annonces dans content/items/ — générez-les avec /update-items à partir de photos, ou écrivez item.json à la main — puis exécutez pnpm upload-images et poussez vers la branche release.",
      "Plus tard, récupérez les mises à jour du modèle depuis le dépôt source en suivant docs/UPDATE_GUIDE.md, sans rien perdre de votre dossier content/.",
    ],
  },
  es: {
    eyebrow: "Plantilla de tienda de código abierto",
    title: "UsedExchange",
    tagline:
      "Una tienda basada en archivos, sin base de datos, para vender tus artículos de segunda mano: bifurca el repositorio, completa una carpeta y publica un sitio estático rápido.",
    whyTitle: "¿Por qué bifurcar esta plantilla?",
    whyPrefix: "Porque tu tienda merece ser",
    whyWords: [
      "gratuita de alojar",
      "completamente tuya, para siempre",
      "tan rápida como HTML estático",
      "fácil de traducir",
      "sencilla de personalizar",
    ],
    whyComparisonsTitle:
      "¿Por qué no usar simplemente una hoja de cálculo o una app de mercado?",
    whyComparisons: [
      {
        title: "En lugar de una hoja de cálculo y chats grupales",
        points: [
          "Una {{tienda}} de verdad, no un chat interminable.",
          "Compradores que {{buscan y filtran}} por categoría, precio y distancia.",
          "Indexada por {{Google}}, con vistas previas al compartir.",
          "Historial de artículos vendidos y {{traducciones automáticas}}.",
          "Compartes {{un enlace}}, no tu número.",
          "Guarda tus datos de contacto para compradores {{serios}}.",
        ],
      },
      {
        title: "En lugar de eBay o Facebook Marketplace",
        points: [
          "Sin {{comisiones ni cuotas}} por publicar.",
          "Un sitio estático {{gratuito}}, no una plataforma que se queda con {{un porcentaje}}.",
          "Tus anuncios y fotos viven en {{tu propio repositorio git}}.",
          "Expórtalos o muévelos cuando quieras — {{a salvo}} de cambios de algoritmo o normas.",
          "{{Rediseña}} todo el aspecto: fondo, cuadrícula, galería y tarjetas.",
          "Publícalo en {{tu propio dominio}}, no escondido en el feed de otro.",
        ],
      },
    ],
    githubLabel: "Ver en GitHub",
    languageLabel: "Idioma",
    intro:
      "Estás viendo esta página porque la tienda todavía no se ha configurado. En cuanto alguien indique un dominio real en baseUrl (content/config.ts), el catálogo ocupará automáticamente la página de inicio y esta introducción se trasladará a /about para que los visitantes puedan seguir conociendo el proyecto.",
    featuresTitle: "Qué obtienes",
    features: [
      {
        title: "Sin base de datos, solo archivos",
        description:
          "Cada artículo es un archivo content/items/*/item.json, escrito a mano o generado por IA a partir de fotos. Sin backend, sin panel de administración: lo único que hay que alojar son archivos estáticos.",
      },
      {
        title: "Exportación estática, despliega donde quieras",
        description:
          "Todo el sitio se compila en HTML, CSS y JS planos — ideal para GitHub Pages — mientras las fotos viven en Cloudflare R2 sin costes de salida.",
      },
      {
        title: "Precios según la distancia",
        description:
          "Los precios pueden variar según la distancia entre el comprador y tú, calculada completamente en el navegador a partir de las coordenadas que publiques.",
      },
      {
        title: "Búsqueda, SEO e i18n incluidos",
        description:
          "Búsqueda de texto completo, mapas del sitio, etiquetas Open Graph, JSON-LD y un selector de idioma, listos para usar.",
      },
      {
        title: "Habilidades de IA que hacen el trabajo pesado",
        description:
          "La configuración, la generación de anuncios y la traducción están guiadas paso a paso por los archivos de habilidades de Claude Code: describe tu artículo y obtén un anuncio completo.",
      },
    ],
    uiTitle: "Rediseña la interfaz sin tocar código",
    uiDescription:
      "Cuatro espacios independientes — fondo, cuadrícula de artículos, galería y tarjeta de artículo — toman cada uno componentes de una biblioteca de 27 componentes de Aceternity UI preinstalados. Elige otra combinación en content/config.ts y todo el aspecto de la tienda cambia, sin código de componentes que escribir ni mantener.",
    uiSlots: [
      { name: "Fondo", description: "Desde un lienzo negro liso hasta campos de partículas animados, auroras y haces de luz." },
      { name: "Cuadrícula de artículos", description: "Cuadrículas simples, diseños tipo «bento» o carruseles animados para la vista de catálogo." },
      { name: "Galería", description: "Visores tipo lightbox, carrusel o tarjetas de enfoque para las fotos de los artículos." },
      { name: "Tarjeta de artículo", description: "Tarjetas minimalistas, de vidrio esmerilado o con animación al pasar el cursor para cada anuncio." },
    ],
    workflowTitle: "Descubre el flujo de trabajo del vendedor",
    workflowCaption:
      "Desde clonar el repositorio hasta publicar un anuncio — sin código, solo unos pocos comandos.",
    getStartedTitle: "Haz que sea tuya",
    getStartedSteps: [
      "Clona el repositorio y luego ejecuta pnpm install y pnpm setup-ui (instala los 27 componentes de interfaz, una sola vez).",
      "Ejecuta la habilidad /setup en Claude Code, o edita content/config.ts a mano: nombre, ubicación, moneda, datos de contacto y los cuatro espacios de interfaz mencionados arriba.",
      "Antes de publicar: activa GitHub Pages (Settings → Pages → Source → GitHub Actions) y configura el alojamiento de fotos — consulta la guía de CDN en docs/setup_instruction.md.",
      "Añade tus primeros artículos en content/items/ — genéralos con /update-items a partir de fotos, o escribe item.json a mano — luego ejecuta pnpm upload-images y haz push a la rama release.",
      "Más adelante, obtén las actualizaciones de la plantilla desde el repositorio original siguiendo docs/UPDATE_GUIDE.md, sin perder nada de tu carpeta content/.",
    ],
  },
  ja: {
    eyebrow: "オープンソースのストアテンプレート",
    title: "UsedExchange",
    tagline:
      "データベース不要、ファイルだけで動く中古品販売ストア——リポジトリをフォークし、フォルダを埋めるだけで、高速な静的サイトを公開できます。",
    whyTitle: "なぜこのテンプレートをフォークするのか？",
    whyPrefix: "あなたのストアは、こうあるべきだから——",
    whyWords: [
      "ホスティング費用ゼロ",
      "ずっと自分だけのもの",
      "静的サイト並みに高速",
      "翻訳もかんたん",
      "見た目を自由に着せ替え",
    ],
    whyComparisonsTitle:
      "なぜスプレッドシートやマーケットプレイスアプリではダメなのか？",
    whyComparisons: [
      {
        title: "スプレッドシートやグループチャットの代わりに",
        points: [
          "チャット履歴をたどる必要のない、本物の{{ギャラリー}}付きストアに。",
          "買い手は{{カテゴリ・価格・距離}}で検索やフィルターができます。",
          "{{Google}} に検索され、共有時にはリンクプレビューが表示されます。",
          "売却履歴や{{多言語対応}}も自動で処理されます。",
          "教えるのは電話番号ではなく{{リンク}}です。",
          "{{本気}}の買い手とだけ連絡先を交換できます。",
        ],
      },
      {
        title: "eBay や Facebook Marketplace の代わりに",
        points: [
          "{{出品料も手数料}}もゼロです。",
          "{{利益の一部}}を持っていくプラットフォームではなく、{{無料}}の静的サイトです。",
          "出品データや写真は{{自分の git リポジトリ}}に保存されます。",
          "いつでも{{エクスポート・移行}}でき、アルゴリズムや規約変更にも左右されません。",
          "見た目は{{丸ごと作り変え}}可能——背景・グリッド・ギャラリー・カードを自由に組み合わせられます。",
          "{{自分のドメイン}}で公開でき、誰かのフィードに埋もれません。",
        ],
      },
    ],
    githubLabel: "GitHub で見る",
    languageLabel: "言語",
    intro:
      "このページが表示されているのは、ストアがまだ設定されていないためです。content/config.ts の baseUrl に実際のドメインを設定すると、カタログが自動的にホームページを引き継ぎ、この紹介ページは /about に移動します。これにより訪問者はいつでもこのプロジェクトについて知ることができます。",
    featuresTitle: "得られるもの",
    features: [
      {
        title: "データベース不要、ファイルのみ",
        description:
          "出品はすべて content/items/*/item.json ファイルとして保存され、手書きでも、写真から AI で生成することもできます。バックエンドも管理画面もなく、ホスティングが必要なのは静的ファイルだけです。",
      },
      {
        title: "静的エクスポート、どこへでもデプロイ",
        description:
          "サイト全体が純粋な HTML・CSS・JS にビルドされ、GitHub Pages に最適です。写真は Cloudflare R2 に保存され、送信データ転送料金はかかりません。",
      },
      {
        title: "距離に応じた価格設定",
        description:
          "商品価格は購入者との距離に応じて変動させることができ、公開した座標をもとにすべてブラウザ側で計算されます。",
      },
      {
        title: "検索・SEO・多言語対応も標準搭載",
        description:
          "全文検索、サイトマップ、Open Graph タグ、JSON-LD、言語切り替えスイッチャーがすぐに使える状態で含まれています。",
      },
      {
        title: "面倒な作業を代行する AI スキル",
        description:
          "セットアップ、出品の生成、翻訳は Claude Code のスキルファイルが手順を追って案内します——商品を説明するだけで、完成した出品情報が手に入ります。",
      },
    ],
    uiTitle: "コードに触れずにインターフェースを作り変える",
    uiDescription:
      "背景・商品グリッド・ギャラリー・商品カードという4つの独立した「スロット」は、それぞれあらかじめインストールされた27個の Aceternity UI コンポーネントのライブラリから選べます。content/config.ts で組み合わせを変えるだけで、ストア全体の見た目が変わります——コンポーネントのコードを書いたり保守したりする必要はありません。",
    uiSlots: [
      { name: "背景", description: "シンプルな黒一色のキャンバスから、動くパーティクル、オーロラ、光の筋まで。" },
      { name: "商品グリッド", description: "シンプルなグリッド、ベントーレイアウト、アニメーション付きカルーセルなど、カタログ表示の方法。" },
      { name: "ギャラリー", description: "ライトボックス、カルーセル、フォーカスカード形式の商品写真ビューア。" },
      { name: "商品カード", description: "ミニマル、グラスモーフィズム、ホバーアニメーション付きなど、出品タイルの見た目。" },
    ],
    workflowTitle: "出品者のワークフローを見る",
    workflowCaption:
      "リポジトリをクローンしてから出品を公開するまで——コードを書く必要はなく、いくつかのコマンドだけです。",
    getStartedTitle: "自分だけのストアにする",
    getStartedSteps: [
      "リポジトリをクローンし、pnpm install と pnpm setup-ui（27個のUIコンポーネントを一度だけインストール）を実行します。",
      "Claude Code で /setup スキルを実行するか、content/config.ts を直接編集します——名前、所在地、通貨、連絡先、そして上記の4つの UI スロット。",
      "公開前に：GitHub Pages を有効化し（Settings → Pages → Source → GitHub Actions）、写真のホスティングを設定します——docs/setup_instruction.md の CDN 設定ガイドを参照してください。",
      "最初の出品を content/items/ に追加します——/update-items で写真から生成するか、item.json を手動で作成し——その後 pnpm upload-images を実行して release ブランチに push します。",
      "その後は docs/UPDATE_GUIDE.md に従って元リポジトリからテンプレートの更新を取り込めます。content/ フォルダの内容は失われません。",
    ],
  },
  ko: {
    eyebrow: "오픈소스 스토어 템플릿",
    title: "UsedExchange",
    tagline:
      "데이터베이스 없이 파일만으로 운영되는 중고 물품 판매 스토어 — 저장소를 포크하고 폴더 하나만 채우면 빠른 정적 사이트를 바로 배포할 수 있습니다.",
    whyTitle: "왜 이 템플릿을 포크해야 할까요?",
    whyPrefix: "당신의 스토어는 이래야 하니까요 —",
    whyWords: [
      "호스팅 비용 무료",
      "영원히 온전한 내 것",
      "정적 HTML만큼 빠르게",
      "번역도 손쉽게",
      "마음대로 모습을 바꾸기",
    ],
    whyComparisonsTitle:
      "왜 그냥 스프레드시트나 마켓플레이스 앱을 쓰지 않을까요?",
    whyComparisons: [
      {
        title: "스프레드시트와 단체 채팅 대신",
        points: [
          "구매자가 {{카테고리·가격·거리}}로 검색하고 필터링할 수 있는 진짜 스토어입니다.",
          "{{채팅 기록}}을 뒤적이지 않아도 됩니다.",
          "{{Google}}에 색인되고, 공유 시 링크 미리보기가 표시됩니다.",
          "판매 완료 기록과 {{다국어 번역}}도 자동으로 처리됩니다.",
          "전화번호가 아닌 {{링크}}를 공유하세요.",
          "{{진지한}} 구매자와만 연락처를 주고받으면 됩니다.",
        ],
      },
      {
        title: "eBay나 Facebook 마켓플레이스 대신",
        points: [
          "{{등록비도 수수료}}도 없습니다.",
          "{{수익의 일부}}를 가져가는 플랫폼이 아니라 {{무료}} 정적 사이트니까요.",
          "상품과 사진은 {{자신의 git 저장소}}에 저장됩니다.",
          "언제든 {{내보내거나 옮길}} 수 있고, 알고리즘이나 정책 변경에도 영향받지 않습니다.",
          "배경·그리드·갤러리·카드까지 전체 모습을 {{자유롭게 바꿀}} 수 있습니다.",
          "{{자신의 도메인}}에서 운영하며, 다른 사람의 피드에 묻히지 않습니다.",
        ],
      },
    ],
    githubLabel: "GitHub에서 보기",
    languageLabel: "언어",
    intro:
      "이 페이지가 보이는 이유는 스토어가 아직 설정되지 않았기 때문입니다. content/config.ts의 baseUrl에 실제 도메인을 입력하면 카탈로그가 자동으로 홈페이지 자리를 차지하고, 이 소개 페이지는 /about으로 이동하여 방문자가 계속해서 프로젝트에 대해 알아볼 수 있습니다.",
    featuresTitle: "제공되는 기능",
    features: [
      {
        title: "데이터베이스 없이, 파일만으로",
        description:
          "모든 상품은 content/items/*/item.json 파일이며, 직접 작성하거나 사진을 기반으로 AI가 생성할 수 있습니다. 백엔드도, 관리자 패널도 없으며 호스팅해야 할 것은 정적 파일뿐입니다.",
      },
      {
        title: "정적 내보내기, 어디에나 배포",
        description:
          "사이트 전체가 순수한 HTML, CSS, JS로 빌드되어 GitHub Pages에 최적이며, 사진은 Cloudflare R2에 저장되어 외부 전송 비용이 들지 않습니다.",
      },
      {
        title: "거리 기반 가격 책정",
        description:
          "상품 가격은 구매자와의 거리에 따라 달라질 수 있으며, 공개한 좌표를 바탕으로 모든 계산이 브라우저에서 이루어집니다.",
      },
      {
        title: "검색, SEO, 다국어 지원 기본 포함",
        description:
          "전문 검색, 사이트맵, Open Graph 태그, JSON-LD, 언어 전환기까지 바로 사용할 수 있도록 포함되어 있습니다.",
      },
      {
        title: "번거로운 작업을 대신하는 AI 스킬",
        description:
          "설정, 상품 정보 생성, 번역까지 Claude Code 스킬 파일이 단계별로 안내합니다 — 물건을 설명하기만 하면 완성된 상품 정보를 얻을 수 있습니다.",
      },
    ],
    uiTitle: "코드를 건드리지 않고 인터페이스를 바꾸세요",
    uiDescription:
      "배경, 상품 그리드, 갤러리, 상품 카드라는 네 개의 독립적인 '슬롯'은 각각 미리 설치된 27개의 Aceternity UI 컴포넌트 라이브러리에서 선택할 수 있습니다. content/config.ts에서 다른 조합을 선택하면 스토어의 전체적인 모습이 바뀌며, 컴포넌트 코드를 작성하거나 유지보수할 필요가 없습니다.",
    uiSlots: [
      { name: "배경", description: "단색 검정 캔버스부터 움직이는 입자 효과, 오로라, 빛줄기까지." },
      { name: "상품 그리드", description: "카탈로그 화면을 위한 단순한 그리드, 벤토 레이아웃, 또는 애니메이션 캐러셀." },
      { name: "갤러리", description: "상품 사진을 위한 라이트박스, 캐러셀, 또는 포커스 카드 뷰어." },
      { name: "상품 카드", description: "미니멀하거나 글래스모피즘, 또는 호버 애니메이션이 적용된 상품 타일." },
    ],
    workflowTitle: "판매자의 작업 흐름 보기",
    workflowCaption:
      "저장소를 클론하는 것부터 상품을 게시하는 것까지 — 코드 작성 없이 몇 가지 명령어만으로.",
    getStartedTitle: "나만의 스토어로 만들기",
    getStartedSteps: [
      "저장소를 클론한 뒤 pnpm install과 pnpm setup-ui(27개 UI 컴포넌트를 한 번만 설치)를 실행하세요.",
      "Claude Code에서 /setup 스킬을 실행하거나 content/config.ts를 직접 편집하세요 — 이름, 위치, 통화, 연락처 정보, 그리고 위에서 설명한 네 가지 UI 슬롯.",
      "공개하기 전: GitHub Pages를 활성화하고(Settings → Pages → Source → GitHub Actions), 사진 호스팅을 설정하세요 — docs/setup_instruction.md의 CDN 설정 가이드를 참고하세요.",
      "첫 상품들을 content/items/에 추가하세요 — /update-items로 사진에서 생성하거나 item.json을 직접 작성한 뒤 — pnpm upload-images를 실행하고 release 브랜치로 push하세요.",
      "이후에는 docs/UPDATE_GUIDE.md를 참고하여 원본 저장소에서 템플릿 업데이트를 받아올 수 있습니다. content/ 폴더의 내용은 그대로 유지됩니다.",
    ],
  },
};

/** Falls back to English when the active locale isn't one of the six shipped translations. */
export function getProjectIntroCopy(locale: string): ProjectIntroCopy {
  return (
    PROJECT_INTRO_DICTIONARY[locale as ProjectIntroLocale] ?? PROJECT_INTRO_DICTIONARY.en
  );
}
