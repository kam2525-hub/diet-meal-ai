/**
 * app.js - MealAI メインコントローラー
 */

document.addEventListener("DOMContentLoaded", () => {
  // アプリケーション状態
  const state = {
    user: {
      gender: "male",
      age: 28,
      height: 172,
      weight: 70,
      activity: 1.375,
      pace: 2, // 月-2kg
      budget: 1500,
      cheatDay: "sun",
      favorites: "チョコ, からあげ, カレー"
    },
    // 計算結果
    metrics: {
      bmr: 0,
      tdee: 0,
      targetCal: 0,
      dailyDeficit: 0,
      pfc: { p: 0, f: 0, c: 0 }
    },
    // 現在のアクティブなモード/フィルター
    craving: null, // 'sweet', 'salty', 'meat', etc.
    isRecoveryMode: false,
    isCheatDay: false,
    isBudgetStrict: false,

    // 各スロットで選択中のメニュー (配列)
    currentPlan: {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
      drink: []
    },

    // 各スロットの指定店舗
    storeFilters: {
      breakfast: "seven",
      lunch: "seven",
      dinner: "seven",
      snack: "all",
      drink: "all"
    },

    // 買い物リストのチェック状態
    checkedShoppingItems: new Set()
  };

  // 初期化
  init();

  function init() {
    loadUserFromStorage();
    calculateAllMetrics();
    generateFullDayPlan();
    setupEventListeners();
    updateUI();
  }

  // ===================== 計算・メトリクス =====================
  function calculateAllMetrics() {
    const u = state.user;
    state.metrics.bmr = DietCalculator.calculateBMR(u.gender, u.age, u.height, u.weight);
    state.metrics.tdee = DietCalculator.calculateTDEE(state.metrics.bmr, u.activity);

    let pace = parseFloat(u.pace);
    const targetCalc = DietCalculator.calculateTargetCalories(state.metrics.tdee, state.metrics.bmr, pace);

    let baseTarget = targetCalc.targetCalories;

    // モードによる補正
    if (state.isCheatDay) {
      baseTarget = state.metrics.tdee + 400; // チートデイはメンテナンス+α
    } else if (state.isRecoveryMode) {
      baseTarget = Math.max(state.metrics.bmr * 0.9, baseTarget - 300); // リカバリー日
    }

    state.metrics.targetCal = baseTarget;
    state.metrics.dailyDeficit = targetCalc.dailyDeficit;
    state.metrics.isLimited = targetCalc.isLimited;
    state.metrics.pfc = DietCalculator.calculatePFC(baseTarget, u.weight);
  }

  // ===================== 献立生成ロジック =====================
  function generateFullDayPlan() {
    // スロットごとのカロリー目標配分
    // 朝: 25%, 昼: 35%, 夜: 30%, 間食: 8%, ドリンク: 2%
    generateSlotPlan('breakfast');
    generateSlotPlan('lunch');
    generateSlotPlan('dinner');
    generateSlotPlan('snack');
    generateSlotPlan('drink');
  }

  function generateSlotPlan(slot) {
    const store = state.storeFilters[slot];
    let candidates = MEAL_DATABASE.filter(item => item.slot === slot);

    // 店舗フィルター
    if (store && store !== 'all') {
      candidates = candidates.filter(item => item.store === store || item.store === 'all');
    }

    // 節約モード
    if (state.isBudgetStrict) {
      candidates = candidates.filter(item => item.price <= 350 || item.tags.includes('budget'));
    }

    // 気分フィルターの反映
    if (slot === 'snack') {
      if (state.craving === 'sweet') {
        const sweetItems = candidates.filter(i => i.tags.includes('sweet'));
        if (sweetItems.length > 0) candidates = sweetItems;
      } else if (state.craving === 'salty') {
        const saltyItems = candidates.filter(i => i.tags.includes('salty'));
        if (saltyItems.length > 0) candidates = saltyItems;
      }
    }

    if ((slot === 'lunch' || slot === 'dinner') && state.craving === 'meat') {
      const meatItems = candidates.filter(i => i.tags.includes('meat') || i.tags.includes('high_protein'));
      if (meatItems.length > 0) candidates = meatItems;
    }

    if (candidates.length === 0) {
      // フォールバック
      candidates = MEAL_DATABASE.filter(item => item.slot === slot);
    }

    // ランダムまたはベストな組み合わせを選択
    // 朝: おにぎり/パン + たんぱく質/スープ 等（1〜2品）
    // 昼: メイン + サラダ または 定食（1〜2品）
    // 夜: 鍋 or 魚 + スープ 等
    // 間食: 1品
    // ドリンク: 1品
    let selected = [];
    if (slot === 'breakfast') {
      const staple = candidates.find(c => c.tags.includes('staple')) || candidates[0];
      const proteinOrSoup = candidates.find(c => (c.tags.includes('high_protein') || c.tags.includes('soup')) && c.id !== staple?.id);
      selected = [staple, proteinOrSoup].filter(Boolean);
    } else if (slot === 'lunch') {
      const main = candidates.find(c => c.tags.includes('meat') || c.tags.includes('gourmet') || c.tags.includes('staple')) || candidates[0];
      const side = candidates.find(c => c.tags.includes('veggie') && c.id !== main?.id);
      selected = side ? [main, side] : [main];
    } else if (slot === 'dinner') {
      const main = candidates[Math.floor(Math.random() * candidates.length)];
      selected = [main].filter(Boolean);
    } else {
      // snack, drink は1品
      const item = candidates[Math.floor(Math.random() * candidates.length)];
      selected = [item].filter(Boolean);
    }

    state.currentPlan[slot] = selected;
  }

  // ===================== UI レンダリング =====================
  function updateUI() {
    renderProfileModalValues();
    renderPlanSummary();
    renderMealSlots();
    renderShoppingBadge();
    renderStatusBanner();
  }

  function renderPlanSummary() {
    let totalCal = 0;
    let totalP = 0;
    let totalF = 0;
    let totalC = 0;
    let totalPrice = 0;

    Object.values(state.currentPlan).flat().forEach(item => {
      totalCal += item.calories;
      totalP += item.p;
      totalF += item.f;
      totalC += item.c;
      totalPrice += item.price;
    });

    const targetCal = state.metrics.targetCal;

    // カロリー
    document.getElementById("currentTotalCal").textContent = Math.round(totalCal).toLocaleString();
    document.getElementById("targetTotalCal").textContent = Math.round(targetCal).toLocaleString();

    const calDiff = Math.round(totalCal - targetCal);
    const diffBadge = document.getElementById("calDiffBadge");
    if (Math.abs(calDiff) <= 50) {
      diffBadge.textContent = "ぴったり目標内！";
      diffBadge.className = "text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800";
    } else if (calDiff < -50) {
      diffBadge.textContent = `${Math.abs(calDiff)} kcal 余裕あり`;
      diffBadge.className = "text-xs px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800";
    } else {
      diffBadge.textContent = `+${calDiff} kcal オーバー`;
      diffBadge.className = "text-xs px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800";
    }

    const pct = Math.min(100, Math.round((totalCal / targetCal) * 100));
    document.getElementById("calProgressBar").style.width = `${pct}%`;

    // 価格
    document.getElementById("currentTotalPrice").textContent = totalPrice.toLocaleString();
    document.getElementById("budgetLimitBadge").textContent = `(予算目安: 〜${state.user.budget}円)`;

    // PFC
    document.getElementById("pfcP").textContent = Math.round(totalP);
    document.getElementById("targetP").textContent = state.metrics.pfc.p;
    document.getElementById("barP").style.width = `${Math.min(100, (totalP / state.metrics.pfc.p) * 100)}%`;

    document.getElementById("pfcF").textContent = Math.round(totalF);
    document.getElementById("targetF").textContent = state.metrics.pfc.f;
    document.getElementById("barF").style.width = `${Math.min(100, (totalF / state.metrics.pfc.f) * 100)}%`;

    document.getElementById("pfcC").textContent = Math.round(totalC);
    document.getElementById("targetC").textContent = state.metrics.pfc.c;
    document.getElementById("barC").style.width = `${Math.min(100, (totalC / state.metrics.pfc.c) * 100)}%`;
  }

  function renderMealSlots() {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];

    slots.forEach(slot => {
      const card = document.querySelector(`.meal-card[data-meal="${slot}"]`);
      if (!card) return;

      const items = state.currentPlan[slot] || [];
      const slotCal = items.reduce((sum, i) => sum + i.calories, 0);
      card.querySelector(".slot-cal").textContent = `約 ${slotCal} kcal`;

      const container = card.querySelector(".slot-items");
      container.innerHTML = "";

      if (items.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-600 italic py-2">指定の条件に合うメニューがありません</div>`;
        return;
      }

      items.forEach(item => {
        const itemEl = document.createElement("div");
        itemEl.className = "meal-item flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs";

        let storeColor = "bg-slate-200 text-slate-700";
        if (item.store === 'seven') storeColor = "bg-orange-100 text-orange-800 border border-orange-200";
        else if (item.store === 'lawson') storeColor = "bg-blue-100 text-blue-800 border border-blue-200";
        else if (item.store === 'family') storeColor = "bg-emerald-100 text-emerald-800 border border-emerald-200";
        else if (item.store === 'matsuya') storeColor = "bg-amber-100 text-amber-800 border border-amber-200";
        else if (item.store === 'sukiya') storeColor = "bg-red-100 text-red-800 border border-red-200";
        else if (item.store === 'ootoya') storeColor = "bg-indigo-100 text-indigo-800 border border-indigo-200";
        else if (item.store === 'starbucks') storeColor = "bg-teal-100 text-teal-800 border border-teal-200";

        itemEl.innerHTML = `
          <div class="flex items-center space-x-2.5">
            <span class="text-xl shrink-0">${item.icon}</span>
            <div>
              <div class="flex items-center space-x-1.5 flex-wrap">
                <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${storeColor}">${item.storeName}</span>
                <span class="font-bold text-slate-800">${item.name}</span>
              </div>
              <div class="text-[10px] text-slate-600 mt-0.5">
                <span>P:${item.p}g</span> · <span>F:${item.f}g</span> · <span>C:${item.c}g</span>
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-bold text-slate-700">${item.calories} <span class="text-[10px] font-normal text-slate-600">kcal</span></div>
            <div class="text-[10px] text-slate-600">¥${item.price}</div>
          </div>
        `;
        container.appendChild(itemEl);
      });
    });
  }

  function renderStatusBanner() {
    const banner = document.getElementById("statusBanner");
    if (state.isCheatDay) {
      banner.className = "rounded-xl p-3.5 flex items-center justify-between text-xs font-medium border bg-amber-50 border-amber-200 text-amber-900 shadow-sm";
      banner.innerHTML = `
        <div class="flex items-center space-x-2">
          <span class="text-lg">🎉</span>
          <span><strong>チートデイ発動中：</strong>本日は消費カロリー上限まで楽しんで代謝を刺激しましょう！</span>
        </div>
        <button id="cancelCheatBtn" class="text-[11px] underline font-bold ml-2">解除</button>
      `;
      banner.classList.remove("hidden");
    } else if (state.isRecoveryMode) {
      banner.className = "rounded-xl p-3.5 flex items-center justify-between text-xs font-medium border bg-purple-50 border-purple-200 text-purple-900 shadow-sm";
      banner.innerHTML = `
        <div class="flex items-center space-x-2">
          <span class="text-lg">🔄</span>
          <span><strong>前日やらかしリカバリー中：</strong>本日の目標を-300kcal調整して相殺プランを生成しています。</span>
        </div>
        <button id="cancelRecoveryBtn" class="text-[11px] underline font-bold ml-2">通常に戻す</button>
      `;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }

    // バナー解除イベント
    const cancelCheat = document.getElementById("cancelCheatBtn");
    if (cancelCheat) {
      cancelCheat.onclick = () => {
        state.isCheatDay = false;
        document.getElementById("btnToggleCheat").classList.remove("active");
        calculateAllMetrics();
        generateFullDayPlan();
        updateUI();
      };
    }
    const cancelRec = document.getElementById("cancelRecoveryBtn");
    if (cancelRec) {
      cancelRec.onclick = () => {
        state.isRecoveryMode = false;
        document.getElementById("btnToggleRecovery").classList.remove("active");
        calculateAllMetrics();
        generateFullDayPlan();
        updateUI();
      };
    }
  }

  function renderProfileModalValues() {
    document.getElementById("calcBMR").textContent = state.metrics.bmr.toLocaleString();
    document.getElementById("calcTDEE").textContent = state.metrics.tdee.toLocaleString();
    document.getElementById("calcTargetCal").textContent = Math.round(state.metrics.targetCal).toLocaleString();

    if (state.metrics.isLimited) {
      document.getElementById("safetyNote").textContent = "⚠️ 健康と代謝低下を防ぐため、基礎代謝を維持する安全リミットが適用されています。";
      document.getElementById("safetyNote").classList.add("text-rose-600", "font-bold");
    } else {
      document.getElementById("safetyNote").textContent = "※脂肪1kg=約7,200kcalとして計算。健康維持のため基礎代謝を極端に下回らないよう自動調整されます。";
      document.getElementById("safetyNote").classList.remove("text-rose-600", "font-bold");
    }
  }

  function renderShoppingBadge() {
    const allItems = Object.values(state.currentPlan).flat();
    document.getElementById("shoppingBadge").textContent = allItems.length;
  }

  // ===================== 買い物リストモーダル =====================
  function openShoppingModal() {
    const modal = document.getElementById("shoppingModal");
    const container = document.getElementById("shoppingListContent");
    container.innerHTML = "";

    const allItems = Object.values(state.currentPlan).flat();

    // 店舗ごとにグルーピング
    const grouped = {};
    allItems.forEach(item => {
      const storeName = item.storeName;
      if (!grouped[storeName]) grouped[storeName] = [];
      grouped[storeName].push(item);
    });

    let totalPrice = 0;

    Object.keys(grouped).forEach(store => {
      const groupEl = document.createElement("div");
      groupEl.className = "bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2";

      const title = document.createElement("div");
      title.className = "font-bold text-xs text-slate-800 flex items-center justify-between pb-1 border-b border-slate-200";
      title.innerHTML = `
        <span class="flex items-center gap-1.5"><i class="fa-solid fa-store text-emerald-600"></i> ${store}</span>
        <span class="text-[10px] text-slate-600">${grouped[store].length}品</span>
      `;
      groupEl.appendChild(title);

      grouped[store].forEach(item => {
        totalPrice += item.price;
        const isChecked = state.checkedShoppingItems.has(item.id);

        const row = document.createElement("label");
        row.className = `flex items-center justify-between py-1 px-1 rounded cursor-pointer hover:bg-slate-100 transition ${isChecked ? 'item-checked' : ''}`;
        row.innerHTML = `
          <div class="flex items-center space-x-2">
            <input type="checkbox" class="shopping-item-checkbox rounded text-emerald-600 focus:ring-emerald-500" data-id="${item.id}" ${isChecked ? 'checked' : ''}>
            <span class="text-base">${item.icon}</span>
            <span class="font-medium text-slate-700">${item.name}</span>
          </div>
          <span class="font-mono text-slate-600">¥${item.price}</span>
        `;

        const checkbox = row.querySelector(".shopping-item-checkbox");
        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            state.checkedShoppingItems.add(item.id);
            row.classList.add("item-checked");
          } else {
            state.checkedShoppingItems.delete(item.id);
            row.classList.remove("item-checked");
          }
        });

        groupEl.appendChild(row);
      });

      container.appendChild(groupEl);
    });

    document.getElementById("shoppingTotalPrice").textContent = `${totalPrice.toLocaleString()} 円`;
    modal.classList.remove("hidden");
  }

  // ===================== イベントリスナー =====================
  function setupEventListeners() {
    // 買い物モーダル
    document.getElementById("shoppingListBtn").addEventListener("click", openShoppingModal);
    document.getElementById("closeShoppingBtn").addEventListener("click", () => {
      document.getElementById("shoppingModal").classList.add("hidden");
    });

    // プロフィールモーダル
    const profileModal = document.getElementById("profileModal");
    document.getElementById("openProfileBtn").addEventListener("click", () => {
      profileModal.classList.remove("hidden");
    });
    document.getElementById("closeProfileBtn").addEventListener("click", () => {
      profileModal.classList.add("hidden");
    });

    // プロフィール入力変更時のプレビュー連動
    const inputs = ['userGender', 'userAge', 'userHeight', 'userWeight', 'userActivity', 'userPace'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener("input", () => {
        readProfileInputs();
        calculateAllMetrics();
        renderProfileModalValues();
      });
    });

    // プロフィール保存
    document.getElementById("saveProfileBtn").addEventListener("click", () => {
      readProfileInputs();
      calculateAllMetrics();
      generateFullDayPlan();
      saveUserToStorage();
      updateUI();
      profileModal.classList.add("hidden");
    });

    // 全リロールボタン
    document.getElementById("regenerateAllBtn").addEventListener("click", () => {
      generateFullDayPlan();
      updateUI();
    });

    // 各スロットのリロールボタン
    document.querySelectorAll(".reroll-slot-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".meal-card");
        const slot = card.dataset.meal;
        generateSlotPlan(slot);
        updateUI();
      });
    });

    // スロットごとの店舗セレクト
    document.querySelectorAll(".store-select").forEach(select => {
      select.addEventListener("change", (e) => {
        const card = e.target.closest(".meal-card");
        const slot = card.dataset.meal;
        state.storeFilters[slot] = e.target.value;
        generateSlotPlan(slot);
        updateUI();
      });
    });

    // クイック気分・調整ボタンたち
    setupCravingButton("btnCravingSweet", "sweet");
    setupCravingButton("btnCravingSalty", "salty");
    setupCravingButton("btnCravingMeat", "meat");

    // リカバリーボタン
    document.getElementById("btnToggleRecovery").addEventListener("click", (e) => {
      state.isRecoveryMode = !state.isRecoveryMode;
      if (state.isRecoveryMode) state.isCheatDay = false; // 排他
      document.getElementById("btnToggleCheat").classList.remove("active");
      e.currentTarget.classList.toggle("active", state.isRecoveryMode);
      calculateAllMetrics();
      generateFullDayPlan();
      updateUI();
    });

    // チートデイボタン
    document.getElementById("btnToggleCheat").addEventListener("click", (e) => {
      state.isCheatDay = !state.isCheatDay;
      if (state.isCheatDay) state.isRecoveryMode = false; // 排他
      document.getElementById("btnToggleRecovery").classList.remove("active");
      e.currentTarget.classList.toggle("active", state.isCheatDay);
      calculateAllMetrics();
      generateFullDayPlan();
      updateUI();
    });

    // 1000円以内節約ボタン
    document.getElementById("btnBudgetStrict").addEventListener("click", (e) => {
      state.isBudgetStrict = !state.isBudgetStrict;
      e.currentTarget.classList.toggle("active", state.isBudgetStrict);
      generateFullDayPlan();
      updateUI();
    });
  }

  function setupCravingButton(btnId, cravingType) {
    const btn = document.getElementById(btnId);
    btn.addEventListener("click", () => {
      if (state.craving === cravingType) {
        state.craving = null;
        btn.classList.remove("active");
      } else {
        ['btnCravingSweet', 'btnCravingSalty', 'btnCravingMeat'].forEach(id => {
          document.getElementById(id).classList.remove("active");
        });
        state.craving = cravingType;
        btn.classList.add("active");
      }
      generateFullDayPlan();
      updateUI();
    });
  }

  function readProfileInputs() {
    state.user.gender = document.getElementById("userGender").value;
    state.user.age = parseInt(document.getElementById("userAge").value) || 28;
    state.user.height = parseFloat(document.getElementById("userHeight").value) || 170;
    state.user.weight = parseFloat(document.getElementById("userWeight").value) || 65;
    state.user.activity = parseFloat(document.getElementById("userActivity").value) || 1.375;
    state.user.pace = parseFloat(document.getElementById("userPace").value) || 2;
    state.user.budget = parseInt(document.getElementById("userBudget").value) || 1500;
    state.user.cheatDay = document.getElementById("userCheatDay").value;
    state.user.favorites = document.getElementById("userFavorites").value;
  }

  function saveUserToStorage() {
    try {
      localStorage.setItem("mealai_user", JSON.stringify(state.user));
    } catch (e) { }
  }

  function loadUserFromStorage() {
    try {
      const saved = localStorage.getItem("mealai_user");
      if (saved) {
        state.user = Object.assign(state.user, JSON.parse(saved));
        // 入力フォームに反映
        document.getElementById("userGender").value = state.user.gender;
        document.getElementById("userAge").value = state.user.age;
        document.getElementById("userHeight").value = state.user.height;
        document.getElementById("userWeight").value = state.user.weight;
        document.getElementById("userActivity").value = state.user.activity;
        document.getElementById("userPace").value = state.user.pace;
        document.getElementById("userBudget").value = state.user.budget;
        document.getElementById("userCheatDay").value = state.user.cheatDay;
        document.getElementById("userFavorites").value = state.user.favorites;
      }
    } catch (e) { }
  }
});
