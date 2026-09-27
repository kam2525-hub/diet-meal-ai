/**
 * calculator.js - 基礎代謝(BMR)・消費カロリー(TDEE)・目標カロリーおよびPFC計算
 */

const DietCalculator = {
  /**
   * 基礎代謝 (BMR: Basal Metabolic Rate) - Mifflin-St Jeor式
   */
  calculateBMR: function (gender, age, height, weight) {
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    if (gender === 'male') {
      bmr += 5;
    } else {
      bmr -= 161;
    }
    return Math.round(bmr);
  },

  /**
   * 1日の推定総消費カロリー (TDEE: Total Daily Energy Expenditure)
   */
  calculateTDEE: function (bmr, activityLevel) {
    return Math.round(bmr * parseFloat(activityLevel));
  },

  /**
   * 月間減量目標 (kg) から1日の目標カロリーを逆算
   * 脂肪1kg = 約7,200kcal
   */
  calculateTargetCalories: function (tdee, bmr, monthlyLossKg) {
    const monthlyDeficit = monthlyLossKg * 7200;
    const dailyDeficit = Math.round(monthlyDeficit / 30);
    let target = tdee - dailyDeficit;

    // 安全装置（セーフティ）：基礎代謝の90%を下回る極端な制限を防止
    const safeMinimum = Math.round(bmr * 0.95);
    let isLimited = false;

    if (target < safeMinimum) {
      target = safeMinimum;
      isLimited = true;
    }

    return {
      targetCalories: target,
      dailyDeficit: dailyDeficit,
      isLimited: isLimited,
      safeMinimum: safeMinimum
    };
  },

  /**
   * 目標カロリーから推奨PFCバランスを計算
   * - たんぱく質 (P): 体重 × 1.4〜1.6g (筋肉維持)
   * - 脂質 (F): 総カロリーの20〜25%
   * - 炭水化物 (C): 残りのカロリー
   */
  calculatePFC: function (targetCalories, weight) {
    // タンパク質: 体重 × 1.5g (1g = 4kcal)
    const pGrams = Math.round(weight * 1.5);
    const pCals = pGrams * 4;

    // 脂質: カロリーの約22% (1g = 9kcal)
    const fCals = targetCalories * 0.22;
    const fGrams = Math.round(fCals / 9);

    // 炭水化物: 残り (1g = 4kcal)
    const cCals = Math.max(0, targetCalories - (pCals + (fGrams * 9)));
    const cGrams = Math.round(cCals / 4);

    return {
      p: pGrams,
      f: fGrams,
      c: cGrams
    };
  },

  /**
   * 体型指数（ローレル指数 または BMI）の計算
   * - 小柄・学童期 (身長 <= 145cm または 年齢 < 18歳): ローレル指数
   * - 成人・標準以上: BMI
   */
  calculateBodyIndex: function (height, weight, age) {
    const h = parseFloat(height) || 160;
    const w = parseFloat(weight) || 55;
    const a = parseInt(age) || 25;
    const hM = h / 100;
    const isSmallOrYouth = (h <= 145) || (a < 18);

    if (isSmallOrYouth) {
      // ローレル指数: (体重kg / (身長cm)^3) * 10^7
      const rohrer = Math.round((w / Math.pow(h, 3)) * 10000000);
      let status = "普通（標準）";
      let statusColor = "emerald";
      if (rohrer < 100) {
        status = "やせすぎ";
        statusColor = "blue";
      } else if (rohrer < 115) {
        status = "やせぎみ";
        statusColor = "teal";
      } else if (rohrer <= 145) {
        status = "普通（適正）";
        statusColor = "emerald";
      } else if (rohrer <= 160) {
        status = "太りぎみ";
        statusColor = "amber";
      } else {
        status = "肥満";
        statusColor = "rose";
      }
      const standardWeight = Math.round(130 * Math.pow(hM, 3) * 10) / 10;
      return {
        isSmallOrYouth: true,
        primaryName: "ローレル指数",
        primaryValue: rohrer,
        status: status,
        statusColor: statusColor,
        standardWeight: standardWeight
      };
    } else {
      // BMI
      const bmi = Math.round((w / Math.pow(hM, 2)) * 10) / 10;
      let status = "普通体重";
      let statusColor = "emerald";
      if (bmi < 18.5) {
        status = "低体重（やせ）";
        statusColor = "blue";
      } else if (bmi < 25) {
        status = "普通体重（適正）";
        statusColor = "emerald";
      } else if (bmi < 30) {
        status = "肥満（1度）";
        statusColor = "amber";
      } else {
        status = "高度肥満";
        statusColor = "rose";
      }
      const standardWeight = Math.round(22 * Math.pow(hM, 2) * 10) / 10;
      return {
        isSmallOrYouth: false,
        primaryName: "BMI",
        primaryValue: bmi,
        status: status,
        statusColor: statusColor,
        standardWeight: standardWeight
      };
    }
  }
};
