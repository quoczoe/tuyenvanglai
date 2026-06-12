# THIẾT KẾ NHÓM 3 — CHỜ DUYỆT (KHÔNG CODE)
> Phiên 2026-06-12. Soạn theo yêu cầu "trình bày để duyệt rồi mới build".
> Phạm vi: **3A** Khóa trạng thái theo giờ ca + "Từ chối khách"; **3B** Lịch sử điểm uy tín.
> ⛔ Chưa viết 1 dòng code logic nào cho 2 mục này. Chờ chủ app chốt.

---

## 3A — KHÓA TRẠNG THÁI THEO GIỜ CA + TÍNH NĂNG "TỪ CHỐI KHÁCH"

### A. Dữ liệu hiện có (KHÔNG cần SQL cho phần khóa giờ)
- `ca_dau.ngay_danh` (date), `ca_dau.gio_bat_dau`, `ca_dau.gio_ket_thuc` — **đã có sẵn & đang dùng** (openGuestListModal đã tính `isMatchStarted` từ `ngay_danh`+`gio_bat_dau`; `autoUpdateChoDao` đã đọc `gio_ket_thuc`).
- `dat_slot.trang_thai_di_danh` = **TEXT tự do, KHÔNG có CHECK/enum** (supabase-schema.sql:111 `TEXT DEFAULT 'Chờ đánh'`). → Thêm giá trị mới **"Host từ chối"** KHÔNG cần SQL.
- → **Phần khóa theo giờ: 0 SQL. Phần "Từ chối khách": 0 SQL** (nếu chọn phương án giá trị status mới — xem D).

### B. BẢNG LUẬT THEO GIỜ (mốc đọc từ ca_dau, giờ trình duyệt = GMT+7)

| Pha | Điều kiện | KHÁCH được làm | HOST được làm | Ghi chú |
|---|---|---|---|---|
| **TRƯỚC giờ bắt đầu** | `now < ngay_danh+gio_bat_dau` | **Hủy slot** (thang `KHACH_HUY` theo giờ còn lại) | **Từ chối khách** (nút riêng) · KHÔNG có "Đã tham gia"/"Bùng kèo" | dropdown chỉ hiện "Chờ đánh" (read-only) + (tùy) "Khách hủy" |
| **TRONG giờ** | `gio_bat_dau ≤ now < gio_ket_thuc` | Hủy slot (phạt nặng <30p — đã có) | **Đã tham gia** / **Bùng kèo** · KHÔNG còn "Từ chối" | "Khách hủy" (host-set) bị disable (đã có: `isMatchStarted`) |
| **SAU giờ kết thúc** | `now ≥ gio_ket_thuc` | (không) | **Chốt cuối**: Đã tham gia / Bùng kèo | sau khi `da_chot_ca=true` → khóa toàn bộ (đã có) |

> **3 pha thay cho cờ `isMatchStarted` nhị phân hiện tại.** Đề xuất helper SSOT trong `bo-may-du-lieu.js`:
> `window.phaCaDau(ca) → "truoc" | "trong" | "sau"` (đọc `ngay_danh`/`gio_bat_dau`/`gio_ket_thuc`, xử lý ca qua đêm end<start = +1 ngày).
> `_renderCustomDropdown` lọc danh sách option theo pha; `doiTrangThaiDiDanh`/`_triggerGlCdd` chặn lần 2 (server-authoritative — đọc lại ca khi đổi, không tin DOM).

### C. UI MOCKUP (text) — DS Khách (host)

```
PHA "TRƯỚC GIỜ"  (ca 18:00, bây giờ 15:00)
┌─────────────────────────────────────────────────────────────┐
│ Tên khách    SĐT         Trạng thái            Thao tác       │
│ Nguyễn A     09xx…       [ ⏳ Chờ đánh  ▾]      [⊘ Từ chối]    │  ← dropdown chỉ có "Chờ đánh"
│                          (Đã tham gia / Bùng    nút cam, riêng │     (option khác mờ + 🔒)
│                           kèo bị mờ + 🔒)                      │
└─────────────────────────────────────────────────────────────┘

PHA "TRONG GIỜ"  (bây giờ 18:30)
│ Nguyễn A     09xx…       [ ✅ Đã tham gia ▾]    (—)            │  ← bỏ nút Từ chối;
│                          (Khách hủy mờ 🔒;       dropdown đủ   │     dropdown mở Tham gia/Bùng
│                           Từ chối ẩn)                          │

PHA "SAU GIỜ"  → giống "trong giờ" + nhắc "Hãy chốt ca" ; sau chốt = badge tĩnh.
```

Nút **"Từ chối"**: pill cam `#fb923c` (mirror style `.btn-da-huy` nhưng cam), `title="Từ chối khách này — slot được giải phóng, khách có thể đặt ca khác"`, chỉ render ở pha "trước giờ" + trạng thái "Chờ đánh". Có `xacNhanModal` ("Từ chối '<Tên>'? Slot sẽ được giải phóng. Nếu <4h trước giờ đánh, ĐIỂM UY TÍN CỦA BẠN (host) sẽ bị trừ.").

### D. TÍNH NĂNG "TỪ CHỐI KHÁCH" — phương án status

**Khuyến nghị: giá trị status MỚI `"Host từ chối"`** (TEXT tự do → 0 SQL).
- **Hệ quả khách**: slot được giải phóng → ca +1 chỗ trống; khách KHÔNG bị trừ điểm; được đặt ca khác (không bị chặn). Có cho đặt LẠI chính ca đó không? → **đề xuất KHÔNG** (host từ chối có lý do) — hiện badge "BỊ TỪ CHỐI" thay nút Đặt (mirror `daHuySet`).
- **Hệ quả host**: nếu từ chối khi `< 4h` trước giờ đánh → trừ host theo thang `HOST_HUY` (đã có trong `DIEM_UY_TIN`); ≥4h = 0. Ghi qua `apDiemTheoTrangThai`/`_truDiemUyTin`.
- **Thông báo G_NEW** (loại mới, vd `G4`): gửi khách "Host đã từ chối slot của bạn tại [ca/sân] — slot đã được giải phóng, vui lòng đặt ca khác." (icon đề xuất `⊘`/`🚷`). Bổ sung 1 dòng vào `_META` (phan-he-thong-bao.js).

**Chi phí code (phương án status mới)** — phải dạy ~7 nơi "Host từ chối" = đã giải phóng (như "Khách hủy"):
| File | Vị trí (≈) | Sửa |
|---|---|---|
| phan-he-khach-choi.js | 1699/1707 (`daDatSet`/`daHuySet`, đếm slot) | coi "Host từ chối" như freed; thêm `daTuChoiSet` để render badge |
| phan-he-khach-choi.js | 2155 (đếm đặt hôm nay), 2834 (`alreadyBooked`), 2230 (re-book guard) | loại trừ "Host từ chối" |
| phan-he-khach-choi.js | 2060–2064 (card nút Đặt/badge) | badge "BỊ TỪ CHỐI" |
| phan-he-host.js | `_renderCustomDropdown` + `_triggerGlCdd` | lọc option theo `phaCaDau`; nút "Từ chối" |
| phan-he-host.js | doanh thu / đếm tham gia | "Host từ chối" không tính tiền (giống Khách hủy) |
| bo-may-du-lieu.js | §0 | thêm `phaCaDau()` helper |
| phan-he-thong-bao.js | `_META` | thêm G4 |

> **Phương án thay thế (ít code hơn, KHÔNG khuyến nghị)**: tái dùng `"Khách hủy"` + cờ phân biệt actor chỉ để chọn thông báo/đối tượng phạt. Nhược: lẫn lộn audit (không phân biệt khách tự hủy vs host từ chối), thông báo G3 hiện tại ("Host đánh dấu bạn Khách hủy") sai ngữ cảnh. → Chỉ chọn nếu muốn tối giản tuyệt đối.

### E. RỦI RO 3A
1. **Lệch giờ client**: pha tính theo `Date.now()` máy khách (GMT+7 set sẵn). Khách chỉnh đồng hồ có thể "mở khóa" sớm pha → host vẫn là người chốt cuối nên rủi ro thấp; phạt vẫn tính server-side khi ghi.
2. **Ca qua đêm** (`gio_ket_thuc < gio_bat_dau`): phải +1 ngày khi tính pha "sau" (đã ghi nhận là edge hiếm chưa xử ở chỗ khác — `phaCaDau` cần xử đúng).
3. **Nhiều nơi lọc "Khách hủy"**: nếu thiếu 1 chỗ khi thêm "Host từ chối" → slot vừa "đã giải phóng" vừa bị đếm. Cần grep đủ (đã liệt kê bảng trên) + test sống.
4. **Tương tác chốt ca**: sau `da_chot_ca` mọi pha đều khóa (đã có) — không cho từ chối sau chốt.

### F. SQL 3A
- **0 file SQL** (cả khóa giờ lẫn "Host từ chối" — dùng giá trị TEXT mới + cột giờ có sẵn).

---

## 3B — LỊCH SỬ ĐIỂM UY TÍN

### A. Schema (1 file SQL mới: `migration-lich-su-uy-tin-v1.sql`)
```sql
CREATE TABLE IF NOT EXISTS lich_su_uy_tin (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sdt         TEXT        NOT NULL,           -- người được/bị thay đổi điểm
    delta       INTEGER     NOT NULL,           -- +2, -10, -20…
    diem_sau    INTEGER,                        -- điểm SAU khi áp (tùy chọn, để hiển thị)
    ly_do       TEXT        NOT NULL,           -- "Đã tham gia" | "Bùng kèo (lần 2)" | "Khách hủy <30p" | "Host từ chối" | "Admin điều chỉnh"…
    ca_id       UUID,                           -- FK mềm tới ca_dau (NULL nếu admin chỉnh tay)
    ten_san     TEXT,                           -- denormalize để hiển thị không cần join
    actor       TEXT,                           -- ai gây ra (sdt host / 'admin' / 'system')
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lsut_sdt_time ON lich_su_uy_tin(sdt, created_at DESC);
-- RLS: khóa anon trực tiếp (giống thong_bao). Đọc/ghi qua RPC SECURITY DEFINER.
ALTER TABLE lich_su_uy_tin ENABLE ROW LEVEL SECURITY;
-- KHÔNG policy anon. (authenticated/admin có thể thêm policy SELECT để admin xem.)
```
Kèm 2 RPC SECURITY DEFINER (mẫu theo `migration-thong-bao-v1.sql`):
- `ghi_lich_su_uy_tin(p_token, p_sdt_actor, p_sdt, p_delta, p_ly_do, p_ca_id, p_ten_san, p_diem_sau)` — verify token actor (`guest_sessions`) rồi INSERT (trusted).
- `lay_lich_su_uy_tin(p_token, p_sdt, p_gioi_han)` — verify token == p_sdt → trả lịch sử của CHÍNH mình (lọc N ngày/limit).
- (Admin xem user bất kỳ: dùng JWT admin + policy SELECT cho `authenticated`, hoặc RPC riêng `admin_lay_lich_su(p_sdt)` check `is_admin()`.)

> **SQL: 1 file** (bảng + index + RLS + 2–3 RPC). Tương tự độ phức tạp `migration-thong-bao-v1.sql`.

### B. Điểm ghi log — HOOK VÀO SSOT (rất gọn)
Mọi thay đổi điểm hiện CHẢY QUA 2 chỗ → chỉ cần chèn 1 lời gọi best-effort:
- `window.apDiemTheoTrangThai()` (phan-he-khach-choi.js) — Tham gia/Bùng/Khách hủy/(Host từ chối) → tại nơi đã tính `delta`, gọi `window.ghiLichSuUyTin({sdt, delta, lyDo, caId, tenSan, diemSau})`.
- `window._truDiemUyTin()` + path host-hủy ca (`xoaCaDau`) — ghi cho host.
- (Admin chỉnh tay điểm: ghi `actor='admin'`, `ly_do='Admin điều chỉnh'`.)
- Helper `window.ghiLichSuUyTin()` đặt ở phan-he-thong-bao.js hoặc bo-may (fire-and-forget, KHÔNG chặn luồng — như `guiThongBao`).

### C. UI MOCKUP (text)
**Khách — tab/section "Lịch Sử Điểm" trong trang Hồ Sơ:**
```
LỊCH SỬ ĐIỂM UY TÍN                       Điểm hiện tại: 86
──────────────────────────────────────────────────────────
🟢  11/06 20:15   +2     Đã tham gia        Sân GENZ · 18:00
🔴  09/06 19:40   −10    Bùng kèo (lần 1)   Sân Cầu 88 · 20:00
🟡  05/06 17:02   −4     Khách hủy (30p–2h) Sân ABC · 18:00
⚪  01/06 09:00   —      (tạo tài khoản, 50đ khởi điểm)
──────────────────────────────────────────────────────────
            [ Tải thêm ]   (mặc định 20 dòng / 90 ngày)
```
- Timeline list: chấm màu theo dấu delta (xanh +, đỏ −, vàng phạt nhẹ); `[+2/−10] [lý do] [ca - sân] [thời gian tương đối]`. Tái dùng style `.tb-item` (divider) hoặc `.hs-table`.

**Admin — trong modal chi tiết user (tab Quản lý người dùng):**
```
[ Xem lịch sử điểm ]  → bảng .ad-table cùng cột (delta/lý do/ca/actor/thời gian)
                         dùng xét khiếu nại; chỉ đọc.
```

### D. File cần sửa (3B)
| File | Sửa |
|---|---|
| `migration-lich-su-uy-tin-v1.sql` (MỚI) | bảng + index + RLS + RPC |
| `phan-he-khach-choi.js` | `ghiLichSuUyTin()` helper + chèn vào `apDiemTheoTrangThai`; UI tab "Lịch Sử Điểm" (Hồ Sơ) gọi `lay_lich_su_uy_tin` |
| `phan-he-host.js` | chèn log ở path host-hủy ca |
| `phan-he-quan-tri.js` | nút + bảng "Lịch sử điểm" trong chi tiết user |
| `phan-he-ung-dung.js` / `index.html` | thêm section/tab trong Hồ Sơ + markup |
| `giao-dien.css`/`components.css` | style timeline (hoặc tái dùng sẵn) |

### E. RỦI RO 3B
1. **Backfill**: log chỉ có TỪ LÚC bật → lịch sử cũ trống. Chấp nhận (ghi chú "ghi từ <ngày>"); KHÔNG backfill (không có dữ liệu nguồn).
2. **Double-log**: nếu apDiem chạy 2 lần (đã có guard `_doiTTBusy`) → có thể 2 dòng. Log là best-effort; nên ghi SAU khi PATCH điểm thành công, đặt trong cùng nhánh đã tính delta (đúng 1 lần).
3. **Quyền chéo**: phải verify token (RPC) — không để user A đọc lịch sử user B; admin đọc qua JWT.
4. **Khối lượng**: mỗi đổi điểm = 1 dòng → tăng đều; index theo `(sdt, created_at)` + lọc 90 ngày ở RPC để nhẹ.
5. **Nhất quán với SSOT**: lý do/điểm phải khớp `DIEM_UY_TIN`; ghi `diem_sau` đọc lại từ DB sau PATCH (tránh lệch khi clamp 0/100).

### F. SQL 3B
- **1 file SQL** mới (`migration-lich-su-uy-tin-v1.sql`).

---

## TÓM TẮT DUYỆT
| Mục | SQL | Độ lớn | Quyết định cần chốt |
|---|---|---|---|
| **3A** Khóa giờ + Từ chối khách | **0 file** | TB (sửa ~7 nơi lọc status + 1 helper pha) | (1) Dùng status mới "Host từ chối" hay tái dùng "Khách hủy"? (2) Cho khách đặt LẠI chính ca bị từ chối? (3) Phạt host <4h theo `HOST_HUY` — đồng ý? |
| **3B** Lịch sử điểm | **1 file** | TB (hook SSOT + 1 tab UI + admin view) | (1) Đồng ý thêm bảng `lich_su_uy_tin` + RPC? (2) Admin xem qua JWT policy hay RPC riêng? (3) Lưu `diem_sau` không? |

> ⛔ **DỪNG — chờ chủ app duyệt từng câu hỏi trên trước khi build 3A/3B.**
