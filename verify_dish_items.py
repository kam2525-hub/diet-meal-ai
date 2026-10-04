import os
import sys
import time
from playwright.sync_api import sync_playwright

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def test_dish_items_feature():
    html_path = os.path.abspath(r"C:\Users\akeer.AKERU\.gemini\antigravity\scratch\diet-meal-ai\index.html")
    url = f"file:///{html_path.replace(os.sep, '/')}"

    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 430, "height": 932})
        page = context.new_page()

        page.on("pageerror", lambda err: errors.append(f"PageError: {err}"))
        page.on("console", lambda msg: errors.append(f"ConsoleError: {msg.text}") if msg.type == "error" else None)

        print(f"Opening page: {url}")
        page.goto(url)
        page.wait_for_load_state("networkidle")

        # 1. 昼食のスロットに鮭定食を渡して解析開始（ファイル名 syake_teishoku.jpg）
        print("Testing dish items detection with salmon set meal...")
        page.evaluate("""() => {
            if (window.openPhotoRecordModal) {
                window.openPhotoRecordModal('lunch');
            }
            const sampleSalmon = {
                name: "牛鮭定食（鮭塩焼き・牛小鉢・ご飯並盛・味噌汁）",
                calories: 690,
                p: 30.0,
                f: 22.0,
                c: 93.0,
                icon: "🐟",
                advice: "焼き鮭のオメガ3脂肪酸と牛小鉢のたんぱく質で栄養満点！"
            };
            window.startPhotoAnalysis("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", sampleSalmon, "syake_teishoku.jpg");
        }""")

        time.sleep(1.0)

        # ステップ1の確認
        dish_name_el = page.locator("#stepDishNameDisplay")
        dish_name = dish_name_el.text_content().strip()
        print(f"Step 1 Dish Name: {dish_name}")
        assert "鮭" in dish_name, f"Expected salmon in dish name, got {dish_name}"

        # プレビュータグの確認
        preview_tags = page.locator("#stepDishItemsPreview span").all_text_contents()
        print(f"Preview items count: {len(preview_tags)}")
        print(f"Preview tags: {preview_tags}")
        assert len(preview_tags) >= 3, "Expected at least 3 items recognized in set meal"

        # スクリーンショット 1: ステップ1（料理名＆品目プレビュー）
        page.screenshot(path="step1_dish_items_preview.png")

        # 2. ステップ2へ進む
        print("Clicking Go to Nutrition Step...")
        page.locator("#goToNutritionStepBtn").click()
        time.sleep(0.5)

        # ステップ2の品目カード確認
        dish_item_cards = page.locator("#dishItemsListContainer > div")
        card_count = dish_item_cards.count()
        print(f"Step 2 dish item cards count: {card_count}")
        assert card_count == 4, f"Expected 4 item cards (rice, salmon, soup, beef), got {card_count}"

        initial_cal = int(page.locator("#nutriCaloriesDisplay").text_content().strip())
        print(f"Initial Total Calories: {initial_cal} kcal")

        # 3. ご飯を「大盛 (300g)」に変更してみる
        print("Changing rice to 大盛 (300g)...")
        first_card = dish_item_cards.nth(0)
        large_rice_btn = first_card.locator("button:has-text('大盛')")
        large_rice_btn.click()
        time.sleep(0.3)

        cal_after_large_rice = int(page.locator("#nutriCaloriesDisplay").text_content().strip())
        print(f"Calories after Large Rice: {cal_after_large_rice} kcal (Difference: +{cal_after_large_rice - initial_cal})")
        assert cal_after_large_rice > initial_cal, "Calories should increase after selecting large rice"

        # 4. 鮭の塩焼き（2番目のカード）を「小さめ」に変更してみる
        print("Changing salmon to 小さめ...")
        second_card = dish_item_cards.nth(1)
        small_salmon_btn = second_card.locator("button:has-text('小さめ')")
        small_salmon_btn.click()
        time.sleep(0.3)

        cal_after_small_salmon = int(page.locator("#nutriCaloriesDisplay").text_content().strip())
        print(f"Calories after Small Salmon: {cal_after_small_salmon} kcal")
        assert cal_after_small_salmon < cal_after_large_rice, "Calories should decrease after selecting small salmon"

        # 5. 味噌汁（3番目のカード）を「少なめ」に変更してみる
        print("Changing miso soup to 少なめ...")
        third_card = dish_item_cards.nth(2)
        small_soup_btn = third_card.locator("button:has-text('少なめ')")
        small_soup_btn.click()
        time.sleep(0.3)

        cal_after_soup = int(page.locator("#nutriCaloriesDisplay").text_content().strip())
        print(f"Calories after Soup reduction: {cal_after_soup} kcal")

        # 6. 「おかず追加」モーダルから「納豆 (90kcal)」を追加してみる
        print("Adding Natto from Add Dish Item modal...")
        page.locator("button:has-text('おかず追加')").click()
        time.sleep(0.3)

        natto_btn = page.locator("#quickAddDishChips button:has-text('納豆')")
        natto_btn.click()
        time.sleep(0.5)

        new_card_count = page.locator("#dishItemsListContainer > div").count()
        cal_after_natto = int(page.locator("#nutriCaloriesDisplay").text_content().strip())
        print(f"Cards count after Natto: {new_card_count}, Calories: {cal_after_natto} kcal")
        assert new_card_count == card_count + 1, "Item cards count should increment after adding Natto"
        assert cal_after_natto == cal_after_soup + 90, f"Calories should increase by 90 for Natto (got {cal_after_natto - cal_after_soup})"

        # スクリーンショット 2: ステップ2（個別量調整＆追加された品目）
        page.screenshot(path="step2_dish_items_adjusted.png")

        # 7. 「この料理を記録する」をクリックして保存
        print("Applying photo meal record...")
        page.locator("#applyPhotoMealBtn").click()
        time.sleep(1.0)

        # ホーム画面の食事カード確認
        lunch_card = page.locator(".meal-card[data-meal='lunch']")
        recorded_name = lunch_card.locator(".record-filled-view .font-bold span").first.text_content().strip()
        print(f"Recorded Name on Lunch Card: {recorded_name}")

        # 品目バッジの確認
        item_chips = lunch_card.locator(".record-filled-view .inline-flex").all_text_contents()
        print(f"Item badges on Lunch Card: {item_chips}")
        assert len(item_chips) >= 4, f"Expected item badges on card, got {item_chips}"

        # スクリーンショット 3: ホーム画面（個別品目バッジ＆料理名表示）
        page.screenshot(path="home_recorded_with_items.png")

        # コンソールエラーの確認
        real_errors = [e for e in errors if "Failed to load resource" not in e and "favicon" not in e]
        if real_errors:
            print(f"WARNING: Javascript errors: {real_errors}")
        else:
            print("SUCCESS: 0 JS errors encountered during test!")

        browser.close()

if __name__ == "__main__":
    test_dish_items_feature()
