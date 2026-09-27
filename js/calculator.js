/**
 * calculator.js - 基礎代謝(BMR)・消費カロリー(TDEE)・ローレル指数 / BMI 計算モジュール
 * 小柄な体格（低身長）や高校生・成長期でも計算が破綻しない適応アルゴリズムを搭載
 */

const DietCalculator = {
  /**
   * 体格指数の計算（ローレル指数 & BMI）
   * ※身長145cm以下、または高校生・小柄体型では三乗（体積比）のローレル指数を主指標として適用
   */
  calculateBodyIndex: function (height, weight, age) {
    const isSmallOrYouth = height <= 145 || age <= 18;

    // ローレル指数 (Rohrer Index) = (体重kg / 身長cm^3) * 10^7
    const rohrer = (weight / Math.pow(height, 3)) * 10000000;
    const roundedRohrer = Math.round(rohrer * 10) / 10;

    // 通常BMI = 体重kg / (身長m)^2
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    const roundedBmi = Math.round(bmi * 10) / 10;

    let status = "";
    let statusColor = "emerald";
    let standardWeight = 0;

    if (isSmallOrYouth) {
      // ローレル指数の基準値（学童・小柄体型）
      // 115〜145が標準
      standardWeight = Math.round((130 * Math.pow(height, 3) / 10000000) * 10) / 10;

      if (rohrer < 100) {
        status = "やせすぎ";
        statusColor = "blue";
      } else if (rohrer < 115) {
        status = "やせぎみ";
        statusColor = "teal";
      } else if (rohrer <= 145) {
        status = "標準（適正体型）";
        statusColor = "emerald";
      } else if (rohrer <= 160) {
        status = "太りぎみ";
        statusColor = "amber";
      } else {
        status = "肥満";
        statusColor = "rose";
      }
    } else {
      // 成人BMI基準（18.5〜25が標準、22が適正）
      standardWeight = Math.round((22 * heightM * heightM) * 10) / 10;

      if (bmi < 18.5) {
        status = "やせぎみ";
        statusColor = "blue";
      } else if (bmi < 25) {
        status = "標準（適正体重）";
        statusColor = "emerald";
      } else {
        status = "肥満ぎみ";
        statusColor = "rose";
      }
    }

    return {
      isSmallOrYouth: isSmallOrYouth,
      rohrer: roundedRohrer,
      bmi: roundedBmi,
      primaryType: isSmallOrYouth ? "rohrer" : "bmi",
      primaryValue: isSmallOrYouth ? roundedRohrer : roundedBmi,
      primaryName: isSmallOrYouth ? "ローレル指数" : "BMI",
      status: status,
      statusColor: statusColor,
      standardWeight: standardWeight
    };
  },

  /**
   * 基礎代謝 (BMR: Basal Metabolic Rate)
   * ※身長145cm以下や高校生（成長期）の場合、通常の成人用一次方程式（Mifflin式等）だと
   * 身長の二乗比率の歪みで基礎代謝が非現実的な低さ（500〜800kcal等）にバグってしまうため、
   * 厚生労働省「日本人の食事摂取基準」の基準値および体表面積・体積比を用いた適正補正を実施。
   */
  calculateBMR: function (gender, age, height, weight) {
    const isSmallOrYouth = height <= 145 || age <= 18;

    if (isSmallOrYouth) {
      // 高校生・小柄体型向け：厚生労働省の基準値＋活動組織量ベース
      // 15〜17歳男子: 約27.0kcal/kg/日、女子: 約25.3kcal/kg/日
      // 12〜14歳男子: 約31.0kcal/kg/日、女子: 約29.6kcal/kg/日
      let ratePerKg = 27.0;
      if (gender === 'female') {
        ratePerKg = 25.3;
      }
      if (age < 15) {
        ratePerKg += 4.0;
      }

      // 体重基準の基礎代謝
      let bmrByWeight = weight * ratePerKg;

      // Mifflin式との加重平均を取りつつ、身長135cm前後でも自然な基礎代謝（1,000〜1,300kcal前後）に調停
      let mifflin = (10 * weight) + (6.25 * height) - (5 * age);
      if (gender === 'male') mifflin += 5;
      else mifflin -= 161;

      let adjustedBmr = Math.round((bmrByWeight * 0.7) + (mifflin * 0.3));

      // 最低生命維持フロア（極端な低カロリー化を物理防止）
      return Math.max(950, adjustedBmr);
    } else {
      // 通常の成人式（Mifflin-St Jeor式）
      let bmr = (10 * weight) + (6.25 * height) - (5 * age);
      if (gender === 'male') {
        bmr += 5;
      } else {
        bmr -= 161;
      }
      return Math.round(bmr);
    }
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
  calculateTargetCalories: function (tdee, bmr, monthlyLossKg, weight) {
    const monthlyDeficit = monthlyLossKg * 7200;
    const dailyDeficit = Math.round(monthlyDeficit / 30);
    let target = tdee - dailyDeficit;

    // 安全装置（セーフティ）：
    // 小柄な方や成長期に過度な制限をかけると発育・健康障害になるため、
    // 基礎代謝の95%未満には落とさない、かつ絶対下限（1,050kcal）を保証。
    const safeMinimum = Math.max(1050, Math.round(bmr * 0.95));
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
   * - たんぱく質 (P): 体重 × 1.5〜1.8g (筋肉維持と成長)
   * - 脂質 (F): 総カロリーの20〜25%
   * - 炭水化物 (C): 残りのカロリー
   */
  calculatePFC: function (targetCalories, weight) {
    // タンパク質: 体重 × 1.6g
    const pGrams = Math.max(45, Math.round(weight * 1.6));
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
  }
};
