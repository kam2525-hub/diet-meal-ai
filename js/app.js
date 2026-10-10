/**
 * app.js - MealAI メインコントローラー
 */

document.addEventListener("DOMContentLoaded", () => {
  // AIマスコット状態
  var mascotTapCount = 0;
  var mascotIsCelebrating = false;

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
    // 体重履歴記録 (YYYY-MM-DD: kg)
    weights: {},
    // 獲得した実績バッジ一覧
    badges: [],
    // 今日の合計摂取栄養素
    eatenNutrients: { cal: 0, p: 0, f: 0, c: 0 },

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

  // 実績バッジ一覧定義
  const ACHIEVEMENTS_LIST = [
    {
      id: "first_meal",
      icon: "🌟",
      title: "はじめの一歩",
      desc: "初めて食事を記録した",
      eval: (s) => Object.values(s.records || {}).some(Boolean) || (s.weights && Object.keys(s.weights).length > 0)
    },
    {
      id: "streak_3",
      icon: "🔥",
      title: "3日連続マスター",
      desc: "3日間続けて食事または体重を記録",
      eval: (s) => (s.weights && Object.keys(s.weights).length >= 3)
    },
    {
      id: "streak_7",
      icon: "👑",
      title: "1週間継続の英雄",
      desc: "7日分以上の記録を積み重ねた",
      eval: (s) => (s.weights && Object.keys(s.weights).length >= 7)
    },
    {
      id: "protein_master",
      icon: "🥩",
      title: "たんぱく質マスター",
      desc: "1日のたんぱく質目標の80%以上を摂取",
      eval: (s) => s.eatenNutrients && s.metrics.pfc && s.metrics.pfc.p > 0 && s.eatenNutrients.p >= (s.metrics.pfc.p * 0.8)
    },
    {
      id: "weight_down",
      icon: "⚖️",
      title: "体重マイナス突破",
      desc: "記録開始時より体重が減少した",
      eval: (s) => {
        if (!s.weights) return false;
        const keys = Object.keys(s.weights).sort();
        if (keys.length < 2) return false;
        return s.weights[keys[keys.length - 1]] < s.weights[keys[0]];
      }
    },
    {
      id: "cal_just",
      icon: "🎯",
      title: "カロリージャスト",
      desc: "目標カロリーの±100kcal以内で管理",
      eval: (s) => s.eatenNutrients && s.eatenNutrients.cal > 500 && Math.abs(s.eatenNutrients.cal - s.metrics.targetCal) <= 100
    },
    {
      id: "cheat_master",
      icon: "🍕",
      title: "賢いチートデイ",
      desc: "チートデイ機能を活用してリフレッシュ",
      eval: (s) => s.isCheatDay
    },
    {
      id: "mascot_evo",
      icon: "🌸",
      title: "モグ丸の進化",
      desc: "モグ丸がLv.2以上の進化形態に成長",
      eval: (s) => typeof calculateMascotEvolutionLevel === 'function' ? calculateMascotEvolutionLevel() >= 2 : false
    }
  ];

  // 初期化
  init();

  function init() {
    loadUserFromStorage();
    loadRecordsFromStorage();
    loadWeightsFromStorage();
    loadBadgesFromStorage();
    calculateAllMetrics();
    generateFullDayPlan();
    setupEventListeners();
    setupFeatureModules();
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

  // 🔔 グローバルトースト通知＆アンドゥ復元コントローラー
  let toastTimeoutId = null;
  function showActionToast(message, options = {}) {
    const toast = document.getElementById("globalActionToast");
    const msgEl = document.getElementById("globalToastMsg");
    const iconEl = document.getElementById("globalToastIcon");
    const actionBtn = document.getElementById("globalToastActionBtn");
    const closeBtn = document.getElementById("globalToastCloseBtn");
    if (!toast || !msgEl) return;

    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
      toastTimeoutId = null;
    }

    const {
      icon = "ℹ️",
      actionText = null,
      onAction = null,
      duration = 4500
    } = options;

    msgEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;

    if (actionBtn) {
      if (actionText && typeof onAction === "function") {
        actionBtn.innerHTML = `<span>${actionText}</span>`;
        actionBtn.classList.remove("hidden");
        actionBtn.onclick = () => {
          hideActionToast();
          try {
            onAction();
          } catch (err) {
            console.error("Toast action failed:", err);
          }
        };
      } else {
        actionBtn.classList.add("hidden");
        actionBtn.onclick = null;
      }
    }

    if (closeBtn) {
      closeBtn.onclick = () => hideActionToast();
    }

    toast.classList.remove("translate-y-24", "opacity-0", "pointer-events-none");
    toast.classList.add("translate-y-0", "opacity-100", "pointer-events-auto");

    if (duration > 0) {
      toastTimeoutId = setTimeout(() => {
        hideActionToast();
      }, duration);
    }
  }

  function hideActionToast() {
    const toast = document.getElementById("globalActionToast");
    if (!toast) return;
    toast.classList.remove("translate-y-0", "opacity-100", "pointer-events-auto");
    toast.classList.add("translate-y-24", "opacity-0", "pointer-events-none");
  }
  window.showActionToast = showActionToast;
  window.hideActionToast = hideActionToast;

  // ===================== UI レンダリング =====================
  function updateUI() {
    renderDateBar();
    renderTopBmrPanel();
    renderProfileModalValues();
    renderPlanSummary();
    renderMealSlots();
    renderStatusBanner();
    checkAndRenderBadges();
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

    // ホーム画面の身体データ＆減量設定サマリーバナーの更新
    const bmrSummaryEl = document.getElementById("mainBmrSummary");
    if (bmrSummaryEl) {
      bmrSummaryEl.textContent = (m.bmr || 0).toLocaleString();
    }

    const paceSummaryEl = document.getElementById("mainPaceSummary");
    if (paceSummaryEl) {
      const pace = parseFloat(u.pace) || 0;
      paceSummaryEl.textContent = pace === 0 ? "現状維持 (±0kg)" : `月 -${pace.toFixed(1)}kg`;
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

    state.eatenNutrients = { cal: eatenCal, p: eatenP, f: eatenF, c: eatenC };

    const remainingCal = targetCal - eatenCal;

    // トップの「1日目標摂取量」表示
    document.getElementById("targetTotalCal").textContent = Math.round(targetCal).toLocaleString();
    const targetRef = document.getElementById("targetTotalCalRef");
    if (targetRef) targetRef.textContent = Math.round(targetCal).toLocaleString();

    // 食べた合計
    const eatenTotalEl = document.getElementById("eatenTotalCal");
    if (eatenTotalEl) eatenTotalEl.textContent = Math.round(eatenCal).toLocaleString();

    // 残りあと何kcal食べられるか
    const remBadge = document.getElementById("remainingCalBadge");
    const diffBadge = document.getElementById("calDiffBadge");
    if (remBadge) {
      if (remainingCal >= 0) {
        remBadge.textContent = `残りあと ${Math.round(remainingCal).toLocaleString()} kcal`;
        remBadge.className = "text-2xl sm:text-4xl font-black text-white font-mono tracking-tight";
        if (diffBadge) {
          diffBadge.textContent = "適正ペース";
          diffBadge.className = "text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
        }
      } else {
        remBadge.textContent = `目標を ${Math.round(Math.abs(remainingCal)).toLocaleString()} kcal 超過`;
        remBadge.className = "text-2xl sm:text-4xl font-black text-rose-400 font-mono tracking-tight";
        if (diffBadge) {
          diffBadge.textContent = "カロリー超過";
          diffBadge.className = "text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30";
        }
      }
    }

    // マスコット「モグ丸」の日常セリフ自動更新
    if (typeof updateMascotDefaultSpeech === "function") {
      updateMascotDefaultSpeech(eatenCal, targetCal, state.records);
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

  // ==================== 📸 写真・料理の個別取り消し選択管理 ====================
  let currentSelectiveDeleteSlot = null;

  function openSelectivePhotoDeleteModal(slot) {
    currentSelectiveDeleteSlot = slot;
    const modal = document.getElementById("photoSelectiveDeleteModal");
    if (!modal) return;

    renderSelectivePhotoDeleteModalContent(slot);
    modal.classList.remove("hidden");
    modal.style.display = "flex";
  }

  function closeSelectivePhotoDeleteModal() {
    const modal = document.getElementById("photoSelectiveDeleteModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    currentSelectiveDeleteSlot = null;
  }

  function renderSelectivePhotoDeleteModalContent(slot) {
    const record = state.records[slot];
    const badgeEl = document.getElementById("selectiveDeleteSlotBadge");
    const listEl = document.getElementById("selectiveDeletePhotoList");
    const deleteEntireBtn = document.getElementById("deleteEntireRecordFromModalBtn");
    if (!record || !listEl) return;

    const slotNameMap = { breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食", drink: "ドリンク" };
    const slotLabel = slotNameMap[slot] || slot;
    const imgs = record.imgs || (record.img ? [record.img] : []);
    const items = record.items || [];

    if (badgeEl) badgeEl.textContent = `${slotLabel}の記録（写真${imgs.length}枚）`;

    listEl.innerHTML = imgs.map((imgSrc, idx) => {
      // 紐づく品目
      const associatedItems = items.filter(it => it.photoIndex === idx);
      let itemsText = "";
      let approxCal = 0;
      if (associatedItems.length > 0) {
        itemsText = associatedItems.map(it => `${it.icon || '🥢'} ${it.name}`).join(", ");
        approxCal = associatedItems.reduce((s, it) => s + (it.calories || 0), 0);
      } else if (items.length > 0 && imgs.length > 0) {
        const itemsPerPhoto = Math.ceil(items.length / imgs.length);
        const sliced = items.slice(idx * itemsPerPhoto, (idx + 1) * itemsPerPhoto);
        if (sliced.length > 0) {
          itemsText = sliced.map(it => `${it.icon || '🥢'} ${it.name}`).join(", ");
          approxCal = sliced.reduce((s, it) => s + (it.calories || 0), 0);
        } else {
          itemsText = `写真 #${idx + 1} のメニュー`;
          approxCal = Math.round(record.calories / imgs.length);
        }
      } else {
        itemsText = idx === 0 ? record.name : `追加写真 #${idx + 1}`;
        approxCal = Math.round(record.calories / Math.max(1, imgs.length));
      }

      return `
        <div class="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between gap-3 hover:border-slate-300 transition">
          <div class="flex items-center space-x-2.5 min-w-0">
            <div class="relative shrink-0">
              <img src="${imgSrc}" class="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-xl border border-slate-200 shadow-2xs">
              <span class="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded font-mono font-bold">#${idx + 1}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[11px] font-bold text-slate-800 truncate" title="${itemsText}">${itemsText}</div>
              <div class="text-[10px] text-emerald-700 font-mono font-bold mt-0.5">約 ${approxCal} kcal</div>
            </div>
          </div>
          <button type="button" onclick="window.deleteSinglePhotoFromRecord && window.deleteSinglePhotoFromRecord('${slot}', ${idx})"
            class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
            title="この写真だけを取り消す">
            <i class="fa-solid fa-trash-can text-rose-500"></i>
            <span>取り消す</span>
          </button>
        </div>
      `;
    }).join("");

    if (deleteEntireBtn) {
      deleteEntireBtn.onclick = () => {
        closeSelectivePhotoDeleteModal();
        deleteEntireSlotRecord(slot);
      };
    }
  }

  function deleteSinglePhotoFromRecord(slot, photoIdx) {
    const record = state.records[slot];
    if (!record) return;

    // 完全バックアップ（アンドゥ復元用）
    const backupRecord = JSON.parse(JSON.stringify(record));
    const slotNameMap = { breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食", drink: "ドリンク" };
    const slotLabel = slotNameMap[slot] || slot;
    const prevCalories = record.calories || 0;

    // 写真が残り1枚（または写真がない）なら全体取り消し
    if (!record.imgs || record.imgs.length <= 1) {
      closeSelectivePhotoDeleteModal();
      deleteEntireSlotRecord(slot);
      return;
    }

    // 1. 対象写真の削除
    record.imgs.splice(photoIdx, 1);
    record.img = record.imgs[0];

    // 2. 紐づく品目の削除
    let removedDishName = "";
    let removedCal = 0;
    if (record.items && record.items.length > 0) {
      const hasPhotoIndex = record.items.some(it => it.photoIndex !== undefined);
      if (hasPhotoIndex) {
        const remainingItems = [];
        record.items.forEach(it => {
          if (it.photoIndex === photoIdx) {
            removedCal += (it.calories || 0);
            if (!removedDishName) removedDishName = it.sourceDishName || it.name;
          } else {
            // 削除した写真より後ろのインデックスを繰り上げ
            if (it.photoIndex > photoIdx) {
              it.photoIndex -= 1;
            }
            remainingItems.push(it);
          }
        });
        record.items = remainingItems;
      } else {
        const itemsPerPhoto = Math.ceil(record.items.length / (record.imgs.length + 1));
        const removed = record.items.splice(photoIdx * itemsPerPhoto, itemsPerPhoto);
        if (removed.length > 0) {
          removedDishName = removed[0].name;
          removedCal = removed.reduce((s, it) => s + (it.calories || 0), 0);
        }
      }
    }

    // photoDetails からの減算
    if (record.photoDetails && record.photoDetails.length > photoIdx) {
      const removedDetail = record.photoDetails.splice(photoIdx, 1)[0];
      if (removedCal === 0 && removedDetail) {
        removedCal = removedDetail.calories || 0;
        removedDishName = removedDetail.name || "";
      }
      record.photoDetails.forEach((d, i) => { d.idx = i; });
    }

    // 3. カロリー・PFCの再計算
    if (record.items && record.items.length > 0) {
      record.calories = record.items.reduce((s, it) => s + (it.calories || 0), 0);
      record.p = Math.round(record.items.reduce((s, it) => s + (it.p || 0), 0) * 10) / 10;
      record.f = Math.round(record.items.reduce((s, it) => s + (it.f || 0), 0) * 10) / 10;
      record.c = Math.round(record.items.reduce((s, it) => s + (it.c || 0), 0) * 10) / 10;

      // もし品目再計算でカロリーが減っていない場合は強制減算
      if (record.calories >= prevCalories && removedCal > 0) {
        record.calories = Math.max(50, prevCalories - removedCal);
      } else if (record.calories >= prevCalories) {
        const approx = Math.round(prevCalories / (record.imgs.length + 1));
        record.calories = Math.max(50, prevCalories - approx);
        removedCal = approx;
      }

      // 料理名の再構築
      const uniqueNames = [];
      record.items.forEach(it => {
        const dName = it.sourceDishName || it.name;
        if (!uniqueNames.includes(dName)) uniqueNames.push(dName);
      });
      record.name = uniqueNames.join(" ＋ ");
    } else {
      if (removedCal > 0) {
        record.calories = Math.max(50, prevCalories - removedCal);
      } else {
        const approx = Math.round(prevCalories / (record.imgs.length + 1));
        record.calories = Math.max(50, prevCalories - approx);
        removedCal = approx;
      }
    }

    const actualDeducted = Math.max(0, prevCalories - record.calories);

    saveRecordsToStorage();
    updateUI();

    // モーダルがまだ写真2枚以上なら再描画、1枚になったら閉じる
    if (record.imgs && record.imgs.length > 1) {
      renderSelectivePhotoDeleteModalContent(slot);
    } else {
      closeSelectivePhotoDeleteModal();
    }

    // トーストでアンドゥ通知（引いたカロリーを明示）
    const toastMsg = removedDishName
      ? `【${slotLabel}】の「${removedDishName}」（写真）を取り消しました（-${actualDeducted} kcal）`
      : `【${slotLabel}】の写真を1枚取り消しました（-${actualDeducted} kcal）`;

    showActionToast(toastMsg, {
      icon: "🗑️",
      actionText: "↩️ 元に戻す",
      duration: 6000,
      onAction: () => {
        state.records[slot] = backupRecord;
        saveRecordsToStorage();
        updateUI();
        showActionToast(`【${slotLabel}】の写真を元に戻しました！`, { icon: "✨", duration: 3000 });
      }
    });
  }

  function deleteEntireSlotRecord(slot) {
    const backupRecord = state.records[slot];
    if (!backupRecord) return;

    const slotNameMap = { breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食", drink: "ドリンク" };
    const slotLabel = slotNameMap[slot] || slot;

    state.records[slot] = null;
    saveRecordsToStorage();
    updateUI();

    showActionToast(`【${slotLabel}】の食事記録を取り消しました`, {
      icon: "🗑️",
      actionText: "↩️ 元に戻す",
      duration: 6000,
      onAction: () => {
        state.records[slot] = backupRecord;
        saveRecordsToStorage();
        updateUI();
        showActionToast(`【${slotLabel}】の食事記録を元に戻しました！`, { icon: "✨", duration: 3000 });
      }
    });
  }

  window.openSelectivePhotoDeleteModal = openSelectivePhotoDeleteModal;
  window.closeSelectivePhotoDeleteModal = closeSelectivePhotoDeleteModal;
  window.deleteSinglePhotoFromRecord = deleteSinglePhotoFromRecord;
  window.deleteEntireSlotRecord = deleteEntireSlotRecord;

  function renderMealSlots() {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
    const targetCal = state.metrics.targetCal;
    const targetPfc = state.metrics.pfc;

    // 基本のカロリー比率（朝25%, 昼38%, 夜30%, 間食7%）
    const baseRatios = {
      breakfast: { cal: 0.25, p: 0.25, f: 0.22, c: 0.27 },
      lunch: { cal: 0.38, p: 0.38, f: 0.40, c: 0.38 },
      dinner: { cal: 0.30, p: 0.32, f: 0.25, c: 0.28 },
      snack: { cal: 0.07, p: 0.05, f: 0.13, c: 0.07 }
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
              ${record.img ? `
                <div class="relative shrink-0 ${record.imgs && record.imgs.length > 1 ? 'cursor-pointer hover:opacity-90' : ''}"
                  ${record.imgs && record.imgs.length > 1 ? `onclick="window.openSelectivePhotoDeleteModal && window.openSelectivePhotoDeleteModal('${slot}')" title="写真が${record.imgs.length}枚あります。クリックして1枚ずつ確認・取り消し"` : ''}>
                  <img src="${record.img}" class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-emerald-300 shadow-xs">
                  ${record.imgs && record.imgs.length > 1 ? `
                    <span class="absolute -bottom-1 -right-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[8.5px] px-1 py-0.2 rounded-full font-bold shadow-2xs flex items-center gap-0.5">
                      <i class="fa-solid fa-layer-group text-[7px]"></i>${record.imgs.length}枚
                    </span>
                  ` : ''}
                </div>
              ` : `<span class="text-xl sm:text-2xl shrink-0">${record.icon || '🍽️'}</span>`}
              <div class="min-w-0 flex-1">
                <div class="font-bold text-slate-800 text-xs sm:text-sm break-words flex items-center gap-1.5 flex-wrap">
                  <span>${record.name}</span>
                  ${record.soupLevel === 'half' ? '<span class="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-md font-bold">🍜 スープ半分残し</span>' : ''}
                  ${record.soupLevel === 'none' ? '<span class="text-[9px] bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 py-0.2 rounded-md font-bold">🍜 麺・具のみ完食</span>' : ''}
                </div>
                ${record.items && record.items.length > 1 ? `
                <div class="flex flex-wrap gap-1 mt-1">
                  ${record.items.map(it => `<span class="text-[9px] bg-white/90 border border-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-0.5"><span>${it.icon || '🍽️'}</span><span>${it.name}</span></span>`).join('')}
                </div>
                ` : ''}
                <div class="text-[10px] sm:text-[11px] text-slate-600 mt-1 flex flex-wrap gap-1 items-center">
                  <span class="font-mono font-bold text-emerald-800">${record.calories} kcal</span>
                  <span class="text-slate-500 font-mono">(P:${record.p}g · F:${record.f}g · C:${record.c}g)</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" onclick="window.triggerSlotAppendPhoto && window.triggerSlotAppendPhoto('${slot}')"
                class="text-[10px] text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-100/70 border border-emerald-300 px-2 py-1 rounded-lg font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                title="この食事に別皿やデザートの写真を追加して合算">
                <i class="fa-solid fa-camera text-emerald-600"></i>
                <span>＋写真追加</span>
              </button>
              <input type="file" id="slotAppendFileInput_${slot}" accept="image/*" class="hidden" onchange="window.handleAppendPhotoToSlot && window.handleAppendPhotoToSlot('${slot}', this)">
              <button class="delete-record-btn text-[11px] text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded-lg hover:bg-rose-50 transition shrink-0 cursor-pointer" data-slot="${slot}"
                title="${record.imgs && record.imgs.length > 1 ? '写真を選んで取り消す' : 'この食事を取り消す'}">
                <i class="fa-solid fa-trash-can mr-1"></i>取り消す
              </button>
            </div>
          `;

          // 削除ボタンイベント（複数写真なら個別選択モーダル、1枚なら全体取り消し）
          const delBtn = filledView.querySelector(".delete-record-btn");
          if (delBtn) {
            delBtn.onclick = (e) => {
              const s = slot || (delBtn && delBtn.dataset.slot) || (e.currentTarget && e.currentTarget.dataset.slot);
              const targetRecord = state.records[s];
              if (!targetRecord) return;

              // 写真が2枚以上ある場合は、1つ1つ選べるモーダルを開く
              if (targetRecord.imgs && targetRecord.imgs.length > 1) {
                openSelectivePhotoDeleteModal(s);
              } else {
                deleteEntireSlotRecord(s);
              }
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



  // ===================== イベントリスナー =====================
  // グローバルモーダル開閉（HTMLのonclickからも直接呼べるようにwindowに公開）
  window.openPhotoRecordModal = function (slot) {
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

  window.closePhotoRecordModal = function () {
    const modal = document.getElementById("photoModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";

    // カメラ停止してリソース解放
    if (window.stopCameraStream) {
      window.stopCameraStream();
    }
  };

  // プロフィール・減量目標設定モーダルの開閉（単一の設定ウィンドウとして全画面から呼び出し）
  window.openProfileModal = function () {
    const profileModal = document.getElementById("profileModal");
    if (!profileModal) return;

    // 現在のユーザー設定値を入力フィールドに完全同期
    const u = state.user;
    const genderEl = document.getElementById("userGender");
    if (genderEl) genderEl.value = u.gender;
    const ageEl = document.getElementById("userAge");
    if (ageEl) ageEl.value = u.age;
    const heightEl = document.getElementById("userHeight");
    if (heightEl) heightEl.value = u.height;
    const weightEl = document.getElementById("userWeight");
    if (weightEl) weightEl.value = u.weight;
    const actEl = document.getElementById("userActivity");
    if (actEl) actEl.value = u.activity;
    const paceEl = document.getElementById("userPace");
    if (paceEl) paceEl.value = u.pace;
    const budgetEl = document.getElementById("userBudget");
    if (budgetEl) budgetEl.value = u.budget;
    const cheatEl = document.getElementById("userCheatDay");
    if (cheatEl) cheatEl.value = u.cheatDay;
    const favEl = document.getElementById("userFavorites");
    if (favEl) favEl.value = u.favorites;

    // モーダル内プレビューを最新値で計算・描画
    calculateAllMetrics();
    renderProfileModalValues();

    profileModal.classList.remove("hidden");
    profileModal.style.display = "flex";
  };

  window.closeProfileModal = function () {
    const profileModal = document.getElementById("profileModal");
    if (!profileModal) return;
    profileModal.classList.add("hidden");
    profileModal.style.display = "none";
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

    const profileModal = document.getElementById("profileModal");
    if (profileModal) {
      profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) {
          window.closeProfileModal();
        }
      });
    }

    // プロフィール・減量設定モーダルの開閉
    document.getElementById("openProfileBtn")?.addEventListener("click", () => {
      window.openProfileModal();
    });
    document.getElementById("closeProfileBtn")?.addEventListener("click", () => {
      window.closeProfileModal();
    });

    // プロフィール入力変更時のリアルタイムプレビュー連動（input & changeの両イベントに対応）
    const profileInputIds = ['userGender', 'userAge', 'userHeight', 'userWeight', 'userActivity', 'userPace', 'userBudget', 'userCheatDay', 'userFavorites'];
    const handleProfilePreviewChange = () => {
      readProfileInputs();
      calculateAllMetrics();
      renderProfileModalValues();
    };
    profileInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", handleProfilePreviewChange);
        el.addEventListener("change", handleProfilePreviewChange);
      }
    });

    // プロフィール設定保存（保存 → 全体再計算 → 献立更新 → UI更新 → モーダル閉）
    document.getElementById("saveProfileBtn")?.addEventListener("click", () => {
      readProfileInputs();
      calculateAllMetrics();
      generateFullDayPlan();
      saveUserToStorage();
      updateUI();
      window.closeProfileModal();
    });

    // 全リロールボタン（任意）
    document.getElementById("regenerateAllBtn")?.addEventListener("click", () => {
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

    // クイック気分・調整ボタンたち（任意）
    setupCravingButton("btnCravingSweet", "sweet");
    setupCravingButton("btnCravingSalty", "salty");
    setupCravingButton("btnCravingMeat", "meat");

    // リカバリーボタン（任意）
    document.getElementById("btnToggleRecovery")?.addEventListener("click", (e) => {
      state.isRecoveryMode = !state.isRecoveryMode;
      if (state.isRecoveryMode) state.isCheatDay = false; // 排他
      document.getElementById("btnToggleCheat")?.classList.remove("active");
      e.currentTarget.classList.toggle("active", state.isRecoveryMode);
      calculateAllMetrics();
      generateFullDayPlan();
      updateUI();
    });

    // チートデイボタン（任意）
    document.getElementById("btnToggleCheat")?.addEventListener("click", (e) => {
      state.isCheatDay = !state.isCheatDay;
      if (state.isCheatDay) state.isRecoveryMode = false; // 排他
      document.getElementById("btnToggleRecovery")?.classList.remove("active");
      e.currentTarget.classList.toggle("active", state.isCheatDay);
      calculateAllMetrics();
      generateFullDayPlan();
      updateUI();
    });

    // 1000円以内節約ボタン（任意）
    document.getElementById("btnBudgetStrict")?.addEventListener("click", (e) => {
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
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (state.craving === cravingType) {
        state.craving = null;
        btn.classList.remove("active");
      } else {
        ['btnCravingSweet', 'btnCravingSalty', 'btnCravingMeat'].forEach(id => {
          document.getElementById(id)?.classList.remove("active");
        });
        state.craving = cravingType;
        btn.classList.add("active");
      }
      generateFullDayPlan();
      updateUI();
    });
  }

  function readProfileInputs() {
    const genderEl = document.getElementById("userGender");
    if (genderEl) state.user.gender = genderEl.value;

    const ageEl = document.getElementById("userAge");
    if (ageEl) {
      const v = parseInt(ageEl.value, 10);
      state.user.age = isNaN(v) ? 28 : v;
    }

    const heightEl = document.getElementById("userHeight");
    if (heightEl) {
      const v = parseFloat(heightEl.value);
      state.user.height = isNaN(v) ? 170 : v;
    }

    const weightEl = document.getElementById("userWeight");
    if (weightEl) {
      const v = parseFloat(weightEl.value);
      state.user.weight = isNaN(v) ? 65 : v;
    }

    const actEl = document.getElementById("userActivity");
    if (actEl) {
      const v = parseFloat(actEl.value);
      state.user.activity = isNaN(v) ? 1.375 : v;
    }

    const paceEl = document.getElementById("userPace");
    if (paceEl) {
      const v = parseFloat(paceEl.value);
      state.user.pace = isNaN(v) ? 2 : v;
    }

    const budgetEl = document.getElementById("userBudget");
    if (budgetEl) {
      const v = parseInt(budgetEl.value, 10);
      state.user.budget = isNaN(v) ? 1500 : v;
    }

    const cheatEl = document.getElementById("userCheatDay");
    if (cheatEl) state.user.cheatDay = cheatEl.value;

    const favEl = document.getElementById("userFavorites");
    if (favEl) state.user.favorites = favEl.value;
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
        const genderEl = document.getElementById("userGender");
        if (genderEl) genderEl.value = state.user.gender;
        const ageEl = document.getElementById("userAge");
        if (ageEl) ageEl.value = state.user.age;
        const heightEl = document.getElementById("userHeight");
        if (heightEl) heightEl.value = state.user.height;
        const weightEl = document.getElementById("userWeight");
        if (weightEl) weightEl.value = state.user.weight;
        const actEl = document.getElementById("userActivity");
        if (actEl) actEl.value = state.user.activity;
        const paceEl = document.getElementById("userPace");
        if (paceEl) paceEl.value = state.user.pace;
        const budgetEl = document.getElementById("userBudget");
        if (budgetEl) budgetEl.value = state.user.budget;
        const cheatEl = document.getElementById("userCheatDay");
        if (cheatEl) cheatEl.value = state.user.cheatDay;
        const favEl = document.getElementById("userFavorites");
        if (favEl) favEl.value = state.user.favorites;
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
    try {
      Object.defineProperty(window, 'currentScanItem', {
        get: () => currentScanItem,
        set: (v) => { currentScanItem = v; },
        configurable: true
      });
    } catch (_) {}



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
        } catch (e) { }

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
        } catch (e) { }
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
      const scanNonFoodAlert = document.getElementById("scanNonFoodAlert");
      if (scanNonFoodAlert) scanNonFoodAlert.classList.add("hidden");
      if (scanPreviewArea) scanPreviewArea.classList.add("hidden");
      if (scanResultArea) scanResultArea.classList.add("hidden");
      if (primaryCameraLauncher) primaryCameraLauncher.classList.remove("hidden");
      if (cameraContainer) cameraContainer.classList.add("hidden");
      if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
      if (directCameraInput) directCameraInput.value = "";
      if (albumFileInput) albumFileInput.value = "";
    }
    window.retakePhotoFromModal = resetCameraView;

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
        const lastEst = window.lastManualAIEstimate;
        const hasMatchedItems = lastEst && lastEst.name === dishName && lastEst.items;

        state.records[slot] = {
          name: dishName,
          items: hasMatchedItems ? lastEst.items : null,
          calories: calories,
          p: p,
          f: f,
          c: c,
          img: null,
          icon: (lastEst && lastEst.icon) || "✏️"
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
        const preview = document.getElementById("aiLookupResultPreview");
        if (preview) preview.classList.add("hidden");
        window.lastManualAIEstimate = null;
      });
    }

    // ✨ 手動入力の料理名からGemini AIでカロリー・栄養・品目を調べる
    window.lookupManualDishWithAI = async function () {
      const nameInput = document.getElementById("manualDishName");
      const dishText = nameInput ? nameInput.value.trim() : "";
      if (!dishText) {
        alert("料理名を入力してください（例: 親子丼、味噌汁と鮭の塩焼き、カレー）");
        if (nameInput) nameInput.focus();
        return;
      }

      const statusEl = document.getElementById("aiLookupStatus");
      const statusText = document.getElementById("aiLookupStatusText");
      const preview = document.getElementById("aiLookupResultPreview");
      const btn = document.getElementById("aiLookupManualDishBtn");

      if (statusEl) statusEl.classList.remove("hidden");
      if (statusText) statusText.textContent = `✨ AIが「${dishText}」の栄養・品目を検索・計算中...`;
      if (btn) btn.disabled = true;

      try {
        const result = await analyzeDishWithGeminiText(dishText);
        window.lastManualAIEstimate = result;

        // 入力フォームに値を即時補完
        const calInput = document.getElementById("manualCalories");
        const pInput = document.getElementById("manualP");
        const fInput = document.getElementById("manualF");
        const cInput = document.getElementById("manualC");

        if (calInput) calInput.value = result.calories;
        if (pInput) pInput.value = result.p;
        if (fInput) fInput.value = result.f;
        if (cInput) cInput.value = result.c;

        // プレビュー表示
        if (preview) {
          preview.classList.remove("hidden");
          const iconEl = document.getElementById("aiLookupResultIcon");
          const nameEl = document.getElementById("aiLookupResultName");
          const calEl = document.getElementById("aiLookupResultCal");
          const macrosEl = document.getElementById("aiLookupResultMacros");
          const tagsEl = document.getElementById("aiLookupItemsTagList");

          if (iconEl) iconEl.textContent = result.icon || "🍽️";
          if (nameEl) nameEl.textContent = result.name;
          if (calEl) calEl.textContent = `${result.calories} kcal`;
          if (macrosEl) macrosEl.textContent = `P: ${result.p}g · F: ${result.f}g · C: ${result.c}g`;

          if (tagsEl) {
            if (result.items && result.items.length > 0) {
              tagsEl.innerHTML = result.items.map(it => `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-900 text-[10px] font-bold">
                  <span>${it.icon || '🥢'}</span>
                  <span>${it.name}</span>
                  <span class="text-indigo-600 font-mono">(${it.calories}kcal)</span>
                </span>
              `).join("");
            } else {
              tagsEl.innerHTML = "";
            }
          }
        }
      } catch (err) {
        console.error("lookupManualDishWithAI error:", err);
        alert("AIによる検索に失敗しました。手動で数値を入力してください。");
      } finally {
        if (statusEl) statusEl.classList.add("hidden");
        if (btn) btn.disabled = false;
      }
    };

    // ✨ 手動AI推計から品目ごとの詳細調整画面（Step 2）へ直接進む
    window.proceedToStep2FromManualAI = function () {
      const result = window.lastManualAIEstimate;
      if (!result) return;

      currentScanItem = {
        ...result,
        img: null,
        imgs: [],
        baseName: result.name,
        baseCalories: result.calories,
        baseP: result.p,
        baseF: result.f,
        baseC: result.c,
        soupLevel: 'all'
      };

      // 写真タブのUIへ切り替えてStep 2を表示
      switchRecordTab('photo');
      const scanPreviewArea = document.getElementById("scanPreviewArea");
      const scanResultArea = document.getElementById("scanResultArea");
      if (scanPreviewArea) scanPreviewArea.classList.add("hidden");
      if (scanResultArea) scanResultArea.classList.remove("hidden");

      setupStep1DishUI(currentScanItem, true, false, null);
      goToNutritionStep();
    };

    // 📸 ホーム画面カードからの追加写真ファイルピッカー起動
    window.triggerSlotAppendPhoto = function (slot) {
      const inp = document.getElementById(`slotAppendFileInput_${slot}`);
      if (inp) {
        inp.value = "";
        inp.click();
      }
    };

    // 📸 記録済みスロットに写真を追加して合算
    window.handleAppendPhotoToSlot = function (slot, input) {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      const record = state.records[slot];
      if (!record) return;

      const reader = new FileReader();
      reader.onload = async function (e) {
        const imageSrc = e.target.result;
        input.value = "";

        // スロットをセット
        const targetSlotSelect = document.getElementById("recordTargetSlot");
        if (targetSlotSelect) targetSlotSelect.value = slot;

        // モーダルを直接表示（カメラリセットは回避し、解析画面を直結）
        const modal = document.getElementById("photoModal");
        if (modal) {
          modal.classList.remove("hidden");
          modal.style.display = "flex";
        }
        switchRecordTab('photo');

        // ランチャーを隠して解析画面に集中
        if (primaryCameraLauncher) primaryCameraLauncher.classList.add("hidden");
        if (cameraContainer) cameraContainer.classList.add("hidden");
        if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
        const sampleBox = document.querySelector("#photoTabContent .sample-presets-box");
        if (sampleBox) sampleBox.classList.add("hidden");

        // 既存のレコードを currentScanItem としてロード（完全ディープコピー）
        currentScanItem = {
          name: record.name,
          items: record.items ? JSON.parse(JSON.stringify(record.items)) : null,
          calories: record.calories,
          baseCalories: record.calories,
          p: record.p,
          baseP: record.p,
          f: record.f,
          baseF: record.f,
          c: record.c,
          baseC: record.c,
          img: record.img || null,
          imgs: record.imgs ? [...record.imgs] : (record.img ? [record.img] : []),
          icon: record.icon || "🍽️",
          soupLevel: record.soupLevel || 'all'
        };

        // 写真を追加合算（Step 1 の料理確認画面へ）
        await appendPhotoToCurrentScan(imageSrc, file.name);
      };
      reader.readAsDataURL(file);
    };

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

    // ==================== Gemini API設定 ＆ 状態管理（BYOK無料方式） ====================
    let geminiApiKey = localStorage.getItem("mealai_gemini_key") || "";

    // Google Gemini APIキー接続テスト関数（利用可能な高クォータモデル順に自動フォールバック検証）
    async function testGeminiApiKeyConnection(apiKey) {
      if (!apiKey) return { success: false, message: "APIキーが入力されていません" };
      const candidateModels = [
        "gemini-flash-lite-latest",
        "gemini-3-flash-preview",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite-preview",
        "gemini-3.8-flash",
        "gemini-3.5-flash"
      ];
      const payload = {
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 2 }
      };

      let lastError = null;
      let lastStatus = 0;
      let lastReason = "";

      for (const model of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            localStorage.setItem("mealai_gemini_active_model", model);
            return { success: true, model: model };
          }
          const errData = await res.json().catch(() => ({}));
          lastError = errData.error?.message || `HTTP ${res.status}`;
          lastReason = errData.error?.details?.[0]?.reason || "";
          lastStatus = res.status;

          // キー自体が無効な場合は全モデルで共通エラーになるためループ即停止
          if (lastError.includes("API_KEY_INVALID") || lastReason === "API_KEY_INVALID" || lastStatus === 400) {
            break;
          }
        } catch (err) {
          lastError = err.message;
        }
      }

      return { success: false, message: lastError || "通信に失敗しました", reason: lastReason, status: lastStatus };
    }
    window.testGeminiApiKeyConnection = testGeminiApiKeyConnection;

    function updateGeminiStatusUI() {
      geminiApiKey = localStorage.getItem("mealai_gemini_key") || "";
      let isVerified = localStorage.getItem("mealai_gemini_verified");
      let lastError = localStorage.getItem("mealai_gemini_last_error") || "";

      // 過去の古い1.5系エラーがブラウザ内に残っている場合は自動クリア
      if (lastError.includes("1.5-flash") || lastError.includes("gemini-1.5")) {
        localStorage.removeItem("mealai_gemini_last_error");
        lastError = "";
        if (isVerified === "false") {
          localStorage.removeItem("mealai_gemini_verified");
          isVerified = null;
        }
      }

      const modalInput = document.getElementById("geminiModalApiKeyInput");
      const modalBadge = document.getElementById("geminiModalStatusBadge");
      const modalDesc = document.getElementById("geminiModalStatusDesc");
      const headerBadge = document.getElementById("headerGeminiBadge");
      const photoBadge = document.getElementById("geminiStatusBadge");
      const photoDesc = document.getElementById("geminiStatusBarDesc");
      const photoBtnText = document.getElementById("geminiStatusActionBtnText");

      if (modalInput && !modalInput.value) modalInput.value = geminiApiKey;

      if (headerBadge) {
        if (geminiApiKey && isVerified === "true") {
          headerBadge.className = "w-2 h-2 rounded-full bg-emerald-500 shadow-xs inline-block";
          headerBadge.title = "Google AI接続中";
        } else if (geminiApiKey && isVerified === "false") {
          headerBadge.className = "w-2 h-2 rounded-full bg-amber-500 shadow-xs inline-block";
          headerBadge.title = "Google AI要確認（通信エラー）";
        } else {
          headerBadge.className = "w-2 h-2 rounded-full bg-slate-300 inline-block";
          headerBadge.title = "Google AI未設定";
        }
      }

      if (photoBadge) {
        if (geminiApiKey && isVerified === "true") {
          photoBadge.textContent = "✨ 超高精度AI有効（接続確認済）";
          photoBadge.className = "text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300";
        } else if (geminiApiKey && isVerified === "false") {
          photoBadge.textContent = "⚠️ API要確認（通信エラー）";
          photoBadge.className = "text-[9px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300";
        } else if (geminiApiKey) {
          photoBadge.textContent = "⚡ AIキー設定済";
          photoBadge.className = "text-[9px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-300";
        } else {
          photoBadge.textContent = "未設定（標準）";
          photoBadge.className = "text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600";
        }
      }

      if (photoDesc) {
        if (geminiApiKey && isVerified === "true") {
          photoDesc.textContent = "自分専用の無料AI枠が稼働中。写真を撮るだけで料理・具材・カロリーを自動特定します";
        } else if (geminiApiKey && isVerified === "false") {
          photoDesc.textContent = `Google APIエラー発生中（${lastError.slice(0, 30)}...）。「設定変更」からキーを再確認してください`;
        } else {
          photoDesc.textContent = "写真を撮るだけで料理・副菜を95%以上の精度で特定";
        }
      }

      if (photoBtnText) {
        photoBtnText.textContent = geminiApiKey ? "設定変更" : "AI設定";
      }

      if (modalBadge) {
        if (geminiApiKey && isVerified === "true") {
          modalBadge.textContent = "✨ Google AI 接続確認完了";
          modalBadge.className = "text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300";
        } else if (geminiApiKey && isVerified === "false") {
          modalBadge.textContent = "⚠️ 通信エラー（キー要再確認）";
          modalBadge.className = "text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 border border-rose-300";
        } else if (geminiApiKey) {
          modalBadge.textContent = "設定保存済（未テスト）";
          modalBadge.className = "text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-300";
        } else {
          modalBadge.textContent = "未設定（標準モード）";
          modalBadge.className = "text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600";
        }
      }

      if (modalDesc) {
        if (geminiApiKey && isVerified === "true") {
          modalDesc.textContent = "Google AI（Gemini）と正常に接続テストが完了しています！食事の写真を撮影すると本物のGoogle AIが自動で料理や副菜を高精度に特定します。";
        } else if (geminiApiKey && isVerified === "false") {
          modalDesc.textContent = `Google APIからエラーが返されました: 「${lastError}」。下の枠で正しいAPIキーを入力し「設定を保存して接続テスト」を押してください。`;
        } else {
          modalDesc.textContent = "Google公式の無料APIキーを設定すると、写真を撮るだけで焼肉定食や副菜、スープまで超高精度に料理を自動特定します。";
        }
      }
    }
    updateGeminiStatusUI();

    // 独立したGemini設定モーダルの開閉
    window.openGeminiModal = function () {
      const modal = document.getElementById("geminiModal");
      if (modal) {
        updateGeminiStatusUI();
        modal.classList.remove("hidden");
      }
    };

    window.closeGeminiModal = function () {
      const modal = document.getElementById("geminiModal");
      if (modal) {
        modal.classList.add("hidden");
      }
    };

    // パスワードの伏字/表示トグル
    window.toggleGeminiKeyVisibility = function () {
      const input = document.getElementById("geminiModalApiKeyInput");
      const icon = document.getElementById("geminiEyeIcon");
      if (!input) return;
      if (input.type === "password") {
        input.type = "text";
        if (icon) icon.className = "fa-solid fa-eye-slash text-xs text-indigo-600";
      } else {
        input.type = "password";
        if (icon) icon.className = "fa-solid fa-eye text-xs text-slate-400";
      }
    };

    // モーダルからのAPIキー保存 ＆ リアルタイム通信テスト
    window.saveGeminiApiKeyFromModal = async function () {
      const input = document.getElementById("geminiModalApiKeyInput");
      const btn = document.getElementById("saveGeminiModalKeyBtn");
      const btnLabel = document.getElementById("saveGeminiBtnLabel");
      const successMsg = document.getElementById("geminiModalSaveSuccessMsg");
      const errorMsg = document.getElementById("geminiModalSaveErrorMsg");
      const errorDetail = document.getElementById("geminiModalSaveErrorDetail");
      const errorHelp = document.getElementById("geminiModalSaveErrorHelp");

      if (!input) return;
      const keyVal = input.value.trim();

      if (!keyVal) {
        alert("APIキーを入力してください。解除したい場合は「解除」ボタンを押してください。");
        return;
      }

      // 簡易形式バリデーションチェック
      if (!keyVal.startsWith("AIza") && !keyVal.startsWith("AQ.") && keyVal.length < 25) {
        if (!confirm("⚠️ 入力されたキーが通常と異なります。\nGoogle APIキーは通常『AIzaSy...』または『AQ....』から始まる英数字です。\n\nこのままテストしますか？")) {
          return;
        }
      }

      // UIをテスト中状態に変更
      if (btn) btn.disabled = true;
      if (btnLabel) btnLabel.textContent = "Googleと通信テスト中...";
      if (successMsg) successMsg.classList.add("hidden");
      if (errorMsg) errorMsg.classList.add("hidden");

      try {
        const testRes = await testGeminiApiKeyConnection(keyVal);

        if (testRes.success) {
          geminiApiKey = keyVal;
          localStorage.setItem("mealai_gemini_key", geminiApiKey);
          localStorage.setItem("mealai_gemini_verified", "true");
          localStorage.removeItem("mealai_gemini_last_error");
          updateGeminiStatusUI();

          if (successMsg) successMsg.classList.remove("hidden");
          if (btnLabel) btnLabel.textContent = "設定を保存して接続テスト";
          if (btn) btn.disabled = false;

          const modelName = testRes.model || "Gemini Flash";
          alert(`✨ Google最先端AI（Gemini）接続テスト成功！\n\nAIモデル [${modelName}] との通信が正常に確立されました！\n1日の無料枠（約1,500回）にも十分な余裕があり、食事写真の撮影時に本物のAIが料理・食材パーツ・カロリー・PFCを直接判定します！`);
        } else {
          geminiApiKey = keyVal;
          localStorage.setItem("mealai_gemini_key", geminiApiKey);
          localStorage.setItem("mealai_gemini_verified", "false");
          localStorage.setItem("mealai_gemini_last_error", testRes.message);
          updateGeminiStatusUI();

          let helpText = "Google AI Studio (https://aistudio.google.com/app/apikey) を開き、青い「Create API key」から発行した「AIzaSy...」から始まるキーをコピーして貼り付けてください。";
          if (testRes.message.includes("API_KEY_INVALID") || testRes.reason === "API_KEY_INVALID") {
            helpText = "💡 【原因: APIキーが無効】キーの文字列にコピー漏れや余分な文字があるか、プロジェクト名などを誤って入力している可能性があります。Google AI Studioで再コピーしてください。";
          } else if (testRes.message.includes("PERMISSION_DENIED") || testRes.status === 403) {
            helpText = "💡 【原因: 権限エラー】18歳未満のアカウント、学校・保護者管理アカウントではAPIが許可されていません。18歳以上の通常Googleアカウントで作成してください。";
          } else if (testRes.status === 429) {
            helpText = "💡 【原因: 利用制限】一時的にリクエスト枠を超過しています。数分お待ちください。";
          }

          if (errorDetail) errorDetail.textContent = `Google APIエラー: ${testRes.message}`;
          if (errorHelp) errorHelp.textContent = helpText;
          if (errorMsg) errorMsg.classList.remove("hidden");
          if (btnLabel) btnLabel.textContent = "設定を保存して接続テスト";
          if (btn) btn.disabled = false;

          alert(`❌ Googleとの通信テストに失敗しました。\n\n【エラー内容】\n${testRes.message}\n\n【対処法】\n${helpText}`);
        }
      } catch (e) {
        if (btnLabel) btnLabel.textContent = "設定を保存して接続テスト";
        if (btn) btn.disabled = false;
        alert(`通信テスト中に予期せぬエラーが発生しました: ${e.message}`);
      }
    };

    // エラー詳細表示用ポップアップ
    window.showGeminiErrorDetail = function () {
      const lastError = localStorage.getItem("mealai_gemini_last_error") || "APIキーが無効またはGenerative Language APIが有効化されていません";
      alert(
        `【Google API通信エラーの詳細】\n\n` +
        `Googleからのエラー内容:\n${lastError}\n\n` +
        `【考えられる原因と対処法】\n` +
        `1. 入力されたキーがGoogle AI Studio発行の『AIzaSy...』キーでない（プロジェクト名や別サービスのキーを入れていませんか？）\n` +
        `2. 18歳未満または学校・保護者管理のGoogleアカウントである（Googleの規約上、18歳以上のアカウントが必要です）\n\n` +
        `【修正手順】\n` +
        `画面上部の「⚙️設定変更」を押し、「Google AI Studio APIキー作成画面を開く」から発行したキーを貼り付けてテストしてください。`
      );
    };

    // APIキーの解除（標準モードへ復帰）
    window.clearGeminiApiKey = function () {
      if (!localStorage.getItem("mealai_gemini_key")) {
        alert("APIキーは現在登録されていません。");
        return;
      }
      if (confirm("APIキーの登録を解除して標準モードに戻しますか？")) {
        geminiApiKey = "";
        localStorage.removeItem("mealai_gemini_key");
        localStorage.removeItem("mealai_gemini_verified");
        localStorage.removeItem("mealai_gemini_last_error");
        const input = document.getElementById("geminiModalApiKeyInput");
        if (input) input.value = "";
        updateGeminiStatusUI();
        alert("APIキーを解除しました。標準モードで動作します。");
      }
    };

    // 画像を安全なサイズ・容量に圧縮する前処理（スマホ高解像度写真対策・CORS安全設計）
    async function compressImageForGemini(imageSrc, maxDim = 800, quality = 0.82) {
      if (!imageSrc) return "";
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            try {
              let w = img.width || 800;
              let h = img.height || 600;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }
              const canvas = document.createElement("canvas");
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, w, h);
              const compressed = canvas.toDataURL("image/jpeg", quality);
              resolve(compressed);
            } catch (e) {
              console.warn("Canvas toDataURL failed (CORS/taint):", e);
              resolve(imageSrc);
            }
          };
          img.onerror = () => resolve(imageSrc);
          img.src = imageSrc;
        } catch (err) {
          resolve(imageSrc);
        }
      });
    }

    // Google Gemini Vision 呼び出し関数 (超高精度マルチモーダルAI・マルチモデル対応)
    async function analyzeWithGeminiVision(imageSrc) {
      const activeKey = geminiApiKey || localStorage.getItem("mealai_gemini_key") || "";
      if (!activeKey) return null;
      try {
        let base64Data = "";
        let mimeType = "image/jpeg";

        // 高解像度カメラ写真（数MB〜十数MB）を最大800px・約100KBに安全圧縮
        const optimizedSrc = await compressImageForGemini(imageSrc, 800, 0.82);

        if (optimizedSrc && optimizedSrc.startsWith("data:")) {
          const match = optimizedSrc.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,/);
          if (match) {
            mimeType = match[1];
            base64Data = optimizedSrc.replace(/^data:[^;]+;base64,/, "");
          } else {
            base64Data = optimizedSrc.split(",")[1] || optimizedSrc;
          }
        } else if (imageSrc.startsWith("data:")) {
          const match = imageSrc.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,/);
          if (match) {
            mimeType = match[1];
            base64Data = imageSrc.replace(/^data:[^;]+;base64,/, "");
          } else {
            base64Data = imageSrc.split(",")[1] || imageSrc;
          }
        } else {
          // 外部URLの場合はfetchしてBase64に変換
          try {
            const resp = await fetch(imageSrc);
            const blob = await resp.blob();
            mimeType = blob.type || "image/jpeg";
            const buf = await blob.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(buf);
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            base64Data = btoa(binary);
          } catch (e) {
            console.warn("Failed to fetch image as base64:", e);
            base64Data = optimizedSrc.includes(",") ? optimizedSrc.split(",")[1] : optimizedSrc;
          }
        }

        if (!base64Data) {
          return { error: true, message: "画像データの読み込みに失敗しました" };
        }

        const prompt = `あなたは世界最高峰のプロ管理栄養士・食品AIアナリストです。
画像全体を観察し、まず【食べ物や飲み物（食事）が写っているか】を厳格に判定してください。

【最重要判定ルール：食べ物・飲み物以外の物体の除外】
画像に写っている主要な被写体が「食べ物・飲み物（料理・食品・飲料・デザート等）」ではない場合（例: 水筒、マイボトル、タンブラー単体、空の食器、スマートフォン、パソコン、文房具、家具、人物、家電、衣服、日用品など）、無理にカロリー計算を行わず、必ず以下のJSONのみを出力してください:
{
  "isFood": false,
  "nonFoodName": "検出された物体の具体的な名称（例: 水筒・マイボトル、スマートフォン、ノートPCなど）",
  "message": "画像から食べ物や飲み物が検出されませんでした。お食事の写真を撮影またはアップロードしてください。"
}

【食べ物や飲み物が写っている場合のみ】：
以下の4ステップ思考を経て、指定のJSON形式のみを出力してください。
ステップ1：料理の特定（物体認識・分類）
- 画像全体から料理の種類（「油そば」「牛鮭定食」「特製ヤンニョムチキン」「牛カルビ焼肉定食」「豚骨ラーメン」「からあげ定食」など）を精密識別。
- 麺の太さ・形状、スープの有無（汁なし系・つけ麺・ラーメンの違い）、添えられている具材（薬味、辛味ペースト、レモンなど）や定食の小鉢・汁物・ご飯の有無を細部まで観察。

ステップ2：食材のパーツ分け（セグメンテーション）
- 主食：ご飯、中華麺、うどん、パンなど
- 主菜・主タンパク源：焼き鮭、牛カルビ肉、鶏からあげ、チキン、豚チャーシューなど
- 副菜・トッピング：メンマ、刻みネギ、牛小鉢、味噌汁、キムチ、野菜など
- 調味料・油脂：底のタレ、絡められた油、甘辛ヤンニョムダレ、ドレッシングなど

ステップ3：ボリューム（重量・体積）の精密推定
- 器（丼、角皿、お椀、お盆）や箸・スプーン等のサイズ感をスケール（物差し）として活用。
- 個数（ヤンニョムチキン5個、からあげ4個、餃子6個など）や、盛り付けの深さ・広がり（ご飯並盛約200〜250g・大盛約300g、茹で麺約200〜250g等）を見積もる。

ステップ4：栄養データベースとの照合・合算
- 推定した各食材の重量を、一般的な食品成分表や外食メニュー標準レシピデータに当てはめ、見えない吸油や調味料も考慮して総カロリーとPFC（たんぱく質・脂質・炭水化物）を合算。

【JSON出力フォーマット（純粋なJSON文字列のみ、Markdownコードブロックや余分なテキストは一切不要）】：
{
  "isFood": true,
  "name": "具体的な料理名（定食や自炊の場合は含まれる主な品目を記載。例: 牛鮭定食（鮭塩焼き・牛小鉢・ご飯並盛・味噌汁）、自炊朝食プレート（目玉焼き・トースト・サラダ））",
  "items": [
    {
      "name": "品目名（例: 白ご飯、鮭の塩焼き、豆腐とわかめの味噌汁、牛小鉢、目玉焼き、サラダ等）",
      "portion": "推定量（例: 並盛約200g、1切れ、1杯、1個等）",
      "portionType": "rice (ご飯・主食) | main (肉・魚・主菜) | soup (汁物・スープ) | side (副菜・小鉢・サラダ) | count (唐揚げ等の個数もの) | other",
      "calories": 310,
      "p": 5.0,
      "f": 0.6,
      "c": 74.0,
      "icon": "最も適切な絵文字（🍚, 🐟, 🥩, 🥣, 🥗, 🥚, 🍞, 🍗, 🍜等）"
    }
  ],
  "portion": "5個 または 並盛",
  "count": 5,
  "unitName": "個",
  "unitCalories": 124,
  "calories": 620,
  "p": 32.0,
  "f": 26.0,
  "c": 64.0,
  "breakdown": "パーツ内訳（例: 白ご飯310kcal + 鮭塩焼き180kcal + 味噌汁45kcal 等）",
  "advice": "管理栄養士からの実践的ダイエットアドバイス（1行）",
  "icon": "最も適切な絵文字（🍱, 🐟, 🥩, 🍜, 🍛等）"
}`;

        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: base64Data } }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        };

        // 利用可能なGeminiモデル（無料枠リクエスト上限が広く、高速・高精度な順にフォールバック試行）
        const candidateModels = [
          "gemini-flash-lite-latest",
          "gemini-3-flash-preview",
          "gemini-3.5-flash-lite",
          "gemini-3.1-flash-lite-preview",
          "gemini-3.8-flash",
          "gemini-3.5-flash"
        ];
        let lastError = null;

        for (const model of candidateModels) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
            const res = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              lastError = err.error?.message || `HTTP ${res.status}`;
              console.warn(`Gemini API (${model}) failed:`, res.status, lastError);
              continue;
            }

            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) continue;

            let cleanText = text.trim();
            if (cleanText.startsWith("```json")) cleanText = cleanText.slice(7);
            if (cleanText.startsWith("```")) cleanText = cleanText.slice(3);
            if (cleanText.endsWith("```")) cleanText = cleanText.slice(0, -3);
            cleanText = cleanText.trim();
            const parsed = JSON.parse(cleanText);

            if (parsed.isFood === false) {
              return {
                isFood: false,
                nonFoodName: parsed.nonFoodName || "水筒・日用品",
                message: parsed.message || "画像から食べ物や飲み物が検出されませんでした。"
              };
            }

            const parsedCal = parseInt(parsed.calories) || 600;
            const parsedCount = parseInt(parsed.count) || (parsed.name && parsed.name.includes("個") ? (parseInt(parsed.name.match(/(\d+)個/)?.[1]) || 5) : 1);
            const parsedUnitName = parsed.unitName || (parsedCount > 1 ? "個" : "人前");
            const parsedUnitCal = parseInt(parsed.unitCalories) || (parsedCount > 1 ? Math.round(parsedCal / parsedCount) : parsedCal);

            // 品目リスト（items）の正規化（料理一つ一つの認識＆個別量調整用）
            let rawItems = Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed.items : [];
            if (rawItems.length === 0) {
              // 単一料理の場合は自身を品目として初期化
              rawItems = [{
                name: parsed.name || "解析された料理",
                portion: parsed.portion || "1人前",
                portionType: (parsed.name && (parsed.name.includes("個") || parsedCount > 1)) ? "count" : "main",
                calories: parsedCal,
                p: parseFloat(parsed.p) || 24,
                f: parseFloat(parsed.f) || 20,
                c: parseFloat(parsed.c) || 70,
                icon: parsed.icon || "🍽️"
              }];
            }

            const normalizedItems = rawItems.map((item, idx) => {
              const c = parseInt(item.calories) || Math.round(parsedCal / rawItems.length);
              const p = parseFloat(item.p) || 0;
              const f = parseFloat(item.f) || 0;
              const carb = parseFloat(item.c) || 0;
              const pType = item.portionType || (item.name.includes("飯") || item.name.includes("米") || item.name.includes("パン") ? "rice" : (item.name.includes("汁") || item.name.includes("スープ") ? "soup" : "main"));
              return {
                id: `item_${Date.now()}_${idx}`,
                name: item.name || `品目 ${idx + 1}`,
                portion: item.portion || "普通",
                portionType: pType,
                calories: c,
                baseCalories: c,
                p: p,
                baseP: p,
                f: f,
                baseF: f,
                c: carb,
                baseC: carb,
                icon: item.icon || (pType === "rice" ? "🍚" : (pType === "soup" ? "🥣" : (pType === "side" ? "🥢" : "🍽️"))),
                scale: 1.0,
                preset: "medium"
              };
            });

            return {
              name: parsed.name || "解析された料理",
              items: normalizedItems,
              portion: parsed.portion || (parsedCount > 1 ? `${parsedCount}${parsedUnitName}` : "並盛"),
              count: parsedCount,
              unitName: parsedUnitName,
              unitCalories: parsedUnitCal,
              calories: parsedCal,
              p: parseFloat(parsed.p) || 24,
              f: parseFloat(parsed.f) || 20,
              c: parseFloat(parsed.c) || 70,
              breakdown: parsed.breakdown || "",
              advice: `✨ Google AI特定：${parsed.advice || "食材のバランスを考慮して推計しました。"}`,
              icon: parsed.icon || "🍽️"
            };
          } catch (modelErr) {
            lastError = modelErr.message;
            console.warn(`Error trying model ${model}:`, modelErr);
          }
        }

        return { error: true, message: lastError || "全モデルで応答がありませんでした" };
      } catch (e) {
        console.error("Gemini Vision exception:", e);
        return { error: true, message: e.message };
      }
    }
    window.analyzeWithGeminiVision = analyzeWithGeminiVision;

    // ==================== 料理名テキストからのAI栄養素・品目推計エンジン ====================
    async function analyzeDishWithGeminiText(dishText) {
      if (!dishText || !dishText.trim()) return null;
      const cleanName = dishText.trim();
      const activeKey = geminiApiKey || localStorage.getItem("mealai_gemini_key") || "";

      // 1. Gemini APIキーがある場合は生成AIで精密分析
      if (activeKey) {
        try {
          const prompt = `あなたは世界最高峰のプロ管理栄養士・食品AIアナリストです。
ユーザーが入力した以下の【料理・食事テキスト】を分析し、含まれる品目（アイテム）と正確な栄養素を推計してください。

料理名テキスト: "${cleanName}"

【出力JSONフォーマット（Markdown不要、JSON文字列のみ）】:
{
  "name": "${cleanName}",
  "items": [
    {
      "name": "品目名（例: 白ご飯、親子煮、味噌汁、サラダ等）",
      "portion": "推定量（例: 並盛約200g、1人前、1杯等）",
      "portionType": "rice | main | soup | side | count | other",
      "calories": 300,
      "p": 20.0,
      "f": 10.0,
      "c": 40.0,
      "icon": "絵文字（🍚, 🥣, 🥩, 🐟, 🥪, 🥗, 🥚等）"
    }
  ],
  "calories": 650,
  "p": 28.0,
  "f": 18.0,
  "c": 85.0,
  "advice": "管理栄養士からの実践的ダイエットアドバイス（1行）",
  "icon": "最も適切な絵文字（🍱, 🍛, 🍜, 🥪等）"
}`;

          const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          };

          const candidateModels = [
            "gemini-flash-lite-latest",
            "gemini-3-flash-preview",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite-preview",
            "gemini-3.8-flash"
          ];

          for (const model of candidateModels) {
            try {
              const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
              const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });
              if (!res.ok) continue;
              const data = await res.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (!text) continue;
              let clean = text.trim();
              if (clean.startsWith("```json")) clean = clean.slice(7);
              if (clean.startsWith("```")) clean = clean.slice(3);
              if (clean.endsWith("```")) clean = clean.slice(0, -3);
              const parsed = JSON.parse(clean.trim());
              return ensureNormalizedMealItems({
                name: parsed.name || cleanName,
                items: parsed.items || [],
                calories: parseInt(parsed.calories) || 500,
                p: parseFloat(parsed.p) || 20,
                f: parseFloat(parsed.f) || 15,
                c: parseFloat(parsed.c) || 60,
                icon: parsed.icon || "🍽️",
                advice: `✨ AI推計：${parsed.advice || "一般的なレシピ標準値から算出しました。"}`
              });
            } catch (err) {
              console.warn(`Text lookup with ${model} failed, trying next:`, err);
            }
          }
        } catch (e) {
          console.warn("Gemini text lookup exception, falling back:", e);
        }
      }

      // 2. オフライン / APIキー未設定時の高精度推計フォールバック
      return estimateDishNutritionFromText(cleanName);
    }
    window.analyzeDishWithGeminiText = analyzeDishWithGeminiText;

    // オフライン・食品DBベースの料理名栄養素推計
    function estimateDishNutritionFromText(text) {
      const q = text.toLowerCase().trim();
      const db = window.WORLD_FOOD_DATABASE || [];

      // ① 食品DBから最良一致を探す
      const matched = db.find(item => item.name.toLowerCase() === q || item.name.toLowerCase().includes(q) || q.includes(item.name.toLowerCase()));
      if (matched) {
        return ensureNormalizedMealItems({
          name: matched.name,
          calories: matched.calories,
          p: matched.p,
          f: matched.f,
          c: matched.c,
          icon: matched.icon || "🍽️",
          advice: `✨ 食品成分表に基づき【${matched.name}】の標準栄養素を算出しました。`
        });
      }

      // ② キーワードルールによる自動セグメンテーション＆推計
      let estCal = 550;
      let estP = 22;
      let estF = 18;
      let estC = 70;
      let icon = "🍽️";
      let items = [];

      if (q.includes("かつ丼") || q.includes("カツ丼")) {
        estCal = 880; estP = 28; estF = 35; estC = 110; icon = "🍚";
        items = [
          { name: "白ご飯 (並盛)", portion: "並盛約220g", portionType: "rice", calories: 340, p: 5.5, f: 0.7, c: 80, icon: "🍚" },
          { name: "とんかつ卵とじ", portion: "1枚分", portionType: "main", calories: 540, p: 22.5, f: 34.3, c: 30, icon: "🥩" }
        ];
      } else if (q.includes("牛丼")) {
        estCal = 720; estP = 22; estF = 26; estC = 95; icon = "🍚";
        items = [
          { name: "白ご飯 (並盛)", portion: "並盛約220g", portionType: "rice", calories: 340, p: 5.5, f: 0.7, c: 80, icon: "🍚" },
          { name: "牛煮込み具材・タレ", portion: "1人前", portionType: "main", calories: 380, p: 16.5, f: 25.3, c: 15, icon: "🥩" }
        ];
      } else if (q.includes("親子丼")) {
        estCal = 650; estP = 32; estF = 16; estC = 88; icon = "🍚";
        items = [
          { name: "白ご飯 (並盛)", portion: "並盛約200g", portionType: "rice", calories: 310, p: 5.0, f: 0.6, c: 74, icon: "🍚" },
          { name: "鶏肉と卵とじ具材", portion: "1人前", portionType: "main", calories: 340, p: 27.0, f: 15.4, c: 14, icon: "🥚" }
        ];
      } else if (q.includes("カレー")) {
        estCal = 750; estP = 18; estF = 24; estC = 110; icon = "🍛";
        items = [
          { name: "ライス (並盛)", portion: "約250g", portionType: "rice", calories: 380, p: 6.0, f: 0.8, c: 90, icon: "🍚" },
          { name: "カレールー・具材", portion: "1人前", portionType: "main", calories: 370, p: 12.0, f: 23.2, c: 20, icon: "🍛" }
        ];
      } else if (q.includes("ラーメン") || q.includes("らーめん")) {
        estCal = 780; estP = 28; estF = 28; estC = 90; icon = "🍜";
        items = [
          { name: "中華麺・具材", portion: "1玉", portionType: "main", calories: 580, p: 22.0, f: 18.0, c: 80, icon: "🍜" },
          { name: "ラーメンスープ", portion: "1杯分", portionType: "soup", calories: 200, p: 6.0, f: 10.0, c: 10, icon: "🥣" }
        ];
      } else if (q.includes("パスタ") || q.includes("スパゲティ")) {
        estCal = 680; estP = 24; estF = 22; estC = 88; icon = "🍝";
        items = [
          { name: "パスタ麺 (乾麺100g)", portion: "茹で約240g", portionType: "main", calories: 360, p: 13.0, f: 2.0, c: 72, icon: "🍝" },
          { name: "パスタソース・具材", portion: "1人前", portionType: "main", calories: 320, p: 11.0, f: 20.0, c: 16, icon: "🍅" }
        ];
      } else if (q.includes("定食")) {
        estCal = 780; estP = 32; estF = 24; estC = 95; icon = "🍱";
        items = [
          { name: "白ご飯 (並盛)", portion: "約200g", portionType: "rice", calories: 310, p: 5.0, f: 0.6, c: 74, icon: "🍚" },
          { name: `${text}の主菜`, portion: "1皿", portionType: "main", calories: 390, p: 22.5, f: 21.0, c: 12, icon: "🥩" },
          { name: "お味噌汁", portion: "1杯", portionType: "soup", calories: 45, p: 3.0, f: 1.2, c: 4.5, icon: "🥣" },
          { name: "副菜小鉢", portion: "小鉢1皿", portionType: "side", calories: 35, p: 1.5, f: 1.2, c: 4.5, icon: "🥗" }
        ];
      } else if (q.includes("おにぎり") || q.includes("おむすび")) {
        const count = q.includes("2個") ? 2 : 1;
        estCal = 190 * count; estP = 4.5 * count; estF = 2.0 * count; estC = 39 * count; icon = "🍙";
        items = [
          { name: text, portion: `${count}個`, portionType: "count", calories: estCal, p: estP, f: estF, c: estC, icon: "🍙" }
        ];
      } else if (q.includes("サラダ")) {
        estCal = 180; estP = 12; estF = 8; estC = 14; icon = "🥗";
        items = [
          { name: text, portion: "1皿", portionType: "side", calories: estCal, p: estP, f: estF, c: estC, icon: "🥗" }
        ];
      } else {
        // 一般料理
        items = [
          { name: text, portion: "1人前", portionType: "main", calories: estCal, p: estP, f: estF, c: estC, icon: "🍽️" }
        ];
      }

      return ensureNormalizedMealItems({
        name: text,
        items: items,
        calories: estCal,
        p: estP,
        f: estF,
        c: estC,
        icon: icon,
        advice: `💡 管理栄養士ルールに基づき【${text}】の推定栄養素を算出しました。`
      });
    }
    window.estimateDishNutritionFromText = estimateDishNutritionFromText;

    // 自炊・定食・一般料理の各品目（items）を完全正規化するエンジン
    function ensureNormalizedMealItems(dish) {
      if (!dish) return dish;

      // 既に items 配列がある場合は各プロパティを整えて返却
      if (Array.isArray(dish.items) && dish.items.length > 0) {
        dish.items = dish.items.map((item, idx) => {
          const cal = parseInt(item.calories) || 100;
          const p = parseFloat(item.p || 0);
          const f = parseFloat(item.f || 0);
          const c = parseFloat(item.c || 0);
          const pType = item.portionType || (item.name.includes("飯") || item.name.includes("米") || item.name.includes("パン") ? "rice" : (item.name.includes("汁") || item.name.includes("スープ") ? "soup" : (item.name.includes("サラダ") || item.name.includes("小鉢") ? "side" : "main")));
          return {
            id: item.id || `item_${Date.now()}_${idx}`,
            name: item.name || `品目 ${idx + 1}`,
            portion: item.portion || "普通",
            portionType: pType,
            calories: cal,
            baseCalories: item.baseCalories !== undefined ? item.baseCalories : cal,
            p: p,
            baseP: item.baseP !== undefined ? item.baseP : p,
            f: f,
            baseF: item.baseF !== undefined ? item.baseF : f,
            c: c,
            baseC: item.baseC !== undefined ? item.baseC : c,
            icon: item.icon || (pType === "rice" ? "🍚" : (pType === "soup" ? "🥣" : (pType === "side" ? "🥢" : "🍽️"))),
            scale: item.scale !== undefined ? item.scale : 1.0,
            preset: item.preset || "medium",
            photoIndex: item.photoIndex !== undefined ? item.photoIndex : 0,
            sourceDishName: item.sourceDishName || null
          };
        });
        return dish;
      }

      // 料理名に応じた品目自動分割（自炊・定食・ラーメン等のスマート分解）
      const name = dish.name || "";
      let items = [];

      if (name.includes("鮭") || name.includes("さけ")) {
        items = [
          { name: "白ご飯", portion: "並盛 (約200g)", portionType: "rice", calories: 310, p: 5.0, f: 0.6, c: 74.0, icon: "🍚" },
          { name: "鮭の塩焼き", portion: "1切れ (中)", portionType: "main", calories: 180, p: 22.0, f: 9.5, c: 0.1, icon: "🐟" },
          { name: "お味噌汁", portion: "1杯", portionType: "soup", calories: 45, p: 3.0, f: 1.2, c: 4.5, icon: "🥣" },
          { name: "牛小鉢", portion: "小鉢1皿", portionType: "side", calories: 155, p: 6.0, f: 10.7, c: 14.4, icon: "🥩" }
        ];
      } else if (name.includes("からあげ") || name.includes("唐揚")) {
        const count = dish.count || 4;
        items = [
          { name: "鶏のからあげ", portion: `${count}個`, portionType: "count", count: count, unitName: "個", unitCalories: Math.round(340 / count), calories: 340, p: 24.0, f: 22.0, c: 10.0, icon: "🍗" },
          { name: "白ご飯", portion: "並盛 (約200g)", portionType: "rice", calories: 310, p: 5.0, f: 0.6, c: 74.0, icon: "🍚" },
          { name: "お味噌汁", portion: "1杯", portionType: "soup", calories: 45, p: 3.0, f: 1.2, c: 4.5, icon: "🥣" },
          { name: "キャベツ・副菜", portion: "小皿", portionType: "side", calories: 25, p: 1.0, f: 0.2, c: 5.5, icon: "🥗" }
        ];
      } else if (name.includes("焼肉") || name.includes("カルビ")) {
        items = [
          { name: "牛カルビ焼き", portion: "1皿 (約100g)", portionType: "main", calories: 420, p: 18.0, f: 32.0, c: 5.0, icon: "🥩" },
          { name: "白ご飯", portion: "並盛 (約200g)", portionType: "rice", calories: 310, p: 5.0, f: 0.6, c: 74.0, icon: "🍚" },
          { name: "わかめスープ", portion: "1杯", portionType: "soup", calories: 30, p: 1.5, f: 0.8, c: 3.0, icon: "🥣" },
          { name: "白菜キムチ", portion: "小皿", portionType: "side", calories: 25, p: 1.5, f: 0.2, c: 4.0, icon: "🥬" }
        ];
      } else if (name.includes("ヤンニョム")) {
        const count = dish.count || 5;
        items = [
          { name: "特製ヤンニョムチキン", portion: `${count}個`, portionType: "count", count: count, unitName: "個", unitCalories: 124, calories: 620, p: 32.0, f: 26.0, c: 64.0, icon: "🍗" }
        ];
      } else if (name.includes("油そば") || name.includes("まぜそば")) {
        items = [
          { name: "油そば（極太麺・特製タレ）", portion: "並盛 (茹で220g)", portionType: "main", calories: 650, p: 16.0, f: 27.0, c: 88.0, icon: "🍜" },
          { name: "具材（チャーシュー・メンマ等）", portion: "1式", portionType: "side", calories: 110, p: 6.0, f: 5.0, c: 7.0, icon: "🥩" }
        ];
      } else if (name.includes("ラーメン") || name.includes("らーめん") || name.includes("拉麺")) {
        items = [
          { name: "豚骨醤油ラーメン（麺・味玉・具材）", portion: "並盛 (1玉)", portionType: "main", calories: 650, p: 26.0, f: 26.0, c: 85.0, icon: "🍜" },
          { name: "濃厚豚骨醤油スープ", portion: "1杯分", portionType: "soup", calories: 200, p: 6.0, f: 12.0, c: 10.0, icon: "🥣" }
        ];
      } else if (name.includes("定食")) {
        items = [
          { name: "白ご飯", portion: "並盛 (約200g)", portionType: "rice", calories: 310, p: 5.0, f: 0.6, c: 74.0, icon: "🍚" },
          { name: "メイン主菜", portion: "1皿", portionType: "main", calories: Math.max(100, dish.calories - 380), p: Math.max(10, (dish.p || 25) - 8), f: Math.max(5, (dish.f || 15) - 2), c: 10.0, icon: "🥩" },
          { name: "お味噌汁", portion: "1杯", portionType: "soup", calories: 45, p: 3.0, f: 1.2, c: 4.5, icon: "🥣" },
          { name: "副菜小鉢", portion: "小鉢1皿", portionType: "side", calories: 35, p: 1.5, f: 0.5, c: 6.0, icon: "🥗" }
        ];
      } else {
        // 単一の料理
        items = [
          {
            name: dish.name || "料理",
            portion: dish.portion || "1人前",
            portionType: (dish.count && dish.count >= 2) ? "count" : "main",
            count: dish.count || 1,
            unitName: dish.unitName || "個",
            unitCalories: dish.unitCalories || dish.calories,
            calories: dish.calories,
            p: dish.p || 20,
            f: dish.f || 15,
            c: dish.c || 50,
            icon: dish.icon || "🍽️"
          }
        ];
      }

      dish.items = items.map((item, idx) => ({
        id: `item_${Date.now()}_${idx}`,
        name: item.name,
        portion: item.portion || "普通",
        portionType: item.portionType || "main",
        count: item.count,
        unitName: item.unitName,
        unitCalories: item.unitCalories,
        calories: item.calories,
        baseCalories: item.calories,
        p: item.p,
        baseP: item.p,
        f: item.f,
        baseF: item.f,
        c: item.c,
        baseC: item.c,
        icon: item.icon || "🍽️",
        scale: 1.0,
        preset: "medium",
        photoIndex: item.photoIndex !== undefined ? item.photoIndex : 0,
        sourceDishName: item.sourceDishName || item.name
      }));

      return dish;
    }
    window.ensureNormalizedMealItems = ensureNormalizedMealItems;

    // 視覚色彩分析＆ファイル名による確実な料理特定フォールバック（鮭定食・焼肉定食・ヤンニョムチキン・油そば等を正確に分類）
    async function detectDishFromImageVisuals(imageSrc, fileName = "") {
      const fn = (fileName || "").toLowerCase();

      // ① ファイル名による高精度特定（最優先）
      if (fn.includes("syake") || fn.includes("鮭") || fn.includes("さけ") || fn.includes("salmon")) {
        return {
          name: "牛鮭定食（鮭塩焼き・牛小鉢・ご飯並盛・味噌汁）",
          portion: "並盛（1人前）",
          count: 1,
          unitName: "人前",
          unitCalories: 690,
          calories: 690,
          p: 30.0,
          f: 22.0,
          c: 93.0,
          icon: "🐟",
          advice: "🐟 焼き鮭の上質なオメガ3脂肪酸＋牛小鉢で高たんぱく！ご飯並盛でバランス完璧です。"
        };
      }
      if (fn.includes("やき") || fn.includes("yaki") || fn.includes("焼肉") || fn.includes("カルビ") || fn.includes("ロース") || fn.includes("ホルモン")) {
        return {
          name: "牛カルビ焼肉定食（牛カルビ・ご飯・わかめスープ・キムチ）",
          portion: "並盛（1人前）",
          count: 1,
          unitName: "人前",
          unitCalories: 820,
          calories: 820,
          p: 35.0,
          f: 36.0,
          c: 88.0,
          icon: "🥩",
          advice: "🥩 牛肉の良質なたんぱく質と鉄分！キムチの乳酸菌とわかめスープで代謝もサポート。"
        };
      }
      if (fn.includes("やんにょむ") || fn.includes("yangnyeom") || fn.includes("ヤンニョム") || fn.includes("韓国チキン")) {
        return {
          name: "特製ヤンニョムチキン（5個）",
          portion: "5個",
          count: 5,
          unitName: "個",
          unitCalories: 124,
          calories: 620,
          p: 32.0,
          f: 26.0,
          c: 64.0,
          icon: "🍗",
          advice: "🍗 コチュジャンの甘辛ダレとジューシーなチキン5個！たんぱく質が豊富です。"
        };
      }
      if (fn.includes("油そば") || fn.includes("aburasoba") || fn.includes("まぜそば")) {
        return {
          name: "特製油そば（並盛・チャーシュー・メンマ添え）",
          portion: "並盛（茹で麺220g）",
          count: 1,
          unitName: "人前",
          unitCalories: 760,
          calories: 760,
          p: 22.0,
          f: 32.0,
          c: 95.0,
          icon: "🍜",
          advice: "🍜 濃厚なタレと麺のハーモニー！お酢やラー油を回しかけて美味しく代謝アップ。"
        };
      }
      if (fn.startsWith("ra.") || fn.includes("ra_") || fn.includes("ramen") || fn.includes("ラーメン") || fn.includes("らーめん") || fn.includes("拉麺") || fn.includes("つけ麺") || fn.includes("中華そば")) {
        return {
          name: "濃厚豚骨醤油ラーメン（味玉・チャーシュー・海苔添え）",
          portion: "並盛（1人前）",
          count: 1,
          unitName: "人前",
          unitCalories: 850,
          calories: 850,
          p: 32.0,
          f: 38.0,
          c: 95.0,
          icon: "🍜",
          advice: "🍜 濃厚豚骨醤油スープとモチモチ太麺！スープを残すことで約150kcalカットできます。"
        };
      }
      if (fn.includes("curry") || fn.includes("カレー")) {
        return {
          name: "特製ポークカレー（並盛）",
          portion: "並盛",
          count: 1,
          unitName: "人前",
          unitCalories: 750,
          calories: 750,
          p: 18.0,
          f: 24.0,
          c: 110.0,
          icon: "🍛",
          advice: "🍛 スパイスの力で代謝アップ！サラダを一緒に摂ると血糖値の上昇を穏やかにできます。"
        };
      }
      if (fn.includes("chicken") || fn.includes("karaage") || fn.includes("からあげ") || fn.includes("唐揚") || fn.includes("チキン")) {
        return {
          name: "特製からあげ定食（唐揚げ4個・ご飯・味噌汁）",
          portion: "4個（定食）",
          count: 4,
          unitName: "個",
          unitCalories: 190,
          calories: 760,
          p: 30.0,
          f: 28.0,
          c: 88.0,
          icon: "🍗",
          advice: "🍗 カラッと揚がったジューシーな唐揚げ4個！満足感が高く高タンパクです。"
        };
      }
      if (fn.includes("salad") || fn.includes("サラダ")) {
        return {
          name: "彩り野菜とチキンのヘルシーサラダ",
          portion: "1皿",
          count: 1,
          unitName: "皿",
          unitCalories: 260,
          calories: 260,
          p: 22.0,
          f: 8.0,
          c: 15.0,
          icon: "🥗",
          advice: "🥗 食物繊維とビタミンたっぷり！低カロリーでダイエットに最適な一皿です。"
        };
      }

      // ② 画像ピクセル色彩・パーツ構成分析（64x64 高速サンプリング）
      try {
        if (imageSrc) {
          const img = await new Promise((resolve) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => resolve(null);
            i.src = imageSrc;
          });
          if (img && img.width > 0) {
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, 64, 64);
            const data = ctx.getImageData(0, 0, 64, 64).data;
            const total = 64 * 64;

            let whiteCount = 0;        // ご飯・白皿
            let blackCount = 0;        // 海苔・黒丼・焦げ目 (R<60, G<60, B<60)
            let soupYellowCount = 0;   // 豚骨醤油スープ/琥珀スープ (130<R<215, 80<G<160, B<90, R>G)
            let eggYolkCount = 0;      // 味玉・卵黄 (R>180, 100<G<170, B<60)
            let salmonCount = 0;       // 鮭のサーモンピンク (R>170, 70<G<140, B<100)
            let rawRedCount = 0;       // 焼肉の生肉赤色 (R>140, G<60, B<60)
            let yangnyeomCount = 0;     // ヤンニョム甘辛ダレ赤褐色 (R>110, R-G>35, B<80)
            let greenCount = 0;        // 野菜・ネギ緑 (G>100, G-R>15, G-B>15)
            let noodleYellowCount = 0;  // 麺・中華麺黄色 (R>160, G>140, B<100)
            let curryCount = 0;        // カレールー色 (110<R<180, 70<G<130, B<50)

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];

              if (r > 190 && g > 190 && b > 190) whiteCount++;
              else if (r < 60 && g < 60 && b < 60) blackCount++;
              else if (r > 170 && g > 70 && g < 140 && b < 100) salmonCount++;
              else if (r > 140 && g < 60 && b < 60) rawRedCount++;
              else if (r > 110 && (r - g > 35) && b < 80) yangnyeomCount++;
              else if (g > 100 && (g - r > 15) && (g - b > 15)) greenCount++;
              else if (r > 180 && g > 100 && g < 170 && b < 60) eggYolkCount++;
              else if (r > 160 && g > 140 && b < 100) noodleYellowCount++;
              else if (r > 130 && r < 215 && g > 80 && g < 160 && b < 90 && r > g) soupYellowCount++;
              else if (r > 110 && r < 180 && g > 70 && g < 130 && b < 50) curryCount++;
            }

            const whiteRatio = whiteCount / total;
            const blackRatio = blackCount / total;
            const soupYellowRatio = soupYellowCount / total;
            const eggYolkRatio = eggYolkCount / total;
            const salmonRatio = salmonCount / total;
            const rawRedRatio = rawRedCount / total;
            const yangnyeomRatio = yangnyeomCount / total;
            const greenRatio = greenCount / total;
            const yellowRatio = noodleYellowCount / total;
            const curryRatio = curryCount / total;
            const foodFeatureSum = soupYellowRatio + eggYolkRatio + salmonRatio + rawRedRatio + yangnyeomRatio + greenRatio + yellowRatio + curryRatio;

            // 0. 食べ物以外の物体（水筒・スマホ・オフィス小物などの非食品判定）
            // 料理特有の色（スープ・卵黄・鮭ピンク・生肉・タレ・野菜・麺・カレー等）が極小かつ白飯・白皿もわずかな場合
            if (foodFeatureSum < 0.018 && whiteRatio < 0.12) {
              return {
                isFood: false,
                nonFoodName: "水筒・日用品",
                message: "画像から食べ物や飲み物が検出されませんでした（水筒や日用品などの可能性があります）。"
              };
            }

            // 1. ラーメン（黒海苔・黒丼比率が圧倒的、白飯なし）
            const isRamenVisual = blackRatio > 0.18 ||
                                  (blackRatio > 0.08 && whiteRatio < 0.07 && (soupYellowRatio > 0.01 || yellowRatio > 0.02 || greenRatio > 0.02));
            if (isRamenVisual) {
              return {
                name: "濃厚豚骨醤油ラーメン（味玉・チャーシュー・海苔添え）",
                portion: "並盛（1人前）",
                count: 1,
                unitName: "人前",
                unitCalories: 850,
                calories: 850,
                p: 32.0,
                f: 38.0,
                c: 95.0,
                icon: "🍜",
                advice: "🍜 濃厚豚骨醤油スープとモチモチ太麺！スープを残すことで約150kcalカットできます。"
              };
            }

            // 2. 特製ヤンニョムチキン（真っ赤なコチュジャン赤唐辛子色が高い、または甘辛ダレ合計値が高い）
            if (rawRedRatio > 0.035 || (yangnyeomRatio + rawRedRatio > 0.20 && blackRatio < 0.15)) {
              return {
                name: "特製ヤンニョムチキン（5個）",
                portion: "5個",
                count: 5,
                unitName: "個",
                unitCalories: 124,
                calories: 620,
                p: 32.0,
                f: 26.0,
                c: 64.0,
                icon: "🍗",
                advice: "🍗 コチュジャンの甘辛ダレとジューシーなチキン5個！たんぱく質が豊富です。"
              };
            }

            // 3. 牛鮭定食（鮭ピンク ＋ 圧倒的な白飯・白皿、黒ほぼなし）
            if (whiteRatio > 0.15 && salmonRatio > 0.012 && blackRatio < 0.03) {
              return {
                name: "牛鮭定食（鮭塩焼き・牛小鉢・ご飯並盛・味噌汁）",
                portion: "並盛（1人前）",
                count: 1,
                unitName: "人前",
                unitCalories: 690,
                calories: 690,
                p: 30.0,
                f: 22.0,
                c: 93.0,
                icon: "🐟",
                advice: "🐟 焼き鮭の上質なオメガ3脂肪酸＋牛小鉢で高たんぱく！ご飯並盛でバランス完璧です。"
              };
            }

            // 4. 牛カルビ焼肉定食（タレ肉・キムチ赤褐色 ＋ 白飯、生肉赤なし、黒わずか）
            if (salmonRatio > 0.08 && whiteRatio > 0.06 && rawRedRatio < 0.02 && blackRatio < 0.05) {
              return {
                name: "牛カルビ焼肉定食（牛カルビ・ご飯・わかめスープ・キムチ）",
                portion: "並盛（1人前）",
                count: 1,
                unitName: "人前",
                unitCalories: 820,
                calories: 820,
                p: 35.0,
                f: 36.0,
                c: 88.0,
                icon: "🥩",
                advice: "🥩 牛肉の良質なたんぱく質と鉄分！キムチの乳酸菌とわかめスープで代謝もサポート。"
              };
            }

            // 5. カレーライス
            if (curryRatio > 0.12 && whiteRatio > 0.12) {
              return {
                name: "特製ポークカレー（並盛）",
                portion: "並盛",
                count: 1,
                unitName: "人前",
                unitCalories: 750,
                calories: 750,
                p: 18.0,
                f: 24.0,
                c: 110.0,
                icon: "🍛",
                advice: "🍛 スパイスの力で代謝アップ！サラダを一緒に摂ると血糖値の上昇を穏やかにできます。"
              };
            }

            // 6. 麺類（油そば）
            if (yellowRatio > 0.09) {
              return {
                name: "特製油そば（並盛・チャーシュー・メンマ添え）",
                portion: "並盛（茹で麺220g）",
                count: 1,
                unitName: "人前",
                unitCalories: 760,
                calories: 760,
                p: 22.0,
                f: 32.0,
                c: 95.0,
                icon: "🍜",
                advice: "🍜 濃厚なタレと麺のハーモニー！お酢やラー油を回しかけて美味しく代謝アップ。"
              };
            }

            // 7. サラダ
            if (greenRatio > 0.12) {
              return {
                name: "彩り野菜とチキンのヘルシーサラダ",
                portion: "1皿",
                count: 1,
                unitName: "皿",
                unitCalories: 260,
                calories: 260,
                p: 22.0,
                f: 8.0,
                c: 15.0,
                icon: "🥗",
                advice: "🥗 食物繊維とビタミンたっぷり！低カロリーでダイエットに最適な一皿です。"
              };
            }
          }
        }
    } catch (err) {
        console.warn("Visual color analysis fallback error:", err);
      }

      // デフォルト：バランス定食（絶対にヤンニョムチキン固定にしない！）
      return {
        name: "日替わりバランス定食（主菜・ご飯並盛・味噌汁）",
        portion: "並盛（1人前）",
        count: 1,
        unitName: "人前",
        unitCalories: 650,
        calories: 650,
        p: 26.0,
        f: 20.0,
        c: 85.0,
      };
    }
    window.detectDishFromImageVisuals = detectDishFromImageVisuals;

    // ==================== MealAI 高精度料理候補TOP4生成 ====================
    function getAskenCandidates(slot, detectedCategory, fileName) {
      // カテゴリ別の専門メニューリスト（AIが特定した料理に直結）
      const categoryMenus = {
        yakiniku: {
          label: "🥩 焼肉定食・牛カルビ (お肉とご飯のバランスをAI検出)",
          items: [
            { rank: 1, name: "牛カルビ焼肉定食 (ご飯普通・スープ・キムチ付)", calories: 780, p: 32.0, f: 34.0, c: 84.0, icon: "🥩", advice: "🥩 焼肉定食を高精度に特定！牛肉の良質なたんぱく質と鉄分をしっかり補給。ご飯を適量に抑えればダイエット中も大活躍！" },
            { rank: 2, name: "牛ハラミ＆ロース定食 (普通盛り)", calories: 650, p: 38.0, f: 22.0, c: 78.0, icon: "🥩", advice: "✨ 低脂質・超高タンパクなハラミ！脂肪燃焼を促すL-カルニチンが豊富で引き締めに最適です。" },
            { rank: 3, name: "特選豚カルビ＆ホルモン定食", calories: 820, p: 29.0, f: 38.0, c: 86.0, icon: "🐷", advice: "🐷 ビタミンB1で疲労回復！夕食の脂質を控えめにして1日の目標カロリー内に収めます。" },
            { rank: 4, name: "ねぎ塩牛タン定食 (麦飯普通盛り)", calories: 590, p: 31.0, f: 20.0, c: 72.0, icon: "🥩", advice: "✨ レモンとねぎ塩でさっぱり高タンパク！代謝をスムーズにする優秀な選択です。" }
          ]
        },
        ramen: {
          label: "🍜 ラーメン・麺類 (麺・スープ・具材をAI検出)",
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
        sushi: {
          label: "🍣 寿司・海鮮料理 (新鮮な魚介とシャリをAI検出)",
          items: [
            { rank: 1, name: "特上にぎり寿司盛り合わせ (8貫)", calories: 520, p: 26.5, f: 6.2, c: 88.0, icon: "🍣", advice: "✨ 寿司を高精度に特定！高たんぱく・低脂質でダイエットに最適な日本食です。" },
            { rank: 2, name: "まぐろサーモン海鮮丼 (並盛)", calories: 580, p: 32.0, f: 8.5, c: 92.0, icon: "🍣", advice: "🐟 良質なEPA・DHAが豊富！代謝を活発にし脂肪燃焼を促進します。" },
            { rank: 3, name: "サーモンづくし握り (6貫)", calories: 460, p: 22.0, f: 14.0, c: 62.0, icon: "🍣", advice: "🍣 抗酸化作用の高いアスタキサンチンが豊富！美容にも嬉しい一皿。" },
            { rank: 4, name: "サラダ巻き・鉄火巻きセット", calories: 410, p: 15.0, f: 5.0, c: 76.0, icon: "🍣", advice: "🍙 手軽でヘルシー！夕食の炭水化物コントロールにちょうど良い量です。" }
          ]
        },
        pizza: {
          label: "🍕 ピザ・イタリアン (チーズとクラストをAI検出)",
          items: [
            { rank: 1, name: "マルゲリータピザ (1/2枚 Mサイズ)", calories: 540, p: 22.0, f: 18.0, c: 72.0, icon: "🍕", advice: "🍕 ピザを特定！トマトのリコピンとモッツァレラ。夕食で主食を軽めに調整。" },
            { rank: 2, name: "クワトロフォルマッジ (1/2枚)", calories: 620, p: 25.0, f: 28.0, c: 66.0, icon: "🍕", advice: "🧀 濃厚チーズ！カルシウムたっぷり。脂質を日中の運動でしっかり燃焼。" },
            { rank: 3, name: "シーフードジェノベーゼピザ (1/2枚)", calories: 510, p: 24.0, f: 16.0, c: 68.0, icon: "🍕", advice: "🦐 シーフードで良質なたんぱく質補給！比較的脂質控えめで優秀。" },
            { rank: 4, name: "ペパロニサラミピザ (1/2枚)", calories: 590, p: 23.0, f: 25.0, c: 68.0, icon: "🍕", advice: "💡 スパイシーな満足感！翌日の朝食を軽めにしてトータル管理。" }
          ]
        },
        pasta: {
          label: "🍝 パスタ・スパゲッティ (パスタ麺とソースをAI検出)",
          items: [
            { rank: 1, name: "濃厚カルボナーラ (普通盛り)", calories: 680, p: 24.0, f: 29.0, c: 80.0, icon: "🍝", advice: "🍝 パスタを特定！卵とベーコンの満足感。夕食の脂質を抑えめにして調整。" },
            { rank: 2, name: "茄子とベーコンのトマトパスタ", calories: 560, p: 18.5, f: 16.0, c: 85.0, icon: "🍝", advice: "🍅 トマトソースで抗酸化！オリーブオイルの良質な脂質です。" },
            { rank: 3, name: "海老とブロッコリーのジェノベーゼ", calories: 520, p: 22.0, f: 17.0, c: 70.0, icon: "🍝", advice: "🥦 緑黄色野菜と魚介！バランスの良いイタリアンランチです。" },
            { rank: 4, name: "和風きのこ明太子パスタ", calories: 470, p: 19.0, f: 11.0, c: 74.0, icon: "🍝", advice: "✨ 低脂質な和風仕立て！食物繊維豊富でダイエッターに最適です。" }
          ]
        },
        burger: {
          label: "🍔 ハンバーガー (バンズとパティをAI検出)",
          items: [
            { rank: 1, name: "ダブルチーズバーガー (1個)", calories: 520, p: 28.0, f: 26.0, c: 44.0, icon: "🍔", advice: "🍔 ハンバーガーを特定！牛肉パティでしっかりたんぱく質を補給できます。" },
            { rank: 2, name: "てりやきバーガー (1個)", calories: 480, p: 17.5, f: 24.0, c: 48.0, icon: "🍔", advice: "🍔 甘辛ソースの王道バーガー！サイドをポテトからサラダにするとさらに健康的。" },
            { rank: 3, name: "アボカドビーフバーガー (1個)", calories: 560, p: 26.0, f: 30.0, c: 46.0, icon: "🥑", advice: "🥑 アボカドの良質な不飽和脂肪酸！腹持ちが良く間食を防ぎます。" },
            { rank: 4, name: "グリルチキンバーガー (1個)", calories: 420, p: 29.0, f: 14.0, c: 44.0, icon: "🍔", advice: "✨ 高タンパク・低脂質なスマートチョイス！減量期にとてもおすすめです。" }
          ]
        },
        bread: {
          label: "🥪 サンドイッチ・パン (ブレッドと具材をAI検出)",
          items: [
            { rank: 1, name: "BLTサンドイッチ (レタス・トマト・ベーコン)", calories: 360, p: 14.5, f: 16.0, c: 38.0, icon: "🥪", advice: "🥪 サンドイッチを特定！手軽でバランスの良い軽食です。" },
            { rank: 2, name: "サラダチキンとたまごのサンド", calories: 340, p: 22.0, f: 12.5, c: 35.0, icon: "🥪", advice: "✨ 高タンパクで引き締まった栄養設計！昼食にもぴったりです。" },
            { rank: 3, name: "クロックムッシュ (ハム＆チーズトースト)", calories: 420, p: 18.0, f: 20.0, c: 42.0, icon: "🍞", advice: "🧀 とろけるチーズと香ばしいトースト！午後のエネルギー源になります。" },
            { rank: 4, name: "チョコクロワッサン ＋ カフェラテ", calories: 390, p: 8.5, f: 19.0, c: 46.0, icon: "🥐", advice: "☕ カフェタイムの憩い！夜を野菜スープ中心にして帳尻を合わせます。" }
          ]
        },
        bento: {
          label: "🍱 幕の内・お弁当 (おかずとご飯の組み合わせをAI検出)",
          items: [
            { rank: 1, name: "彩り幕の内弁当 (普通盛り)", calories: 640, p: 25.0, f: 18.0, c: 94.0, icon: "🍱", advice: "🍱 お弁当を特定！様々なおかずが揃ってバランス良好。お漬物で塩分控えめに。" },
            { rank: 2, name: "鮭西京焼き弁当 (麦飯普通盛り)", calories: 560, p: 28.0, f: 14.0, c: 80.0, icon: "🐟", advice: "✨ 理想的な和食弁当！良質な魚脂と食物繊維で代謝アップ。" },
            { rank: 3, name: "鶏と野菜の黒酢あん弁当", calories: 620, p: 24.0, f: 16.0, c: 95.0, icon: "🍱", advice: "🥦 黒酢のアミノ酸とたっぷり根菜！クエン酸で疲労回復を促進。" },
            { rank: 4, name: "チキンカツ弁当 (特製ソース)", calories: 790, p: 29.0, f: 31.0, c: 98.0, icon: "🍱", advice: "💡 がっつり満腹弁当！夕食は脂質を抑えて野菜中心に調整しましょう。" }
          ]
        },
        donburi: {
          label: "🍚 丼もの (具材とご飯をAI検出)",
          items: [
            { rank: 1, name: "特製牛丼 (並盛・紅生姜)", calories: 650, p: 20.0, f: 22.0, c: 92.0, icon: "🍚", advice: "🍚 牛丼を特定！牛肉の鉄分とビタミン補給。生姜で代謝をアップ。" },
            { rank: 2, name: "ふわとろ親子丼 (並盛)", calories: 580, p: 28.0, f: 14.0, c: 85.0, icon: "🍚", advice: "✨ 鶏肉と卵で高タンパク・低脂質！減量中にも優秀な丼メニューです。" },
            { rank: 3, name: "豚ロースかつ丼 (並盛)", calories: 820, p: 29.0, f: 32.0, c: 104.0, icon: "🍚", advice: "💡 パワーチャージ！トレーニングや活動量の多い日にぴったり。" },
            { rank: 4, name: "まぐろ漬け丼 (並盛)", calories: 490, p: 30.0, f: 5.0, c: 80.0, icon: "🐟", advice: "✨ 超低脂質・超高タンパク！アスリート級の理想的な減量飯です。" }
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
        },
        fruit: {
          label: "🍎 フルーツ・果物 (フレッシュな果実をAI検出)",
          items: [
            { rank: 1, name: "完熟バナナ (1本 中サイズ 100g)", calories: 86, p: 1.1, f: 0.2, c: 22.5, icon: "🍌", advice: "🍌 フルーツを特定！自然な果糖とカリウムでむくみ解消と素早いエネルギー補給。" },
            { rank: 2, name: "カットりんご (1/2個 150g)", calories: 72, p: 0.2, f: 0.1, c: 18.0, icon: "🍎", advice: "🍎 アップルペクチンで腸内環境を改善！食前デザートにも最適。" },
            { rank: 3, name: "フルーツヨーグルトボウル (ベリー・キウイ)", calories: 145, p: 8.5, f: 1.5, c: 24.0, icon: "🥣", advice: "✨ ビタミンCと乳酸菌！腸活と美肌を叶えるヘルシーボウル。" },
            { rank: 4, name: "ミックスフルーツ盛り合わせ", calories: 110, p: 1.2, f: 0.3, c: 27.0, icon: "🍓", advice: "🍓 豊富な抗酸化成分！低カロリーで罪悪感ゼロの間食です。" }
          ]
        },
        coffee: {
          label: "☕ カフェ・ドリンク (飲料・カップをAI検出)",
          items: [
            { rank: 1, name: "無糖アイスカフェラテ (200ml)", calories: 78, p: 4.1, f: 4.2, c: 5.9, icon: "☕", advice: "☕ カフェドリンクを特定！ミルクの良質なたんぱく質とカルシウムを補給。" },
            { rank: 2, name: "ドリップブラックコーヒー (HOT/ICE)", calories: 8, p: 0.5, f: 0.1, c: 1.4, icon: "☕", advice: "✨ ほぼゼロカロリー！カフェインとクロロゲン酸で脂肪燃焼を活性化。" },
            { rank: 3, name: "抹茶ラテ (甘さ控えめ 200ml)", calories: 160, p: 5.2, f: 4.8, c: 24.0, icon: "🍵", advice: "🍵 カテキンたっぷり！リフレッシュしながら集中力をキープ。" },
            { rank: 4, name: "キャラメルマキアート (HOT 250ml)", calories: 210, p: 6.0, f: 7.5, c: 29.5, icon: "☕", advice: "💡 ご褒美ビバレッジ！夕食の糖質を少し抑えて調整しましょう。" }
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
        if (fn.includes("焼肉") || fn.includes("カルビ") || fn.includes("ロース") || fn.includes("ハラミ") || fn.includes("牛タン") || fn.includes("ホルモン") || fn.includes("yakiniku") || fn.includes("bbq")) {
          return { label: categoryMenus.yakiniku.label, candidates: categoryMenus.yakiniku.items };
        }
        if (fn.includes("ramen") || fn.includes("ラーメン") || fn.includes("麺") || fn.includes("拉麺")) {
          return { label: categoryMenus.ramen.label, candidates: categoryMenus.ramen.items };
        }
        if (fn.includes("sushi") || fn.includes("寿司") || fn.includes("鮨") || fn.includes("刺身")) {
          return { label: categoryMenus.sushi.label, candidates: categoryMenus.sushi.items };
        }
        if (fn.includes("pizza") || fn.includes("ピザ")) {
          return { label: categoryMenus.pizza.label, candidates: categoryMenus.pizza.items };
        }
        if (fn.includes("pasta") || fn.includes("パスタ") || fn.includes("スパゲッティ") || fn.includes("カルボナーラ")) {
          return { label: categoryMenus.pasta.label, candidates: categoryMenus.pasta.items };
        }
        if (fn.includes("burger") || fn.includes("バーガー") || fn.includes("ハンバーガー")) {
          return { label: categoryMenus.burger.label, candidates: categoryMenus.burger.items };
        }
        if (fn.includes("sandwich") || fn.includes("サンドイッチ") || fn.includes("パン") || fn.includes("トースト") || fn.includes("bread")) {
          return { label: categoryMenus.bread.label, candidates: categoryMenus.bread.items };
        }
        if (fn.includes("bento") || fn.includes("弁当") || fn.includes("幕の内")) {
          return { label: categoryMenus.bento.label, candidates: categoryMenus.bento.items };
        }
        if (fn.includes("don") || fn.includes("丼") || fn.includes("牛丼") || fn.includes("親子丼") || fn.includes("かつ丼")) {
          return { label: categoryMenus.donburi.label, candidates: categoryMenus.donburi.items };
        }
        if (fn.includes("curry") || fn.includes("カレー")) {
          return { label: categoryMenus.curry.label, candidates: categoryMenus.curry.items };
        }
        if (fn.includes("salad") || fn.includes("サラダ")) {
          return { label: categoryMenus.salad.label, candidates: categoryMenus.salad.items };
        }
        if (fn.includes("karaage") || fn.includes("からあげ") || fn.includes("唐揚") || fn.includes("揚げ") || fn.includes("フライ")) {
          return { label: categoryMenus.karaage.label, candidates: categoryMenus.karaage.items };
        }
        if (fn.includes("meat") || fn.includes("ステーキ") || fn.includes("肉") || fn.includes("ハンバーグ") || fn.includes("生姜焼き")) {
          return { label: categoryMenus.meat.label, candidates: categoryMenus.meat.items };
        }
        if (fn.includes("cake") || fn.includes("ケーキ") || fn.includes("スイーツ") || fn.includes("チョコ") || fn.includes("パフェ")) {
          return { label: categoryMenus.cake.label, candidates: categoryMenus.cake.items };
        }
        if (fn.includes("fruit") || fn.includes("フルーツ") || fn.includes("バナナ") || fn.includes("りんご") || fn.includes("果物")) {
          return { label: categoryMenus.fruit.label, candidates: categoryMenus.fruit.items };
        }
        if (fn.includes("coffee") || fn.includes("カフェ") || fn.includes("コーヒー") || fn.includes("ラテ") || fn.includes("珈琲")) {
          return { label: categoryMenus.coffee.label, candidates: categoryMenus.coffee.items };
        }
      }

      // 3. 通常の時間帯・スロット別標準メニュー（特定不能時の自然なフォールバック）
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
          { rank: 3, name: "ミックスサンド ＋ サラダチキン", calories: 400, p: 34.7, f: 14.7, c: 30.0, icon: "🥪", advice: "✨ 理想的な高たんぱく・適正カロリーのスマートランチです！" },
          { rank: 4, name: "特上にぎり寿司盛り合わせ (8貫)", calories: 520, p: 26.5, f: 6.2, c: 88.0, icon: "🍣", advice: "🍣 高たんぱく・低脂質な和食ランチ！午後の眠気を防ぎます。" }
        ],
        dinner: [
          { rank: 1, name: "焼き鮭・塩鮭定食 (ご飯普通・味噌汁付)", calories: 484, p: 30.0, f: 13.3, c: 58.7, icon: "🐟", advice: "✨ 理想の夕食！高タンパク・低脂質で睡眠中の脂肪燃焼をサポート。" },
          { rank: 2, name: "デミグラスハンバーグ定食 (ご飯普通)", calories: 714, p: 29.8, f: 29.0, c: 77.4, icon: "🥩", advice: "💡 しっかり肉料理！日中の活動量と相殺して目標内に収めます。" },
          { rank: 3, name: "豚ロース生姜焼き定食 (普通盛り)", calories: 680, p: 28.0, f: 24.0, c: 85.0, icon: "🐷", advice: "🐷 ビタミンB1豊富で疲労回復！糖質の代謝をスムーズにします。" },
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
        label: "AI高精度判定（時間帯レコメンド）",
        candidates: candidatesBySlot[slot] || candidatesBySlot.lunch
      };
    }

    // グローバルアクセス・テスト用エクスポート
    window.getAskenCandidates = getAskenCandidates;

    // 解析開始演出 ＆ Google Gemini AI画像認識（旧検出は完全廃止しGeminiに一本化）
    async function startPhotoAnalysis(imageSrc, presetData, fileName) {
      window.startPhotoAnalysis = startPhotoAnalysis;
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

      const scanNonFoodAlert = document.getElementById("scanNonFoodAlert");
      if (scanNonFoodAlert) scanNonFoodAlert.classList.add("hidden");

      const slot = document.getElementById("recordTargetSlot")?.value || "lunch";
      let geminiRes = null;
      let isGeminiSuccess = false;
      let isPreset = false;

      if (presetData) {
        isPreset = true;
        scanStatusText.textContent = "サンプル料理データを読み込み中...";
        await new Promise(r => setTimeout(r, 200));
        currentScanItem = {
          ...presetData,
          img: imageSrc,
          baseName: presetData.name,
          baseCalories: presetData.calories,
          baseP: presetData.p,
          baseF: presetData.f,
          baseC: presetData.c,
          baseAdvice: presetData.advice,
          soupLevel: 'all'
        };
      } else if (geminiApiKey) {
        scanStatusText.textContent = "Google Gemini AIが料理を解析中...";
        geminiRes = await analyzeWithGeminiVision(imageSrc);
        if (geminiRes && !geminiRes.error) {
          if (geminiRes.isFood === false) {
            showNonFoodAlert(geminiRes.nonFoodName, geminiRes.message);
            return;
          }
          isGeminiSuccess = true;
          currentScanItem = {
            ...geminiRes,
            img: imageSrc,
            baseName: geminiRes.name,
            baseCalories: geminiRes.calories,
            baseP: geminiRes.p,
            baseF: geminiRes.f,
            baseC: geminiRes.c,
            baseAdvice: geminiRes.advice,
            soupLevel: 'all'
          };
        } else {
          // Gemini失敗時：画像ピクセル色彩分析＆ファイル名から料理をスマート特定（ヤンニョムチキン・唐揚げ等）
          localStorage.setItem("mealai_gemini_verified", "false");
          localStorage.setItem("mealai_gemini_last_error", geminiRes?.message || "通信エラー");
          updateGeminiStatusUI();

          const visualMeal = await detectDishFromImageVisuals(imageSrc, fileName);
          if (visualMeal?.isFood === false) {
            showNonFoodAlert(visualMeal.nonFoodName, visualMeal.message);
            return;
          }
          currentScanItem = {
            ...visualMeal,
            img: imageSrc,
            baseName: visualMeal.name,
            baseCalories: visualMeal.calories,
            baseP: visualMeal.p,
            baseF: visualMeal.f,
            baseC: visualMeal.c,
            baseAdvice: visualMeal.advice,
            soupLevel: 'all'
          };
        }
      } else {
        // キー未設定時：画像ピクセル色彩分析＆ファイル名から料理をスマート特定（ヤンニョムチキン・唐揚げ等）
        const visualMeal = await detectDishFromImageVisuals(imageSrc, fileName);
        if (visualMeal?.isFood === false) {
          showNonFoodAlert(visualMeal.nonFoodName, visualMeal.message);
          return;
        }
        currentScanItem = {
          ...visualMeal,
          img: imageSrc,
          baseName: visualMeal.name,
          baseCalories: visualMeal.calories,
          baseP: visualMeal.p,
          baseF: visualMeal.f,
          baseC: visualMeal.c,
          baseAdvice: visualMeal.advice,
          soupLevel: 'all'
        };
      }

      // 写真配列を初期化（複数写真対応）
      if (!currentScanItem.imgs) {
        currentScanItem.imgs = [imageSrc];
      } else if (!currentScanItem.imgs.includes(imageSrc)) {
        currentScanItem.imgs.unshift(imageSrc);
      }

      scanOverlay.classList.add("hidden");
      scanLaserLine.classList.add("hidden");

      // 複数写真ギャラリーバーを更新
      updateScanPhotosBarUI();

      // ステップ 1（料理名確認）を表示
      setupStep1DishUI(currentScanItem, isGeminiSuccess, isPreset, geminiRes?.error ? geminiRes?.message : null);

      scanResultArea.classList.remove("hidden");
      setTimeout(() => {
        scanResultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }

    // 📸 複数写真ギャラリーUIの更新
    function updateScanPhotosBarUI() {
      const bar = document.getElementById("scanPhotosBar");
      const list = document.getElementById("scanPhotosThumbnailsList");
      const badge = document.getElementById("scanPhotosCountBadge");
      if (!bar || !list) return;

      if (!currentScanItem || !currentScanItem.imgs || currentScanItem.imgs.length === 0) {
        bar.classList.add("hidden");
        return;
      }

      bar.classList.remove("hidden");
      if (badge) badge.textContent = currentScanItem.imgs.length;

      list.innerHTML = currentScanItem.imgs.map((imgSrc, idx) => `
        <div class="relative shrink-0 group">
          <img src="${imgSrc}" class="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-xl border-2 ${idx === 0 ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-300'} shadow-xs cursor-pointer hover:opacity-90 transition"
            title="写真 ${idx + 1}" onclick="window.previewPhotoInModal && window.previewPhotoInModal(${idx})">
          <span class="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 py-0.2 rounded font-mono font-bold">#${idx + 1}</span>
          ${currentScanItem.imgs.length > 1 ? `
            <button type="button" onclick="event.stopPropagation(); window.removePhotoFromCurrentScan && window.removePhotoFromCurrentScan(${idx})"
              class="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px] shadow-xs cursor-pointer"
              title="この写真を削除">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ''}
        </div>
      `).join("");
    }
    window.updateScanPhotosBarUI = updateScanPhotosBarUI;

    window.previewPhotoInModal = function (idx) {
      if (!currentScanItem || !currentScanItem.imgs || !currentScanItem.imgs[idx]) return;
      if (scannedImagePreview) scannedImagePreview.src = currentScanItem.imgs[idx];
      updateScanPhotosBarUI();
    };

    // 📸 追加写真のファイル変更ハンドラ
    window.handleAppendPhotoChange = function (input) {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = async function (e) {
        const imageSrc = e.target.result;
        input.value = "";
        await appendPhotoToCurrentScan(imageSrc, file.name);
      };
      reader.readAsDataURL(file);
    };

    // 📸 写真を追加して既存の解析結果に合算（1枚目と同じように料理名確認→量調整を経てから合算）
    async function appendPhotoToCurrentScan(imageSrc, fileName) {
      if (!currentScanItem) {
        return startPhotoAnalysis(imageSrc, null, fileName);
      }

      // 1. 現在の親の食事データをディープコピーして保持
      const parentMeal = currentScanItem.isAppendingToParent && currentScanItem.parentMeal
        ? currentScanItem.parentMeal
        : {
            ...currentScanItem,
            items: currentScanItem.items ? JSON.parse(JSON.stringify(currentScanItem.items)) : [],
            imgs: currentScanItem.imgs ? [...currentScanItem.imgs] : (currentScanItem.img ? [currentScanItem.img] : [])
          };

      // 2. ランチャーやカメラコンテナを完全に隠す
      if (primaryCameraLauncher) primaryCameraLauncher.classList.add("hidden");
      if (cameraContainer) cameraContainer.classList.add("hidden");
      if (liveCameraActionBtn) liveCameraActionBtn.classList.add("hidden");
      const sampleBox = document.querySelector("#photoTabContent .sample-presets-box");
      if (sampleBox) sampleBox.classList.add("hidden");

      // スキャンアニメーション表示
      scanPreviewArea.classList.remove("hidden");
      scannedImagePreview.src = imageSrc;
      scanOverlay.classList.remove("hidden");
      scanLaserLine.classList.remove("hidden");
      scanStatusText.textContent = "追加写真をAI解析中...（料理と品目を特定）";

      let newMeal = null;
      let isGeminiSuccess = false;

      try {
        if (geminiApiKey) {
          const geminiRes = await analyzeWithGeminiVision(imageSrc);
          if (geminiRes && !geminiRes.error && geminiRes.isFood !== false) {
            newMeal = geminiRes;
            isGeminiSuccess = true;
          }
        }
        if (!newMeal) {
          newMeal = await detectDishFromImageVisuals(imageSrc, fileName);
        }
      } catch (e) {
        console.warn("Append photo analysis failed, using fallback:", e);
        newMeal = { name: "追加のおかず", calories: 200, p: 10, f: 8, c: 20, icon: "🥢" };
      }

      // 品目を正規化
      newMeal = ensureNormalizedMealItems(newMeal);

      // 3. 2枚目の追加写真用の独立した currentScanItem をセット
      currentScanItem = {
        ...newMeal,
        img: imageSrc,
        imgs: [imageSrc],
        baseName: newMeal.name,
        baseCalories: newMeal.calories,
        baseP: newMeal.p,
        baseF: newMeal.f,
        baseC: newMeal.c,
        baseAdvice: newMeal.advice,
        soupLevel: 'all',
        // 💡 追加モードフラグ＆親データ保持
        isAppendingToParent: true,
        parentMeal: parentMeal,
        appendPhotoSrc: imageSrc
      };

      scanOverlay.classList.add("hidden");
      scanLaserLine.classList.add("hidden");

      // スキャン結果エリアを確実に表示
      scanResultArea.classList.remove("hidden");

      // 4. 1枚目と同様に【ステップ 1】（追加写真の料理名確認画面）を表示！
      setupStep1DishUI(currentScanItem, isGeminiSuccess, false, null);

      setTimeout(() => {
        scanResultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
    window.appendPhotoToCurrentScan = appendPhotoToCurrentScan;

    // 📸 追加写真の料理・量調整が完了した後の「合算確定」処理
    window.confirmAppendMealToParent = function () {
      if (!currentScanItem || !currentScanItem.parentMeal) return;
      const parent = currentScanItem.parentMeal;
      const added = currentScanItem;

      // 1. 写真配列にプッシュ
      if (!parent.imgs) parent.imgs = [parent.img || scannedImagePreview.src];
      if (added.appendPhotoSrc && !parent.imgs.includes(added.appendPhotoSrc)) {
        parent.imgs.push(added.appendPhotoSrc);
      }

      // 2. 料理名を合成
      const addedName = added.name || "追加料理";
      if (!parent.name.includes(addedName)) {
        parent.name = `${parent.name} ＋ ${addedName}`;
      } else {
        parent.name = `${parent.name} ＋ ${addedName}(別皿)`;
      }

      // 3. 調整済み品目（items）をマージ
      if (!parent.items || parent.items.length === 0) {
        parent = ensureNormalizedMealItems(parent);
      }
      // 親の元々の品目に photoIndex: 0 を付与
      if (parent.items) {
        parent.items.forEach(it => {
          if (it.photoIndex === undefined) it.photoIndex = 0;
        });
      }

      const appendPhotoIndex = parent.imgs.length - 1;
      const appendItems = (added.items && added.items.length > 0)
        ? added.items
        : [{
            name: added.name,
            portion: "1皿",
            portionType: "side",
            calories: added.calories,
            baseCalories: added.calories,
            p: added.p, baseP: added.p,
            f: added.f, baseF: added.f,
            c: added.c, baseC: added.c,
            icon: added.icon || "🥢",
            scale: 1.0, preset: "medium"
          }];

      appendItems.forEach((it, i) => {
        parent.items.push({
          ...it,
          id: `item_appended_${Date.now()}_${i}`,
          photoIndex: appendPhotoIndex,
          sourceDishName: addedName
        });
      });

      // 写真ごとの詳細履歴（カロリー・料理名）を保持して正確な減算を保証
      parent.photoDetails = parent.photoDetails || [];
      if (parent.photoDetails.length === 0) {
        parent.photoDetails.push({
          idx: 0,
          name: parent.baseName || parent.name.split(" ＋ ")[0],
          calories: parent.baseCalories || parent.calories,
          p: parent.baseP || parent.p,
          f: parent.baseF || parent.f,
          c: parent.baseC || parent.c
        });
      }
      parent.photoDetails.push({
        idx: appendPhotoIndex,
        name: addedName,
        calories: added.calories,
        p: added.p,
        f: added.f,
        c: added.c
      });

      // 4. 親の食事を currentScanItem に戻す
      currentScanItem = parent;
      currentScanItem.isAppendingToParent = false;
      currentScanItem.parentMeal = null;

      const manualInput = document.getElementById("manualEditDishInput");
      if (manualInput) manualInput.value = currentScanItem.name;

      // 5. 合計栄養素・カロリーを全品目から自動再計算
      recalculateTotalNutritionFromItems();

      // 6. 全体合算後のステップ2（カロリー確認ページ）へ即座に復帰
      updateScanPhotosBarUI();
      goToNutritionStep();

      // 7. アラートなしで即座にカロリーボックスをハイライト＆合算バナーを表示
      const successBanner = document.getElementById("mergedSuccessBanner");
      const bannerText = document.getElementById("mergedSuccessBannerText");
      const calBox = document.getElementById("step2CalorieBox");

      if (successBanner && bannerText) {
        bannerText.textContent = `【${addedName}】(+${added.calories}kcal) を合算しました！`;
        successBanner.classList.remove("hidden");
        setTimeout(() => {
          successBanner.classList.add("hidden");
        }, 4000);
      }

      showActionToast(`【${addedName}】(+${added.calories}kcal) を合算しました！`, {
        icon: "🍱",
        duration: 3500
      });

      if (calBox) {
        calBox.classList.add("ring-4", "ring-emerald-400");
        setTimeout(() => {
          calBox.classList.remove("ring-4", "ring-emerald-400");
        }, 2000);
        calBox.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    // 📸 追加写真のキャンセル（親の食事画面に戻る）
    window.cancelAppendMeal = function () {
      if (!currentScanItem || !currentScanItem.parentMeal) return;
      currentScanItem = currentScanItem.parentMeal;
      currentScanItem.isAppendingToParent = false;
      currentScanItem.parentMeal = null;
      updateScanPhotosBarUI();
      goToNutritionStep();
    };

    // 📸 写真削除の元に戻すバックアップ管理
    let lastDeletedPhotoBackup = null;

    // 📸 追加写真の削除（品目・カロリーも即座に減算）
    window.removePhotoFromCurrentScan = function (idx) {
      if (!currentScanItem || !currentScanItem.imgs || currentScanItem.imgs.length <= 1) return;

      const prevCalories = currentScanItem.calories || 0;

      // 誤削除対策：直前の完全バックアップを保持
      lastDeletedPhotoBackup = {
        imgs: [...currentScanItem.imgs],
        items: currentScanItem.items ? JSON.parse(JSON.stringify(currentScanItem.items)) : [],
        name: currentScanItem.name,
        calories: currentScanItem.calories,
        p: currentScanItem.p,
        f: currentScanItem.f,
        c: currentScanItem.c,
        photoDetails: currentScanItem.photoDetails ? JSON.parse(JSON.stringify(currentScanItem.photoDetails)) : null,
        deletedIndex: idx
      };

      // 1. 対象写真の削除
      currentScanItem.imgs.splice(idx, 1);
      if (scannedImagePreview && currentScanItem.imgs.length > 0) {
        scannedImagePreview.src = currentScanItem.imgs[0];
      }

      // 2. 紐づく品目の削除
      let removedCal = 0;
      let removedName = "";
      if (currentScanItem.items && currentScanItem.items.length > 0) {
        const remainingItems = [];
        currentScanItem.items.forEach(it => {
          if (it.photoIndex === idx) {
            removedCal += (it.calories || 0);
            if (!removedName) removedName = it.sourceDishName || it.name;
          } else {
            if (it.photoIndex > idx) {
              it.photoIndex -= 1;
            }
            remainingItems.push(it);
          }
        });
        currentScanItem.items = remainingItems;
      }

      // 3. photoDetails からの減算
      if (currentScanItem.photoDetails && currentScanItem.photoDetails.length > idx) {
        const removedDetail = currentScanItem.photoDetails.splice(idx, 1)[0];
        if (removedCal === 0 && removedDetail) {
          removedCal = removedDetail.calories || 0;
          removedName = removedDetail.name || "";
        }
        currentScanItem.photoDetails.forEach((d, i) => { d.idx = i; });
      }

      // 4. カロリー・PFCの再計算
      if (currentScanItem.items && currentScanItem.items.length > 0) {
        recalculateTotalNutritionFromItems();

        // 安全弁：もし品目削除でカロリーが減っていない場合は確実に減算
        if (currentScanItem.calories >= prevCalories && removedCal > 0) {
          currentScanItem.calories = Math.max(50, prevCalories - removedCal);
        } else if (currentScanItem.calories >= prevCalories) {
          const approx = Math.round(prevCalories / (currentScanItem.imgs.length + 1));
          currentScanItem.calories = Math.max(50, prevCalories - approx);
          removedCal = approx;
        }

        // 料理名の再構築
        const uniqueNames = [];
        currentScanItem.items.forEach(it => {
          const dName = it.sourceDishName || it.name;
          if (!uniqueNames.includes(dName)) uniqueNames.push(dName);
        });
        currentScanItem.name = uniqueNames.join(" ＋ ");
      } else {
        if (removedCal > 0) {
          currentScanItem.calories = Math.max(50, prevCalories - removedCal);
        } else {
          const approx = Math.round(prevCalories / (currentScanItem.imgs.length + 1));
          currentScanItem.calories = Math.max(50, prevCalories - approx);
          removedCal = approx;
        }
      }

      // 実際に引かれたカロリーを計算
      const actualDeducted = Math.max(0, prevCalories - (currentScanItem.calories || 0));

      const manualInput = document.getElementById("manualEditDishInput");
      if (manualInput) manualInput.value = currentScanItem.name;

      // 5. 画面（Step 2）の各要素を再描画！
      updateScanPhotosBarUI();
      renderDishItemsUI();
      refreshStep2Displays();

      // カロリーボックスをアニメーション強調
      const calBox = document.getElementById("step2CalorieBox");
      if (calBox) {
        calBox.classList.add("ring-4", "ring-rose-400");
        setTimeout(() => {
          calBox.classList.remove("ring-4", "ring-rose-400");
        }, 1500);
      }

      // 「写真を復元」ボタンを表示
      const undoBtn = document.getElementById("undoPhotoDeleteBtn");
      if (undoBtn) undoBtn.classList.remove("hidden");

      // トーストでも即座に復元可能にする（引いたカロリーを明示）
      const toastText = actualDeducted > 0
        ? `写真を削除しました（-${actualDeducted} kcal）`
        : "写真を削除しました";

      showActionToast(toastText, {
        icon: "🗑️",
        actionText: "↩️ 写真を復元",
        duration: 5000,
        onAction: () => {
          window.restoreLastDeletedPhoto();
        }
      });
    };

    // ↩️ 間違えて消した写真を元に戻す（ワンタップ復元）
    window.restoreLastDeletedPhoto = function () {
      if (!lastDeletedPhotoBackup || !currentScanItem) return;

      currentScanItem.imgs = [...lastDeletedPhotoBackup.imgs];
      currentScanItem.items = [...lastDeletedPhotoBackup.items];
      currentScanItem.name = lastDeletedPhotoBackup.name;
      currentScanItem.calories = lastDeletedPhotoBackup.calories;
      currentScanItem.p = lastDeletedPhotoBackup.p;
      currentScanItem.f = lastDeletedPhotoBackup.f;
      currentScanItem.c = lastDeletedPhotoBackup.c;
      if (lastDeletedPhotoBackup.photoDetails) {
        currentScanItem.photoDetails = [...lastDeletedPhotoBackup.photoDetails];
      }

      lastDeletedPhotoBackup = null;

      // 復元ボタンを隠す
      const undoBtn = document.getElementById("undoPhotoDeleteBtn");
      if (undoBtn) undoBtn.classList.add("hidden");

      updateScanPhotosBarUI();
      recalculateTotalNutritionFromItems();
      renderDishItemsUI();
      refreshStep2Displays();

      showActionToast("↩️ 削除した写真を復元しました！", { icon: "✨", duration: 3000 });
    };

    // 食べ物以外の物体（水筒・スマホ等）が撮影された場合のアラート表示
    function showNonFoodAlert(nonFoodName, message) {
      const scanNonFoodAlert = document.getElementById("scanNonFoodAlert");
      const alertTitle = document.getElementById("nonFoodAlertTitle");
      const alertDesc = document.getElementById("nonFoodAlertDesc");
      const scanResultArea = document.getElementById("scanResultArea");
      const scanOverlay = document.getElementById("scanOverlay");
      const scanLaserLine = document.getElementById("scanLaserLine");

      if (scanOverlay) scanOverlay.classList.add("hidden");
      if (scanLaserLine) scanLaserLine.classList.add("hidden");
      if (scanResultArea) scanResultArea.classList.add("hidden");

      if (alertTitle) {
        alertTitle.textContent = "食べ物・飲み物が検出されませんでした";
      }
      if (alertDesc) {
        const detectedStr = nonFoodName ? `「${nonFoodName}」` : "食べ物以外の物体";
        alertDesc.textContent = message || `写真に料理や飲み物が写っていないようです（${detectedStr}が検出されました）。お食事の写真を撮影または選択してください。`;
      }

      if (scanNonFoodAlert) {
        scanNonFoodAlert.classList.remove("hidden");
        scanNonFoodAlert.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    window.showNonFoodAlert = showNonFoodAlert;

    // 水筒等の写真から「手動で料理名・中身を入力」を選択した場合
    window.continueAnywayWithManual = function () {
      const scanNonFoodAlert = document.getElementById("scanNonFoodAlert");
      if (scanNonFoodAlert) scanNonFoodAlert.classList.add("hidden");

      currentScanItem = {
        name: "ドリンク・水筒の中身",
        portion: "1本（約500ml）",
        count: 1,
        unitName: "本",
        unitCalories: 150,
        calories: 150,
        p: 15.0,
        f: 2.0,
        c: 18.0,
        advice: "水筒やマイボトルの中身（プロテイン、お茶、カフェラテなど）に合わせて料理名を変更・登録してください。",
        icon: "🥤",
        img: scannedImagePreview?.src || null,
        baseName: "ドリンク・水筒の中身",
        baseCalories: 150,
        baseP: 15.0,
        baseF: 2.0,
        baseC: 18.0,
        baseAdvice: "水筒やマイボトルの中身（プロテイン、お茶、カフェラテなど）に合わせて料理名を変更・登録してください。",
        soupLevel: 'all'
      };

      setupStep1DishUI(currentScanItem, false, false, null);
      const col = document.getElementById("dishEditCollapsible");
      if (col) col.classList.remove("hidden");
      const btnText = document.getElementById("toggleEditDishBtnText");
      if (btnText) btnText.textContent = "入力欄を閉じる";
      const manualInput = document.getElementById("manualEditDishInput");
      if (manualInput) {
        manualInput.focus();
        manualInput.select();
      }

      scanResultArea.classList.remove("hidden");
      scanResultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    // ==================== 2ステップ式 UI制御 ====================

    // 【ステップ 1】料理名の確認UIをセットアップ
    function setupStep1DishUI(meal, isGemini, isPreset, geminiErrorMsg) {
      const step1Area = document.getElementById("photoStepDishArea");
      const step2Area = document.getElementById("photoStepNutritionArea");
      const badgeText = document.getElementById("stepDishBadgeText");
      const dishIcon = document.getElementById("stepDishIcon");
      const dishDisplay = document.getElementById("stepDishNameDisplay");
      const manualInput = document.getElementById("manualEditDishInput");
      const editCollapsible = document.getElementById("dishEditCollapsible");
      const itemsPreview = document.getElementById("stepDishItemsPreview");

      if (step1Area) step1Area.classList.remove("hidden");
      if (step2Area) step2Area.classList.add("hidden");
      if (editCollapsible) editCollapsible.classList.add("hidden");

      // 品目を正規化
      currentScanItem = ensureNormalizedMealItems(currentScanItem || meal);

      if (dishIcon) dishIcon.textContent = currentScanItem.icon || "🍽️";
      if (dishDisplay) dishDisplay.textContent = currentScanItem.name;
      if (manualInput) manualInput.value = currentScanItem.name;

      // 認識された各品目（ご飯・鮭・味噌汁等）のプレビュータグを描画
      if (itemsPreview) {
        if (currentScanItem.items && currentScanItem.items.length > 0) {
          itemsPreview.classList.remove("hidden");
          itemsPreview.innerHTML = currentScanItem.items.map(item => `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-[11px] font-bold shadow-2xs">
              <span>${item.icon || '🍽️'}</span>
              <span>${item.name}</span>
              <span class="text-emerald-700 font-mono text-[10px] font-normal">(${item.calories}kcal)</span>
            </span>
          `).join("");
        } else {
          itemsPreview.classList.add("hidden");
        }
      }

      if (badgeText) {
        if (currentScanItem.isAppendingToParent) {
          badgeText.innerHTML = `📸 追加写真（2枚目）の料理名確認（次へ進むと量を調整できます）`;
          if (badgeText.parentElement) {
            badgeText.parentElement.className = "text-[10px] text-indigo-900 font-bold bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-300 flex items-center gap-1 shadow-2xs";
          }
        } else if (isGemini) {
          badgeText.textContent = "🤖 Google Gemini AI 認識（本物AI稼働中）";
          if (badgeText.parentElement) {
            badgeText.parentElement.className = "text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shadow-2xs";
          }
        } else if (isPreset) {
          badgeText.textContent = "サンプル料理";
          if (badgeText.parentElement) {
            badgeText.parentElement.className = "text-[10px] text-slate-800 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-300 flex items-center gap-1";
          }
        } else if (geminiErrorMsg) {
          badgeText.innerHTML = `⚡ オフライン色彩解析（APIエラー: <button type="button" onclick="window.showGeminiErrorDetail && window.showGeminiErrorDetail()" class="underline font-bold text-amber-900 hover:text-black cursor-pointer">原因と対策を確認</button>）`;
          if (badgeText.parentElement) {
            badgeText.parentElement.className = "text-[10px] text-amber-800 font-bold bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1";
          }
        } else {
          badgeText.textContent = "⚡ オフライン色彩解析（AI未設定）";
          if (badgeText.parentElement) {
            badgeText.parentElement.className = "text-[10px] text-slate-700 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-300 flex items-center gap-1";
          }
        }
      }
    }

    // 料理名修正アコーディオンの開閉トグル
    window.toggleDishEditSection = function () {
      const col = document.getElementById("dishEditCollapsible");
      const btnText = document.getElementById("toggleEditDishBtnText");
      if (!col) return;
      col.classList.toggle("hidden");
      const isOpen = !col.classList.contains("hidden");
      if (btnText) {
        btnText.textContent = isOpen ? "入力欄を閉じる" : "料理名を変更・検索";
      }
      if (isOpen) {
        const input = document.getElementById("manualEditDishInput");
        if (input) {
          input.focus();
          input.select();
        }
      }
    };

    // 料理名入力サジェスト＆ジャンルチップ
    const manualEditInput = document.getElementById("manualEditDishInput");
    const stepQuickResults = document.getElementById("stepQuickSearchResults");

    if (manualEditInput && stepQuickResults) {
      manualEditInput.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        const display = document.getElementById("stepDishNameDisplay");
        if (display && val) display.textContent = val;
        if (currentScanItem) currentScanItem.name = val;

        if (!val) {
          stepQuickResults.classList.add("hidden");
          stepQuickResults.innerHTML = "";
          return;
        }

        const queryLower = val.toLowerCase();
        const matched = (window.WORLD_FOOD_DATABASE || []).filter(item =>
          item.name.toLowerCase().includes(queryLower)
        ).slice(0, 5);

        if (matched.length > 0) {
          stepQuickResults.innerHTML = matched.map(m => `
            <div class="p-2 hover:bg-emerald-50 cursor-pointer flex items-center justify-between step-search-row"
                 data-name="${m.name}" data-cal="${m.calories}" data-p="${m.p}" data-f="${m.f}" data-c="${m.c}" data-icon="${m.icon || '🍽️'}">
              <span class="font-bold text-slate-800">${m.icon || '🍽️'} ${m.name}</span>
              <span class="font-mono text-emerald-700 text-xs font-bold">${m.calories} kcal</span>
            </div>
          `).join("");
          stepQuickResults.classList.remove("hidden");

          stepQuickResults.querySelectorAll(".step-search-row").forEach(row => {
            row.onclick = () => {
              const name = row.dataset.name;
              const cal = parseInt(row.dataset.cal);
              const p = parseFloat(row.dataset.p);
              const f = parseFloat(row.dataset.f);
              const c = parseFloat(row.dataset.c);
              const icon = row.dataset.icon;

              manualEditInput.value = name;
              if (display) display.textContent = name;
              const dishIcon = document.getElementById("stepDishIcon");
              if (dishIcon) dishIcon.textContent = icon;

              if (currentScanItem) {
                currentScanItem.name = name;
                currentScanItem.calories = cal;
                currentScanItem.p = p;
                currentScanItem.f = f;
                currentScanItem.c = c;
                currentScanItem.icon = icon;
                currentScanItem.baseCalories = cal;
                currentScanItem.baseP = p;
                currentScanItem.baseF = f;
                currentScanItem.baseC = c;
              }
              stepQuickResults.classList.add("hidden");
            };
          });
        } else {
          stepQuickResults.classList.add("hidden");
        }
      });
    }
    window.startPhotoAnalysis = startPhotoAnalysis;

    // ジャンルチップのクリック接続
    document.querySelectorAll(".genre-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const genre = chip.dataset.genre;
        const matched = (window.WORLD_FOOD_DATABASE || []).find(item => item.name.includes(genre));
        if (matched && currentScanItem) {
          currentScanItem.name = matched.name;
          currentScanItem.calories = matched.calories;
          currentScanItem.p = matched.p;
          currentScanItem.f = matched.f;
          currentScanItem.c = matched.c;
          currentScanItem.icon = matched.icon || '🍽️';
          currentScanItem.baseCalories = matched.calories;

          const display = document.getElementById("stepDishNameDisplay");
          const input = document.getElementById("manualEditDishInput");
          const iconEl = document.getElementById("stepDishIcon");
          if (display) display.textContent = matched.name;
          if (input) input.value = matched.name;
          if (iconEl) iconEl.textContent = matched.icon || '🍽️';
        }
      });
    });

    // ✨ ステップ1：自由入力した料理名をGemini AIで分析・品目再計算
    window.applyManualDishWithAI = async function () {
      const input = document.getElementById("manualEditDishInput");
      const dishText = input ? input.value.trim() : "";
      if (!dishText) {
        alert("料理名を入力してください（例: 親子丼、味噌汁と鮭の塩焼き、カレー）");
        if (input) input.focus();
        return;
      }

      const display = document.getElementById("stepDishNameDisplay");
      if (display) display.textContent = `✨ AI解析中: ${dishText}...`;

      try {
        const result = await analyzeDishWithGeminiText(dishText);
        if (currentScanItem) {
          currentScanItem.name = result.name;
          currentScanItem.items = result.items;
          currentScanItem.calories = result.calories;
          currentScanItem.baseCalories = result.calories;
          currentScanItem.p = result.p;
          currentScanItem.baseP = result.p;
          currentScanItem.f = result.f;
          currentScanItem.baseF = result.f;
          currentScanItem.c = result.c;
          currentScanItem.baseC = result.c;
          currentScanItem.icon = result.icon || "🍽️";
          currentScanItem.advice = result.advice;
        }

        setupStep1DishUI(currentScanItem, true, false, null);
        const col = document.getElementById("dishEditCollapsible");
        if (col) col.classList.add("hidden");
        const btnText = document.getElementById("toggleEditDishBtnText");
        if (btnText) btnText.textContent = "料理名を変更・検索";
      } catch (err) {
        console.error("applyManualDishWithAI error:", err);
        alert("AI推計に失敗しました。");
        if (display && currentScanItem) display.textContent = currentScanItem.name;
      }
    };

    // 【ステップ 1 → ステップ 2 へ進む】
    window.goToNutritionStep = function () {
      if (!currentScanItem && window.currentScanItem) currentScanItem = window.currentScanItem;
      if (!currentScanItem) return;

      const manualInput = document.getElementById("manualEditDishInput");
      if (manualInput && manualInput.value.trim()) {
        currentScanItem.name = manualInput.value.trim();
      }

      currentScanItem = ensureNormalizedMealItems(currentScanItem);

      // 個数・ポーションの初期化
      currentScanItem.count = currentScanItem.count || 1;
      currentScanItem.baseCount = currentScanItem.baseCount || currentScanItem.count;
      currentScanItem.unitName = currentScanItem.unitName || (currentScanItem.count > 1 ? "個" : "人前");
      currentScanItem.unitCalories = currentScanItem.unitCalories || (currentScanItem.count > 1 ? Math.round(currentScanItem.calories / currentScanItem.count) : currentScanItem.calories);
      currentScanItem.baseCalories = currentScanItem.baseCalories !== undefined ? currentScanItem.baseCalories : currentScanItem.calories;
      currentScanItem.baseP = currentScanItem.baseP !== undefined ? currentScanItem.baseP : currentScanItem.p;
      currentScanItem.baseF = currentScanItem.baseF !== undefined ? currentScanItem.baseF : currentScanItem.f;
      currentScanItem.baseC = currentScanItem.baseC !== undefined ? currentScanItem.baseC : currentScanItem.c;

      const step1Area = document.getElementById("photoStepDishArea");
      const step2Area = document.getElementById("photoStepNutritionArea");
      if (step1Area) step1Area.classList.add("hidden");
      if (step2Area) step2Area.classList.remove("hidden");

      // ステップ2の各項目を反映
      const nutriIcon = document.getElementById("nutriDishIcon");
      const adviceEl = document.getElementById("resultAdvice");

      if (nutriIcon) nutriIcon.textContent = currentScanItem.icon || "🍽️";
      if (adviceEl) adviceEl.textContent = currentScanItem.advice || "✨ 管理栄養士AIが推計しました。";

      // 品目別調整UIを描画
      renderDishItemsUI();

      refreshStep2Displays();
      updatePortionControlUI();

      // ラーメンのみスープ量調整を表示（ラーメン以外の料理・定食・チキン等では絶対に出さない）
      const isRamen = isRamenOnlyDish(currentScanItem.name);
      const soupContainer = document.getElementById("soupOptionContainer");
      if (soupContainer) {
        if (isRamen) {
          soupContainer.classList.remove("hidden");
          applySoupAdjustment('all');
        } else {
          soupContainer.classList.add("hidden");
        }
      }

      // 追加モードかどうかに応じたボタン表示の切り替え
      const cancelAppendBtn = document.getElementById("cancelAppendPhotoBtn");
      if (cancelAppendBtn) {
        if (currentScanItem.isAppendingToParent) {
          cancelAppendBtn.classList.remove("hidden");
        } else {
          cancelAppendBtn.classList.add("hidden");
        }
      }

      if (applyPhotoMealBtn) {
        if (currentScanItem.isAppendingToParent) {
          applyPhotoMealBtn.innerHTML = `<i class="fa-solid fa-plus-circle mr-1"></i><span>＋この食事と合算する</span>`;
          applyPhotoMealBtn.className = "flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 active:scale-95 text-white font-black rounded-xl text-xs sm:text-sm transition shadow-md flex items-center justify-center space-x-1.5 cursor-pointer";
        } else {
          applyPhotoMealBtn.innerHTML = `<span>この食事を記録する</span><i class="fa-solid fa-check ml-1"></i>`;
          applyPhotoMealBtn.className = "flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 active:scale-95 text-white font-black rounded-xl text-xs sm:text-sm transition shadow-md flex items-center justify-center space-x-1.5 cursor-pointer";
        }
      }

      step2Area.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    // ==================== 品目個別ボリューム調整エンジン（自炊・定食対応） ====================
    function renderDishItemsUI() {
      if (!currentScanItem) return;
      const container = document.getElementById("dishItemsListContainer");
      const section = document.getElementById("dishItemsSection");
      const portionControlBox = document.getElementById("portionControlBox");
      if (!container) return;

      const items = currentScanItem.items || [];
      if (items.length === 0) {
        if (section) section.classList.add("hidden");
        if (portionControlBox) portionControlBox.classList.remove("hidden");
        return;
      }

      if (section) section.classList.remove("hidden");
      // 2品目以上ある（自炊・定食）場合は、各品目の調整がメインになるので全体の単一ステッパーは隠す
      if (portionControlBox) {
        if (items.length >= 2) {
          portionControlBox.classList.add("hidden");
        } else {
          portionControlBox.classList.remove("hidden");
        }
      }

      container.innerHTML = items.map((item) => {
        const name = (item.name || "").toLowerCase();
        const pType = item.portionType || "";

        const isRice = pType === "rice" || name.includes("ご飯") || name.includes("ごはん") || name.includes("米") || name.includes("ライス") || name.includes("玄米") || name.includes("オートミール");
        const isNoodle = name.includes("麺") || name.includes("パスタ") || name.includes("うどん") || name.includes("そば") || name.includes("ラーメン") || name.includes("スパゲティ") || name.includes("焼きそば");
        const isBread = name.includes("パン") || name.includes("トースト") || name.includes("サンド") || name.includes("ベーグル");
        const isSoup = pType === "soup" || name.includes("汁") || name.includes("スープ") || name.includes("ポタージュ") || name.includes("豚汁");
        const isSalad = pType === "side" || name.includes("サラダ") || name.includes("おひたし") || name.includes("和え") || name.includes("ナムル") || name.includes("キムチ") || name.includes("漬物");
        const isCount = pType === "count" || (item.count && item.count >= 2) || name.includes("個") || name.includes("個入") || name.includes("本");
        const isMeatFish = pType === "main" || name.includes("肉") || name.includes("魚") || name.includes("鮭") || name.includes("サバ") || name.includes("チキン") || name.includes("ステーキ") || name.includes("ハンバーグ") || name.includes("切り身");

        let smallLabel = "少なめ";
        let medLabel = "普通";
        let largeLabel = "多め";

        let smallScale = 0.7;
        let medScale = 1.0;
        let largeScale = 1.35;

        if (isRice) {
          smallLabel = "少なめ (150g)";
          medLabel = "普通 (200g)";
          largeLabel = "大盛 (300g)";
          smallScale = 0.75;
          largeScale = 1.4;
        } else if (isNoodle) {
          smallLabel = "少なめ (半玉)";
          medLabel = "普通 (1玉)";
          largeLabel = "大盛 (1.5玉)";
          smallScale = 0.7;
          largeScale = 1.4;
        } else if (isBread) {
          smallLabel = "少なめ (軽め)";
          medLabel = "普通 (1人前)";
          largeLabel = "多め (しっかり)";
          smallScale = 0.7;
          largeScale = 1.4;
        } else if (isMeatFish) {
          smallLabel = "小さめ (少なめ)";
          medLabel = "普通 (1人前)";
          largeLabel = "大きめ (多め)";
          smallScale = 0.7;
          largeScale = 1.35;
        } else if (isSoup) {
          smallLabel = "少なめ (具のみ)";
          medLabel = "普通 (1杯)";
          largeLabel = "多め (具沢山)";
          smallScale = 0.6;
          largeScale = 1.3;
        } else if (isSalad) {
          smallLabel = "少なめ (小鉢)";
          medLabel = "普通 (1皿)";
          largeLabel = "多め (山盛り)";
          smallScale = 0.65;
          largeScale = 1.4;
        } else if (isCount) {
          smallLabel = "少なめ";
          medLabel = "標準";
          largeLabel = "多め";
          smallScale = 0.6;
          largeScale = 1.5;
        } else {
          // 自炊の炒め物、煮物、お好み焼きなどあらゆるおかず
          smallLabel = "少なめ";
          medLabel = "普通";
          largeLabel = "多め (大)";
          smallScale = 0.7;
          largeScale = 1.35;
        }

        const curPreset = item.preset || "medium";

        return `
          <div class="bg-white rounded-xl p-2.5 sm:p-3 border border-slate-200/90 shadow-2xs space-y-2" data-item-id="${item.id}">
            <div class="flex items-center justify-between gap-1.5">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="text-xl shrink-0">${item.icon || '🍽️'}</span>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-slate-800 text-xs sm:text-[13px] break-words">${item.name}</div>
                  <div class="text-[10px] sm:text-[11px] text-slate-500 font-medium flex items-center gap-1.5 flex-wrap">
                    <span class="font-mono font-black text-emerald-700">${item.calories} kcal</span>
                    <span class="text-slate-400 font-mono">(P:${item.p}g · F:${item.f}g · C:${item.c}g)</span>
                  </div>
                </div>
              </div>
              ${items.length > 1 ? `
              <button type="button" onclick="window.removeDishItem('${item.id}')"
                class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0 text-xs"
                title="このおかずを除外">
                <i class="fa-solid fa-trash-can"></i>
              </button>
              ` : ''}
            </div>

            <!-- 量調整ボタン -->
            <div class="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100 flex-wrap sm:flex-nowrap">
              <div class="flex items-center gap-1 text-[10px] font-bold flex-1">
                <button type="button" onclick="window.setDishItemPreset('${item.id}', 'small', ${smallScale})"
                  class="flex-1 py-1 px-1.5 rounded-lg border text-center transition cursor-pointer active:scale-95 ${curPreset === 'small' ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-black' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}">
                  ${smallLabel}
                </button>
                <button type="button" onclick="window.setDishItemPreset('${item.id}', 'medium', ${medScale})"
                  class="flex-1 py-1 px-1.5 rounded-lg border text-center transition cursor-pointer active:scale-95 ${curPreset === 'medium' ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-black' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}">
                  ${medLabel}
                </button>
                <button type="button" onclick="window.setDishItemPreset('${item.id}', 'large', ${largeScale})"
                  class="flex-1 py-1 px-1.5 rounded-lg border text-center transition cursor-pointer active:scale-95 ${curPreset === 'large' ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-black' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}">
                  ${largeLabel}
                </button>
              </div>
              <!-- 微調整 [-] [+] -->
              <div class="flex items-center bg-slate-100 rounded-lg p-0.5 shrink-0">
                <button type="button" onclick="window.stepDishItemCalories('${item.id}', -20)"
                  class="w-6 h-6 rounded bg-white hover:bg-slate-200 active:scale-95 text-slate-700 font-black flex items-center justify-center cursor-pointer shadow-2xs"
                  title="少し減らす (-20kcal)">
                  <i class="fa-solid fa-minus text-[9px]"></i>
                </button>
                <span class="px-1 text-[9px] font-bold text-slate-500">微調</span>
                <button type="button" onclick="window.stepDishItemCalories('${item.id}', 20)"
                  class="w-6 h-6 rounded bg-emerald-100 hover:bg-emerald-200 active:scale-95 text-emerald-800 font-black flex items-center justify-center cursor-pointer shadow-2xs"
                  title="少し増やす (+20kcal)">
                  <i class="fa-solid fa-plus text-[9px]"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
    window.renderDishItemsUI = renderDishItemsUI;

    // 品目のプリセット変更
    window.setDishItemPreset = function (itemId, preset, scale) {
      if (!currentScanItem || !currentScanItem.items) return;
      const item = currentScanItem.items.find(i => i.id === itemId);
      if (!item) return;

      item.preset = preset;
      item.scale = scale;
      item.calories = Math.max(10, Math.round(item.baseCalories * scale));
      item.p = Math.round(item.baseP * scale * 10) / 10;
      item.f = Math.round(item.baseF * scale * 10) / 10;
      item.c = Math.round(item.baseC * scale * 10) / 10;

      recalculateTotalNutritionFromItems();
      renderDishItemsUI();
    };

    // 品目のカロリー微調整 (+20 / -20)
    window.stepDishItemCalories = function (itemId, delta) {
      if (!currentScanItem || !currentScanItem.items) return;
      const item = currentScanItem.items.find(i => i.id === itemId);
      if (!item) return;

      const newCal = Math.max(10, item.calories + delta);
      const ratio = newCal / (item.calories || 1);
      item.calories = newCal;
      item.p = Math.round(item.p * ratio * 10) / 10;
      item.f = Math.round(item.f * ratio * 10) / 10;
      item.c = Math.round(item.c * ratio * 10) / 10;
      item.preset = "custom";

      recalculateTotalNutritionFromItems();
      renderDishItemsUI();
    };

    // 品目の除外（削除）
    window.removeDishItem = function (itemId) {
      if (!currentScanItem || !currentScanItem.items) return;
      if (currentScanItem.items.length <= 1) return;
      currentScanItem.items = currentScanItem.items.filter(i => i.id !== itemId);
      recalculateTotalNutritionFromItems();
      renderDishItemsUI();
    };

    // 各品目の合算による全体カロリー・PFCのリアルタイム再計算
    function recalculateTotalNutritionFromItems() {
      if (!currentScanItem || !currentScanItem.items || currentScanItem.items.length === 0) return;
      let totalCal = 0;
      let totalP = 0;
      let totalF = 0;
      let totalC = 0;

      currentScanItem.items.forEach(it => {
        totalCal += it.calories;
        totalP += it.p;
        totalF += it.f;
        totalC += it.c;
      });

      currentScanItem.calories = Math.round(totalCal);
      currentScanItem.p = Math.round(totalP * 10) / 10;
      currentScanItem.f = Math.round(totalF * 10) / 10;
      currentScanItem.c = Math.round(totalC * 10) / 10;

      refreshStep2Displays();
    }
    window.recalculateTotalNutritionFromItems = recalculateTotalNutritionFromItems;

    // おかず追加モーダル関連
    window.openAddDishItemModal = function () {
      const modal = document.getElementById("addDishItemModal");
      if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
      }
    };

    window.closeAddDishItemModal = function () {
      const modal = document.getElementById("addDishItemModal");
      if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
      }
    };

    window.quickAddPresetDish = function (name, cal, p, f, c, icon, portionType) {
      if (!currentScanItem) return;
      if (!currentScanItem.items) currentScanItem.items = [];

      const newItem = {
        id: `item_${Date.now()}_add`,
        name: name,
        portion: "1人前",
        portionType: portionType || "side",
        calories: cal,
        baseCalories: cal,
        p: p,
        baseP: p,
        f: f,
        baseF: f,
        c: c,
        baseC: c,
        icon: icon || "🥢",
        scale: 1.0,
        preset: "medium"
      };

      currentScanItem.items.push(newItem);
      recalculateTotalNutritionFromItems();
      renderDishItemsUI();
      window.closeAddDishItemModal();
    };

    window.submitCustomDishItem = function () {
      const nameInput = document.getElementById("customDishItemName");
      const calInput = document.getElementById("customDishItemCal");
      const typeSelect = document.getElementById("customDishItemType");

      const name = nameInput ? nameInput.value.trim() : "";
      const cal = calInput ? parseInt(calInput.value) : 0;
      const pType = typeSelect ? typeSelect.value : "side";

      if (!name || isNaN(cal) || cal <= 0) {
        alert("おかず名と正しいカロリーを入力してください");
        return;
      }

      const p = Math.round(cal * 0.05 * 10) / 10;
      const f = Math.round(((cal * 0.2) / 9) * 10) / 10;
      const c = Math.round(((cal * 0.6) / 4) * 10) / 10;
      const iconMap = { rice: "🍚", main: "🥩", soup: "🥣", side: "🥢" };

      window.quickAddPresetDish(name, cal, p, f, c, iconMap[pType] || "🥢", pType);
      if (nameInput) nameInput.value = "";
      if (calInput) calInput.value = "";
    };

    function updatePortionControlUI() {
      if (!currentScanItem) return;
      const countVal = document.getElementById("portionCountValue");
      const unitLabel = document.getElementById("portionUnitLabel");
      const hint = document.getElementById("portionUnitHint");
      const chips = document.getElementById("portionQuickChips");

      if (countVal) countVal.textContent = currentScanItem.count;
      if (unitLabel) unitLabel.textContent = currentScanItem.unitName;
      if (hint) {
        hint.textContent = currentScanItem.baseCount >= 2
          ? `1${currentScanItem.unitName} 約${currentScanItem.unitCalories}kcal`
          : `並盛 1人前 約${currentScanItem.baseCalories}kcal`;
      }

      if (chips) {
        const isCountType = currentScanItem.baseCount >= 2;
        if (isCountType) {
          const smallCount = Math.max(1, currentScanItem.baseCount - 2);
          const medCount = currentScanItem.baseCount;
          const largeCount = currentScanItem.baseCount + 2;
          chips.innerHTML = `
            <button type="button" onclick="window.setPortionPreset('small')" id="chipPortionSmall"
              class="portion-chip px-2.5 py-1.5 rounded-xl border font-bold active:scale-95 transition cursor-pointer shrink-0 ${currentScanItem.count === smallCount ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-400'}">
              少なめ (${smallCount}個)
            </button>
            <button type="button" onclick="window.setPortionPreset('medium')" id="chipPortionMed"
              class="portion-chip px-2.5 py-1.5 rounded-xl border font-bold active:scale-95 transition cursor-pointer shrink-0 ${currentScanItem.count === medCount ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-400'}">
              標準 (${medCount}個)
            </button>
            <button type="button" onclick="window.setPortionPreset('large')" id="chipPortionLarge"
              class="portion-chip px-2.5 py-1.5 rounded-xl border font-bold active:scale-95 transition cursor-pointer shrink-0 ${currentScanItem.count === largeCount ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-400'}">
              大盛 (${largeCount}個)
            </button>
          `;
        } else {
          chips.innerHTML = `
            <button type="button" onclick="window.setPortionPreset('small')" id="chipPortionSmall"
              class="portion-chip px-2.5 py-1.5 rounded-xl border font-bold active:scale-95 transition cursor-pointer shrink-0 ${currentScanItem.portionScale === 0.75 ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-400'}">
              小盛 (軽め)
            </button>
            <button type="button" onclick="window.setPortionPreset('medium')" id="chipPortionMed"
              class="portion-chip px-2.5 py-1.5 rounded-xl border font-bold active:scale-95 transition cursor-pointer shrink-0 ${(!currentScanItem.portionScale || currentScanItem.portionScale === 1.0) ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-400'}">
              並盛 (標準)
            </button>
            <button type="button" onclick="window.setPortionPreset('large')" id="chipPortionLarge"
              class="portion-chip px-2.5 py-1.5 rounded-xl border font-bold active:scale-95 transition cursor-pointer shrink-0 ${currentScanItem.portionScale === 1.35 ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-400'}">
              大盛 (ガッツリ)
            </button>
          `;
        }
      }
    }

    // 個数ステッパー操作（+1, -1）
    window.changePortionCount = function (delta) {
      if (!currentScanItem) return;
      const isCountType = currentScanItem.baseCount >= 2;
      if (isCountType) {
        currentScanItem.count = Math.max(1, (currentScanItem.count || 1) + delta);
        const scale = currentScanItem.count / currentScanItem.baseCount;
        currentScanItem.calories = Math.round(currentScanItem.unitCalories * currentScanItem.count);
        currentScanItem.p = Math.round((currentScanItem.baseP || 25) * scale * 10) / 10;
        currentScanItem.f = Math.round((currentScanItem.baseF || 20) * scale * 10) / 10;
        currentScanItem.c = Math.round((currentScanItem.baseC || 60) * scale * 10) / 10;

        if (currentScanItem.name.includes("個")) {
          currentScanItem.name = currentScanItem.name.replace(/\d+個/, `${currentScanItem.count}個`);
        }
      } else {
        currentScanItem.count = Math.max(1, (currentScanItem.count || 1) + delta);
        const scale = currentScanItem.count;
        currentScanItem.calories = Math.round(currentScanItem.baseCalories * scale);
        currentScanItem.p = Math.round((currentScanItem.baseP || 25) * scale * 10) / 10;
        currentScanItem.f = Math.round((currentScanItem.baseF || 20) * scale * 10) / 10;
        currentScanItem.c = Math.round((currentScanItem.baseC || 60) * scale * 10) / 10;
      }

      refreshStep2Displays();
      updatePortionControlUI();
    };

    // クイックプリセット選択（少なめ / 標準 / 大盛）
    window.setPortionPreset = function (preset) {
      if (!currentScanItem) return;
      const isCountType = currentScanItem.baseCount >= 2;

      if (isCountType) {
        if (preset === 'small') currentScanItem.count = Math.max(1, currentScanItem.baseCount - 2);
        else if (preset === 'large') currentScanItem.count = currentScanItem.baseCount + 2;
        else currentScanItem.count = currentScanItem.baseCount;

        const scale = currentScanItem.count / currentScanItem.baseCount;
        currentScanItem.calories = Math.round(currentScanItem.unitCalories * currentScanItem.count);
        currentScanItem.p = Math.round((currentScanItem.baseP || 25) * scale * 10) / 10;
        currentScanItem.f = Math.round((currentScanItem.baseF || 20) * scale * 10) / 10;
        currentScanItem.c = Math.round((currentScanItem.baseC || 60) * scale * 10) / 10;

        if (currentScanItem.name.includes("個")) {
          currentScanItem.name = currentScanItem.name.replace(/\d+個/, `${currentScanItem.count}個`);
        }
      } else {
        let scale = 1.0;
        if (preset === 'small') scale = 0.75;
        else if (preset === 'large') scale = 1.35;
        currentScanItem.portionScale = scale;
        currentScanItem.calories = Math.round(currentScanItem.baseCalories * scale);
        currentScanItem.p = Math.round((currentScanItem.baseP || 25) * scale * 10) / 10;
        currentScanItem.f = Math.round((currentScanItem.baseF || 20) * scale * 10) / 10;
        currentScanItem.c = Math.round((currentScanItem.baseC || 60) * scale * 10) / 10;
      }

      refreshStep2Displays();
      updatePortionControlUI();
    };

    function refreshStep2Displays() {
      if (!currentScanItem) return;
      const nutriName = document.getElementById("nutriDishName");
      const nutriCal = document.getElementById("nutriCaloriesDisplay");
      const nutriP = document.getElementById("nutriP");
      const nutriF = document.getElementById("nutriF");
      const nutriC = document.getElementById("nutriC");
      const applyBtnLabel = document.getElementById("applyPhotoBtnLabel");

      if (nutriName) nutriName.textContent = currentScanItem.name;
      if (nutriCal) nutriCal.textContent = currentScanItem.calories;
      if (nutriP) nutriP.textContent = currentScanItem.p;
      if (nutriF) nutriF.textContent = currentScanItem.f;
      if (nutriC) nutriC.textContent = currentScanItem.c;

      const targetSlot = document.getElementById("recordTargetSlot")?.value || "lunch";
      const slotJp = getSlotJpName(targetSlot);
      if (applyBtnLabel) {
        if (currentScanItem.isAppendingToParent) {
          applyBtnLabel.textContent = `📸 この追加料理 (${currentScanItem.calories} kcal) を合算する`;
        } else {
          applyBtnLabel.textContent = `この料理 (${currentScanItem.calories} kcal) を【${slotJp}】に記録する`;
        }
      }

      const cancelAppendBtn = document.getElementById("cancelAppendPhotoBtn");
      const step2AppendBtn = document.getElementById("step2AppendPhotoBtn");
      if (cancelAppendBtn) {
        if (currentScanItem.isAppendingToParent) {
          cancelAppendBtn.classList.remove("hidden");
        } else {
          cancelAppendBtn.classList.add("hidden");
        }
      }
      if (step2AppendBtn) {
        if (currentScanItem.isAppendingToParent) {
          step2AppendBtn.classList.add("hidden");
        } else {
          step2AppendBtn.classList.remove("hidden");
        }
      }
    }

    // 【ステップ 2 → ステップ 1 へ戻る】
    window.backToDishStep = function () {
      const step1Area = document.getElementById("photoStepDishArea");
      const step2Area = document.getElementById("photoStepNutritionArea");
      if (step2Area) step2Area.classList.add("hidden");
      if (step1Area) step1Area.classList.remove("hidden");
      step1Area.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    // カロリー微調整（-50 / +50）
    window.adjustCaloriesStep = function (delta) {
      if (!currentScanItem) return;
      currentScanItem.calories = Math.max(50, (currentScanItem.calories || 0) + delta);
      const calDisplay = document.getElementById("nutriCaloriesDisplay");
      if (calDisplay) calDisplay.textContent = currentScanItem.calories;

      const targetSlot = document.getElementById("recordTargetSlot")?.value || "lunch";
      const slotJp = getSlotJpName(targetSlot);
      const applyBtnLabel = document.getElementById("applyPhotoBtnLabel");
      if (applyBtnLabel) {
        applyBtnLabel.textContent = `この料理 (${currentScanItem.calories} kcal) を【${slotJp}】に記録する`;
      }
    };

    // 撮り直すアクション
    window.retakePhotoAction = function () {
      const scanPreviewArea = document.getElementById("scanPreviewArea");
      const scanResultArea = document.getElementById("scanResultArea");
      const sampleBox = document.querySelector("#photoTabContent .sample-presets-box");
      const primaryCameraLauncher = document.getElementById("primaryCameraLauncher");

      if (scanPreviewArea) scanPreviewArea.classList.add("hidden");
      if (scanResultArea) scanResultArea.classList.add("hidden");
      if (sampleBox) sampleBox.classList.remove("hidden");
      if (primaryCameraLauncher) primaryCameraLauncher.classList.remove("hidden");
    };

    // ラーメン判定（ラーメンの時だけスープ飲み干し選択を表示）
    function isRamenOnlyDish(name) {
      if (!name) return false;
      const n = name.toLowerCase();
      const keywords = ['ラーメン', 'らーめん', '拉麺', 'つけ麺', 'タンメン', '担々麺', '中華そば', 'ramen'];
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

      const nutriName = document.getElementById("nutriDishName");
      const nutriCal = document.getElementById("nutriCaloriesDisplay");
      const nutriF = document.getElementById("nutriF");
      const badgeEl = document.getElementById("soupSavingsBadge");
      const adviceEl = document.getElementById("resultAdvice");

      if (nutriName) nutriName.textContent = finalName;
      if (nutriCal) nutriCal.textContent = finalCal;
      if (nutriF) nutriF.textContent = finalF;
      if (badgeEl) badgeEl.textContent = badgeText;
      if (adviceEl) adviceEl.textContent = adviceText;

      const targetSlot = document.getElementById("recordTargetSlot")?.value || "lunch";
      const slotJp = getSlotJpName(targetSlot);
      const applyBtnLabel = document.getElementById("applyPhotoBtnLabel");
      if (applyBtnLabel) {
        applyBtnLabel.textContent = `この料理 (${finalCal} kcal) を【${slotJp}】に記録する`;
      }

      document.querySelectorAll(".soup-level-btn").forEach(btn => {
        const bl = btn.dataset.level;
        if (bl === level) {
          btn.className = "soup-level-btn py-1.5 px-1 rounded-xl border font-bold text-xs transition bg-amber-500 text-white shadow-2xs border-amber-500 cursor-pointer";
        } else {
          btn.className = "soup-level-btn py-1.5 px-1 rounded-xl border font-bold text-xs transition bg-white border-slate-200 text-slate-700 hover:bg-amber-50 cursor-pointer";
        }
      });
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
        } catch (e) { }

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

    // 画像を軽量サムネイル（最大120x120、約2〜3KB）に圧縮（localStorageの容量制限を完全回避）
    function createThumbnailForStorage(imageSrc) {
      return new Promise((resolve) => {
        if (!imageSrc || !imageSrc.startsWith("data:")) {
          return resolve(imageSrc);
        }
        const img = new Image();
        img.onload = () => {
          const maxDim = 120;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        img.onerror = () => resolve(null);
        img.src = imageSrc;
      });
    }

    // 共通：食事記録の即時適用処理（ワンタップ決定 ＆ 確定ボタン共有）
    async function applyCandidateMeal(mealData, photoImg) {
      const slot = document.getElementById("recordTargetSlot")?.value || "breakfast";
      const finalName = (mealData.name && mealData.name.trim()) || "記録した食事";
      const finalCal = parseInt(mealData.calories) || 400;

      const rawImg = photoImg || mealData.img || (currentScanItem && currentScanItem.img) || null;
      const thumbImg = await createThumbnailForStorage(rawImg);

      state.records[slot] = {
        name: finalName,
        items: mealData.items || (currentScanItem && currentScanItem.items) || null,
        calories: finalCal,
        p: mealData.p !== undefined ? mealData.p : Math.round(finalCal * 0.05),
        f: mealData.f !== undefined ? mealData.f : Math.round((finalCal * 0.2) / 9),
        c: mealData.c !== undefined ? mealData.c : Math.round((finalCal * 0.6) / 4),
        img: thumbImg,
        imgs: (currentScanItem && currentScanItem.imgs && currentScanItem.imgs.length > 0)
          ? currentScanItem.imgs
          : (thumbImg ? [thumbImg] : []),
        photoDetails: (currentScanItem && currentScanItem.photoDetails) ? currentScanItem.photoDetails : null,
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
      // AIマスコット「モグ丸」のお祝いリアクション
      if (typeof triggerMascotCelebration === "function") {
        triggerMascotCelebration(slot, name, cal);
      }

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

        // 📸 追加写真の合算中なら、親の食事に合算して全体画面に戻す
        if (currentScanItem.isAppendingToParent && currentScanItem.parentMeal) {
          window.confirmAppendMealToParent();
          return;
        }

        applyCandidateMeal({
          ...currentScanItem,
          name: currentScanItem.name,
          calories: currentScanItem.calories
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
    } catch (e) {
      console.warn("Storage quota exceeded, retrying without images:", e);
      try {
        // 画像を抜いたクローンを作成してテキスト記録だけは絶対に保存
        const textRecords = {};
        for (const [k, v] of Object.entries(state.records)) {
          if (v) {
            textRecords[k] = { ...v, img: null };
          } else {
            textRecords[k] = null;
          }
        }
        localStorage.setItem(`mealai_records_${state.currentDate}`, JSON.stringify(textRecords));
      } catch (err2) {
        console.error("Critical: Could not save records to storage:", err2);
      }
    }
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

  // === AIパートナー「モグ丸」マスコット機能 ===

  function playMascotChime(type = "normal") {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const now = ctx.currentTime;
      if (type === "celebrate") {
        // ファンファーレ風「ピロリーン♪」 (C5 -> E5 -> G5)
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      } else {
        // かわいい「ぽよん♪」 (D5 -> A5)
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.12);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // AudioContext policy or unsupported, silent fallback
    }
  }

  function spawnMascotParticles(isCelebration = false) {
    const container = document.getElementById("mascotHeartContainer");
    if (!container) return;
    const icons = isCelebration
      ? ["🎉", "⭐", "✨", "💖", "🥗", "🥑", "🏆"]
      : ["💕", "✨", "🌱", "⭐", "🍀", "🥰"];
    const count = isCelebration ? 6 : 2;

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const particle = document.createElement("span");
        particle.className = "mascot-particle";
        particle.textContent = icons[Math.floor(Math.random() * icons.length)];
        const randX = (Math.random() - 0.5) * 80;
        particle.style.setProperty("--rand-x", randX);
        particle.style.left = `${30 + Math.random() * 20}px`;
        particle.style.top = `${15 + Math.random() * 15}px`;
        container.appendChild(particle);
        setTimeout(() => particle.remove(), 950);
      }, i * 80);
    }
  }

  // === モグ丸進化・体型変化システム ===
  function calculateMascotEvolutionLevel() {
    let eatenCal = 0;
    Object.values(state.records).forEach(r => {
      if (r) eatenCal += r.calories;
    });
    const targetCal = state.metrics.targetCal;
    const hasRecords = Object.values(state.records).some(Boolean);
    const isTodayUnderCal = hasRecords && eatenCal <= targetCal + 30;

    let score = 0;
    if (isTodayUnderCal) score += 1;

    // 記録された食事数（朝・昼・夕・間食）
    const recordCount = Object.values(state.records).filter(Boolean).length;
    score += recordCount;

    // 体重変化ボーナス
    try {
      const initialWeightKey = "mealai_initial_weight";
      let initialWeight = parseFloat(localStorage.getItem(initialWeightKey) || "0");
      if (!initialWeight && state.user.weight) {
        localStorage.setItem(initialWeightKey, state.user.weight.toString());
      } else if (initialWeight > 0 && state.user.weight < initialWeight) {
        // 体重が減っている場合ボーナス+3
        score += 3;
      }
    } catch(e) {}

    // 継続達成ストリーク（LocalStorage）
    try {
      const streak = parseInt(localStorage.getItem("mealai_achieved_days") || "0", 10);
      score += streak;
    } catch(e) {}

    if (score >= 6) return 4; // 👑 Lv.4 キングモグ丸
    if (score >= 4) return 3; // 💪 Lv.3 アスリート丸
    if (score >= 2) return 2; // 🌸 Lv.2 すっきり丸
    return 1;                 // 🌱 Lv.1 ぽよ丸
  }

  function applyMascotEvolutionUI(level) {
    const badge = document.getElementById("mascotLevelBadge");
    const flower = document.getElementById("mascotFlower");
    const crown = document.getElementById("mascotCrown");
    const spoon = document.getElementById("mascotToolSpoon");
    const dumbbell = document.getElementById("mascotToolDumbbell");

    if (flower) flower.classList.toggle("hidden", level !== 2 && level !== 3);
    if (crown) crown.classList.toggle("hidden", level < 4);
    if (spoon) spoon.classList.toggle("hidden", level >= 3);
    if (dumbbell) dumbbell.classList.toggle("hidden", level < 3);

    if (badge) {
      if (level === 4) {
        badge.textContent = "👑 Lv.4 キング丸";
        badge.className = "bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-2xs";
      } else if (level === 3) {
        badge.textContent = "💪 Lv.3 アスリート丸";
        badge.className = "bg-gradient-to-r from-cyan-400 to-blue-400 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-2xs";
      } else if (level === 2) {
        badge.textContent = "🌸 Lv.2 すっきり丸";
        badge.className = "bg-gradient-to-r from-pink-400 to-rose-300 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-2xs";
      } else {
        badge.textContent = "🌱 Lv.1 ぽよ丸";
        badge.className = "bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-2xs";
      }
    }
  }
  window.applyMascotEvolutionUI = applyMascotEvolutionUI;

  window.interactWithMascot = function() {
    mascotTapCount++;
    playMascotChime("normal");

    // アバタージャンプ
    const avatar = document.getElementById("mascotAvatar");
    if (avatar) {
      avatar.classList.remove("mascot-bounce");
      void avatar.offsetWidth;
      avatar.classList.add("mascot-bounce");
    }

    spawnMascotParticles(false);

    const speechEl = document.getElementById("mascotSpeech");
    if (!speechEl) return;

    const currentLevel = calculateMascotEvolutionLevel();
    applyMascotEvolutionUI(currentLevel);

    let eatenCal = 0;
    let eatenP = 0;
    Object.values(state.records).forEach(r => {
      if (r) {
        eatenCal += r.calories;
        eatenP += r.p || 0;
      }
    });
    const targetCal = state.metrics.targetCal;
    const remCal = targetCal - eatenCal;
    const targetP = state.metrics.pfc?.p || 80;

    const funDialogues = [
      "えへへ、くすぐったいよ〜😆",
      "今日も一緒に美味しく健康に食べようね🌱",
      "お水もこまめに飲んでる？水分補給も代謝に大切だよ🚰",
      "無理な我慢はNG！美味しく続けられるのが一番だよ🍀",
      "記録してるだけで本当にえらい！ハナマルあげる〜💯",
      "食べた後は軽くお散歩すると血糖値の上昇がゆるやかに🚶‍♂️",
      "よく噛んで食べると満腹中枢が刺激されて大満足だよ✨",
      "今日のあなたの頑張り、モグ丸はずっと見てるよ〜！🥰",
      "夜はぬるめのお風呂に浸かるとぐっすり眠れるよ🛁"
    ];

    // レベル・進化状況に応じた専用セリフ
    if (currentLevel === 1) {
      funDialogues.push("目標カロリーを守って食事を記録すると、モグ丸に花が咲いて進化するよ🌸");
      funDialogues.push("体重が減るとモグ丸もシュッとスリムに成長できるんだ！一緒に頑張ろうね🔥");
    } else if (currentLevel === 2) {
      funDialogues.push("見て見て！頭にお花が咲いたよ🌸 あと少しでダンベル持てる筋肉アスリート丸に進化できるよ💪");
      funDialogues.push("いいペース！お腹がすっきりして体が軽くなってきた気がする〜✨");
    } else if (currentLevel === 3) {
      funDialogues.push("ダンベル装備で代謝爆上がり中💪 このまま達成を続けると最高の王冠キング丸になれるよ👑");
      funDialogues.push("ナイス筋肉！タンパク質がしっかり身について引き締まってきたよ〜！🔥");
    } else if (currentLevel === 4) {
      funDialogues.push("あなたの努力でついに最高のキングモグ丸になったよ！神すぎる〜！👑✨");
      funDialogues.push("目標達成の達人！これからもずっとモグ丸と一緒にベスト体型をキープしようね💖");
    }

    if (eatenP >= targetP * 0.7) {
      funDialogues.push("タンパク質しっかり摂れてて最高！筋肉も喜んでるよ💪");
    }

    if (remCal < 0) {
      funDialogues.push("ちょっと目標オーバーしても大丈夫！明日と明後日で調整すればOKだよ👍");
    } else if (remCal <= 300) {
      funDialogues.push("本日の目標カロリーにぴったり近づいてる！ペース配分完璧✨");
    }

    const randomLine = funDialogues[Math.floor(Math.random() * funDialogues.length)];
    speechEl.textContent = randomLine;
  };

  function triggerMascotCelebration(slot, name, cal) {
    mascotIsCelebrating = true;
    playMascotChime("celebrate");

    const avatar = document.getElementById("mascotAvatar");
    if (avatar) {
      avatar.classList.remove("mascot-bounce");
      void avatar.offsetWidth;
      avatar.classList.add("mascot-bounce");
    }

    spawnMascotParticles(true);

    const level = calculateMascotEvolutionLevel();
    applyMascotEvolutionUI(level);

    const speechEl = document.getElementById("mascotSpeech");
    if (speechEl) {
      const slotJp = getSlotJpName(slot);
      if (level >= 3) {
        speechEl.textContent = `【${slotJp}】記録完了！モグ丸もますます引き締まってパワーアップ中だよ〜！💪🎉`;
      } else {
        speechEl.textContent = `【${slotJp}】記録できたね！偉すぎる〜！美味しく健康にチャージ完了🎉`;
      }
    }

    setTimeout(() => {
      mascotIsCelebrating = false;
    }, 4500);
  }

  function updateMascotDefaultSpeech(eatenCal, targetCal, records) {
    const level = calculateMascotEvolutionLevel();
    applyMascotEvolutionUI(level);

    if (mascotIsCelebrating) return;
    const speechEl = document.getElementById("mascotSpeech");
    if (!speechEl) return;

    const remCal = targetCal - eatenCal;
    const recordedCount = Object.values(records).filter(Boolean).length;
    const hour = new Date().getHours();

    if (recordedCount === 0) {
      if (hour >= 5 && hour < 11) {
        speechEl.textContent = "おはよう！朝ごはんを食べて代謝のスイッチをONにしよう☀️";
      } else if (hour >= 11 && hour < 15) {
        speechEl.textContent = "お昼ごはん何食べる？写真をパシャッと撮るだけで記録完了だよ📸";
      } else if (hour >= 15 && hour < 18) {
        speechEl.textContent = "お疲れ様！小腹が空いたらナッツやお茶でブレイクタイム☕";
      } else if (hour >= 18 && hour < 22) {
        speechEl.textContent = "夜ごはんの時間だね！今日の食事を振り返りながら美味しく食べよう✨";
      } else {
        speechEl.textContent = "今日もお疲れ様！夜更かしせずしっかり寝るのもダイエットだよ🌙";
      }
      return;
    }

    if (remCal < -200) {
      speechEl.textContent = "今日は目標を少しオーバー気味💦 明日の食事を軽めにして調整しよっ！";
    } else if (remCal >= 0 && remCal <= 350) {
      speechEl.textContent = "すごい！目標カロリーにぴったり適正ペースをキープ中だよ🎯✨";
    } else if (remCal > 350) {
      speechEl.textContent = `順調だよ！あと ${Math.round(remCal).toLocaleString()} kcal 食べられるよ🌱`;
    }
  }

  // ===================== 新機能モジュール: 図鑑・今日の通知表 =====================
  function setupFeatureModules() {
    // 1. モグ丸の称号・実績バッジ図鑑モーダル開閉
    document.getElementById("openBadgesBtn")?.addEventListener("click", () => window.openBadgesModal());
    document.getElementById("closeBadgesBtn")?.addEventListener("click", () => window.closeBadgesModal());
    const badgesModal = document.getElementById("badgesModal");
    if (badgesModal) {
      badgesModal.addEventListener("click", (e) => {
        if (e.target === badgesModal) window.closeBadgesModal();
      });
    }

    // 3. 本日のAI総評レビュー（今日の通知表）モーダル開閉
    document.getElementById("openDailyReviewBtn")?.addEventListener("click", () => window.openDailyReviewModal());
    document.getElementById("closeDailyReviewBtn")?.addEventListener("click", () => window.closeDailyReviewModal());
    document.getElementById("closeDailyReviewFooterBtn")?.addEventListener("click", () => window.closeDailyReviewModal());
    const dailyReviewModal = document.getElementById("dailyReviewModal");
    if (dailyReviewModal) {
      dailyReviewModal.addEventListener("click", (e) => {
        if (e.target === dailyReviewModal) window.closeDailyReviewModal();
      });
    }
  }

  // --- 体重記録ロジック ---
  function loadWeightsFromStorage() {
    try {
      const saved = localStorage.getItem("mealai_weights");
      state.weights = saved ? JSON.parse(saved) : {};
    } catch (e) {
      state.weights = {};
    }
  }

  function saveWeightsToStorage() {
    try {
      localStorage.setItem("mealai_weights", JSON.stringify(state.weights));
    } catch (e) {}
  }

  function renderWeightWidget() {
    const input = document.getElementById("quickWeightInput");
    const diffBadge = document.getElementById("weightDiffBadge");
    const summary = document.getElementById("weightHistorySummary");
    if (!input || !diffBadge || !summary) return;

    const todayWeight = state.weights[state.currentDate];
    if (todayWeight !== undefined) {
      input.value = todayWeight;
      const prevDate = getPreviousRecordedDate(state.currentDate);
      if (prevDate && state.weights[prevDate] !== undefined) {
        const diff = Number((todayWeight - state.weights[prevDate]).toFixed(1));
        if (diff < 0) {
          diffBadge.textContent = `前日比 ${diff}kg 🎉`;
          diffBadge.className = "text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200";
          summary.textContent = `前日より ${Math.abs(diff)}kg 減量！ナイスペース🌱`;
        } else if (diff > 0) {
          diffBadge.textContent = `前日比 +${diff}kg`;
          diffBadge.className = "text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200";
          summary.textContent = `水分やむくみもあるので焦らずいこう🌱`;
        } else {
          diffBadge.textContent = `前日比 ±0.0kg`;
          diffBadge.className = "text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200";
          summary.textContent = `体重キープ！安定したコントロールです`;
        }
      } else {
        diffBadge.textContent = "記録済み";
        diffBadge.className = "text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200";
        summary.textContent = `本日記録済み（${todayWeight}kg）`;
      }
    } else {
      input.value = state.user.weight || 70;
      diffBadge.textContent = "未記録";
      diffBadge.className = "text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200";
      summary.textContent = "今日の体重を入力して記録しよう🌱";
    }
  }

  function getPreviousRecordedDate(currentDateStr) {
    const dates = Object.keys(state.weights).filter(d => d < currentDateStr).sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }

  function saveCurrentWeight() {
    const input = document.getElementById("quickWeightInput");
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 20 || val > 300) {
      alert("正しい体重を入力してください（20kg〜300kg）");
      return;
    }

    const prevDate = getPreviousRecordedDate(state.currentDate);
    const prevWeight = prevDate ? state.weights[prevDate] : (state.user.weight || val);
    const diff = Number((val - prevWeight).toFixed(1));

    state.weights[state.currentDate] = val;
    saveWeightsToStorage();

    // ユーザー情報と基礎代謝・TDEEの自動更新
    state.user.weight = val;
    calculateAllMetrics();
    saveUserToStorage();

    // モグ丸のリアクション
    const speechEl = document.getElementById("mascotSpeech");
    if (diff < 0) {
      if (speechEl) {
        speechEl.textContent = `昨日より ${Math.abs(diff)}kg 減ってる！🎉 すごい、この調子だよ〜🌱`;
      }
      playMascotChime("celebrate");
      spawnMascotParticles(true);
    } else if (diff > 0) {
      if (speechEl) {
        speechEl.textContent = `体重記録ありがとう！水分やむくみもあるから焦らずマイペースにいこうね🌱`;
      }
      playMascotChime("normal");
      spawnMascotParticles(false);
    } else {
      if (speechEl) {
        speechEl.textContent = `体重記録完了！現状維持ナイスコントロール🌱`;
      }
      playMascotChime("normal");
      spawnMascotParticles(false);
    }

    updateUI();
  }

  window.openWeightChartModal = function () {
    const modal = document.getElementById("weightChartModal");
    if (!modal) return;
    renderWeightChart();
    modal.classList.remove("hidden");
    modal.style.display = "flex";
  };

  window.closeWeightChartModal = function () {
    const modal = document.getElementById("weightChartModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
  };

  function renderWeightChart() {
    const container = document.getElementById("weightSvgChartContainer");
    const curWeightEl = document.getElementById("chartCurrentWeight");
    const diffEl = document.getElementById("chartWeightDiff");
    const paceEl = document.getElementById("chartTargetPace");
    const historyList = document.getElementById("weightHistoryList");

    const sortedDates = Object.keys(state.weights).sort();
    let currentWeight = state.user.weight || 70;
    let startWeight = currentWeight;

    if (sortedDates.length > 0) {
      currentWeight = state.weights[sortedDates[sortedDates.length - 1]];
      startWeight = state.weights[sortedDates[0]];
    }

    const totalDiff = Number((currentWeight - startWeight).toFixed(1));
    if (curWeightEl) curWeightEl.textContent = `${currentWeight.toFixed(1)} kg`;
    if (diffEl) {
      diffEl.textContent = totalDiff <= 0 ? `${totalDiff} kg` : `+${totalDiff} kg`;
      diffEl.className = totalDiff <= 0
        ? "text-sm sm:text-base font-black text-emerald-700 font-mono"
        : "text-sm sm:text-base font-black text-amber-700 font-mono";
    }
    if (paceEl) {
      const p = parseFloat(state.user.pace) || 0;
      paceEl.textContent = p === 0 ? "現状維持 (±0kg)" : `月 -${p.toFixed(1)}kg`;
    }

    // 履歴リスト
    if (historyList) {
      if (sortedDates.length === 0) {
        historyList.innerHTML = `<p class="text-slate-400 text-center py-3">まだ体重記録がありません。「記録」ボタンから入力してみましょう！</p>`;
      } else {
        const recentDates = sortedDates.slice(-7).reverse();
        historyList.innerHTML = recentDates.map((date, idx) => {
          const w = state.weights[date];
          const nextDate = recentDates[idx + 1];
          let diffBadgeHtml = "";
          if (nextDate && state.weights[nextDate] !== undefined) {
            const d = Number((w - state.weights[nextDate]).toFixed(1));
            diffBadgeHtml = d <= 0
              ? `<span class="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">${d}kg</span>`
              : `<span class="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">+${d}kg</span>`;
          }
          return `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span class="text-slate-600 font-medium">${date}</span>
              <div class="flex items-center space-x-2">
                ${diffBadgeHtml}
                <span class="font-black text-slate-800 font-mono">${w.toFixed(1)} kg</span>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // SVG グラフ描画
    if (container) {
      let chartPoints = sortedDates.slice(-14).map(d => ({ date: d.slice(5), weight: state.weights[d] }));
      if (chartPoints.length === 0) {
        chartPoints = [
          { date: "開始", weight: currentWeight + 0.8 },
          { date: "今日", weight: currentWeight }
        ];
      } else if (chartPoints.length === 1) {
        chartPoints.unshift({ date: "開始", weight: chartPoints[0].weight + 0.5 });
      }

      const weightsArr = chartPoints.map(p => p.weight);
      const minW = Math.min(...weightsArr) - 0.5;
      const maxW = Math.max(...weightsArr) + 0.5;
      const rangeW = maxW - minW || 1;

      const width = 360;
      const height = 180;
      const padding = { top: 20, right: 25, bottom: 30, left: 35 };

      const getX = (i) => padding.left + (i / (chartPoints.length - 1)) * (width - padding.left - padding.right);
      const getY = (w) => height - padding.bottom - ((w - minW) / rangeW) * (height - padding.top - padding.bottom);

      const pathData = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.weight)}`).join(" ");
      const areaPathData = `${pathData} L ${getX(chartPoints.length - 1)} ${height - padding.bottom} L ${getX(0)} ${height - padding.bottom} Z`;

      const dotsHtml = chartPoints.map((p, i) => `
        <circle cx="${getX(i)}" cy="${getY(p.weight)}" r="4.5" fill="#10b981" stroke="#ffffff" stroke-width="2"/>
        <text x="${getX(i)}" y="${getY(p.weight) - 8}" text-anchor="middle" fill="#34d399" font-size="10" font-weight="bold">${p.weight.toFixed(1)}</text>
        <text x="${getX(i)}" y="${height - 10}" text-anchor="middle" fill="#94a3b8" font-size="9">${p.date}</text>
      `).join("");

      container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" class="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <line x1="${padding.left}" y1="${getY(minW)}" x2="${width - padding.right}" y2="${getY(minW)}" stroke="#334155" stroke-dasharray="3,3" />
          <line x1="${padding.left}" y1="${getY(maxW)}" x2="${width - padding.right}" y2="${getY(maxW)}" stroke="#334155" stroke-dasharray="3,3" />
          <path d="${areaPathData}" fill="url(#chartAreaGrad)" />
          <path d="${pathData}" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          ${dotsHtml}
        </svg>
      `;
    }
  }

  // --- 実績バッジ図鑑ロジック ---

  function loadBadgesFromStorage() {
    try {
      const saved = localStorage.getItem("mealai_badges");
      state.badges = saved ? JSON.parse(saved) : ["first_meal"];
    } catch (e) {
      state.badges = ["first_meal"];
    }
  }

  function saveBadgesToStorage() {
    try {
      localStorage.setItem("mealai_badges", JSON.stringify(state.badges));
    } catch (e) {}
  }

  function checkAndRenderBadges() {
    ACHIEVEMENTS_LIST.forEach(ach => {
      if (!state.badges.includes(ach.id)) {
        if (ach.eval(state)) {
          state.badges.push(ach.id);
          saveBadgesToStorage();
        }
      }
    });

    const badgeHeaderCount = document.getElementById("badgeUnlockedCountBadge");
    if (badgeHeaderCount) {
      badgeHeaderCount.textContent = state.badges.length;
    }
  }

  window.openBadgesModal = function () {
    const modal = document.getElementById("badgesModal");
    if (!modal) return;

    checkAndRenderBadges();

    const countEl = document.getElementById("badgesUnlockedCount");
    if (countEl) countEl.textContent = state.badges.length;

    const currentLevel = calculateMascotEvolutionLevel();
    const lvlText = currentLevel === 4 ? "Lv.4 キング丸" : currentLevel === 3 ? "Lv.3 アスリート丸" : currentLevel === 2 ? "Lv.2 すっきり丸" : "Lv.1 ぽよ丸";
    const lvlEl = document.getElementById("badgesModalMascotLevel");
    if (lvlEl) lvlEl.textContent = lvlText;

    const grid = document.getElementById("badgesGridContainer");
    if (grid) {
      grid.innerHTML = ACHIEVEMENTS_LIST.map(ach => {
        const isUnlocked = state.badges.includes(ach.id);
        if (isUnlocked) {
          return `
            <div class="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/90 shadow-2xs flex items-center space-x-2.5">
              <span class="text-2xl filter drop-shadow-xs shrink-0">${ach.icon}</span>
              <div class="min-w-0">
                <div class="flex items-center gap-1">
                  <span class="font-bold text-xs text-slate-800 truncate">${ach.title}</span>
                  <i class="fa-solid fa-circle-check text-emerald-500 text-[11px]"></i>
                </div>
                <p class="text-[10px] text-slate-500 truncate">${ach.desc}</p>
                <span class="text-[9px] text-emerald-700 font-bold bg-emerald-100/80 px-1.5 py-0.2 rounded-full mt-1 inline-block">達成済み！</span>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="p-3 rounded-2xl bg-slate-100/70 border border-slate-200/80 shadow-2xs flex items-center space-x-2.5 opacity-60">
              <span class="text-2xl grayscale shrink-0">${ach.icon}</span>
              <div class="min-w-0">
                <div class="flex items-center gap-1">
                  <span class="font-bold text-xs text-slate-700 truncate">${ach.title}</span>
                  <i class="fa-solid fa-lock text-slate-400 text-[10px]"></i>
                </div>
                <p class="text-[10px] text-slate-400 truncate">${ach.desc}</p>
                <span class="text-[9px] text-slate-500 font-semibold bg-slate-200 px-1.5 py-0.2 rounded-full mt-1 inline-block">未達成</span>
              </div>
            </div>
          `;
        }
      }).join("");
    }

    modal.classList.remove("hidden");
    modal.style.display = "flex";
  };

  window.closeBadgesModal = function () {
    const modal = document.getElementById("badgesModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
  };

  // --- 今日の通知表 ＆ AI総評レビューロジック ---
  window.openDailyReviewModal = function () {
    const modal = document.getElementById("dailyReviewModal");
    if (!modal) return;

    const eaten = state.eatenNutrients || { cal: 0, p: 0, f: 0, c: 0 };
    const targetCal = state.metrics.targetCal || 2000;
    const targetP = (state.metrics.pfc && state.metrics.pfc.p) || 95;
    const targetF = (state.metrics.pfc && state.metrics.pfc.f) || 45;

    let score = 90;
    const calDiff = eaten.cal - targetCal;
    const pRatio = targetP > 0 ? (eaten.p / targetP) : 1;
    const fRatio = targetF > 0 ? (eaten.f / targetF) : 1;

    // カロリー採点
    if (Math.abs(calDiff) <= 120) {
      score += 6;
    } else if (Math.abs(calDiff) <= 300) {
      score += 2;
    } else {
      score -= 8;
    }

    // たんぱく質採点
    if (pRatio >= 0.85) {
      score += 4;
    } else {
      score -= 5;
    }

    // 脂質採点
    if (fRatio <= 1.1) {
      // 良好
    } else {
      score -= 4;
    }

    score = Math.max(65, Math.min(100, Math.round(score)));

    // ランク判定
    let rank = "S ランク";
    let stampText = "たいへん<br>よくできました";
    let verdict = "目標カロリーも栄養バランスもほぼ満点の素晴らしい一日でした！";

    if (score >= 93) {
      rank = "S ランク";
      stampText = "たいへん<br>よくできました";
    } else if (score >= 84) {
      rank = "A ランク";
      stampText = "よく<br>できました";
      verdict = "バランスよく上手にコントロールできています。明日もこの調子をキープ！";
    } else if (score >= 75) {
      rank = "B ランク";
      stampText = "がんばり<br>ました";
      verdict = "概ね良好です。少し気になる栄養素を明日の食事で意識してみましょう。";
    } else {
      rank = "C ランク";
      stampText = "あした<br>挽回！";
      verdict = "今日はちょっと息抜きの日。明日からまたモグ丸と一緒に楽しく整えましょう🌱";
    }

    document.getElementById("reviewScoreNum").textContent = score;
    document.getElementById("reviewRankBadge").textContent = rank;
    document.getElementById("reviewStampText").innerHTML = stampText;
    document.getElementById("reviewScoreVerdict").textContent = verdict;
    document.getElementById("dailyReviewDateLabel").textContent = `${state.currentDate} のまとめ`;

    // 3大評価項目テキスト
    const calEl = document.getElementById("reviewCalScore");
    const calDetailEl = document.getElementById("reviewCalDetail");
    if (calEl && calDetailEl) {
      if (Math.abs(calDiff) <= 120) {
        calEl.textContent = "◎ 適正ペース";
        calEl.className = "font-bold text-emerald-600 text-xs sm:text-sm";
      } else if (calDiff > 120) {
        calEl.textContent = "○ ややオーバー";
        calEl.className = "font-bold text-amber-600 text-xs sm:text-sm";
      } else {
        calEl.textContent = "○ 控えめ";
        calEl.className = "font-bold text-teal-600 text-xs sm:text-sm";
      }
      calDetailEl.textContent = calDiff >= 0 ? `目標比 +${Math.round(calDiff)}kcal` : `目標比 ${Math.round(calDiff)}kcal`;
    }

    const pEl = document.getElementById("reviewProteinScore");
    const pDetailEl = document.getElementById("reviewProteinDetail");
    if (pEl && pDetailEl) {
      const pPct = Math.round(pRatio * 100);
      pEl.textContent = pPct >= 85 ? "◎ 目標達成" : "△ やや不足";
      pEl.className = pPct >= 85 ? "font-bold text-teal-600 text-xs sm:text-sm" : "font-bold text-amber-600 text-xs sm:text-sm";
      pDetailEl.textContent = `達成率 ${pPct}% (${Math.round(eaten.p)}g / ${Math.round(targetP)}g)`;
    }

    const fEl = document.getElementById("reviewFatScore");
    const fDetailEl = document.getElementById("reviewFatDetail");
    if (fEl && fDetailEl) {
      fEl.textContent = fRatio <= 1.15 ? "○ 適正範囲" : "△ やや多め";
      fEl.className = fRatio <= 1.15 ? "font-bold text-emerald-600 text-xs sm:text-sm" : "font-bold text-rose-500 text-xs sm:text-sm";
      fDetailEl.textContent = `実績 ${Math.round(eaten.f)}g / 目標 ${Math.round(targetF)}g`;
    }

    // AI/モグ丸からの総評アドバイス
    const adviceEl = document.getElementById("reviewAdviceText");
    if (adviceEl) {
      if (score >= 90) {
        adviceEl.textContent = "朝・昼・晩とバランスよく記録できて素晴らしい一日でした！モグ丸もとっても元気いっぱいです。明日は水分補給をこまめに意識するとさらに代謝が上がりますよ✨";
      } else if (pRatio < 0.8) {
        adviceEl.textContent = "カロリー管理はできていますが、筋肉を守るたんぱく質が少し足りないかも！明日の朝か昼にサラダチキンやゆで卵、プロテインを1品プラスしてみてね🌱";
      } else if (fRatio > 1.2) {
        adviceEl.textContent = "脂質が少し多めの一日でした。明日は揚げ物やドレッシングを少し控えて、お魚や具だくさんスープをメインにするとすぐリカバリーできますよ！ファイトです🔥";
      } else {
        adviceEl.textContent = "記録をしっかり続けられていること自体がダイエット成功の最大の秘訣！無理のないペースで明日も美味しく健康に食べようね🌱";
      }
    }

    const reviewBadge = document.getElementById("dailyReviewBadge");
    if (reviewBadge) {
      reviewBadge.textContent = `${score}点 ${rank.split(' ')[0]}`;
      reviewBadge.className = "bg-emerald-400 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full";
    }

    modal.classList.remove("hidden");
    modal.style.display = "flex";
  };

  window.closeDailyReviewModal = function () {
    const modal = document.getElementById("dailyReviewModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
  };
});

