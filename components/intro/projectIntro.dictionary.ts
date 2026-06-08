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
  githubLabel: string;
  languageLabel: string;
  intro: string;
  featuresTitle: string;
  features: { title: string; description: string }[];
  uiTitle: string;
  uiDescription: string;
  uiSlots: { name: string; description: string }[];
  getStartedTitle: string;
  getStartedSteps: string[];
};

const PROJECT_INTRO_DICTIONARY: Record<ProjectIntroLocale, ProjectIntroCopy> = {
  en: {
    eyebrow: "Open-source storefront template",
    title: "UsedExchange",
    tagline:
      "A file-driven, database-free storefront for selling your second-hand things — fork it, fill in a folder, and ship a fast static site.",
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
    getStartedTitle: "Make it your own",
    getStartedSteps: [
      "Fork or clone the repository and install dependencies.",
      "Describe your store to the /setup skill, or edit content/config.ts by hand — name, location, currency, contact details, and the four UI slots above.",
      "Add your first listings to content/items/, then build and deploy the static output to GitHub Pages (or any static host).",
    ],
  },
  zh: {
    eyebrow: "开源二手商店模板",
    title: "UsedExchange",
    tagline:
      "一个以文件驱动、无需数据库的二手物品商店模板——复刻仓库、填好一个文件夹，即可上线一个快速的静态网站。",
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
    getStartedTitle: "把它变成你自己的商店",
    getStartedSteps: [
      "复刻或克隆这个仓库，并安装依赖。",
      "向 /setup 技能描述你的商店，或者手动编辑 content/config.ts——填写名称、所在地、货币、联系方式，以及上面提到的四个 UI 插槽。",
      "把你的第一批商品添加到 content/items/，然后构建并将静态产物部署到 GitHub Pages（或任意静态托管平台）。",
    ],
  },
  fr: {
    eyebrow: "Modèle de boutique open source",
    title: "UsedExchange",
    tagline:
      "Une boutique pilotée par fichiers, sans base de données, pour vendre vos articles d'occasion — clonez le dépôt, remplissez un dossier, et publiez un site statique rapide.",
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
    getStartedTitle: "Faites-en votre propre boutique",
    getStartedSteps: [
      "Clonez le dépôt et installez les dépendances.",
      "Décrivez votre boutique à la compétence /setup, ou modifiez content/config.ts à la main : nom, localisation, devise, coordonnées de contact, et les quatre emplacements d'interface ci-dessus.",
      "Ajoutez vos premières annonces dans content/items/, puis construisez et déployez le résultat statique sur GitHub Pages (ou tout autre hébergeur statique).",
    ],
  },
  es: {
    eyebrow: "Plantilla de tienda de código abierto",
    title: "UsedExchange",
    tagline:
      "Una tienda basada en archivos, sin base de datos, para vender tus artículos de segunda mano: bifurca el repositorio, completa una carpeta y publica un sitio estático rápido.",
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
    getStartedTitle: "Haz que sea tuya",
    getStartedSteps: [
      "Bifurca o clona el repositorio e instala las dependencias.",
      "Describe tu tienda a la habilidad /setup, o edita content/config.ts a mano: nombre, ubicación, moneda, datos de contacto y los cuatro espacios de interfaz mencionados arriba.",
      "Añade tus primeros artículos en content/items/, luego compila y despliega el resultado estático en GitHub Pages (o cualquier alojamiento estático).",
    ],
  },
  ja: {
    eyebrow: "オープンソースのストアテンプレート",
    title: "UsedExchange",
    tagline:
      "データベース不要、ファイルだけで動く中古品販売ストア——リポジトリをフォークし、フォルダを埋めるだけで、高速な静的サイトを公開できます。",
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
    getStartedTitle: "自分だけのストアにする",
    getStartedSteps: [
      "リポジトリをフォークまたはクローンし、依存関係をインストールします。",
      "/setup スキルにストアの内容を伝えるか、content/config.ts を直接編集します——名前、所在地、通貨、連絡先、そして上記の4つの UI スロットなど。",
      "最初の出品を content/items/ に追加し、ビルドした静的ファイルを GitHub Pages（または任意の静的ホスティング）にデプロイします。",
    ],
  },
  ko: {
    eyebrow: "오픈소스 스토어 템플릿",
    title: "UsedExchange",
    tagline:
      "데이터베이스 없이 파일만으로 운영되는 중고 물품 판매 스토어 — 저장소를 포크하고 폴더 하나만 채우면 빠른 정적 사이트를 바로 배포할 수 있습니다.",
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
    getStartedTitle: "나만의 스토어로 만들기",
    getStartedSteps: [
      "저장소를 포크하거나 클론한 뒤 의존성을 설치하세요.",
      "/setup 스킬에 스토어를 설명하거나 content/config.ts를 직접 편집하세요 — 이름, 위치, 통화, 연락처 정보, 그리고 위에서 설명한 네 가지 UI 슬롯 등을 포함합니다.",
      "첫 상품들을 content/items/에 추가한 뒤, 정적 결과물을 빌드하여 GitHub Pages(또는 다른 정적 호스팅)에 배포하세요.",
    ],
  },
};

/** Falls back to English when the active locale isn't one of the six shipped translations. */
export function getProjectIntroCopy(locale: string): ProjectIntroCopy {
  return (
    PROJECT_INTRO_DICTIONARY[locale as ProjectIntroLocale] ?? PROJECT_INTRO_DICTIONARY.en
  );
}
