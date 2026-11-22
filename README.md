# N2 Luyện Đề — web luyện thi JLPT N2 chạy local

32 đề JLPT N2 thật (7/2010 → 7/2026), gồm 文字・語彙 · 文法 · 読解 (không có phần nghe).
Đáp án lấy từ file đáp án chính thức trong thư mục Drive. Câu nào cũng có giải thích tiếng Việt:
dịch nghĩa, vì sao đúng, phân tích từng phương án, từ vựng (Hán Việt + nghĩa), mẫu ngữ pháp,
câu căn cứ trong bài đọc (được tô vàng ngay trong bài), và mẹo nhớ.

## Chạy

Yêu cầu: Node.js ≥ 22.5. **Không cần `npm install`**, vì database dùng `node:sqlite` có sẵn trong Node.

```bash
git clone https://github.com/DangNH2512/n2-test.git
cd n2-test
```

Lần đầu, hoặc sau khi dữ liệu đề thay đổi:

```bash
npm run build:db     # nạp data/parts/** + đáp án chính thức vào SQLite (data/n2.db)
npm run mazii        # tra Mazii cho các từ vựng mới (có cache, chỉ tra từ chưa có)
```

`build:db` chỉ dựng lại phần nội dung đề. Lịch sử làm bài, câu đánh dấu và cache Mazii vẫn được giữ.

Sau đó chạy app:

```bash
npm start            # → http://localhost:5173
```

Hoặc double-click file `start.command`.

## Cách dùng

| Chế độ | Mô tả |
|---|---|
| **Luyện tập** | Chọn đáp án là chấm ngay, hiện giải thích chi tiết bên dưới. Câu đã trả lời bị khóa. |
| **⏱ Thi thử** | Bấm giờ theo thời lượng đề thật (語彙 30′ + 文法 25′ + 読解 50′ = 105′). Hết giờ tự nộp; nộp xong mới chấm điểm và xem giải thích. |
| Câu sai | Những câu làm sai ở lần gần nhất, kèm giải thích để ôn lại. |
| Đánh dấu | Câu đã đánh dấu ☆ khi làm bài. |
| Từ vựng | Toàn bộ từ vựng xuất hiện trong phần giải thích, tìm được theo chữ Hán, cách đọc, Hán Việt hoặc nghĩa. |
| Thống kê | Tỉ lệ đúng theo phần thi, theo dạng 問題, và lịch sử làm bài. |

Có thể chọn làm từng phần (chỉ 語彙, chỉ 読解…). Phím tắt: `1`–`4` chọn đáp án · `←` `→` chuyển câu · `Enter` sang câu sau · `F` đánh dấu.
Nút A−/A+ chỉnh cỡ chữ, ◐ chuyển giao diện sáng/tối.

## Nguồn nghĩa từ vựng (thứ tự ưu tiên)

1. **List N2 của bạn**: `data/vocab_list.json` (badge xanh lá “List N2”).
2. **Mazii**: tra tự động qua `npm run mazii` (badge xanh dương “Mazii”).
3. Giải thích soạn sẵn, dùng khi hai nguồn trên không có từ đó.

Nạp danh sách từ vựng riêng (export từ Messenger/Notes/Excel…):

```bash
node scripts/import-vocab.js duong-dan/list.txt   # hỗ trợ .txt / .csv / .tsv / .json
npm run build:db && npm start
```

Mỗi dòng một từ, theo một trong các dạng: `詳細<TAB>しょうさい<TAB>TƯỜNG TẾ<TAB>chi tiết`,
`詳細（しょうさい）: chi tiết`, hoặc `詳細 (しょうさい) [TƯỜNG TẾ] - chi tiết`.

## Cấu trúc

```
server.js                 API + static (Node thuần, node:sqlite)
db/schema.sql             schema SQLite
public/                   giao diện (HTML/CSS/JS thuần, không cần build)
data/answer_key.json      đáp án chính thức (parse từ "ĐÁP ÁN JLPT N2.pdf")
data/parts/<đề>/mNN.json  nội dung đề + giải thích, mỗi file một 問題 (xem docs/DATA_SCHEMA.md)
data/source/              PDF gốc + text trích xuất (gạch chân → <u>…</u>); chỉ có ở máy soạn đề, không đưa lên repo
scripts/                  build-db, enrich-mazii, import-vocab, validate_parts.py, extract.py, parse_key.py
docs/REVIEW_NOTES.md      các câu có đáp án đáng xem lại / lỗi đánh máy trong đề gốc
```

Kiểm tra dữ liệu: `npm run validate`. Lệnh này kiểm JSON, đủ số câu, đủ 4 phương án, đáp án khớp key chính thức, và giải thích có đủ các phần.
