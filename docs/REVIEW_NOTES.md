# Ghi chú review dữ liệu đề

Đáp án trong app **luôn lấy theo file đáp án chính thức** (`data/answer_key.json`, parse từ
"ĐÁP ÁN JLPT N2 (update 27.10.2026).pdf"). Các agent soạn giải thích đã tự giải lại từng câu để đối chiếu.
Dưới đây là những câu họ thấy **đáp án chính thức đáng xem lại**. Ở mọi câu, phần giải thích vẫn bám
đáp án chính thức và có thêm lưu ý trong mục "Mẹo nhớ".

## Câu có đáp án đáng xem lại

| Đề | Câu | Đáp án key | Vấn đề |
|---|---|---|---|
| 7/2011 | 75 | 1 | Theo sơ đồ của B社 trong bản PDF, nhánh "gia đình → lần đầu sống ở nước ngoài → muốn nhân viên nói tiếng Nhật" dẫn tới プランIV, tức là đáp án 2. Có thể bản gõ lại bị đảo nhãn. |
| 7/2011 | 71 | 1 | Phương án 2 cũng khá hợp lý (nghi ngờ nhẹ). |
| 12/2011 | 44 | 3 | 「お持ちになりますか」 là đáp án key, nhưng 「お持ちですか」 (2) cũng là kính ngữ tự nhiên. |
| 12/2011 | 72 | 2 | Phương án 4 khá gần nghĩa (nghi ngờ nhẹ). |
| 7/2017 | 54 | 1 | 「社会」 (key) và 「社会だ」 (2) đều có thể chấp nhận. |
| 7/2019 | 43 | 1 | Trong PDF, ★ nằm ở ô 3, nếu theo đó thì đáp án là 3. Key là 1, nghĩa là ★ phải ở ô 4. App đặt ★ ở ô 4 cho khớp key. |
| 12/2019 | 46 | 1 | Key cần thứ tự 3→4→1→2, trong khi 3→1→4→2 nghe tự nhiên hơn (★ sẽ là 4). |
| 12/2021 | 65 | 2 | Phương án 1 cũng sát với chữ trong bài A. |

## Chất lượng nguồn đề

Các PDF trong Drive là **bản gõ lại** của đề gốc nên có nhiều lỗi chính tả hoặc OCR (ví dụ ロポット, 間題, 応援条件 thay cho 応募条件…).
Agent đã sửa những lỗi hiển nhiên khi chép; với câu bị ảnh hưởng, lưu ý nằm trong mục "Mẹo nhớ". Một số chỗ phải
**tự dựng lại**, cần biết:

- 12/2020 問題14: đề in sai lời dẫn, nên đã viết lại cho khớp nội dung (dịch vụ gửi hành lý sân bay); cụm 「ご自宅での集荷」 là do agent suy ra. Bài 問題11(3) có hai chỗ bị cắt, đã được điền theo mạch văn.
- 7/2019 問題14: lời dẫn không khớp nội dung nên đã viết lại; 問題10(5) được thêm 「ですが」 để câu đọc được.
- 7/2010 câu 74: phương án 3 được hiểu là 学習塾 (suy đoán, không ảnh hưởng đáp án).
- 7/2012 問題14: thiếu một dòng thông tin, đã bổ sung theo ảnh trang PDF. Câu 52 phương án 2 được ghi thành 「その点の場合」.
- 7/2022 問題14: giá vé 0–4 tuổi kỳ đặc biệt sửa từ 7000円 thành 700円 (không câu hỏi nào dùng tới).
- 12/2015 câu 51: đề ghi 「約200グラム」 (theo phép tính phải là 20g), giữ nguyên như đề.
- 12/2012 câu 35: phương án 1 in 「させた」 được sửa thành 「さらに」.
- 7/2026 câu 18: phương án 2 sửa thành 「おおざっぱな」 cho đồng bộ (chưa đối chiếu PDF).
- 7/2021 問題11(2): chú thích (注1) 「しきたり」 trong đề bị sai nghĩa, đã viết lại thành 「昔から決まっているやり方」.
- 12/2024 問題14: đề in lời dẫn 「美容院のキャンペーン」 nhưng nội dung là bảng giá khách sạn, nên lời dẫn đã được đặt lại.
- 7/2023 問題14: đề đánh số câu 68–69, đã đổi thành 70–71 theo đáp án chính thức.
- 12/2014 câu 53: phương án 4 bị in trùng 「するべきだ」, giữ nguyên (không ảnh hưởng đáp án 3).
- Một số đề 2022–2025 (12/2022, 7/2025, 12/2024, 12/2025): lời dẫn 問題11 ghi 「(1)から(3)」 nhưng bài có 4 đoạn, đã sửa thành (1)〜(4).

Phần **nghe (聴解)** bị loại khỏi app theo yêu cầu.

## Kiểm tra

```bash
npm run validate     # JSON hợp lệ, đủ câu, đáp án = key chính thức, đủ các phần giải thích
```
