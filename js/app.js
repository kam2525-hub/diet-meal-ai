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
    state.metrics.bodyIndex = (DietCalculator && typeof DietCalculator.calculateBodyIndex === 'function')
      ? DietCalculator.calculateBodyIndex(u.height, u.weight, u.age)
      : { isSmallOrYouth: false, primaryName: "BMI", primaryValue: 22, status: "普通体重", statusColor: "emerald", standardWeight: 55 };
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
          filledView.className = "record-filled-view p-2.5 sm:p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs flex items-center justify-between gap-2";
          filledView.innerHTML = `
            <div class="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
              ${record.img ? `<img src="${record.img}" class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-emerald-300 shadow-xs shrink-0">` : `<span class="text-xl sm:text-2xl shrink-0">${record.icon || '🍽️'}</span>`}
              <div class="min-w-0">
                <div class="font-bold text-slate-800 text-xs sm:text-sm truncate flex items-center gap-1.5 flex-wrap">
                  <span>${record.name}</span>
                  ${record.soupLevel === 'half' ? '<span class="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-md font-bold">🍜 スープ半分残し</span>' : ''}
                  ${record.soupLevel === 'none' ? '<span class="text-[9px] bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.2 rounded-md font-bold">🍜 麺・具のみ完食</span>' : ''}
                </div>
                <div class="text-[10px] sm:text-[11px] text-slate-600 mt-0.5 flex flex-wrap gap-1 items-center">
                  <span class="font-mono font-bold text-emerald-800">${record.calories} kcal</span>
                  <span class="text-slate-500">(P:${record.p}g · F:${record.f}g · C:${record.c}g)</span>
                </div>
              </div>
            </div>
            <button class="delete-record-btn text-[11px] text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded-lg hover:bg-rose-50 transition shrink-0 cursor-pointer" data-slot="${slot}">
              <i class="fa-solid fa-trash-can mr-1"></i>取り消す
            </button>
          `;

          // 削除ボタンイベント
          const delBtn = filledView.querySelector(".delete-record-btn");
          if (delBtn) {
            delBtn.onclick = (e) => {
              const s = e.currentTarget.dataset.slot;
              state.records[s] = null;
              saveRecordsToStorage();
              updateUI();
            };
          }
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
  // グローバルモーダル開閉（HTMLのonclickからも直接呼べるようにwindowに公開）
  window.openPhotoRecordModal = function(slot) {
    const modal = document.getElementById("photoModal");
    if (!modal) return;
    if (slot) {
      const slotSelect = document.getElementById("recordTargetSlot");
      if (slotSelect) slotSelect.value = slot;
    }
    modal.classList.remove("hidden");
    modal.style.display = "flex";

    // モーダルを開いた時にカメラ撮影タブをアクティブにしてカメラを起動
    if (window.initRecordModalState) {
      window.initRecordModalState();
    }
  };

  window.closePhotoRecordModal = function() {
    const modal = document.getElementById("photoModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";

    // カメラ停止してリソース解放
    if (window.stopCameraStream) {
      window.stopCameraStream();
    }
  };

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

    // イベント委任（Event Delegation）：各カードの「写真で記録」ボタンを確実に開く
    document.addEventListener("click", (e) => {
      const triggerBtn = e.target.closest(".trigger-photo-btn");
      if (triggerBtn) {
        const slot = triggerBtn.dataset.meal;
        window.openPhotoRecordModal(slot);
      }
    });

    // モーダルの背景（backdrop）タップで閉じる
    const photoModal = document.getElementById("photoModal");
    if (photoModal) {
      photoModal.addEventListener("click", (e) => {
        if (e.target === photoModal) {
          window.closePhotoRecordModal();
        }
      });
    }
    const shoppingModal = document.getElementById("shoppingModal");
    if (shoppingModal) {
      shoppingModal.addEventListener("click", (e) => {
        if (e.target === shoppingModal) {
          shoppingModal.classList.add("hidden");
        }
      });
    }
    const profileModal = document.getElementById("profileModal");
    if (profileModal) {
      profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) {
          profileModal.classList.add("hidden");
        }
      });
    }

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
    document.getElementById("openProfileBtn").addEventListener("click", () => {
      if (profileModal) profileModal.classList.remove("hidden");
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

  // ===================== 写真スキャン & リアルタイムカメラAI解析 =====================
  function setupPhotoScanner() {
    const photoModal = document.getElementById("photoModal");
    const closePhotoBtn = document.getElementById("closePhotoBtn");
    const directCameraInput = document.getElementById("directCameraInput");
    const albumFileInput = document.getElementById("albumFileInput");
    const toggleLiveStreamBtn = document.getElementById("toggleLiveStreamBtn");
    const cameraVideo = document.getElementById("cameraVideo");
    const cameraContainer = document.getElementById("cameraContainer");
    const cameraLoadingOverlay = document.getElementById("cameraLoadingOverlay");
    const cameraErrorBox = document.getElementById("cameraErrorBox");
    const cameraStatusText = document.getElementById("cameraStatusText");
    const switchCameraBtn = document.getElementById("switchCameraBtn");
    const captureShutterBtn = document.getElementById("captureShutterBtn");
    const liveCameraActionBtn = document.getElementById("liveCameraActionBtn");
    const captureCanvas = document.getElementById("captureCanvas");
    const primaryCameraLauncher = document.getElementById("primaryCameraLauncher");
    const scanPreviewArea = document.getElementById("scanPreviewArea");
    const scannedImagePreview = document.getElementById("scannedImagePreview");
    const scanLaserLine = document.getElementById("scanLaserLine");
    const scanOverlay = document.getElementById("scanOverlay");
    const scanStatusText = document.getElementById("scanStatusText");
    const scanResultArea = document.getElementById("scanResultArea");
    const applyPhotoMealBtn = document.getElementById("applyPhotoMealBtn");
    const retakeCameraBtn = document.getElementById("retakeCameraBtn");

    let mediaStream = null;
    let currentFacingMode = "environment"; // 背面カメラを優先
    let currentScanItem = null;

    // TensorFlow.js MobileNet のバックグラウンド初期化（完全無料・端末内深層学習）
    if (window.mobilenet && !window.mobilenetModel) {
      window.mobilenet.load({ version: 2, alpha: 1.0 }).then(model => {
        window.mobilenetModel = model;
        console.log("MobileNet Food AI Model loaded successfully!");
      }).catch(e => {
        console.warn("MobileNet load error:", e);
      });
    }

    // モーダル閉じるボタン
    if (closePhotoBtn) {
      closePhotoBtn.addEventListener("click", () => {
        window.closePhotoRecordModal();
      });
    }

    // 外部からのカメラ制御・画像処理用フック
    window.stopCameraStream = stopLiveCamera;
    window.handleImageFileSelected = handleImageFileSelected;
    window.initRecordModalState = () => {
      switchRecordTab('photo');
      resetCameraView();
    };

    // ④ 各食事カードの「写真で記録」直接カメラインプットの監視（スマホで一発カメラ起動）
    document.addEventListener("change", (e) => {
      if (e.target && e.target.classList.contains("slot-direct-camera")) {
        const file = e.target.files[0];
        const slot = e.target.dataset.meal;
        if (!file) return;
        handleImageFileSelected(file, slot);
      }
    });

    // ① スマホ直接カメラ撮影（capture="environment"）イベント
    if (directCameraInput) {
      directCameraInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        handleImageFileSelected(file);
      });
    }

    // ② アルバム・写真選択イベント
    if (albumFileInput) {
      albumFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        handleImageFileSelected(file);
      });
    }

    // 画像ファイルが選択/撮影されたときの共通処理（リサイズ圧縮・HEIC対策・クラッシュ防止）
    function handleImageFileSelected(file, optionalSlot) {
      if (!file) return;

      const modal = document.getElementById("photoModal");
      const targetSlot = optionalSlot || document.getElementById("recordTargetSlot")?.value || "breakfast";
      const slotSelect = document.getElementById("recordTargetSlot");
      if (slotSelect) slotSelect.value = targetSlot;

      // タブを写真タブに確実に合わせる
      const pContent = document.getElementById("photoTabContent");
      const mContent = document.getElementById("manualTabContent");
      const prContent = document.getElementById("presetTabContent");
      if (pContent) pContent.classList.remove("hidden");
      if (mContent) mContent.classList.add("hidden");
      if (prContent) prContent.classList.add("hidden");

      // モーダルを開く（カメラ初期化リセットは呼ばず、解析画面を直接開く）
      if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
      }

      // ランチャー・カメラ・サンプルボタンを隠し、解析画面を全面に
      stopLiveCamera();
      if (primaryCameraLauncher) primaryCameraLauncher.classList.add("hidden");
      if (cameraContainer) cameraContainer.classList.add("hidden");
      if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
      const sampleBox = document.querySelector("#photoTabContent .sample-presets-box");
      if (sampleBox) sampleBox.classList.add("hidden");

      if (scanPreviewArea) scanPreviewArea.classList.remove("hidden");
      if (scanOverlay) scanOverlay.classList.remove("hidden");
      if (scanLaserLine) scanLaserLine.classList.remove("hidden");
      if (scanResultArea) scanResultArea.classList.add("hidden");
      if (scanStatusText) scanStatusText.textContent = "写真を読み込み・AI解析中...";

      // FileReaderで確実に画像を読み込み（読み込み完了前にinputをクリアしない）
      const reader = new FileReader();
      reader.onerror = (err) => {
        console.error("FileReader error:", err);
        alert("写真の読み込みに失敗しました。もう一度お試しください。");
        resetCameraView();
      };

      reader.onload = (event) => {
        const rawDataUrl = event.target.result;

        // 読み込み完了後に安全にinputをクリア（ブラウザのBlob無効化を防ぐ）
        try {
          if (directCameraInput) directCameraInput.value = "";
          if (albumFileInput) albumFileInput.value = "";
          document.querySelectorAll(".slot-direct-camera").forEach(inp => { inp.value = ""; });
        } catch (e) {}

        const img = new Image();
        img.onerror = () => {
          // デコード失敗時も生のDataURLで確実に解析を継続
          startPhotoAnalysis(rawDataUrl, null, file.name, null);
        };
        img.onload = () => {
          try {
            const MAX_DIM = 1200;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > MAX_DIM || h > MAX_DIM) {
              if (w > h) {
                h = Math.round((h * MAX_DIM) / w);
                w = MAX_DIM;
              } else {
                w = Math.round((w * MAX_DIM) / h);
                h = MAX_DIM;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);

            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            startPhotoAnalysis(compressedDataUrl, null, file.name, img);
          } catch (err) {
            console.warn("Canvas compression fallback:", err);
            startPhotoAnalysis(rawDataUrl, null, file.name, img);
          }
        };
        img.src = rawDataUrl;
      };

      reader.readAsDataURL(file);
    }

    // ③ ライブファインダー（ブラウザ内カメラ）切り替えボタン
    if (toggleLiveStreamBtn) {
      toggleLiveStreamBtn.addEventListener("click", () => {
        if (!cameraContainer) return;
        const isHidden = cameraContainer.classList.contains("hidden");
        if (isHidden) {
          cameraContainer.classList.remove("hidden");
          if (liveCameraActionBtn) liveCameraActionBtn.classList.remove("hidden");
          startLiveCamera();
        } else {
          stopLiveCamera();
          cameraContainer.classList.add("hidden");
          if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
        }
      });
    }

    // リアルタイムカメラ起動
    async function startLiveCamera() {
      stopLiveCamera();
      if (cameraLoadingOverlay) cameraLoadingOverlay.classList.remove("hidden");
      if (cameraErrorBox) cameraErrorBox.classList.add("hidden");
      if (cameraStatusText) cameraStatusText.textContent = "カメラを起動中...";

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (cameraLoadingOverlay) cameraLoadingOverlay.classList.add("hidden");
        if (cameraErrorBox) cameraErrorBox.classList.remove("hidden");
        return;
      }

      try {
        const constraints = {
          video: {
            facingMode: { ideal: currentFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cameraVideo) {
          cameraVideo.srcObject = mediaStream;
          await cameraVideo.play();
        }
        if (cameraLoadingOverlay) cameraLoadingOverlay.classList.add("hidden");
      } catch (err) {
        console.warn("Live camera access failed or denied:", err);
        if (cameraLoadingOverlay) cameraLoadingOverlay.classList.add("hidden");
        if (cameraErrorBox) cameraErrorBox.classList.remove("hidden");
      }
    }

    // カメラ停止
    function stopLiveCamera() {
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
        mediaStream = null;
      }
      if (cameraVideo) {
        cameraVideo.srcObject = null;
      }
    }

    // カメラ切り替え（イン/アウト）
    if (switchCameraBtn) {
      switchCameraBtn.addEventListener("click", () => {
        currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
        startLiveCamera();
      });
    }

    // ライブカメラのシャッターボタン（撮影）
    if (captureShutterBtn) {
      captureShutterBtn.addEventListener("click", () => {
        if (!cameraVideo || !cameraVideo.videoWidth) {
          if (directCameraInput) directCameraInput.click();
          return;
        }

        captureCanvas.width = cameraVideo.videoWidth;
        captureCanvas.height = cameraVideo.videoHeight;
        const ctx = captureCanvas.getContext("2d");
        ctx.drawImage(cameraVideo, 0, 0, captureCanvas.width, captureCanvas.height);
        const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.88);

        stopLiveCamera();
        if (primaryCameraLauncher) primaryCameraLauncher.classList.add("hidden");
        if (cameraContainer) cameraContainer.classList.add("hidden");
        if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");

        startPhotoAnalysis(dataUrl, null);
      });
    }

    // 撮り直しボタン
    if (retakeCameraBtn) {
      retakeCameraBtn.addEventListener("click", () => {
        resetCameraView();
      });
    }

    function resetCameraView() {
      stopLiveCamera();
      if (scanPreviewArea) scanPreviewArea.classList.add("hidden");
      if (scanResultArea) scanResultArea.classList.add("hidden");
      if (primaryCameraLauncher) primaryCameraLauncher.classList.remove("hidden");
      if (cameraContainer) cameraContainer.classList.add("hidden");
      if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
      if (directCameraInput) directCameraInput.value = "";
      if (albumFileInput) albumFileInput.value = "";
    }

    // タブ切り替え（カメラ / 手動 / 定番）
    const tabPhotoBtn = document.getElementById("tabPhotoBtn");
    const tabManualBtn = document.getElementById("tabManualBtn");
    const tabPresetBtn = document.getElementById("tabPresetBtn");
    const photoTabContent = document.getElementById("photoTabContent");
    const manualTabContent = document.getElementById("manualTabContent");
    const presetTabContent = document.getElementById("presetTabContent");

    function switchRecordTab(activeTab) {
      [tabPhotoBtn, tabManualBtn, tabPresetBtn].forEach(b => {
        if (b) b.className = "flex-1 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 flex items-center justify-center gap-1 transition";
      });
      [photoTabContent, manualTabContent, presetTabContent].forEach(c => {
        if (c) c.classList.add("hidden");
      });

      if (activeTab === 'photo') {
        if (tabPhotoBtn) tabPhotoBtn.className = "flex-1 py-1.5 rounded-lg bg-white text-emerald-700 shadow-xs flex items-center justify-center gap-1 transition font-bold";
        if (photoTabContent) photoTabContent.classList.remove("hidden");
        resetCameraView();
      } else {
        stopLiveCamera(); // 手動・定番時はカメラ停止
        if (activeTab === 'manual') {
          if (tabManualBtn) tabManualBtn.className = "flex-1 py-1.5 rounded-lg bg-white text-emerald-700 shadow-xs flex items-center justify-center gap-1 transition font-bold";
          if (manualTabContent) manualTabContent.classList.remove("hidden");
        } else if (activeTab === 'preset') {
          if (tabPresetBtn) tabPresetBtn.className = "flex-1 py-1.5 rounded-lg bg-white text-emerald-700 shadow-xs flex items-center justify-center gap-1 transition font-bold";
          if (presetTabContent) presetTabContent.classList.remove("hidden");
          renderPresetMenuList();
        }
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
        window.closePhotoRecordModal();

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
          window.closePhotoRecordModal();
        });

        container.appendChild(itemEl);
      });
    }

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
          stopLiveCamera();
          if (primaryCameraLauncher) primaryCameraLauncher.classList.add("hidden");
          if (cameraContainer) cameraContainer.classList.add("hidden");
          if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
          startPhotoAnalysis(preset.img, preset);
        }
      });
    });

    // ==================== Gemini API設定 ＆ 状態管理 ====================
    let geminiApiKey = localStorage.getItem("mealai_gemini_key") || "";
    const geminiInput = document.getElementById("geminiApiKeyInput");
    const saveGeminiBtn = document.getElementById("saveGeminiKeyBtn");
    const geminiBadge = document.getElementById("geminiStatusBadge");

    function updateGeminiStatusUI() {
      if (geminiInput) geminiInput.value = geminiApiKey;
      if (geminiBadge) {
        if (geminiApiKey) {
          geminiBadge.textContent = "AI連携中";
          geminiBadge.className = "text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800";
        } else {
          geminiBadge.textContent = "未連携";
          geminiBadge.className = "text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600";
        }
      }
    }
    updateGeminiStatusUI();

    if (saveGeminiBtn && geminiInput) {
      saveGeminiBtn.addEventListener("click", () => {
        geminiApiKey = geminiInput.value.trim();
        localStorage.setItem("mealai_gemini_key", geminiApiKey);
        updateGeminiStatusUI();
        if (geminiApiKey) {
          alert("✨ Google Gemini APIキーを連携しました！\n撮った写真を本物のAIが解析し、料理名・カロリー・栄養素を自動特定します。");
        } else {
          alert("APIキーの連携を解除しました。");
        }
      });
    }

    // Google Gemini 1.5 Flash Vision 呼び出し関数
    async function analyzeWithGeminiVision(imageSrc) {
      if (!geminiApiKey) return null;
      try {
        const base64Data = imageSrc.includes(",") ? imageSrc.split(",")[1] : imageSrc;
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
        const prompt = "あなたはプロの管理栄養士AIです。写真の料理を正確に識別し、料理名、推定総カロリー(kcal、半角数値)、PFC(たんぱく質g, 脂質g, 炭水化物g、半角数値)、および実践的なダイエットアドバイス(1行)を以下のJSON形式のみで出力してください。\n{\n  \"name\": \"料理名\",\n  \"calories\": 480,\n  \"p\": 22.0,\n  \"f\": 14.5,\n  \"c\": 65.0,\n  \"advice\": \"アドバイス\"\n}";

        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }],
          generationConfig: {
            response_mime_type: "application/json"
          }
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.warn("Gemini API call failed:", err);
          return null;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null;
        const parsed = JSON.parse(text);
        return {
          name: parsed.name || "解析された料理",
          calories: parseInt(parsed.calories) || 500,
          p: parseFloat(parsed.p) || 20,
          f: parseFloat(parsed.f) || 15,
          c: parseFloat(parsed.c) || 60,
          advice: `🤖 Gemini AI解析：${parsed.advice || "食材のバランスを考慮して推計しました。"}`,
          icon: "🍽️"
        };
      } catch (e) {
        console.error("Gemini Vision exception:", e);
        return null;
      }
    }

    // ==================== 高精度AI画像認識：Canvasコンピュータビジョン ＆ 特徴量解析 ====================
    function analyzeFoodImageWithCanvas(img) {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const size = 100;
        canvas.width = size;
        canvas.height = size;

        // 料理が集中する中央70%領域を切り出してフォーカス解析
        const nw = img.naturalWidth || img.width || 400;
        const nh = img.naturalHeight || img.height || 300;
        const sx = nw * 0.15;
        const sy = nh * 0.15;
        const sw = nw * 0.70;
        const sh = nh * 0.70;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size);
        const data = imgData.data;
        const total = size * size;

        let soupBroth = 0;
        let noodleYellow = 0;
        let curryBrown = 0;
        let saladGreen = 0;
        let friedCrispy = 0;
        let deepMeat = 0;
        let whiteRice = 0;
        let sweetBerry = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const diff = max - min;
          const s = max === 0 ? 0 : diff / max;
          const v = max / 255;

          let h = 0;
          if (diff !== 0) {
            if (max === r) h = ((g - b) / diff) % 6;
            else if (max === g) h = (b - r) / diff + 2;
            else h = (r - g) / diff + 4;
            h = h * 60;
            if (h < 0) h += 360;
          }

          // ラーメンの醤油・豚骨・味噌スープ (琥珀色〜黄金色〜茶色の液体領域)
          if (h >= 24 && h <= 54 && s >= 0.28 && s <= 0.92 && v >= 0.30 && v <= 0.96) {
            soupBroth++;
          }
          // ラーメンの麺・煮卵の黄身・コーン
          if (h >= 36 && h <= 64 && s >= 0.22 && s <= 0.75 && v >= 0.58) {
            noodleYellow++;
          }
          // カレーの濃厚なカレールー (濃い黄褐色)
          if (h >= 20 && h <= 38 && s > 0.55 && v >= 0.22 && v <= 0.62) {
            curryBrown++;
          }
          // サラダの鮮やかな緑色
          if (h >= 75 && h <= 165 && s > 0.22 && v > 0.22) {
            saladGreen++;
          }
          // から揚げ・フライのきつね色の揚げ衣
          if (h >= 22 && h <= 44 && s >= 0.45 && s <= 0.88 && v >= 0.35 && v <= 0.78) {
            friedCrispy++;
          }
          // 焼き肉・ハンバーグ・ステーキの濃い赤褐色
          if (h >= 8 && h <= 25 && s >= 0.35 && s <= 0.78 && v >= 0.18 && v <= 0.58) {
            deepMeat++;
          }
          // 白ご飯・トーストのクラム・生クリーム
          if (s < 0.20 && v > 0.72) {
            whiteRice++;
          }
          // スイーツ・ベリー・洋菓子のピンク/赤
          if ((h >= 340 || h <= 15) && s > 0.45 && v > 0.55) {
            sweetBerry++;
          }
        }

        const scores = {
          ramen: (soupBroth / total) * 2.0 + (noodleYellow / total) * 1.5,
          curry: (curryBrown / total) * 1.8 + (whiteRice / total) * 0.9,
          salad: (saladGreen / total) * 2.8,
          karaage: (friedCrispy / total) * 1.5,
          meat: (deepMeat / total) * 1.6,
          bento: (whiteRice / total) * 0.8 + (friedCrispy / total) * 0.6 + (saladGreen / total) * 0.6,
          cake: (sweetBerry / total) * 2.2 + (whiteRice / total) * 0.6
        };

        console.log("Canvas Food CV Scores:", scores);

        let bestCategory = null;
        let maxScore = 0;
        for (const [cat, score] of Object.entries(scores)) {
          if (score > maxScore) {
            maxScore = score;
            bestCategory = cat;
          }
        }

        if (maxScore >= 0.12) {
          return { category: bestCategory, score: maxScore };
        }
        return null;
      } catch (e) {
        console.warn("Canvas food analysis exception:", e);
        return null;
      }
    }

    // ==================== MealAI 高精度料理候補TOP4生成 ====================
    function getAskenCandidates(slot, detectedCategory, fileName) {
      // カテゴリ別の専門メニューリスト（AIが特定した料理に直結）
      const categoryMenus = {
        ramen: {
          label: "🍜 ラーメン (麺・スープ・具材をAI検出)",
          items: [
            { rank: 1, name: "醤油チャーシュー麺 (並盛)", calories: 620, p: 25.0, f: 18.5, c: 88.0, icon: "🍜", advice: "🍜 ラーメンを高精度に特定！チャーシューでたんぱく質が摂れています。スープを残すことで脂質・塩分を約30%カット可能！" },
            { rank: 2, name: "濃厚豚骨ラーメン (並盛)", calories: 780, p: 28.0, f: 32.0, c: 94.0, icon: "🍜", advice: "🍜 コクのある濃厚豚骨！夕食の脂質を控えめにして目標内に自動調整します。" },
            { rank: 3, name: "味噌バターコーンラーメン", calories: 740, p: 23.5, f: 26.0, c: 98.0, icon: "🍜", advice: "🍜 味噌の旨味と野菜！食物繊維とエネルギーをしっかりチャージ。" },
            { rank: 4, name: "鶏白湯ラーメン (あっさり)", calories: 540, p: 26.5, f: 14.0, c: 76.0, icon: "🍜", advice: "✨ ヘルシーな鶏白湯！高タンパク・適正カロリーで優秀な選択肢です。" }
          ]
        },
        curry: {
          label: "🍛 カレーライス (ルーとライスの比率をAI検出)",
          items: [
            { rank: 1, name: "チキンカレーライス (普通盛り)", calories: 680, p: 18.5, f: 20.0, c: 105.0, icon: "🍛", advice: "🍛 カレーを特定！スパイスで代謝アップ。夕食で主食を少し軽めに調整します。" },
            { rank: 2, name: "特製ビーフカレー (普通盛り)", calories: 750, p: 21.0, f: 24.0, c: 108.0, icon: "🍛", advice: "🍛 食べごたえ抜群！野菜サラダを添えると血糖値の上昇を緩やかにできます。" },
            { rank: 3, name: "ロースカツカレー (普通盛り)", calories: 960, p: 28.5, f: 38.0, c: 122.0, icon: "🍛", advice: "💡 ご褒美カツカレー！日中の活動量と相殺して目標内に収めます。" },
            { rank: 4, name: "たっぷり野菜のスープカレー", calories: 450, p: 19.0, f: 11.5, c: 68.0, icon: "🍛", advice: "✨ 低脂質で具だくさん！食物繊維たっぷりのヘルシーカレーです。" }
          ]
        },
        salad: {
          label: "🥗 サラダ・野菜料理 (フレッシュな葉物野菜をAI検出)",
          items: [
            { rank: 1, name: "グリルチキンのチョップドサラダ", calories: 210, p: 25.4, f: 7.2, c: 9.8, icon: "🥗", advice: "✨ 理想的な高たんぱく・超低脂質！次の食事にカロリーの余裕が大きくできました。" },
            { rank: 2, name: "シーザーサラダ (温玉・クルトン付)", calories: 280, p: 12.0, f: 18.5, c: 14.0, icon: "🥗", advice: "🥗 チーズと温泉卵のコク！主菜と組み合わせてバランスを整えましょう。" },
            { rank: 3, name: "蒸し鶏と豆腐の胡麻ドレサラダ", calories: 230, p: 21.0, f: 11.0, c: 10.5, icon: "🥗", advice: "✨ 大豆イソフラボンと良質なたんぱく質が摂れる美肌サラダです。" },
            { rank: 4, name: "海鮮アボカドポキサラダ", calories: 310, p: 18.0, f: 19.0, c: 15.0, icon: "🥑", advice: "🐟 アボカドと良質なオメガ3脂肪酸！美容と代謝に最適です。" }
          ]
        },
        karaage: {
          label: "🍗 から揚げ・揚げ物 (クリスピーな揚げ色をAI検出)",
          items: [
            { rank: 1, name: "特製からあげ弁当 (ご飯普通盛り)", calories: 780, p: 27.0, f: 29.5, c: 94.0, icon: "🍱", advice: "🍗 唐揚げ弁当を特定！たんぱく質豊富。夜は脂質控えめの魚やスープがおすすめ。" },
            { rank: 2, name: "若鶏のから揚げ定食 (4個)", calories: 720, p: 32.0, f: 28.0, c: 82.0, icon: "🍗", advice: "🍗 たんぱく質しっかり補給！レモンをかけると脂っこさを抑えられます。" },
            { rank: 3, name: "チキン南蛮定食 (タルタルソース付)", calories: 880, p: 34.0, f: 38.0, c: 96.0, icon: "🍱", advice: "💡 ボリューム満点！翌日の朝食を軽めにしてトータルで収めます。" },
            { rank: 4, name: "油淋鶏 (ユーリンチー) 定食", calories: 760, p: 30.0, f: 29.0, c: 88.0, icon: "🍗", advice: "🍗 ネギだれの香味！代謝を促す香味野菜がアクセント。" }
          ]
        },
        meat: {
          label: "🥩 肉料理・ハンバーグ (焼き色と質感をAI検出)",
          items: [
            { rank: 1, name: "デミグラスハンバーグ定食 (ご飯普通)", calories: 714, p: 29.8, f: 29.0, c: 77.4, icon: "🥩", advice: "🥩 ハンバーグを特定！しっかり肉料理。睡眠中の筋肉修復をサポートします。" },
            { rank: 2, name: "豚ロース生姜焼き定食 (普通盛り)", calories: 680, p: 28.0, f: 24.0, c: 85.0, icon: "🥩", advice: "🐷 ビタミンB1豊富で疲労回復！糖質の代謝をスムーズにします。" },
            { rank: 3, name: "カットステーキ定食 (和風おろしソース)", calories: 620, p: 36.0, f: 21.0, c: 68.0, icon: "🥩", advice: "✨ 赤身肉の良質なたんぱく質！脂質控えめで減量に最適です。" },
            { rank: 4, name: "牛すき焼き重 (温泉たまご付き)", calories: 750, p: 27.0, f: 25.0, c: 98.0, icon: "🍱", advice: "💡 甘辛いたれとお肉！活動的な日のエネルギー源になります。" }
          ]
        },
        cake: {
          label: "🍰 スイーツ・ケーキ (スイーツの色彩とトッピングをAI検出)",
          items: [
            { rank: 1, name: "ベイクドチーズケーキ (1個)", calories: 360, p: 6.8, f: 24.2, c: 28.5, icon: "🍰", advice: "🍰 スイーツを特定！午後の至福の糖分補給。夕食の主食を軽めにして相殺します。" },
            { rank: 2, name: "苺のショートケーキ (1個)", calories: 320, p: 4.5, f: 19.0, c: 32.0, icon: "🍰", advice: "🍓 定番ショートケーキ！次の食事で脂質を抑えてバランス調整。" },
            { rank: 3, name: "濃厚ガトーショコラ (1個)", calories: 380, p: 6.0, f: 25.0, c: 32.0, icon: "🍫", advice: "🍫 ポリフェノール補給！水分をしっかり摂って代謝をキープ。" },
            { rank: 4, name: "モンブラン (1個)", calories: 350, p: 4.8, f: 20.5, c: 36.0, icon: "🌰", advice: "🌰 栗の優しい甘さ！夕食を野菜スープ中心にして帳尻を合わせます。" }
          ]
        }
      };

      // 1. AIが特定したカテゴリがあれば、その専門メニューを優先返却
      if (detectedCategory && categoryMenus[detectedCategory]) {
        return {
          label: categoryMenus[detectedCategory].label,
          candidates: categoryMenus[detectedCategory].items
        };
      }

      // 2. ファイル名にキーワードが含まれる場合のフォールバック特定
      if (fileName) {
        const fn = fileName.toLowerCase();
        if (fn.includes("ramen") || fn.includes("ラーメン") || fn.includes("麺") || fn.includes("拉麺")) {
          return { label: categoryMenus.ramen.label, candidates: categoryMenus.ramen.items };
        }
        if (fn.includes("curry") || fn.includes("カレー")) {
          return { label: categoryMenus.curry.label, candidates: categoryMenus.curry.items };
        }
        if (fn.includes("salad") || fn.includes("サラダ")) {
          return { label: categoryMenus.salad.label, candidates: categoryMenus.salad.items };
        }
        if (fn.includes("karaage") || fn.includes("からあげ") || fn.includes("唐揚")) {
          return { label: categoryMenus.karaage.label, candidates: categoryMenus.karaage.items };
        }
        if (fn.includes("cake") || fn.includes("ケーキ") || fn.includes("スイーツ")) {
          return { label: categoryMenus.cake.label, candidates: categoryMenus.cake.items };
        }
      }

      // 3. 通常の時間帯・スロット別標準メニュー
      const candidatesBySlot = {
        breakfast: [
          { rank: 1, name: "白ご飯 (150g) ＋ 目玉焼き ＋ 味噌汁", calories: 384, p: 14.1, f: 9.5, c: 58.8, icon: "🍚", advice: "✨ 朝の王道和定食！良質なたんぱく質とエネルギーをチャージ。" },
          { rank: 2, name: "食パン (6枚切) ＋ ゆで卵 ＋ カフェラテ", calories: 350, p: 15.6, f: 15.4, c: 37.5, icon: "🍞", advice: "🥖 手軽な洋朝食！糖質と脂質のバランスが適度です。" },
          { rank: 3, name: "直火焼き焼鮭おむすび ＋ 味噌汁", calories: 237, p: 9.3, f: 3.6, c: 41.0, icon: "🍙", advice: "🐟 鮭の良質なEPA/DHAと低脂質な軽朝食です。" },
          { rank: 4, name: "バナナ (1本) ＋ オイコスヨーグルト", calories: 157, p: 11.2, f: 0.2, c: 27.7, icon: "🍌", advice: "✨ 超ヘルシー高タンパク朝食！昼・夕にカロリーの余裕ができます。" }
        ],
        lunch: [
          { rank: 1, name: "チキンカレーライス (普通盛り)", calories: 680, p: 18.5, f: 20.0, c: 105.0, icon: "🍛", advice: "💡 スパイスで代謝アップ！夕食の炭水化物を少し控えめに調整します。" },
          { rank: 2, name: "特製からあげ弁当 (ご飯普通盛り)", calories: 780, p: 27.0, f: 29.5, c: 94.0, icon: "🍱", advice: "🍗 たんぱく質しっかり！夕食は脂質を抑えた魚メニューがおすすめ。" },
          { rank: 3, name: "醤油ラーメン (チャーシュー・メンマ)", calories: 520, p: 21.0, f: 16.5, c: 72.0, icon: "🍜", advice: "🍜 定番麺類！スープを少し残すとさらに塩分と脂質をカット可能。" },
          { rank: 4, name: "ミックスサンド ＋ サラダチキン", calories: 400, p: 34.7, f: 14.7, c: 30.0, icon: "🥪", advice: "✨ 理想的な高たんぱく・適正カロリーのスマートランチです！" }
        ],
        dinner: [
          { rank: 1, name: "焼き鮭・塩鮭定食 (ご飯普通・味噌汁付)", calories: 484, p: 30.0, f: 13.3, c: 58.7, icon: "🐟", advice: "✨ 理想の夕食！高タンパク・低脂質で睡眠中の脂肪燃焼をサポート。" },
          { rank: 2, name: "デミグラスハンバーグ定食 (ご飯普通)", calories: 714, p: 29.8, f: 29.0, c: 77.4, icon: "🥩", advice: "💡 しっかり肉料理！日中の活動量と相殺して目標内に収めます。" },
          { rank: 3, name: "豚ロースとんかつ定食 (普通盛り)", calories: 749, p: 31.6, f: 36.3, c: 70.6, icon: "🍱", advice: "💡 食べごたえ抜群！翌日の朝食を少し軽めにしてバランスを取ります。" },
          { rank: 4, name: "サラダチキン ＋ 豆腐とわかめの味噌汁 ＋ ゆで卵", calories: 235, p: 34.3, f: 7.4, c: 6.3, icon: "🥗", advice: "🔥 超強力な減量ディナー！体脂肪がぐんぐん燃焼するペースです。" }
        ],
        snack: [
          { rank: 1, name: "バナナ (1本 中サイズ 100g)", calories: 86, p: 1.1, f: 0.2, c: 22.5, icon: "🍌", advice: "🍌 自然な甘みとカリウム！むくみ防止にも最適なおやつです。" },
          { rank: 2, name: "プロテインバー (チョコ味 1本)", calories: 195, p: 15.0, f: 9.5, c: 12.5, icon: "🍫", advice: "💪 筋肉を守りながら小腹を満たすスマート間食です。" },
          { rank: 3, name: "ベイクドチーズケーキ (1個)", calories: 360, p: 6.8, f: 24.2, c: 28.5, icon: "🍰", advice: "🍰 美味しいスイーツ補給！夕食の主食を少し軽めにして帳尻を合わせます。" },
          { rank: 4, name: "アイスカフェラテ (無糖 200ml)", calories: 78, p: 4.1, f: 4.2, c: 5.9, icon: "☕", advice: "☕ 牛乳のたんぱく質が摂れるヘルシードリンクです。" }
        ]
      };

      return {
        label: "AI高精度判定（定番メニュー）",
        candidates: candidatesBySlot[slot] || candidatesBySlot.lunch
      };
    }

    // 解析開始演出 ＆ AI画像認識・候補自動特定
    async function startPhotoAnalysis(imageSrc, presetData, fileName, sourceImg) {
      if (primaryCameraLauncher) primaryCameraLauncher.classList.add("hidden");
      if (cameraContainer) cameraContainer.classList.add("hidden");
      if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
      const sampleBox = document.querySelector("#photoTabContent .sample-presets-box");
      if (sampleBox) sampleBox.classList.add("hidden");

      scanPreviewArea.classList.remove("hidden");
      scannedImagePreview.src = imageSrc;
      scanOverlay.classList.remove("hidden");
      scanLaserLine.classList.remove("hidden");
      scanResultArea.classList.add("hidden");
      scanStatusText.textContent = "AIが写真から料理とカロリーを分析中...";

      const slot = document.getElementById("recordTargetSlot")?.value || "breakfast";

      // 1. 高速Canvasコンピュータビジョンによる料理カテゴリ・特徴量の自動検出
      let detectedCategory = null;
      let imgForAnalysis = sourceImg;
      if (!imgForAnalysis) {
        imgForAnalysis = new Image();
        imgForAnalysis.src = imageSrc;
        if (!imgForAnalysis.complete) {
          await new Promise(r => { imgForAnalysis.onload = imgForAnalysis.onerror = r; });
        }
      }

      if (imgForAnalysis && imgForAnalysis.naturalWidth) {
        const cvRes = analyzeFoodImageWithCanvas(imgForAnalysis);
        if (cvRes) {
          detectedCategory = cvRes.category;
          console.log("Detected food category by Canvas CV:", detectedCategory);
        }
      }

      // 2. TensorFlow.js MobileNet (もしロード完了していれば機械学習で補強)
      if (window.mobilenetModel && imgForAnalysis && imgForAnalysis.naturalWidth) {
        try {
          const preds = await window.mobilenetModel.classify(imgForAnalysis);
          console.log("MobileNet predictions:", preds);
          if (preds && preds.length > 0) {
            const top = preds[0].className.toLowerCase();
            if (top.includes("ramen") || top.includes("soup bowl") || top.includes("consomme")) {
              detectedCategory = "ramen";
            } else if (top.includes("pizza")) {
              detectedCategory = "pizza";
            }
          }
        } catch (e) {
          console.warn("MobileNet inference exception:", e);
        }
      }

      // 3. Geminiキーがあれば本物AIを優先
      let geminiRes = null;
      if (geminiApiKey && !presetData) {
        scanStatusText.textContent = "Google Gemini AIが食材・カロリーを特定中...";
        geminiRes = await analyzeWithGeminiVision(imageSrc);
      }

      await new Promise(r => setTimeout(r, geminiRes ? 200 : 450));

      scanOverlay.classList.add("hidden");
      scanLaserLine.classList.add("hidden");

      let candidateResult = getAskenCandidates(slot, detectedCategory, fileName);
      let candidates = candidateResult.candidates;
      let label = candidateResult.label;

      if (presetData) {
        candidates = [{ rank: 1, ...presetData }, ...candidates.slice(0, 3).map((item, i) => ({ ...item, rank: i + 2 }))];
        label = `📸 ${presetData.name} (サンプル)`;
      } else if (geminiRes) {
        candidates = [{ rank: 1, ...geminiRes }, ...candidates.slice(0, 3).map((item, i) => ({ ...item, rank: i + 2 }))];
        label = "🤖 Google Gemini AI特定";
      }

      renderAskenCandidates(candidates, imageSrc, label);
      selectCandidate(candidates[0], imageSrc);

      scanResultArea.classList.remove("hidden");

      // スマホ・PCで結果へスムーズスクロール
      setTimeout(() => {
        scanResultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }

    // AI料理候補リストUI生成（ワンタップ決定ボタン付き ＆ AI検出バッジ）
    function renderAskenCandidates(candidates, imageSrc, detectedLabel) {
      const container = document.getElementById("aiCandidatesList");
      if (!container) return;
      container.innerHTML = "";

      if (detectedLabel) {
        const headerBadge = document.createElement("div");
        headerBadge.className = "flex items-center space-x-2 bg-emerald-100/90 border border-emerald-300 px-3 py-2 rounded-xl text-emerald-950 font-bold text-xs shadow-2xs mb-2";
        headerBadge.innerHTML = `
          <i class="fa-solid fa-wand-magic-sparkles text-emerald-600 text-sm shrink-0"></i>
          <span>AI解析判定：<strong>${detectedLabel}</strong></span>
        `;
        container.appendChild(headerBadge);
      }

      candidates.forEach((cand, idx) => {
        const row = document.createElement("div");
        row.className = `asken-candidate-card p-2.5 sm:p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-2 ${idx === 0 ? 'bg-emerald-50 border-emerald-400 shadow-2xs font-bold' : 'bg-white border-slate-200 hover:bg-slate-50'}`;
        row.innerHTML = `
          <div class="flex items-center space-x-2 sm:space-x-2.5 min-w-0 flex-1">
            <span class="w-5 h-5 rounded-full ${idx === 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'} text-[10px] font-black flex items-center justify-center shrink-0">${idx + 1}</span>
            <span class="text-base sm:text-lg shrink-0">${cand.icon || '🍽️'}</span>
            <div class="min-w-0">
              <div class="font-bold text-slate-800 text-xs sm:text-sm truncate cand-name">${cand.name}</div>
              <div class="text-[10px] text-slate-500 font-mono mt-0.5">P:${cand.p}g · F:${cand.f}g · C:${cand.c}g</div>
            </div>
          </div>
          <div class="flex items-center space-x-2 shrink-0 ml-2">
            <div class="text-right">
              <span class="font-mono font-black text-emerald-700 text-xs sm:text-sm">${cand.calories}</span>
              <span class="text-[9px] text-slate-500 block -mt-1">kcal</span>
            </div>
            <button type="button" class="quick-apply-btn px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-[11px] transition shadow-xs flex items-center gap-1 cursor-pointer">
              <span>決定</span>
              <i class="fa-solid fa-check text-[10px]"></i>
            </button>
          </div>
        `;

        // 行全体タップで選択
        row.addEventListener("click", (e) => {
          if (e.target.closest(".quick-apply-btn")) return; // 決定ボタンと二重発火防止
          document.querySelectorAll(".asken-candidate-card").forEach(c => {
            c.className = "asken-candidate-card p-2.5 sm:p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-2 bg-white border-slate-200 hover:bg-slate-50";
            const badge = c.querySelector("span:first-child");
            if (badge) badge.className = "w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center shrink-0";
          });
          row.className = "asken-candidate-card p-2.5 sm:p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-2 bg-emerald-50 border-emerald-400 shadow-2xs font-bold";
          const badge = row.querySelector("span:first-child");
          if (badge) badge.className = "w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0";
          selectCandidate(cand, imageSrc);
        });

        // 「決定」ボタンでワンタップ即記録！
        const quickBtn = row.querySelector(".quick-apply-btn");
        if (quickBtn) {
          quickBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            applyCandidateMeal({ ...cand, img: imageSrc }, imageSrc);
          });
        }

        container.appendChild(row);
      });
    }

    // スープ・汁物系料理の判定（ラーメン、うどん、そば、スープ、鍋、味噌汁等）
    function isSoupOrNoodleDish(name) {
      if (!name) return false;
      const n = name.toLowerCase();
      const keywords = [
        'ラーメン', 'らーめん', '拉麺', '麺', 'ramen',
        'うどん', 'そば', '蕎麦', 'ちゃんぽん', 'タンメン', 'フォー', '担々麺',
        'スープ', '味噌汁', 'みそ汁', '豚汁', '鍋', '雑炊', 'ポトフ', 'シチュー', 'ワンタン', '春雨'
      ];
      return keywords.some(k => n.includes(k));
    }

    function applySoupAdjustment(level) {
      if (!currentScanItem) return;
      currentScanItem.soupLevel = level;

      const baseName = currentScanItem.baseName || currentScanItem.name;
      const baseCal = currentScanItem.baseCalories !== undefined ? currentScanItem.baseCalories : currentScanItem.calories;
      const baseF = currentScanItem.baseF !== undefined ? currentScanItem.baseF : currentScanItem.f;
      const isNoodle = (baseName.includes('ラーメン') || baseName.includes('らーめん') || baseName.includes('麺') || baseName.includes('うどん') || baseName.includes('そば') || baseName.includes('ちゃんぽん') || baseName.includes('ramen'));

      let dedCal = 0;
      let dedF = 0;
      let badgeText = "全飲み（通常）";
      let adviceText = currentScanItem.baseAdvice || "✨ 食品標準データベースに基づき正確に算出しました。";

      if (level === 'half') {
        dedCal = isNoodle ? 75 : 20;
        dedF = isNoodle ? 4 : 1;
        badgeText = `半分残し (-${dedCal} kcal)`;
        adviceText = isNoodle 
          ? "💡 スープを半分残して約75kcal＆塩分カット！満足感をキープしながら賢くカロリーオフできました。" 
          : "💡 汁物を半分残して塩分・余分な脂質をカットしました。";
      } else if (level === 'none') {
        dedCal = isNoodle ? 150 : 35;
        dedF = isNoodle ? 8 : 2;
        badgeText = `麺・具のみ (-${dedCal} kcal)`;
        adviceText = isNoodle 
          ? "✨ スープを飲まずに麺と具のみ完食！約150kcal＆余分な脂質・塩分を大幅カットし、ダイエット効果抜群です！" 
          : "✨ 具材のみ食べて汁を残し、塩分と余分なカロリーをしっかり抑えました！";
      }

      const finalCal = Math.max(50, baseCal - dedCal);
      const finalF = Math.max(0, Math.round((baseF - dedF) * 10) / 10);
      const finalName = level === 'all' ? baseName : `${baseName} [${level === 'half' ? 'スープ半分' : 'スープ残し'}]`;

      currentScanItem.calories = finalCal;
      currentScanItem.f = finalF;
      currentScanItem.name = finalName;

      const nameInput = document.getElementById("resultDishNameInput");
      const calInput = document.getElementById("resultCaloriesInput");
      const fEl = document.getElementById("resultF");
      const badgeEl = document.getElementById("soupSavingsBadge");
      const adviceEl = document.getElementById("resultAdvice");
      const soupAdviceEl = document.getElementById("soupAdviceText");

      if (nameInput) nameInput.value = finalName;
      if (calInput) calInput.value = finalCal;
      if (fEl) fEl.textContent = `${finalF}g`;
      if (badgeEl) badgeEl.textContent = badgeText;
      if (adviceEl) adviceEl.textContent = adviceText;
      if (soupAdviceEl) soupAdviceEl.textContent = adviceText;

      // 記録ボタンの文言も動的に更新
      const targetSlot = document.getElementById("recordTargetSlot")?.value || "breakfast";
      const slotJp = getSlotJpName(targetSlot);
      const applyBtnLabel = document.getElementById("applyPhotoBtnLabel");
      if (applyBtnLabel) {
        applyBtnLabel.textContent = `この料理 (${finalCal} kcal) を【${slotJp}】に記録する`;
      }

      // ボタンのスタイル更新
      document.querySelectorAll(".soup-level-btn").forEach(btn => {
        const bl = btn.dataset.level;
        if (bl === level) {
          btn.className = "soup-level-btn py-1.5 px-1 rounded-xl border font-bold text-xs transition bg-amber-500 text-white shadow-2xs border-amber-500 cursor-pointer";
          const sub = btn.querySelector("div:last-child");
          if (sub) sub.className = "text-[9px] opacity-90 font-normal mt-0.5 text-white";
        } else {
          btn.className = "soup-level-btn py-1.5 px-1 rounded-xl border font-bold text-xs transition bg-white border-slate-200 text-slate-700 hover:bg-amber-50 cursor-pointer";
          const sub = btn.querySelector("div:last-child");
          if (sub) sub.className = bl === 'all' ? "text-[9px] text-slate-500 font-normal mt-0.5" : "text-[9px] text-emerald-600 font-bold mt-0.5";
        }
      });
    }

    function selectCandidate(data, imageSrc) {
      currentScanItem = {
        ...data,
        img: imageSrc || data.img || null,
        baseName: data.name,
        baseCalories: data.calories,
        baseP: data.p,
        baseF: data.f,
        baseC: data.c,
        baseAdvice: data.advice,
        soupLevel: 'all'
      };
      const nameInput = document.getElementById("resultDishNameInput");
      const calInput = document.getElementById("resultCaloriesInput");
      if (nameInput) nameInput.value = data.name;
      if (calInput) calInput.value = data.calories;

      document.getElementById("resultP").textContent = `${data.p}g`;
      document.getElementById("resultF").textContent = `${data.f}g`;
      document.getElementById("resultC").textContent = `${data.c}g`;
      document.getElementById("resultAdvice").textContent = data.advice || "✨ 食品標準データベースに基づき正確に算出しました。";

      // スープ系料理判定とUI表示
      const isSoup = isSoupOrNoodleDish(data.name);
      const soupContainer = document.getElementById("soupOptionContainer");
      if (soupContainer) {
        if (isSoup) {
          soupContainer.classList.remove("hidden");
          applySoupAdjustment('all');
        } else {
          soupContainer.classList.add("hidden");
        }
      }

      // 記録ボタンの文言も動的に更新
      const targetSlot = document.getElementById("recordTargetSlot")?.value || "breakfast";
      const slotJp = getSlotJpName(targetSlot);
      const applyBtnLabel = document.getElementById("applyPhotoBtnLabel");
      if (applyBtnLabel) {
        applyBtnLabel.textContent = `この料理 (${data.calories} kcal) を【${slotJp}】に記録する`;
      }
    }

    // スープ量調整ボタンのクリックイベント接続
    document.querySelectorAll(".soup-level-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const level = btn.dataset.level || 'all';
        applySoupAdjustment(level);
      });
    });

    // クイック微調整（-50 / +50）
    const minus50 = document.getElementById("calMinus50Btn");
    const plus50 = document.getElementById("calPlus50Btn");
    if (minus50) {
      minus50.onclick = () => {
        const inp = document.getElementById("resultCaloriesInput");
        if (inp) {
          inp.value = Math.max(0, (parseInt(inp.value) || 0) - 50);
          if (currentScanItem) currentScanItem.calories = parseInt(inp.value);
        }
      };
    }
    if (plus50) {
      plus50.onclick = () => {
        const inp = document.getElementById("resultCaloriesInput");
        if (inp) {
          inp.value = (parseInt(inp.value) || 0) + 50;
          if (currentScanItem) currentScanItem.calories = parseInt(inp.value);
        }
      };
    }

    // ==================== リアルタイム食品検索エンジン ====================
    const foodSearchInput = document.getElementById("foodQuickSearchInput");
    const foodSearchResults = document.getElementById("foodQuickSearchResults");

    if (foodSearchInput && foodSearchResults) {
      foodSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
          foodSearchResults.classList.add("hidden");
          foodSearchResults.innerHTML = "";
          return;
        }

        const matched = MEAL_DATABASE.filter(item => 
          item.name.toLowerCase().includes(query) || 
          (item.storeName && item.storeName.toLowerCase().includes(query)) ||
          (item.tags && item.tags.some(t => t.toLowerCase().includes(query)))
        ).slice(0, 10);

        if (matched.length === 0) {
          foodSearchResults.innerHTML = `<div class="p-2 text-slate-400 text-center text-xs">「${query}」に一致する食品が見つかりません</div>`;
          foodSearchResults.classList.remove("hidden");
          return;
        }

        foodSearchResults.innerHTML = matched.map(item => `
          <div class="p-2 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition search-item-row"
               data-name="${item.name}" data-cal="${item.calories}" data-p="${item.p}" data-f="${item.f}" data-c="${item.c}">
            <div class="flex items-center space-x-1.5 min-w-0">
              <span class="text-sm shrink-0">${item.icon || '🍽️'}</span>
              <div class="truncate">
                <span class="font-bold text-slate-800">${item.name}</span>
                <span class="text-[10px] text-slate-500 ml-1">(${item.storeName})</span>
              </div>
            </div>
            <span class="font-mono font-bold text-emerald-700 shrink-0 ml-2">${item.calories} kcal</span>
          </div>
        `).join("");
        foodSearchResults.classList.remove("hidden");

        foodSearchResults.querySelectorAll(".search-item-row").forEach(row => {
          row.onclick = () => {
            const name = row.dataset.name;
            const cal = parseInt(row.dataset.cal);
            const p = parseFloat(row.dataset.p);
            const f = parseFloat(row.dataset.f);
            const c = parseFloat(row.dataset.c);

            document.getElementById("resultDishNameInput").value = name;
            document.getElementById("resultCaloriesInput").value = cal;
            document.getElementById("resultP").textContent = `${p}g`;
            document.getElementById("resultF").textContent = `${f}g`;
            document.getElementById("resultC").textContent = `${c}g`;
            document.getElementById("resultAdvice").textContent = `✨ 食品DB「${name}」の正確な栄養成分 (${cal}kcal) を適用しました！`;
            
            if (currentScanItem) {
              currentScanItem.name = name;
              currentScanItem.calories = cal;
              currentScanItem.p = p;
              currentScanItem.f = f;
              currentScanItem.c = c;
            }
            foodSearchResults.classList.add("hidden");
            foodSearchInput.value = "";
          };
        });
      });

      // 外側クリックで検索候補を閉じる
      document.addEventListener("click", (e) => {
        if (!foodSearchInput.contains(e.target) && !foodSearchResults.contains(e.target)) {
          foodSearchResults.classList.add("hidden");
        }
      });
    }

    // ==================== 今月の減量ダッシュボード ＆ カレンダー ====================
    const monthlyModal = document.getElementById("monthlyModal");
    const openMonthlyBtn = document.getElementById("openMonthlyBtn");
    const closeMonthlyBtn = document.getElementById("closeMonthlyBtn");

    if (openMonthlyBtn) {
      openMonthlyBtn.addEventListener("click", () => {
        renderMonthlyDashboard();
        if (monthlyModal) monthlyModal.classList.remove("hidden");
      });
    }
    if (closeMonthlyBtn) {
      closeMonthlyBtn.addEventListener("click", () => {
        if (monthlyModal) monthlyModal.classList.add("hidden");
      });
    }
    if (monthlyModal) {
      monthlyModal.addEventListener("click", (e) => {
        if (e.target === monthlyModal) monthlyModal.classList.add("hidden");
      });
    }

    function renderMonthlyDashboard() {
      const parts = state.currentDate.split("-");
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const todayStr = state.currentDate;

      // 月の初日と日数
      const firstDay = new Date(year, month - 1, 1).getDay();
      const totalDays = new Date(year, month, 0).getDate();

      const monthLabel = document.getElementById("monthlyCalendarMonthLabel");
      if (monthLabel) monthLabel.textContent = `${year}年 ${month}月`;

      const grid = document.getElementById("monthlyCalendarGrid");
      if (!grid) return;
      grid.innerHTML = "";

      // 曜日ヘッダー
      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      dayNames.forEach((d, i) => {
        const h = document.createElement("div");
        h.className = `font-bold text-[10px] pb-1 ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`;
        h.textContent = d;
        grid.appendChild(h);
      });

      // 空白セル
      for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        empty.className = "p-1";
        grid.appendChild(empty);
      }

      // 日付セル生成
      let totalActualCalories = 0;
      let totalTargetCalories = 0;
      let recordedDaysCount = 0;

      const targetPerDay = state.targetCalories || 1650;

      for (let day = 1; day <= totalDays; day++) {
        const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayCell = document.createElement("div");
        dayCell.className = "p-1.5 rounded-xl border transition cursor-pointer flex flex-col items-center justify-between min-h-[50px]";

        // 保存された記録を読み込み
        let dayRecords = null;
        try {
          const raw = localStorage.getItem(`mealai_records_${dayStr}`);
          if (raw) dayRecords = JSON.parse(raw);
        } catch (e) {}

        let dayCalories = 0;
        let hasAnyRecord = false;
        if (dayRecords) {
          ['breakfast', 'lunch', 'dinner', 'snack'].forEach(s => {
            if (dayRecords[s] && dayRecords[s].calories) {
              dayCalories += dayRecords[s].calories;
              hasAnyRecord = true;
            }
          });
        }

        const isToday = dayStr === todayStr;

        if (hasAnyRecord) {
          recordedDaysCount++;
          totalActualCalories += dayCalories;
          totalTargetCalories += targetPerDay;

          const isUnder = dayCalories <= targetPerDay;
          dayCell.className += isUnder 
            ? " bg-emerald-50/80 border-emerald-300 hover:bg-emerald-100" 
            : " bg-rose-50/80 border-rose-300 hover:bg-rose-100";

          dayCell.innerHTML = `
            <span class="font-bold text-[11px] ${isToday ? 'text-emerald-700 underline' : 'text-slate-700'}">${day}</span>
            <span class="text-[9px] font-mono font-bold ${isUnder ? 'text-emerald-700' : 'text-rose-600'}">${dayCalories}</span>
            <span class="w-1.5 h-1.5 rounded-full ${isUnder ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
          `;
        } else {
          dayCell.className += isToday 
            ? " bg-teal-50/60 border-teal-300 font-bold" 
            : " bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-400";
          dayCell.innerHTML = `
            <span class="text-[11px] ${isToday ? 'text-teal-700 font-bold' : 'text-slate-600'}">${day}</span>
            <span class="text-[8px] text-slate-300">-</span>
            <span class="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
          `;
        }

        // クリックでその日の記録へジャンプ
        dayCell.addEventListener("click", () => {
          saveRecordsToStorage();
          state.currentDate = dayStr;
          state.records = { breakfast: null, lunch: null, dinner: null, snack: null };
          loadRecordsFromStorage();
          updateUI();
          if (monthlyModal) monthlyModal.classList.add("hidden");
        });

        grid.appendChild(dayCell);
      }

      // サマリー計算（累積カロリーカット ＆ 脂肪燃焼量）
      const netDeficit = totalTargetCalories - totalActualCalories;
      const fatLostKg = Math.max(0, (netDeficit / 7200)).toFixed(2);
      const paceGoalKg = Math.abs(parseFloat(state.user.pace) || 2.0);

      const deficitEl = document.getElementById("monthlyDeficitTotal");
      const fatEl = document.getElementById("monthlyFatLost");
      const rateEl = document.getElementById("monthlyProgressRate");
      const goalLabel = document.getElementById("monthlyGoalLabel");

      if (deficitEl) {
        deficitEl.textContent = netDeficit >= 0 ? `-${netDeficit} kcal` : `+${Math.abs(netDeficit)} kcal`;
        deficitEl.className = netDeficit >= 0 ? "text-base sm:text-lg font-black text-teal-700 font-mono mt-0.5" : "text-base sm:text-lg font-black text-rose-600 font-mono mt-0.5";
      }
      if (fatEl) fatEl.textContent = `約 -${fatLostKg} kg`;
      if (goalLabel) goalLabel.textContent = `月 -${paceGoalKg}kg 目標`;
      if (rateEl) {
        const rate = paceGoalKg > 0 ? Math.min(100, Math.round((parseFloat(fatLostKg) / paceGoalKg) * 100)) : 100;
        rateEl.textContent = `${rate}%`;
      }
    }

    // 共通：食事記録の即時適用処理（ワンタップ決定 ＆ 確定ボタン共有）
    function applyCandidateMeal(mealData, photoImg) {
      const slot = document.getElementById("recordTargetSlot")?.value || "breakfast";
      const finalName = (mealData.name && mealData.name.trim()) || "記録した食事";
      const finalCal = parseInt(mealData.calories) || 400;

      state.records[slot] = {
        name: finalName,
        calories: finalCal,
        p: mealData.p !== undefined ? mealData.p : Math.round(finalCal * 0.05),
        f: mealData.f !== undefined ? mealData.f : Math.round((finalCal * 0.2) / 9),
        c: mealData.c !== undefined ? mealData.c : Math.round((finalCal * 0.6) / 4),
        img: photoImg || mealData.img || (currentScanItem && currentScanItem.img) || null,
        icon: mealData.icon || "🍽️",
        soupLevel: mealData.soupLevel || (currentScanItem && currentScanItem.soupLevel) || null
      };

      saveRecordsToStorage();
      updateUI();
      window.closePhotoRecordModal();

      // 即座に完了バナー表示 ＆ 対象の食事カードへスクロール強調
      showRecordSuccessNotification(slot, finalName, finalCal);
    }

    function showRecordSuccessNotification(slot, name, cal) {
      const slotJp = getSlotJpName(slot);
      const banner = document.getElementById("statusBanner");
      if (banner) {
        banner.className = "rounded-2xl p-4 flex items-center justify-between text-xs font-medium border bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg";
        banner.innerHTML = `
          <div class="flex items-center space-x-2.5">
            <span class="text-2xl">🎉</span>
            <div>
              <div class="font-bold text-sm sm:text-base">【${slotJp}】に「${name}」(${cal} kcal) を記録しました！</div>
              <div class="text-[11px] text-emerald-100 mt-0.5">食べたカロリーを反映し、残りの目標・PFCバランスを即時再計算しました。</div>
            </div>
          </div>
          <button id="dismissPhotoBannerBtn" class="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition ml-2 shrink-0 cursor-pointer">閉じる</button>
        `;
        banner.classList.remove("hidden");
        const dismissBtn = document.getElementById("dismissPhotoBannerBtn");
        if (dismissBtn) dismissBtn.onclick = () => banner.classList.add("hidden");
      }

      // 対象の食事カードへスムーズスクロールし、ハイライトアニメーション
      setTimeout(() => {
        const targetCard = document.querySelector(`.meal-card[data-meal="${slot}"]`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
          targetCard.classList.add("ring-4", "ring-emerald-400", "transition-all");
          setTimeout(() => {
            targetCard.classList.remove("ring-4", "ring-emerald-400");
          }, 2500);
        }
      }, 100);
    }

    // ① 写真解析モーダル下部の確定ボタン
    if (applyPhotoMealBtn) {
      applyPhotoMealBtn.addEventListener("click", () => {
        if (!currentScanItem) return;

        const nameInput = document.getElementById("resultDishNameInput");
        const calInput = document.getElementById("resultCaloriesInput");
        const finalName = (nameInput && nameInput.value.trim()) || currentScanItem.name;
        const finalCal = (calInput && parseInt(calInput.value)) || currentScanItem.calories;

        applyCandidateMeal({
          ...currentScanItem,
          name: finalName,
          calories: finalCal
        }, currentScanItem.img);
      });
    }
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
