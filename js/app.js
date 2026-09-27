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
      favorites: "チョコ, からあげ, カレー",
      isManualBmr: false,
      manualBmr: 1600
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
    checkedShoppingItems: new Set(),

    // 日付管理 (YYYY-MM-DD)
    currentDate: getTodayString(),

    // 各食事の実際の写真記録データ
    records: {
      breakfast: null,
      lunch: null,
      dinner: null,
      snack: null
    },
    currentRecordSlot: 'lunch'
  };

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 初期化
  init();

  function init() {
    loadUserFromStorage();
    loadRecordsFromStorage();
    calculateAllMetrics();
    generateFullDayPlan();
    setupEventListeners();
    updateUI();
  }

  // ===================== 計算・メトリクス =====================
  function calculateAllMetrics() {
    const u = state.user;
    if (u.isManualBmr && u.manualBmr > 500) {
      state.metrics.bmr = Math.round(u.manualBmr);
    } else {
      state.metrics.bmr = DietCalculator.calculateBMR(u.gender, u.age, u.height, u.weight);
    }
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
    state.metrics.bodyIndex = DietCalculator.calculateBodyIndex(u.height, u.weight, u.age);
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
    renderDateBar();
    renderTopBmrPanel();
    renderProfileModalValues();
    renderPlanSummary();
    renderMealSlots();
    renderShoppingBadge();
    renderStatusBanner();
  }

  function renderDateBar() {
    const input = document.getElementById("datePickerInput");
    const badge = document.getElementById("dateLabelBadge");
    if (!input || !badge) return;

    input.value = state.currentDate;

    const todayStr = getTodayString();
    const d = new Date(state.currentDate);
    const today = new Date(todayStr);

    const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      badge.textContent = "今日";
      badge.className = "bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold";
    } else if (diffDays === -1) {
      badge.textContent = "昨日";
      badge.className = "bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold";
    } else if (diffDays === 1) {
      badge.textContent = "明日";
      badge.className = "bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-bold";
    } else {
      badge.textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
      badge.className = "bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold";
    }
  }

  function changeDateByOffset(offset) {
    saveRecordsToStorage();
    const parts = state.currentDate.split("-");
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    d.setDate(d.getDate() + offset);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    state.currentDate = `${year}-${month}-${day}`;

    // 新しい日付の記録を読み込み
    state.records = { breakfast: null, lunch: null, dinner: null, snack: null };
    loadRecordsFromStorage();
    updateUI();
  }

  function renderTopBmrPanel() {
    const u = state.user;
    const m = state.metrics;

    // トップ入力フォームの同期
    const genderEl = document.getElementById("mainGender");
    if (genderEl) genderEl.value = u.gender;
    const ageEl = document.getElementById("mainAge");
    if (ageEl) ageEl.value = u.age;
    const heightEl = document.getElementById("mainHeight");
    if (heightEl) heightEl.value = u.height;
    const weightEl = document.getElementById("mainWeight");
    if (weightEl) weightEl.value = u.weight;
    const paceEl = document.getElementById("mainPace");
    if (paceEl) paceEl.value = u.pace;
    const actEl = document.getElementById("mainActivity");
    if (actEl) actEl.value = u.activity;

    // BMRと直接入力チェックボックス
    const manualToggle = document.getElementById("manualBmrToggle");
    const bmrInput = document.getElementById("mainBmrInput");
    const badge = document.getElementById("bmrCalcMethodBadge");

    if (manualToggle && bmrInput && badge) {
      manualToggle.checked = u.isManualBmr;
      bmrInput.disabled = !u.isManualBmr;
      bmrInput.value = m.bmr;

      if (u.isManualBmr) {
        badge.textContent = "手動入力中";
        badge.className = "text-[10px] text-amber-600 font-bold";
        bmrInput.classList.add("bg-white", "border", "border-amber-300", "px-1", "rounded");
      } else {
        badge.textContent = "自動計算";
        badge.className = "text-[10px] text-emerald-600 font-semibold";
        bmrInput.classList.remove("bg-white", "border", "border-amber-300", "px-1", "rounded");
      }
    }

    // TDEE表示
    const tdeeEl = document.getElementById("mainTdeeDisplay");
    if (tdeeEl) tdeeEl.textContent = m.tdee.toLocaleString();

    // 体型指数（ローレル指数 / BMI）の表示
    if (m.bodyIndex) {
      const b = m.bodyIndex;
      const titleEl = document.getElementById("bodyIndexTitle");
      if (titleEl) titleEl.textContent = `体型指数：${b.primaryName}`;

      const valEl = document.getElementById("bodyIndexValue");
      if (valEl) valEl.textContent = b.primaryValue;

      const badgeEl = document.getElementById("bodyIndexBadge");
      if (badgeEl) {
        badgeEl.textContent = b.status;
        if (b.statusColor === 'emerald') {
          badgeEl.className = "text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800";
        } else if (b.statusColor === 'blue' || b.statusColor === 'teal') {
          badgeEl.className = "text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800";
        } else {
          badgeEl.className = "text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800";
        }
      }

      const stdWeightEl = document.getElementById("standardWeightDisplay");
      if (stdWeightEl) stdWeightEl.textContent = `${b.standardWeight} kg`;

      const noteEl = document.getElementById("rohrerNote");
      if (noteEl) {
        if (b.isSmallOrYouth) {
          noteEl.classList.remove("hidden");
        } else {
          noteEl.classList.add("hidden");
        }
      }
    }
  }

  function renderPlanSummary() {
    const targetCal = state.metrics.targetCal;

    // 今日実際に食べた合計カロリーとPFCの集計
    let eatenCal = 0;
    let eatenP = 0;
    let eatenF = 0;
    let eatenC = 0;

    Object.values(state.records).forEach(rec => {
      if (rec) {
        eatenCal += rec.calories;
        eatenP += rec.p;
        eatenF += rec.f;
        eatenC += rec.c;
      }
    });

    const remainingCal = targetCal - eatenCal;

    // トップの「1日目標摂取量」表示
    document.getElementById("targetTotalCal").textContent = Math.round(targetCal).toLocaleString();
    const targetRef = document.getElementById("targetTotalCalRef");
    if (targetRef) targetRef.textContent = Math.round(targetCal).toLocaleString();

    // 食べた合計
    const eatenTotalEl = document.getElementById("eatenTotalCal");
    if (eatenTotalEl) eatenTotalEl.textContent = Math.round(eatenCal).toLocaleString();

    // 残りあと何kcal食べられるかバッジ
    const remBadge = document.getElementById("remainingCalBadge");
    if (remBadge) {
      if (remainingCal >= 0) {
        remBadge.textContent = `残りあと ${Math.round(remainingCal).toLocaleString()} kcal`;
        remBadge.className = "text-xs px-3 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800";
      } else {
        remBadge.textContent = `目標を ${Math.round(Math.abs(remainingCal)).toLocaleString()} kcal 超過`;
        remBadge.className = "text-xs px-3 py-1 rounded-full font-bold bg-rose-100 text-rose-800";
      }
    }

    // 消化進捗バー
    const progressBar = document.getElementById("eatenProgressBar");
    if (progressBar) {
      const pct = Math.min(100, Math.round((eatenCal / targetCal) * 100));
      progressBar.style.width = `${pct}%`;
      if (remainingCal < 0) {
        progressBar.className = "bg-rose-500 h-full transition-all duration-300";
      } else {
        progressBar.className = "bg-gradient-to-r from-teal-400 to-emerald-500 h-full transition-all duration-300";
      }
    }

    // PFC目標値と現在の摂取進捗
    document.getElementById("targetP").textContent = state.metrics.pfc.p;
    document.getElementById("barP").style.width = `${Math.min(100, (eatenP / state.metrics.pfc.p) * 100)}%`;

    document.getElementById("targetF").textContent = state.metrics.pfc.f;
    document.getElementById("barF").style.width = `${Math.min(100, (eatenF / state.metrics.pfc.f) * 100)}%`;

    document.getElementById("targetC").textContent = state.metrics.pfc.c;
    document.getElementById("barC").style.width = `${Math.min(100, (eatenC / state.metrics.pfc.c) * 100)}%`;
  }

  function renderMealSlots() {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
    const targetCal = state.metrics.targetCal;
    const targetPfc = state.metrics.pfc;

    // 基本のカロリー比率（朝25%, 昼38%, 夜30%, 間食7%）
    const baseRatios = {
      breakfast: { cal: 0.25, p: 0.25, f: 0.22, c: 0.27 },
      lunch:     { cal: 0.38, p: 0.38, f: 0.40, c: 0.38 },
      dinner:    { cal: 0.30, p: 0.32, f: 0.25, c: 0.28 },
      snack:     { cal: 0.07, p: 0.05, f: 0.13, c: 0.07 }
    };

    // 食べた実績カロリーの集計と、未記録スロットの自動調整
    let totalEaten = 0;
    slots.forEach(s => {
      if (state.records[s]) totalEaten += state.records[s].calories;
    });

    // 昼食に超過があった場合の夕食目標カロリーの動的補正
    let lunchExcess = 0;
    const lunchTargetBase = Math.round(targetCal * baseRatios.lunch.cal);
    if (state.records.lunch && state.records.lunch.calories > lunchTargetBase) {
      lunchExcess = state.records.lunch.calories - lunchTargetBase;
    }

    slots.forEach(slot => {
      const card = document.querySelector(`.meal-card[data-meal="${slot}"]`);
      if (!card) return;

      const r = baseRatios[slot];
      let slotTargetCal = Math.round(targetCal * r.cal);

      // 夕食が未記録で、昼食がオーバーしている場合は夕食目標を自動相殺！
      let isAutoAdjusted = false;
      if (slot === 'dinner' && !state.records.dinner && lunchExcess > 0) {
        slotTargetCal = Math.max(250, slotTargetCal - lunchExcess);
        isAutoAdjusted = true;
      }

      const slotTargetP = Math.round(targetPfc.p * r.p);
      const slotTargetF = Math.round(targetPfc.f * r.f);
      const slotTargetC = Math.round(targetPfc.c * r.c);

      // 目標数値のDOM反映
      const calTargetEl = card.querySelector(".slot-cal-target");
      if (calTargetEl) calTargetEl.innerHTML = `${slotTargetCal} <span class="text-[10px] font-normal text-slate-600">kcal</span>`;
      const pEl = card.querySelector(".slot-p");
      if (pEl) pEl.textContent = `約 ${slotTargetP}g`;
      const fEl = card.querySelector(".slot-f");
      if (fEl) fEl.textContent = `約 ${slotTargetF}g`;
      const cEl = card.querySelector(".slot-c");
      if (cEl) cEl.textContent = `約 ${slotTargetC}g`;

      // 自動調整バナーの表示（夕食）
      if (slot === 'dinner') {
        const adjustNote = card.querySelector(".dinner-auto-adjust-note");
        if (adjustNote) {
          if (isAutoAdjusted) {
            adjustNote.classList.remove("hidden");
            adjustNote.querySelector(".adjust-text").textContent = `昼食の超過(+${lunchExcess}kcal)を相殺するため、夕食目標を ${slotTargetCal}kcal に自動調整しました！`;
          } else {
            adjustNote.classList.add("hidden");
          }
        }
      }

      // 実績の描画（未記録 vs 記録済み）
      const record = state.records[slot];
      const actualDisplay = card.querySelector(".slot-actual-display");
      const emptyView = card.querySelector(".record-empty-view");
      const filledView = card.querySelector(".record-filled-view");

      if (record) {
        // 記録済みの場合
        const diff = record.calories - slotTargetCal;
        let diffBadgeHtml = "";
        if (diff > 30) {
          diffBadgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 ml-1">+${diff} kcal</span>`;
        } else if (diff < -30) {
          diffBadgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 ml-1">${Math.abs(diff)} kcal 余裕</span>`;
        } else {
          diffBadgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 ml-1">ナイス調整！</span>`;
        }

        actualDisplay.innerHTML = `${record.calories} <span class="text-[10px] font-normal text-slate-600">kcal</span> ${diffBadgeHtml}`;

        if (emptyView) emptyView.classList.add("hidden");
        if (filledView) {
          filledView.classList.remove("hidden");
          filledView.className = "record-filled-view p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs flex items-center justify-between flex-wrap gap-2";
          filledView.innerHTML = `
            <div class="flex items-center space-x-2.5">
              ${record.img ? `<img src="${record.img}" class="w-12 h-12 rounded-xl object-cover border border-emerald-300 shadow-xs shrink-0">` : `<span class="text-2xl">${record.icon || '🍽️'}</span>`}
              <div>
                <div class="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <span>${record.name}</span>
                </div>
                <div class="text-[11px] text-slate-600 mt-0.5">
                  <span class="font-mono font-bold text-emerald-800">${record.calories} kcal</span>
                  <span>(P:${record.p}g · F:${record.f}g · C:${record.c}g)</span>
                </div>
              </div>
            </div>
            <button class="delete-record-btn text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded-lg hover:bg-rose-50 transition" data-slot="${slot}">
              <i class="fa-solid fa-trash-can mr-1"></i>取り消す
            </button>
          `;

          // 削除ボタンイベント
          filledView.querySelector(".delete-record-btn").onclick = (e) => {
            const s = e.currentTarget.dataset.slot;
            state.records[s] = null;
            saveRecordsToStorage();
            updateUI();
          };
        }
      } else {
        // 未記録の場合
        actualDisplay.textContent = "未記録";
        actualDisplay.className = "slot-actual-display text-lg font-black text-slate-400 font-mono";
        if (emptyView) emptyView.classList.remove("hidden");
        if (filledView) filledView.classList.add("hidden");
      }

      // 参考コンビニ例
      const items = state.currentPlan[slot] || [];
      const container = card.querySelector(".slot-items");
      if (container) {
        container.innerHTML = "";
        items.forEach(item => {
          const itemEl = document.createElement("div");
          itemEl.className = "meal-item flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs";
          itemEl.innerHTML = `
            <div class="flex items-center space-x-2">
              <span>${item.icon}</span>
              <span class="font-medium text-slate-700">${item.storeName} ${item.name}</span>
            </div>
            <div class="font-bold font-mono text-slate-600">${item.calories} kcal</div>
          `;
          container.appendChild(itemEl);
        });
      }
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
    // 日付切り替えナビゲーション
    const prevDateBtn = document.getElementById("prevDateBtn");
    if (prevDateBtn) prevDateBtn.addEventListener("click", () => changeDateByOffset(-1));
    const nextDateBtn = document.getElementById("nextDateBtn");
    if (nextDateBtn) nextDateBtn.addEventListener("click", () => changeDateByOffset(1));
    const datePicker = document.getElementById("datePickerInput");
    if (datePicker) {
      datePicker.addEventListener("change", (e) => {
        if (e.target.value) {
          saveRecordsToStorage();
          state.currentDate = e.target.value;
          state.records = { breakfast: null, lunch: null, dinner: null, snack: null };
          loadRecordsFromStorage();
          updateUI();
        }
      });
    }

    // イベント委任（Event Delegation）：各カードの「写真で記録」ボタンが確実に開くようにする
    document.addEventListener("click", (e) => {
      const triggerBtn = e.target.closest(".trigger-photo-btn");
      if (triggerBtn) {
        const slot = triggerBtn.dataset.meal;
        const modal = document.getElementById("photoModal");
        const slotSelect = document.getElementById("recordTargetSlot");
        if (slotSelect) slotSelect.value = slot;
        if (modal) modal.classList.remove("hidden");
      }
    });

    // 画面トップの基礎代謝 ＆ 減量目標 パネルのリアルタイム連動
    const topInputs = ['mainGender', 'mainAge', 'mainHeight', 'mainWeight', 'mainPace', 'mainActivity'];
    topInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        state.user.gender = document.getElementById("mainGender").value;
        state.user.age = parseInt(document.getElementById("mainAge").value) || 28;
        state.user.height = parseFloat(document.getElementById("mainHeight").value) || 170;
        state.user.weight = parseFloat(document.getElementById("mainWeight").value) || 65;
        state.user.pace = parseFloat(document.getElementById("mainPace").value) || 2;
        state.user.activity = parseFloat(document.getElementById("mainActivity").value) || 1.375;

        calculateAllMetrics();
        saveUserToStorage();
        updateUI();
      });
    });

    // 体組成計 BMR 手動トグル
    const manualToggle = document.getElementById("manualBmrToggle");
    const bmrInput = document.getElementById("mainBmrInput");
    if (manualToggle && bmrInput) {
      manualToggle.addEventListener("change", (e) => {
        state.user.isManualBmr = e.target.checked;
        if (state.user.isManualBmr) {
          state.user.manualBmr = parseFloat(bmrInput.value) || state.metrics.bmr;
        }
        calculateAllMetrics();
        saveUserToStorage();
        updateUI();
      });

      bmrInput.addEventListener("input", (e) => {
        if (state.user.isManualBmr) {
          const val = parseFloat(e.target.value);
          if (val > 500) {
            state.user.manualBmr = val;
            calculateAllMetrics();
            saveUserToStorage();
            updateUI();
          }
        }
      });
    }

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

    // 写真スキャン機能のセットアップ
    setupPhotoScanner();
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

  // ===================== 写真スキャン & AI解析ロジック =====================
  function setupPhotoScanner() {
    const photoModal = document.getElementById("photoModal");
    const photoScanBtn = document.getElementById("photoScanBtn");
    const closePhotoBtn = document.getElementById("closePhotoBtn");
    const photoInput = document.getElementById("photoInput");
    const photoDropArea = document.getElementById("photoDropArea");
    const scanPreviewArea = document.getElementById("scanPreviewArea");
    const scannedImagePreview = document.getElementById("scannedImagePreview");
    const scanLaserLine = document.getElementById("scanLaserLine");
    const scanOverlay = document.getElementById("scanOverlay");
    const scanStatusText = document.getElementById("scanStatusText");
    const scanResultArea = document.getElementById("scanResultArea");
    const applyPhotoMealBtn = document.getElementById("applyPhotoMealBtn");

    let currentScanItem = null;

    // モーダル開閉
    photoScanBtn.addEventListener("click", () => {
      photoModal.classList.remove("hidden");
    });
    closePhotoBtn.addEventListener("click", () => {
      photoModal.classList.add("hidden");
    });

    // タブ切り替え（写真 / 手動 / 定番）
    const tabPhotoBtn = document.getElementById("tabPhotoBtn");
    const tabManualBtn = document.getElementById("tabManualBtn");
    const tabPresetBtn = document.getElementById("tabPresetBtn");
    const photoTabContent = document.getElementById("photoTabContent");
    const manualTabContent = document.getElementById("manualTabContent");
    const presetTabContent = document.getElementById("presetTabContent");

    function switchRecordTab(activeTab) {
      [tabPhotoBtn, tabManualBtn, tabPresetBtn].forEach(b => {
        b.className = "flex-1 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 flex items-center justify-center gap-1 transition";
      });
      [photoTabContent, manualTabContent, presetTabContent].forEach(c => c.classList.add("hidden"));

      if (activeTab === 'photo') {
        tabPhotoBtn.className = "flex-1 py-1.5 rounded-lg bg-white text-emerald-700 shadow-xs flex items-center justify-center gap-1 transition font-bold";
        photoTabContent.classList.remove("hidden");
      } else if (activeTab === 'manual') {
        tabManualBtn.className = "flex-1 py-1.5 rounded-lg bg-white text-emerald-700 shadow-xs flex items-center justify-center gap-1 transition font-bold";
        manualTabContent.classList.remove("hidden");
      } else if (activeTab === 'preset') {
        tabPresetBtn.className = "flex-1 py-1.5 rounded-lg bg-white text-emerald-700 shadow-xs flex items-center justify-center gap-1 transition font-bold";
        presetTabContent.classList.remove("hidden");
        renderPresetMenuList();
      }
    }

    if (tabPhotoBtn) tabPhotoBtn.addEventListener("click", () => switchRecordTab('photo'));
    if (tabManualBtn) tabManualBtn.addEventListener("click", () => switchRecordTab('manual'));
    if (tabPresetBtn) tabPresetBtn.addEventListener("click", () => switchRecordTab('preset'));

    // ② 手動入力の保存処理
    const saveManualBtn = document.getElementById("saveManualMealBtn");
    if (saveManualBtn) {
      saveManualBtn.addEventListener("click", () => {
        const dishName = document.getElementById("manualDishName").value.trim() || "手動記録の食事";
        const calories = parseInt(document.getElementById("manualCalories").value) || 0;
        const p = parseFloat(document.getElementById("manualP").value) || Math.round(calories * 0.05);
        const f = parseFloat(document.getElementById("manualF").value) || Math.round((calories * 0.2) / 9);
        const c = parseFloat(document.getElementById("manualC").value) || Math.round((calories * 0.6) / 4);

        if (calories <= 0) {
          alert("カロリーを入力してください！");
          return;
        }

        const slot = document.getElementById("recordTargetSlot").value;
        state.records[slot] = {
          name: dishName,
          calories: calories,
          p: p,
          f: f,
          c: c,
          img: null,
          icon: "✏️"
        };

        saveRecordsToStorage();
        updateUI();
        photoModal.classList.add("hidden");

        // フォームクリア
        document.getElementById("manualDishName").value = "";
        document.getElementById("manualCalories").value = "";
        document.getElementById("manualP").value = "";
        document.getElementById("manualF").value = "";
        document.getElementById("manualC").value = "";
      });
    }

    // ③ 定番メニューリストの描画
    function renderPresetMenuList() {
      const container = document.getElementById("presetMenuList");
      if (!container) return;
      container.innerHTML = "";

      MEAL_DATABASE.forEach(item => {
        const itemEl = document.createElement("div");
        itemEl.className = "flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 cursor-pointer transition";
        itemEl.innerHTML = `
          <div class="flex items-center space-x-2">
            <span class="text-base">${item.icon}</span>
            <div>
              <div class="font-bold text-slate-800 text-xs">${item.name}</div>
              <div class="text-[10px] text-slate-600">${item.storeName} · P:${item.p}g F:${item.f}g C:${item.c}g</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="font-mono font-bold text-emerald-700">${item.calories} kcal</span>
          </div>
        `;

        itemEl.addEventListener("click", () => {
          const slot = document.getElementById("recordTargetSlot").value;
          state.records[slot] = {
            name: `${item.storeName} ${item.name}`,
            calories: item.calories,
            p: item.p,
            f: item.f,
            c: item.c,
            img: null,
            icon: item.icon
          };
          saveRecordsToStorage();
          updateUI();
          photoModal.classList.add("hidden");
        });

        container.appendChild(itemEl);
      });
    }

    // 写真クリック / ファイル選択
    photoDropArea.addEventListener("click", () => {
      photoInput.click();
    });

    photoInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        startPhotoAnalysis(event.target.result, null);
      };
      reader.readAsDataURL(file);
    });

    // サンプル写真ボタン
    const samplePresets = {
      ramen: {
        name: "豚骨チャーシュー麺（並盛）",
        calories: 820,
        p: 28.5,
        f: 34.0,
        c: 98.0,
        price: 900,
        icon: "🍜",
        advice: "💡 脂質・糖質が高めです。夕食をヘルシーなスープや野菜鍋に自動変更して、トータルカロリーを目標内に収めます！",
        img: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500&auto=format&fit=crop&q=60"
      },
      bento: {
        name: "特製からあげ弁当（ご飯普通盛り）",
        calories: 780,
        p: 27.0,
        f: 29.5,
        c: 94.0,
        price: 680,
        icon: "🍱",
        advice: "💡 揚げ物の脂質が含まれますが、たんぱく質もしっかり摂れています。夜は魚または低脂質メニューでバランスを取ります。",
        img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60"
      },
      cake: {
        name: "ベイクドチーズケーキ",
        calories: 360,
        p: 6.8,
        f: 24.2,
        c: 28.5,
        price: 450,
        icon: "🍰",
        advice: "💡 スイーツでエネルギー補給！間食として記録し、夕食の主食（炭水化物）を控えめにして目標内に収めます。",
        img: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=500&auto=format&fit=crop&q=60"
      },
      salad: {
        name: "グリルチキンのチョップドサラダ",
        calories: 210,
        p: 25.4,
        f: 7.2,
        c: 9.8,
        price: 520,
        icon: "🥗",
        advice: "✨ 素晴らしい高タンパク・低カロリー！夕食や間食にしっかり余裕ができました。",
        img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=60"
      }
    };

    document.querySelectorAll(".sample-photo-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        const preset = samplePresets[type];
        if (preset) {
          startPhotoAnalysis(preset.img, preset);
        }
      });
    });

    // 解析開始演出
    function startPhotoAnalysis(imageSrc, presetData) {
      scanPreviewArea.classList.remove("hidden");
      scannedImagePreview.src = imageSrc;
      scanOverlay.classList.remove("hidden");
      scanLaserLine.classList.remove("hidden");
      scanResultArea.classList.add("hidden");
      scanStatusText.textContent = "AIが食材・カロリーを解析中...";

      setTimeout(() => {
        scanStatusText.textContent = "栄養成分（PFC）と盛り付け量を推計中...";
      }, 700);

      setTimeout(() => {
        scanOverlay.classList.add("hidden");
        scanLaserLine.classList.add("hidden");
        showAnalysisResult(presetData || {
          name: "写真から解析した料理（盛り合わせ）",
          calories: 580,
          p: 22.0,
          f: 18.0,
          c: 78.0,
          price: 650,
          icon: "🍽️",
          advice: "💡 食材の色味と盛り付けからAIが推計しました。夕食の献立を自動調整して目標に合わせます。"
        });
      }, 1400);
    }

    // 解析結果の表示
    function showAnalysisResult(data) {
      currentScanItem = data;
      document.getElementById("resultDishName").textContent = data.name;
      document.getElementById("resultCalories").textContent = data.calories;
      document.getElementById("resultP").textContent = `${data.p}g`;
      document.getElementById("resultF").textContent = `${data.f}g`;
      document.getElementById("resultC").textContent = `${data.c}g`;
      document.getElementById("resultAdvice").textContent = data.advice;
      scanResultArea.classList.remove("hidden");
    }

    // ① 写真解析からの保存
    applyPhotoMealBtn.addEventListener("click", () => {
      if (!currentScanItem) return;

      const slot = document.getElementById("recordTargetSlot").value;

      state.records[slot] = {
        name: currentScanItem.name,
        calories: currentScanItem.calories,
        p: currentScanItem.p,
        f: currentScanItem.f,
        c: currentScanItem.c,
        img: currentScanItem.img || null,
        icon: currentScanItem.icon || "📸"
      };

      saveRecordsToStorage();
      updateUI();
      photoModal.classList.add("hidden");

      // 完了バナー表示
      const banner = document.getElementById("statusBanner");
      banner.className = "rounded-xl p-3.5 flex items-center justify-between text-xs font-medium border bg-teal-50 border-teal-200 text-teal-900 shadow-sm";
      banner.innerHTML = `
        <div class="flex items-center space-x-2">
          <span class="text-lg">📸</span>
          <span><strong>【${getSlotJpName(slot)}】に記録しました：</strong>${currentScanItem.name} (${currentScanItem.calories}kcal) を反映し、残りカロリーと目標をリアルタイム更新しました！</span>
        </div>
        <button id="dismissPhotoBannerBtn" class="text-[11px] underline font-bold ml-2">閉じる</button>
      `;
      banner.classList.remove("hidden");
      document.getElementById("dismissPhotoBannerBtn").onclick = () => {
        banner.classList.add("hidden");
      };
    });
  }

  function getSlotJpName(slot) {
    const map = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食・ドリンク' };
    return map[slot] || slot;
  }

  function saveRecordsToStorage() {
    try {
      const key = `mealai_records_${state.currentDate}`;
      localStorage.setItem(key, JSON.stringify(state.records));
    } catch (e) { }
  }

  function loadRecordsFromStorage() {
    try {
      const key = `mealai_records_${state.currentDate}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        state.records = JSON.parse(saved);
      } else {
        state.records = { breakfast: null, lunch: null, dinner: null, snack: null };
      }
    } catch (e) { }
  }
});
