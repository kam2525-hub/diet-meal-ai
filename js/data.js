/**
 * 実在するコンビニ・外食チェーンのメニューデータ
 * ※公表されている事実情報（商品名・カロリー・PFC・推定税込価格）
 * 画像無断転載を避け、視覚的で親しみやすいアイコンとタグで構成
 */

const MEAL_DATABASE = [
  // ==================== 朝食向け（セブン・ローソン・ファミマ・自炊軽食） ====================
  {
    id: "b_seven_1",
    name: "梅こんぶおむすび",
    store: "seven",
    storeName: "セブン",
    slot: "breakfast",
    calories: 168,
    p: 3.2,
    f: 0.8,
    c: 37.1,
    price: 130,
    icon: "🍙",
    tags: ["salty", "budget", "staple"]
  },
  {
    id: "b_seven_2",
    name: "味付き半熟ゆでたまご (1個)",
    store: "seven",
    storeName: "セブン",
    slot: "breakfast",
    calories: 65,
    p: 6.0,
    f: 4.4,
    c: 0.6,
    price: 105,
    icon: "🥚",
    tags: ["high_protein", "budget"]
  },
  {
    id: "b_seven_3",
    name: "とうふとわかめのおみそ汁",
    store: "seven",
    storeName: "セブン",
    slot: "breakfast",
    calories: 42,
    p: 2.8,
    f: 1.2,
    c: 4.9,
    price: 118,
    icon: "🥣",
    tags: ["soup", "budget", "warm"]
  },
  {
    id: "b_lawson_1",
    name: "NL ブランパン 2個入 (乳酸菌入)",
    store: "lawson",
    storeName: "ローソン",
    slot: "breakfast",
    calories: 134,
    p: 11.4,
    f: 5.4,
    c: 4.4,
    price: 149,
    icon: "🥖",
    tags: ["low_carb", "high_protein", "staple"]
  },
  {
    id: "b_lawson_2",
    name: "オイコス プレーン 砂糖不使用",
    store: "lawson",
    storeName: "ローソン",
    slot: "breakfast",
    calories: 71,
    p: 10.1,
    f: 0,
    c: 5.2,
    price: 198,
    icon: "🍶",
    tags: ["sweet", "high_protein", "clean"]
  },
  {
    id: "b_family_1",
    name: "直火焼き焼鮭おむすび",
    store: "family",
    storeName: "ファミマ",
    slot: "breakfast",
    calories: 182,
    p: 5.5,
    f: 1.8,
    c: 35.8,
    price: 168,
    icon: "🍙",
    tags: ["staple", "fish"]
  },
  {
    id: "b_family_2",
    name: "たんぱく質が摂れる！サラダチキンバー スモーク",
    store: "family",
    storeName: "ファミマ",
    slot: "breakfast",
    calories: 83,
    p: 14.5,
    f: 1.5,
    c: 2.8,
    price: 178,
    icon: "🍗",
    tags: ["high_protein", "salty", "meat"]
  },
  {
    id: "b_home_1",
    name: "バナナ1本 ＆ 納豆1パック (自宅軽食)",
    store: "home",
    storeName: "自宅軽食",
    slot: "breakfast",
    calories: 186,
    p: 8.5,
    f: 4.8,
    c: 32.0,
    price: 80,
    icon: "🍌",
    tags: ["budget", "clean", "healthy"]
  },

  // ==================== 昼食向け（コンビニ & 松屋・すき家・大戸屋） ====================
  {
    id: "l_seven_1",
    name: "たんぱく質が摂れる チキン＆チリ ロールパン",
    store: "seven",
    storeName: "セブン",
    slot: "lunch",
    calories: 298,
    p: 26.2,
    f: 9.8,
    c: 25.1,
    price: 399,
    icon: "🥪",
    tags: ["high_protein", "staple", "meat"]
  },
  {
    id: "l_seven_2",
    name: "豚しゃぶと根菜の胡麻サラダ",
    store: "seven",
    storeName: "セブン",
    slot: "lunch",
    calories: 162,
    p: 9.5,
    f: 8.2,
    c: 12.0,
    price: 430,
    icon: "🥗",
    tags: ["veggie", "meat"]
  },
  {
    id: "l_lawson_1",
    name: "たんぱく質が摂れる 蒸し鶏と玉子のサラダ",
    store: "lawson",
    storeName: "ローソン",
    slot: "lunch",
    calories: 185,
    p: 20.1,
    f: 9.2,
    c: 5.4,
    price: 497,
    icon: "🥗",
    tags: ["high_protein", "veggie"]
  },
  {
    id: "l_lawson_2",
    name: "もち麦入り 枝豆と塩昆布おにぎり",
    store: "lawson",
    storeName: "ローソン",
    slot: "lunch",
    calories: 172,
    p: 4.8,
    f: 1.9,
    c: 33.5,
    price: 140,
    icon: "🍙",
    tags: ["salty", "budget", "staple"]
  },
  {
    id: "l_family_1",
    name: "全粒粉サンド サラダチキンとたまご",
    store: "family",
    storeName: "ファミマ",
    slot: "lunch",
    calories: 312,
    p: 22.4,
    f: 11.5,
    c: 28.6,
    price: 350,
    icon: "🥪",
    tags: ["high_protein", "staple"]
  },
  {
    id: "l_matsuya_1",
    name: "牛焼肉定食（ライス小盛・生野菜＋ポン酢）",
    store: "matsuya",
    storeName: "松屋",
    slot: "lunch",
    calories: 610,
    p: 29.5,
    f: 22.0,
    c: 72.0,
    price: 790,
    icon: "🥩",
    tags: ["meat", "gourmet", "high_protein"]
  },
  {
    id: "l_sukiya_1",
    name: "牛丼ライト（ご飯の代わりに豆腐使用）並盛",
    store: "sukiya",
    storeName: "すき家",
    slot: "lunch",
    calories: 425,
    p: 25.1,
    f: 27.5,
    c: 17.9,
    price: 530,
    icon: "🍲",
    tags: ["low_carb", "meat", "high_protein"]
  },
  {
    id: "l_ootoya_1",
    name: "すけそう鱈と野菜の黒酢あん定食（五穀ご飯少なめ）",
    store: "ootoya",
    storeName: "大戸屋",
    slot: "lunch",
    calories: 590,
    p: 21.0,
    f: 15.0,
    c: 91.0,
    price: 990,
    icon: "🍱",
    tags: ["fish", "veggie", "healthy"]
  },

  // ==================== 夕食向け（夜軽め or 外食定食・コンビニ鍋・スープ） ====================
  {
    id: "d_seven_1",
    name: "1/2日分の野菜！キムチ鍋（豆腐・豚肉入り）",
    store: "seven",
    storeName: "セブン",
    slot: "dinner",
    calories: 278,
    p: 21.8,
    f: 11.4,
    c: 18.2,
    price: 572,
    icon: "🍲",
    tags: ["spicy", "high_protein", "warm", "veggie"]
  },
  {
    id: "d_seven_2",
    name: "銀鮭の塩焼き",
    store: "seven",
    storeName: "セブン",
    slot: "dinner",
    calories: 198,
    p: 18.5,
    f: 13.5,
    c: 0.2,
    price: 368,
    icon: "🐟",
    tags: ["fish", "high_protein", "salty"]
  },
  {
    id: "d_lawson_1",
    name: "国産サラダチキン プレーン ＆ 海藻と大根のサラダ",
    store: "lawson",
    storeName: "ローソン",
    slot: "dinner",
    calories: 165,
    p: 26.5,
    f: 2.5,
    c: 6.8,
    price: 490,
    icon: "🥗",
    tags: ["high_protein", "budget", "clean"]
  },
  {
    id: "d_ootoya_2",
    name: "しまほっけの炭火焼き定食（五穀ご飯少なめ）",
    store: "ootoya",
    storeName: "大戸屋",
    slot: "dinner",
    calories: 540,
    p: 38.0,
    f: 12.0,
    c: 68.0,
    price: 1050,
    icon: "🐟",
    tags: ["fish", "high_protein", "healthy"]
  },
  {
    id: "d_yoshinoya_1",
    name: "牛鮭定食（ご飯少なめ）",
    store: "yoshinoya",
    storeName: "吉野家",
    slot: "dinner",
    calories: 630,
    p: 31.0,
    f: 22.0,
    c: 75.0,
    price: 745,
    icon: "🥩",
    tags: ["meat", "fish", "high_protein"]
  },

  // ==================== 間食・スイーツ枠（甘いもの / しょっぱいもの） ====================
  {
    id: "s_sweet_1",
    name: "SUNAO バニラアイス（糖質50%オフ）",
    store: "lawson",
    storeName: "ローソン/コンビニ",
    slot: "snack",
    calories: 80,
    p: 2.4,
    f: 4.1,
    c: 9.3,
    price: 180,
    icon: "🍨",
    tags: ["sweet", "snack"]
  },
  {
    id: "s_sweet_2",
    name: "糖質70%オフ チョコチップスコーン",
    store: "seven",
    storeName: "セブン",
    slot: "snack",
    calories: 145,
    p: 4.5,
    f: 7.2,
    c: 13.0,
    price: 170,
    icon: "🍪",
    tags: ["sweet", "chocolate", "snack"]
  },
  {
    id: "s_sweet_3",
    name: "寒天ゼリー ゼロカロリー ぶどう味",
    store: "family",
    storeName: "ファミマ",
    slot: "snack",
    calories: 0,
    p: 0,
    f: 0,
    c: 0.5,
    price: 120,
    icon: "🍇",
    tags: ["sweet", "zero_cal", "budget", "snack"]
  },
  {
    id: "s_salty_1",
    name: "やわらかスモーク豚タン",
    store: "seven",
    storeName: "セブン",
    slot: "snack",
    calories: 104,
    p: 13.2,
    f: 5.6,
    c: 0.5,
    price: 246,
    icon: "🥓",
    tags: ["salty", "high_protein", "snack"]
  },
  {
    id: "s_salty_2",
    name: "三陸産くきわかめ (梅しそ味)",
    store: "seven",
    storeName: "セブン/ファミマ",
    slot: "snack",
    calories: 28,
    p: 0.8,
    f: 0.1,
    c: 5.8,
    price: 140,
    icon: "🌿",
    tags: ["salty", "budget", "low_cal", "snack"]
  },
  {
    id: "s_salty_3",
    name: "パリパリ食感のこんにゃくチップス のり塩味",
    store: "lawson",
    storeName: "ローソン",
    slot: "snack",
    calories: 61,
    p: 0.2,
    f: 2.1,
    c: 9.8,
    price: 168,
    icon: "🥔",
    tags: ["salty", "low_cal", "snack"]
  },

  // ==================== ドリンク・カフェ枠 ====================
  {
    id: "dr_starbucks_1",
    name: "スターバックス カフェアメリカーノ (Short/無脂肪乳)",
    store: "starbucks",
    storeName: "スタバ",
    slot: "drink",
    calories: 11,
    p: 0.7,
    f: 0.1,
    c: 1.8,
    price: 430,
    icon: "☕",
    tags: ["drink", "cafe", "low_cal"]
  },
  {
    id: "dr_starbucks_2",
    name: "スターバックス ソイラテ (Tall/ホット/無糖シロップ)",
    store: "starbucks",
    storeName: "スタバ",
    slot: "drink",
    calories: 191,
    p: 10.2,
    f: 9.8,
    c: 14.1,
    price: 520,
    icon: "☕",
    tags: ["drink", "cafe", "high_protein"]
  },
  {
    id: "dr_seven_1",
    name: "セブンカフェ アイスカフェラテ (R/無糖)",
    store: "seven",
    storeName: "セブンカフェ",
    slot: "drink",
    calories: 78,
    p: 4.1,
    f: 4.2,
    c: 5.9,
    price: 240,
    icon: "🧊☕",
    tags: ["drink", "cafe", "budget"]
  },
  {
    id: "dr_seven_2",
    name: "サントリー 伊右衛門 特茶（特定保健用食品）500ml",
    store: "seven",
    storeName: "コンビニ各社",
    slot: "drink",
    calories: 0,
    p: 0,
    f: 0,
    c: 0,
    price: 190,
    icon: "🍵",
    tags: ["drink", "zero_cal", "healthy"]
  },
  {
    id: "dr_seven_3",
    name: "ペプシスペシャル ゼロ 490ml",
    store: "all",
    storeName: "コンビニ各社",
    slot: "drink",
    calories: 0,
    p: 0,
    f: 0,
    c: 0,
    price: 170,
    icon: "🥤",
    tags: ["drink", "sweet", "zero_cal"]
  },
  // ==================== 一般的な家庭料理・定番主食・フルーツ ====================
  { id: "h_rice", name: "白ご飯 (茶碗1杯 150g)", store: "home", storeName: "主食", slot: "breakfast", calories: 234, p: 3.8, f: 0.5, c: 53.4, price: 50, icon: "🍚", tags: ["staple", "home"] },
  { id: "h_toast", name: "食パン (6枚切 1枚 バター付)", store: "home", storeName: "主食", slot: "breakfast", calories: 210, p: 5.5, f: 6.8, c: 31.0, price: 40, icon: "🍞", tags: ["staple", "bread"] },
  { id: "h_egg_fried", name: "目玉焼き (1個)", store: "home", storeName: "家庭料理", slot: "breakfast", calories: 95, p: 6.5, f: 7.2, c: 0.2, price: 30, icon: "🍳", tags: ["high_protein", "egg"] },
  { id: "h_tamagoyaki", name: "卵焼き (2切れ)", store: "home", storeName: "家庭料理", slot: "breakfast", calories: 145, p: 8.2, f: 9.8, c: 4.5, price: 60, icon: "🥚", tags: ["high_protein", "egg"] },
  { id: "h_natto", name: "納豆 (1パック タレ・からし付)", store: "home", storeName: "家庭料理", slot: "breakfast", calories: 86, p: 7.4, f: 4.4, c: 5.4, price: 35, icon: "🥢", tags: ["healthy", "high_protein"] },
  { id: "h_miso", name: "豆腐とわかめの味噌汁 (1杯)", store: "home", storeName: "家庭料理", slot: "breakfast", calories: 55, p: 3.8, f: 1.8, c: 5.2, price: 40, icon: "🥣", tags: ["soup", "healthy"] },
  { id: "h_banana", name: "バナナ (1本 中サイズ)", store: "fresh", storeName: "果物", slot: "snack", calories: 86, p: 1.1, f: 0.2, c: 22.5, price: 50, icon: "🍌", tags: ["fruit", "healthy"] },
  { id: "h_apple", name: "りんご (1/2個)", store: "fresh", storeName: "果物", slot: "snack", calories: 70, p: 0.3, f: 0.2, c: 18.0, price: 80, icon: "🍎", tags: ["fruit", "healthy"] },
  { id: "h_milk", name: "牛乳 (コップ1杯 200ml)", store: "home", storeName: "飲料", slot: "breakfast", calories: 134, p: 6.6, f: 7.6, c: 9.6, price: 55, icon: "🥛", tags: ["drink", "high_protein"] },
  { id: "h_curry", name: "チキンカレーライス (普通盛り)", store: "home", storeName: "家庭料理", slot: "lunch", calories: 680, p: 18.5, f: 20.0, c: 105.0, price: 350, icon: "🍛", tags: ["staple", "curry"] },
  { id: "h_hamburg", name: "デミグラスハンバーグ (付け合わせ付)", store: "home", storeName: "家庭料理", slot: "dinner", calories: 480, p: 26.0, f: 28.5, c: 24.0, price: 300, icon: "🥩", tags: ["high_protein", "meat"] },
  { id: "h_karaage", name: "鶏のからあげ (4個)", store: "home", storeName: "家庭料理", slot: "dinner", calories: 340, p: 22.0, f: 22.0, c: 11.0, price: 200, icon: "🍗", tags: ["high_protein", "fried"] },
  { id: "h_salmon", name: "焼き鮭・塩鮭 (1切れ)", store: "home", storeName: "家庭料理", slot: "breakfast", calories: 195, p: 22.4, f: 11.0, c: 0.1, price: 180, icon: "🐟", tags: ["high_protein", "fish"] },
  { id: "h_udon", name: "かけうどん (ねぎ・かまぼこ)", store: "home", storeName: "麺類", slot: "lunch", calories: 320, p: 8.5, f: 2.0, c: 65.0, price: 150, icon: "🍜", tags: ["noodle", "staple"] },
  { id: "h_ramen", name: "醤油ラーメン (チャーシュー・メンマ)", store: "home", storeName: "麺類", slot: "lunch", calories: 520, p: 21.0, f: 16.5, c: 72.0, price: 400, icon: "🍜", tags: ["noodle", "soup"] },
  { id: "h_pasta", name: "ミートソースパスタ (普通盛り)", store: "home", storeName: "麺類", slot: "lunch", calories: 590, p: 21.5, f: 18.0, c: 84.0, price: 250, icon: "🍝", tags: ["noodle", "pasta"] },
  { id: "h_gyudon", name: "牛丼 (並盛り つゆ普通)", store: "home", storeName: "外食", slot: "lunch", calories: 650, p: 20.0, f: 23.0, c: 88.0, price: 480, icon: "🍚", tags: ["meat", "staple"] },
  { id: "h_tonkatsu", name: "とんかつ・ロースカツ (1枚)", store: "home", storeName: "家庭料理", slot: "dinner", calories: 460, p: 24.0, f: 34.0, c: 12.0, price: 320, icon: "🍱", tags: ["meat", "fried"] },
  { id: "h_sandwich", name: "ミックスサンド (ハム・たまご・レタス)", store: "seven", storeName: "コンビニ", slot: "breakfast", calories: 285, p: 10.2, f: 13.5, c: 29.5, price: 280, icon: "🥪", tags: ["bread", "staple"] },
  { id: "h_salad_chicken", name: "国産鶏サラダチキン プレーン", store: "all", storeName: "コンビニ", slot: "lunch", calories: 115, p: 24.5, f: 1.2, c: 0.5, price: 230, icon: "🥗", tags: ["high_protein", "clean"] },
  { id: "h_protein_bar", name: "プロテインバー (チョコ味)", store: "all", storeName: "間食", slot: "snack", calories: 195, p: 15.0, f: 9.5, c: 12.5, price: 160, icon: "🍫", tags: ["snack", "high_protein"] }
];

/**
 * =========================================================================
 * 世界の料理マスターデータベース (World Food Database)
 * 日本食・韓国・中華・タイ・ベトナム・イタリア・メキシコ・アメリカ・インド・中東等
 * =========================================================================
 */
const WORLD_FOOD_DATABASE = [
  // 🇯🇵 日本料理・定食・丼・麺類
  { name: "牛カルビ焼肉定食 (ご飯普通・スープ・キムチ)", calories: 780, p: 32.0, f: 34.0, c: 84.0, icon: "🥩", country: "日本", advice: "🥩 牛肉の良質なたんぱく質と鉄分！ご飯を適量に抑えればダイエット中も優秀。" },
  { name: "牛ハラミ定食 (ご飯普通・わかめスープ付)", calories: 650, p: 38.0, f: 22.0, c: 78.0, icon: "🥩", country: "日本", advice: "✨ 低脂質・超高タンパクなハラミ！脂肪燃焼を促すL-カルニチン豊富。" },
  { name: "豚ロース生姜焼き定食 (キャベツ・味噌汁付)", calories: 680, p: 28.0, f: 24.0, c: 85.0, icon: "🐷", country: "日本", advice: "🐷 ビタミンB1で疲労回復！糖質の代謝をスムーズにします。" },
  { name: "ロースとんかつ定食 (すり胡麻ソース)", calories: 840, p: 32.0, f: 38.0, c: 92.0, icon: "🍱", country: "日本", advice: "💡 食べごたえ満点！キャベツを先に食べることで血糖値の上昇を抑制。" },
  { name: "チキン南蛮定食 (特製タルタルソース)", calories: 880, p: 35.0, f: 42.0, c: 90.0, icon: "🍗", country: "日本", advice: "🍗 たんぱく質しっかり補給！夕食の脂質を控えめにして相殺。" },
  { name: "若鶏のから揚げ定食 (4個 レモン添え)", calories: 720, p: 32.0, f: 28.0, c: 82.0, icon: "🍗", country: "日本", advice: "🍗 定番からあげ！レモンを搾ることで脂っこさを抑えて代謝サポート。" },
  { name: "デミグラスハンバーグ定食 (目玉焼き付)", calories: 740, p: 30.0, f: 32.0, c: 80.0, icon: "🥩", country: "日本", advice: "🥩 ジューシーなハンバーグ！睡眠中の筋肉修復をサポート。" },
  { name: "サバの塩焼き定食 (大根おろし・味噌汁付)", calories: 540, p: 31.0, f: 18.0, c: 62.0, icon: "🐟", country: "日本", advice: "✨ 理想的な魚定食！DHA・EPA豊富で血液サラサラ＆代謝促進。" },
  { name: "特上にぎり寿司盛り合わせ (8貫)", calories: 520, p: 26.5, f: 6.2, c: 88.0, icon: "🍣", country: "日本", advice: "✨ 超低脂質・高タンパク！アスリートにも愛される究極の和食。" },
  { name: "まぐろサーモン海鮮丼 (並盛)", calories: 580, p: 32.0, f: 8.5, c: 92.0, icon: "🍣", country: "日本", advice: "🐟 サーモンのアスタキサンチンとマグロの鉄分！美容にも◎。" },
  { name: "ふわとろ親子丼 (並盛 三つ葉添え)", calories: 580, p: 28.0, f: 14.0, c: 85.0, icon: "🍚", country: "日本", advice: "✨ 鶏肉と卵で低脂質・高タンパク！減量中にも大満足の一杯。" },
  { name: "豚ロースかつ丼 (並盛)", calories: 820, p: 29.0, f: 32.0, c: 104.0, icon: "🍚", country: "日本", advice: "💡 がっつりスタミナ飯！活動量が多い日のお昼にぴったり。" },
  { name: "特製牛丼 (並盛 つゆだく・紅生姜)", calories: 650, p: 20.0, f: 22.0, c: 92.0, icon: "🍚", country: "日本", advice: "🍚 牛肉の旨味！紅生姜のカプサイシンで代謝アップ。" },
  { name: "海老と季節野菜の天丼 (並盛)", calories: 730, p: 18.0, f: 26.0, c: 102.0, icon: "🍤", country: "日本", advice: "🍤 ぷりぷり海老天！お味噌汁を添えて消化を促しましょう。" },
  { name: "うな重 (並 肝吸い・お新香付)", calories: 680, p: 28.0, f: 22.0, c: 90.0, icon: "🍱", country: "日本", advice: "✨ ビタミンA・B群が豊富！夏バテ防止と疲労回復に抜群。" },
  { name: "醤油チャーシュー麺 (並盛)", calories: 620, p: 25.0, f: 18.5, c: 88.0, icon: "🍜", country: "日本", advice: "🍜 定番醤油！スープを残すことで脂質・塩分を約30%カット可能。" },
  { name: "濃厚豚骨ラーメン (並盛 ネギ・煮卵)", calories: 780, p: 28.0, f: 32.0, c: 94.0, icon: "🍜", country: "日本", advice: "🍜 コク深い濃厚スープ！野菜トッピングを追加すると食物繊維◎。" },
  { name: "讃岐肉うどん (温泉卵トッピング)", calories: 520, p: 22.0, f: 12.0, c: 78.0, icon: "🍜", country: "日本", advice: "✨ 消化吸収が良く胃腸に優しい！素早いエネルギー補給に。" },
  { name: "博多もつ鍋定食 (ちゃんぽん麺付)", calories: 740, p: 32.0, f: 28.0, c: 85.0, icon: "🍲", country: "日本", advice: "🍲 コラーゲンたっぷりの牛もつとニラ！発汗作用でデトックス。" },
  { name: "牛すき焼き御膳 (生卵・ご飯・味噌汁)", calories: 780, p: 34.0, f: 26.0, c: 98.0, icon: "🥩", country: "日本", advice: "💡 甘辛い割下と牛肉！良質なたんぱく質と野菜がバランス良く摂れます。" },

  // 🇰🇷 韓国料理
  { name: "野菜たっぷり石焼ビビンバ (温泉卵・コチュジャン)", calories: 620, p: 18.0, f: 16.0, c: 98.0, icon: "🍚", country: "韓国", advice: "✨ たっぷりナムルで食物繊維豊富！おこげの香ばしさと満足感。" },
  { name: "海鮮スンドゥブチゲ (あさり・豆腐・卵)", calories: 340, p: 24.0, f: 14.0, c: 26.0, icon: "🥣", country: "韓国", advice: "🔥 カプサイシンで脂肪燃焼促進！大豆イソフラボンと貝のタウリンで肝臓も元気。" },
  { name: "サムギョプサル定食 (サンチュ・エゴマ・キムチ包み)", calories: 780, p: 32.0, f: 45.0, c: 55.0, icon: "🥩", country: "韓国", advice: "🥬 サンチュでたっぷり巻くのがコツ！脂を落としてビタミンB1補給。" },
  { name: "韓国ヤンニョムチキン (甘辛チキン 4ピース)", calories: 650, p: 32.0, f: 28.0, c: 62.0, icon: "🍗", country: "韓国", advice: "🍗 甘辛ソースが食欲を刺激！夕食の炭水化物を控えめにして調整。" },
  { name: "本場韓国冷麺 (酢・からし・ゆで卵)", calories: 440, p: 14.0, f: 4.5, c: 84.0, icon: "🍜", country: "韓国", advice: "✨ 超低脂質でさっぱり！そば粉麺で血糖値の上昇も緩やか。" },
  { name: "海鮮ニラチヂミ (特製タレ付)", calories: 420, p: 15.0, f: 18.0, c: 48.0, icon: "🥟", country: "韓国", advice: "🦐 ニラのアリシンで疲労回復！シェアして食べるのがおすすめ。" },
  { name: "韓国風のり巻き キンパ (1本)", calories: 480, p: 14.0, f: 12.0, c: 78.0, icon: "🍙", country: "韓国", advice: "🥕 ごま油の風味とたっぷり具材！手軽でバランスの良い韓国軽食。" },
  { name: "旨辛トッポギ (ゆで卵・おでん入り)", calories: 460, p: 10.0, f: 6.0, c: 92.0, icon: "🍢", country: "韓国", advice: "💡 モチモチお米のトック！運動前のエネルギー補給に最適。" },
  { name: "牛プルコギ定食 (春雨・野菜炒め)", calories: 690, p: 30.0, f: 22.0, c: 88.0, icon: "🥩", country: "韓国", advice: "🥩 牛肉の鉄分補給！甘辛醤油ダレでご飯が進むスタミナ定食。" },
  { name: "薬膳サムゲタン (参鶏湯 半身)", calories: 480, p: 42.0, f: 16.0, c: 38.0, icon: "🥣", country: "韓国", advice: "✨ 高麗人参と丸鶏の滋養強壮！高タンパク・低脂質の究極回復食。" },

  // 🇨🇳 中華・台湾料理
  { name: "四川風麻婆豆腐定食 (花椒・豆板醤)", calories: 680, p: 25.0, f: 26.0, c: 84.0, icon: "🍲", country: "中華", advice: "🔥 花椒と唐辛子で代謝アップ！豆腐の植物性たんぱく質がたっぷり。" },
  { name: "五目パラパラ炒飯 (スープ付)", calories: 670, p: 18.0, f: 22.0, c: 96.0, icon: "🍚", country: "中華", advice: "🍳 香ばしい中華の王道！夕食で野菜を多めに摂ってバランスを整えます。" },
  { name: "パリッと焼き餃子 (6個 酢コショウ)", calories: 340, p: 14.0, f: 18.0, c: 28.0, icon: "🥟", country: "中華", advice: "🥟 酢コショウで食べると塩分・糖質カット！ニラと豚肉で疲労回復。" },
  { name: "特製小籠包 (4個 黒酢・生姜添え)", calories: 260, p: 12.0, f: 14.0, c: 20.0, icon: "🥟", country: "中華", advice: "✨ 熱々のコラーゲンスープ！黒酢と生姜で脂肪燃焼をサポート。" },
  { name: "濃厚胡麻担々麺 (ピリ辛肉味噌)", calories: 780, p: 26.0, f: 35.0, c: 88.0, icon: "🍜", country: "中華", advice: "🍜 胡麻のセサミンで抗酸化！スープを残してカロリー調整を。" },
  { name: "エビのチリソース定食 (海老チリ)", calories: 620, p: 24.0, f: 16.0, c: 92.0, icon: "🦐", country: "中華", advice: "✨ 高タンパクで比較的低脂質なエビ料理！プリプリの満足感。" },
  { name: "回鍋肉 (ホイコーロー) 定食", calories: 750, p: 26.0, f: 34.0, c: 82.0, icon: "🥬", country: "中華", advice: "🥬 キャベツのビタミンUで胃腸を守る！豚肉のビタミンB1も◎。" },
  { name: "青椒肉絲 (チンジャオロース) 定食", calories: 640, p: 26.0, f: 22.0, c: 82.0, icon: "🥩", country: "中華", advice: "✨ ピーマンのビタミンCと細切り牛肉！脂質控えめで優秀な中華。" },
  { name: "黒酢酢豚定食 (彩り野菜添え)", calories: 690, p: 24.0, f: 25.0, c: 88.0, icon: "🐷", country: "中華", advice: "🐷 黒酢のクエン酸で疲労回復！玉ねぎと人参で抗酸化。" },
  { name: "台湾ルーローハン (魯肉飯 煮卵・高菜付)", calories: 680, p: 26.0, f: 28.0, c: 78.0, icon: "🍚", country: "台湾", advice: "💡 五香粉の香りと甘辛豚角煮！異国情緒溢れるスタミナ丼。" },

  // 🇹🇭 タイ・ベトナム・東南アジア
  { name: "タイ風ガパオライス (鶏ひき肉バジル炒め・目玉焼き)", calories: 640, p: 28.0, f: 22.0, c: 78.0, icon: "🍚", country: "タイ", advice: "✨ ホーリーバジルと唐辛子で発汗代謝！鶏ひき肉で高タンパク。" },
  { name: "本場トムヤムクン (海老・ハーブスープ)", calories: 180, p: 16.0, f: 6.0, c: 14.0, icon: "🥣", country: "タイ", advice: "🔥 世界三大スープ！超低脂質・低カロリーでハーブの抗酸化作用絶大。" },
  { name: "パッタイ (タイ風海老焼きそば ピーナッツ添え)", calories: 590, p: 20.0, f: 18.0, c: 84.0, icon: "🍜", country: "タイ", advice: "🦐 米粉麺でグルテンフリー！ライムをたっぷり搾って爽やかに。" },
  { name: "チキングリーンカレー (ジャスミンライス付)", calories: 690, p: 24.0, f: 32.0, c: 74.0, icon: "🍛", country: "タイ", advice: "🥥 ココナッツミルクの良質な中鎖脂肪酸！エネルギーに変わりやすい。" },
  { name: "カオマンガイ (タイ風蒸し鶏ご飯 特製生姜ダレ)", calories: 580, p: 32.0, f: 14.0, c: 78.0, icon: "🍚", country: "タイ", advice: "✨ 柔らかい蒸し鶏で高タンパク・低脂質！減量中にも大人気の一皿。" },
  { name: "ベトナム牛肉フォー (ハーブ・ライム付)", calories: 420, p: 22.0, f: 6.5, c: 68.0, icon: "🍜", country: "ベトナム", advice: "✨ 超ヘルシーなあっさり牛骨スープ！低脂質で胃にも優しい。" },
  { name: "ベトナム生春巻き (海老・豚肉・野菜 2本)", calories: 190, p: 12.0, f: 2.5, c: 28.0, icon: "🥗", country: "ベトナム", advice: "✨ ほぼ野菜と海老で超低脂質！ダイエットの最高のおつまみ・前菜。" },
  { name: "ベトナム風サンドイッチ バインミー (豚肉・レバーペースト)", calories: 480, p: 22.0, f: 16.0, c: 60.0, icon: "🥖", country: "ベトナム", advice: "🥖 パクチーとなますの酸味！クリスピーなフランスパンサンド。" },
  { name: "インドネシア風ナシゴレン (目玉焼き・えびせん付)", calories: 650, p: 22.0, f: 20.0, c: 92.0, icon: "🍚", country: "東南アジア", advice: "🍳 サンバルソースのスパイシー炒飯！目玉焼きでたんぱく質補給。" },

  // 🇮🇹 イタリア・西洋・地中海料理
  { name: "マルゲリータピザ (1枚 Mサイズ)", calories: 680, p: 28.0, f: 22.0, c: 88.0, icon: "🍕", country: "イタリア", advice: "🍕 シンプルなトマトとモッツァレラ！オリーブオイルの良質なオメガ9。" },
  { name: "濃厚カルボナーラ (生パスタ・パンチェッタ)", calories: 740, p: 26.0, f: 34.0, c: 80.0, icon: "🍝", country: "イタリア", advice: "🍝 卵黄とペコリーノチーズのコク！夕食の脂質を抑えてバランス調整。" },
  { name: "ボロネーゼ (牛挽肉の赤ワイン煮込みパスタ)", calories: 640, p: 28.0, f: 20.0, c: 84.0, icon: "🍝", country: "イタリア", advice: "🍅 牛赤身肉の旨味とトマトのリコピン！良質なたんぱく質パスタ。" },
  { name: "魚介たっぷりペスカトーレ (ムール貝・海老・イカ)", calories: 520, p: 32.0, f: 10.0, c: 74.0, icon: "🍝", country: "イタリア", advice: "✨ シーフード満載で超高タンパク・低脂質！ダイエッターに最適パスタ。" },
  { name: "シーフードパエリア (サフランライス・海老・貝)", calories: 620, p: 28.0, f: 14.0, c: 92.0, icon: "🥘", country: "スペイン", advice: "🥘 サフランの抗酸化作用と魚介の出汁！低脂質で贅沢な地中海料理。" },
  { name: "海老とマッシュルームのアヒージョ (バゲット2枚付)", calories: 460, p: 18.0, f: 32.0, c: 24.0, icon: "🍤", country: "スペイン", advice: "🧄 オリーブオイルとニンニクのスタミナ！良質な脂質を適量摂取。" },
  { name: "白身魚のアクアパッツァ (アサリ・ミニトマト・オリーブ)", calories: 340, p: 32.0, f: 12.0, c: 8.0, icon: "🐟", country: "イタリア", advice: "✨ 高タンパク・糖質ほぼゼロ！睡眠前のディナーに超おすすめ。" },
  { name: "特製オムライス (ふわとろ卵・デミグラスソース)", calories: 690, p: 22.0, f: 24.0, c: 94.0, icon: "🍳", country: "洋食", advice: "🍳 卵の完全栄養！サラダを添えて食物繊維を補うのがベスト。" },
  { name: "厚切りローストビーフ丼 (西洋わさびソース)", calories: 620, p: 36.0, f: 16.0, c: 80.0, icon: "🥩", country: "イギリス", advice: "✨ 牛赤身もも肉で超高タンパク・低脂質！減量期のご褒美に最高。" },

  // 🇲🇽 メキシコ・アメリカ料理
  { name: "ダブルチーズバーガー (ビーフパティ2枚・チェダー)", calories: 560, p: 32.0, f: 30.0, c: 40.0, icon: "🍔", country: "アメリカ", advice: "🍔 赤身ビーフでしっかりたんぱく質！サイドメニューをサラダに。" },
  { name: "メキシカンタコス (2個 牛挽肉・サルサ・アボカド)", calories: 420, p: 24.0, f: 18.0, c: 38.0, icon: "🌮", country: "メキシコ", advice: "✨ トマトサルサでビタミン！トウモロコシ生地で食物繊維も豊富。" },
  { name: "ビーフブリトー (黒豆・ライス・チーズ包み)", calories: 620, p: 30.0, f: 22.0, c: 74.0, icon: "🌯", country: "メキシコ", advice: "🌯 豆と牛肉で植物性＆動物性Wたんぱく質！腹持ち抜群。" },
  { name: "サーロインステーキ (200g グリル野菜添え)", calories: 540, p: 44.0, f: 28.0, c: 6.0, icon: "🥩", country: "アメリカ", advice: "✨ 圧倒的な高タンパク・超低糖質！筋肉の成長と脂肪燃焼を加速。" },
  { name: "クラムチャウダー (あさり・ベーコン・じゃがいも)", calories: 280, p: 12.0, f: 14.0, c: 26.0, icon: "🥣", country: "アメリカ", advice: "🥣 あさりのタウリンと鉄分！身体が温まり代謝をキープ。" },

  // 🇮🇳 インド・中東料理
  { name: "バターチキンカレー ＆ プレーンナン", calories: 780, p: 28.0, f: 32.0, c: 92.0, icon: "🍛", country: "インド", advice: "🍛 トマトとカシューナッツの濃厚カレー！タンドリーチキンでたんぱく質補給。" },
  { name: "スパイシーキーマカレー ＆ ターメリックライス", calories: 660, p: 26.0, f: 22.0, c: 88.0, icon: "🍛", country: "インド", advice: "✨ ターメリックのクルクミンで肝機能活性！スパイスで基礎代謝アップ。" },
  { name: "インド風チキンビリヤニ (ライタヨーグルト付)", calories: 640, p: 32.0, f: 18.0, c: 85.0, icon: "🍚", country: "インド", advice: "✨ バスマティライスとスパイス炊き込みご飯！低GIで血糖値が上がりにくい。" },
  { name: "タンドリーチキン (骨付きチキン 2本)", calories: 340, p: 38.0, f: 12.0, c: 6.0, icon: "🍗", country: "インド", advice: "✨ ヨーグルトとスパイス漬け込みで超高タンパク・低脂質！減量飯の王様。" },
  { name: "シシケバブサンド (ピタパン・チキン・ヨーグルトソース)", calories: 480, p: 30.0, f: 14.0, c: 54.0, icon: "🥙", country: "トルコ", advice: "✨ グリル肉と新鮮野菜！脂を落として香ばしく焼いたヘルシーファストフード。" },
  { name: "フムス＆ピタパン (ひよこ豆ペースト・オリーブ油)", calories: 360, p: 14.0, f: 16.0, c: 42.0, icon: "🫓", country: "中東", advice: "✨ ひよこ豆の良質な植物性たんぱく質と食物繊維！地中海ダイエットの定番。" },

  // 🌺 ハワイ・オセアニア
  { name: "ロコモコ丼 (ハンバーグ・目玉焼き・グレイビー)", calories: 720, p: 30.0, f: 28.0, c: 86.0, icon: "🍳", country: "ハワイ", advice: "🍳 ハンバーグと卵のWプロテイン！午後のアクティビティ前のエネルギー源。" },
  { name: "ハワイアン アヒポキ丼 (新鮮マグロ・アボカド・海藻)", calories: 540, p: 32.0, f: 14.0, c: 72.0, icon: "🥑", country: "ハワイ", advice: "✨ マグロの良質たんぱく質＋アボカドの不飽和脂肪酸！美容と減量に最強の丼。" },
  { name: "アサイーボウル (ベリー・バナナ・グラノーラ・蜂蜜)", calories: 360, p: 8.0, f: 9.0, c: 62.0, icon: "🥣", country: "ハワイ", advice: "🫐 ポリフェノールと鉄分の宝庫！朝食や運動前のスーパーフード。" }
];

/**
 * =========================================================================
 * 世界のあらゆる料理に対応する「AI動的栄養推計エンジン」
 * 未知の料理名でも、食材・調理法・盛り付けから瞬時にカロリー・PFCを自動計算
 * =========================================================================
 */
function estimateWorldFoodNutrition(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") return null;
  const q = rawQuery.trim();
  if (!q) return null;
  const qLower = q.toLowerCase();

  // 1. 完全・部分一致検索 (WORLD_FOOD_DATABASE)
  const matches = WORLD_FOOD_DATABASE.filter(f => {
    const fn = f.name.toLowerCase();
    return fn.includes(qLower) || qLower.includes(fn.split(" ")[0]);
  });
  if (matches.length > 0) {
    return matches[0];
  }

  // 2. 未知の料理に対する「AI形態素・栄養推計アルゴリズム」
  let cal = 520;
  let p = 20.0;
  let f = 16.0;
  let c = 68.0;
  let icon = "🍽️";

  // ① 料理ジャンル・形態の特定
  if (/定食|セット|御膳|プレート/.test(q)) {
    cal = 720; p = 28.0; f = 22.0; c = 88.0; icon = "🍱";
  } else if (/丼|重|ライス|炒飯|チャーハン|ピラフ|リゾット|カレー|ルーローハン|ビリヤニ/.test(q)) {
    cal = 680; p = 22.0; f = 20.0; c = 95.0; icon = "🍚";
  } else if (/ラーメン|らーめん|拉麺|つけ麺|うどん|そば|蕎麦|パスタ|スパゲッティ|フォー|パッタイ|焼きそば|麺/.test(q)) {
    cal = 580; p = 18.0; f = 16.0; c = 78.0; icon = "🍜";
  } else if (/サラダ|和え|ナムル|キムチ|マリネ|カルパッチョ|生春巻き|セビーチェ/.test(q)) {
    cal = 180; p = 8.0; f = 8.0; c = 12.0; icon = "🥗";
  } else if (/スープ|チゲ|汁|シチュー|ポトフ|トムヤムクン|ボルシチ|鍋|煮込み/.test(q)) {
    cal = 240; p = 16.0; f = 10.0; c = 18.0; icon = "🥣";
  } else if (/バーガー|サンド|トースト|ホットドッグ|タコス|ブリトー|ケバブ|バインミー/.test(q)) {
    cal = 520; p = 24.0; f = 22.0; c = 52.0; icon = "🍔";
  } else if (/ピザ|ピッツァ|ナン|フォッカチャ/.test(q)) {
    cal = 620; p = 22.0; f = 25.0; c = 72.0; icon = "🍕";
  } else if (/ケーキ|パフェ|アイス|プリン|クレープ|パンケーキ|ワッフル|タルト|チュロス/.test(q)) {
    cal = 360; p = 5.0; f = 18.0; c = 45.0; icon = "🍰";
  } else if (/コーヒー|ラテ|紅茶|ミルクティー|スムージー|ジュース|シェイク/.test(q)) {
    cal = 140; p = 4.0; f = 4.5; c = 20.0; icon = "☕";
  }

  // ② メイン食材（タンパク質源）の特定
  if (/牛|カルビ|ロース|ハラミ|タン|ステーキ|ビーフ|サーロイン/.test(q)) {
    p += 12.0; f += 10.0; cal += 140;
  } else if (/豚|ポーク|豚バラ|生姜焼き|とんかつ|サムギョプサル|プルコギ|角煮/.test(q)) {
    p += 9.0; f += 8.0; cal += 110;
  } else if (/鶏|チキン|ささみ|もも|からあげ|唐揚|タンドリー/.test(q)) {
    p += 14.0; f += 3.0; cal += 70;
  } else if (/魚|サーモン|マグロ|海老|エビ|シーフード|タコ|イカ|ホタテ|アサリ/.test(q)) {
    p += 12.0; f -= 2.0; cal += 40;
  } else if (/豆腐|大豆|納豆|豆|フムス/.test(q)) {
    p += 8.0; f += 2.0; cal += 50;
  }

  // ③ 調理法・調味料による増減
  if (/揚げ|フライ|カツ|天ぷら|からあげ|南蛮|ヤンニョム/.test(q)) {
    f += 14.0; c += 10.0; cal += 180;
  }
  if (/チーズ|マヨ|バター|クリーム|濃厚|タルタル/.test(q)) {
    f += 12.0; cal += 130;
  }
  if (/蒸し|茹で|ボイル|刺身|ノンオイル/.test(q)) {
    f = Math.max(3.0, f - 6.0); cal -= 60;
  }

  // ④ 盛り付けサイズ
  if (/大盛り|大盛|特盛|メガ|倍|マシ/.test(q)) {
    cal = Math.round(cal * 1.35);
    p = Math.round(p * 1.25 * 10) / 10;
    f = Math.round(f * 1.25 * 10) / 10;
    c = Math.round(c * 1.40 * 10) / 10;
  } else if (/小盛り|少なめ|ハーフ|ミニ|半分/.test(q)) {
    cal = Math.round(cal * 0.70);
    p = Math.round(p * 0.75 * 10) / 10;
    f = Math.round(f * 0.75 * 10) / 10;
    c = Math.round(c * 0.70 * 10) / 10;
  }

  return {
    name: q,
    calories: Math.max(30, cal),
    p: Math.max(1.0, Math.round(p * 10) / 10),
    f: Math.max(0.5, Math.round(f * 10) / 10),
    c: Math.max(1.0, Math.round(c * 10) / 10),
    icon: icon,
    advice: `🌍 世界の料理AI推計：${q}の主要食材・調理法を分析し、最適カロリーとPFCを算出しました。`,
    country: "世界"
  };
}

// グローバル公開
window.WORLD_FOOD_DATABASE = WORLD_FOOD_DATABASE;
window.estimateWorldFoodNutrition = estimateWorldFoodNutrition;
