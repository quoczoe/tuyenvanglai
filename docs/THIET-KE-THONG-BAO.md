# THIẾT KẾ HỆ THỐNG THÔNG BÁO — TUYENVANGLAI.IO.VN
> Trạng thái: **BẢN THIẾT KẾ — CHỜ DUYỆT** (chưa code). Soạn ở PHIÊN PART 2.
> Sau khi chủ app duyệt → mở phiên riêng để build.

---

## A. DANH SÁCH SỰ KIỆN CẦN THÔNG BÁO

Phân theo NGƯỜI NHẬN. Mỗi sự kiện có: nguồn phát (hàm đang có), đối tượng liên quan
(để click điều hướng), độ ưu tiên.

### A1. KHÁCH (guest) nhận
| # | Sự kiện | Phát từ (code hiện có) | Click → đi tới | Ưu tiên |
|---|---|---|---|---|
| G1 | Host **xác nhận "Đã tham gia"** cho mình | `doiTrangThaiDiDanh` / `xacNhanThamGia` | Lịch Sử (ca đó) | Cao |
| G2 | Host **hủy ca** mình đã đặt | `xoaCaDau` (host) | Tìm Kèo (gợi ý ca khác) | Cao |
| G3 | Host **đánh dấu Bùng kèo / Khách hủy** cho mình | `xuLyBungKeo` / `doiTrangThaiDiDanh` | Lịch Sử + điểm uy tín | Cao |
| G4 | **Ca sắp diễn ra** (nhắc 2h trước) | (MỚI — cron/Edge Function hoặc check client) | Chi tiết ca / Lịch Sử | TB |
| G5 | **Kết quả chấm điểm** (host đánh giá mình sau ca) | `moQuickDanhGiaKhach` → INSERT `danh_gia_tin_dung` | Hồ sơ / Lịch Sử | TB |
| G6 | **Điểm uy tín thay đổi** (thưởng +2 / phạt) | `_congDiemUyTin` / `_truDiemUyTin` | Hồ sơ (trust bar) | Thấp |
| G7 | **Ca có cọc**: host đã xác nhận nhận cọc của mình | (cọc đang localStorage — cần DB nếu muốn push) | Lịch Sử | Thấp |

### A2. HOST nhận
| # | Sự kiện | Phát từ | Click → đi tới | Ưu tiên |
|---|---|---|---|---|
| H1 | **Khách đặt slot mới** vào ca của mình | `datSlot` (guest) | DS Khách của ca đó | Cao |
| H2 | **Khách hủy slot** | `huyDatSlot` (guest) | DS Khách của ca đó | Cao |
| H3 | **Khách (bị nghi) bùng** — slot quá giờ chưa xác nhận | (MỚI — suy ra từ giờ ca) | DS Khách (nút Báo cáo Ghost) | TB |
| H4 | **Ca sắp đầy / đã đầy slot** | `datSlot` đếm slot | DS Khách | Thấp |
| H5 | **Ca sắp tới giờ** — nhắc chốt số liệu | (MỚI — cron) | Chi tiết ca (chốt ca) | TB |
| — | *(Cọc: "yêu cầu xác nhận cọc mới"* — chỉ ý nghĩa nếu cọc lên DB; hiện localStorage nên SKIP push) | | | |

### A3. HỆ THỐNG / ADMIN
| # | Sự kiện | Phát từ | Click → đi tới | Ưu tiên |
|---|---|---|---|---|
| S1 | **Tài khoản bị khóa** (kèm lý do: bùng lần 3 / điểm < 40) | `xuLyBungKeo` / `_truDiemUyTin` | Màn thông báo (chỉ đọc) | Cao |
| S2 | **Cảnh báo uy tín thấp** (điểm chạm 60 / 40) | `_truDiemUyTin` | Hồ sơ | TB |
| S3 | **Admin broadcast** (thông báo chung: bảo trì, sự kiện) | Admin panel (MỚI: ô soạn broadcast) | Màn thông báo / popup | TB |
| S4 | **Admin mở khóa** tài khoản | `_khoaMoTV` | Login lại | Thấp |

> **Bổ sung đề xuất** (ngoài gợi ý đề bài): G5 (kết quả chấm điểm), G6 (điểm uy tín đổi),
> H4 (ca đầy slot), S2 (cảnh báo uy tín), S4 (mở khóa). Có thể cắt bớt ở v1.

---

## B. PHƯƠNG ÁN KỸ THUẬT (2 cách + trade-off)

### Phương án 1 — ĐƠN GIẢN: bảng `thong_bao` + polling 30s
- **Bảng mới** `thong_bao`: `id, sdt_nguoi_nhan, loai, tieu_de, noi_dung, link_data(jsonb), da_doc(bool), created_at`.
- **Ghi**: tại các hàm phát sự kiện (datSlot, huyDatSlot, xoaCaDau, doiTrangThaiDiDanh...) → thêm 1 INSERT `thong_bao` cho người nhận.
- **Đọc**: client poll mỗi 30s (hoặc khi focus tab) → `SELECT ... WHERE sdt_nguoi_nhan = me AND created_at > lastSeen` → cập nhật badge số chưa đọc + danh sách.
- **Ưu**: đơn giản, không cần realtime infra, hợp RLS hiện tại (chỉ cần policy "đọc thông báo của chính mình"). Hoạt động kể cả khi tab mở lại sau (lấy theo created_at).
- **Nhược**: trễ tối đa 30s; tốn round-trip định kỳ (nhẹ với cộng đồng nhỏ); cần tự dọn thông báo cũ.

### Phương án 2 — REALTIME: Supabase Realtime subscription
- Subscribe `postgres_changes` trên bảng `thong_bao` (filter `sdt_nguoi_nhan=eq.me`) → push tức thì khi có INSERT.
- **Ưu**: tức thời, không poll.
- **Nhược**: cần bật Realtime cho bảng; RLS phải chuẩn (Realtime tôn trọng RLS — nhưng hiện RLS đang lỏng → rủi ro lộ); quản lý kết nối/reconnect; phức tạp hơn; SDK realtime tăng tải.

### 👉 KHUYẾN NGHỊ cho quy mô hiện tại (cộng đồng nhỏ–vừa)
**Phương án 1 (polling 30s)**. Lý do:
- App đã dùng REST thuần + đã có `dbEngine` (không cần thêm hạ tầng).
- Trễ 30s chấp nhận được cho loại sự kiện này (không phải chat).
- Tránh phụ thuộc Realtime khi **RLS còn lỏng** (security-auth-v4 chưa chạy) — push realtime trên RLS lỏng dễ lộ thông báo người khác.
- Dễ nâng cấp lên Realtime sau (chỉ đổi tầng đọc, giữ nguyên bảng + điểm ghi).
- **Tối ưu polling**: chỉ poll khi tab visible (`visibilitychange`), giãn nhịp khi idle, dùng `created_at > lastSeen` để tải delta.

---

## C. PHÁC THẢO UI

- **Icon chuông 🔔 trên thanh nav** (cạnh avatar/đăng xuất) + **badge số chưa đọc** (đỏ, ẩn khi 0).
- Click chuông → **drawer/panel trượt từ phải** (mobile: full-height sheet) liệt kê thông báo mới→cũ:
  - Mỗi dòng: icon theo loại (xanh/cam/đỏ) + tiêu đề đậm + 1 dòng mô tả + thời gian tương đối ("5 phút trước").
  - Chưa đọc: nền nhạt + chấm xanh; đã đọc: mờ hơn.
  - **Click 1 thông báo → điều hướng thẳng đối tượng** + đánh dấu đã đọc:
    - H1 "khách đặt slot" → mở `openGuestListModal(caId)`.
    - G1 "đã tham gia" → chuyển tab Lịch Sử, scroll tới ca.
    - G2 "host hủy ca" → tab Tìm Kèo.
    - S1 "khóa tài khoản" → màn thông báo chi tiết (read-only).
  - Nút "Đánh dấu tất cả đã đọc" + "Xem tất cả" (nếu cần trang riêng).
- **Không làm trang riêng `/thong-bao`** ở v1 — drawer là đủ; cân nhắc trang riêng nếu danh sách dài.
- Tái dùng token sẵn có (`--space-*`, `--fs-*`, màu status) — KHÔNG hardcode.

```
┌──────────────── nav ────────────────┐
│ TUYENVANGLAI  ...  🔔③  [avatar ▾]  │
└─────────────────────────────────────┘
                         │ click
                         ▼
        ┌──────── Thông báo ───────[✓ tất cả]┐
        │ ● 🟢 Khách đặt slot mới             │
        │    Nguyễn A đặt ca "Sân X"  · 2p    │
        │ ● 🔴 Tài khoản bị cảnh báo          │
        │    Uy tín còn 58đ          · 1h     │
        │   🟠 Khách hủy slot                 │
        │    Trần B hủy ca "Sân Y"   · hôm qua│
        └────────────────────────────────────┘
```

---

## D. ƯỚC LƯỢNG

| Hạng mục | Chi tiết | Lượng |
|---|---|---|
| **SQL** | 1 bảng `thong_bao` + RLS (đọc/cập nhật của chính mình) + index `(sdt_nguoi_nhan, created_at)` | **1 file SQL** (chờ duyệt) |
| **File JS mới** | `phan-he-thong-bao.js` (poll, render drawer, mark đọc, điều hướng) | 1 |
| **File sửa** | `index.html` (icon chuông + drawer markup), `phan-he-khach-choi.js` + `phan-he-host.js` (chèn INSERT `thong_bao` ở ~7 điểm phát), `phan-he-quan-tri.js` (ô broadcast — tùy chọn), `giao-dien.css`/`components.css` (style drawer) | ~5 |
| **Helper** | thêm `dbEngine` query thông báo (đã có sẵn doc/ghi) | 0 mới |
| **Độ phức tạp tổng** | **TRUNG BÌNH**. Phần khó nhất: chèn điểm ghi nhất quán + dọn thông báo cũ + (nếu admin broadcast) ghi hàng loạt theo danh sách user. | — |

**Phụ thuộc**: nên chạy **sau** security-auth-v4 (RLS chuẩn) để thông báo không lộ chéo;
hoặc RLS riêng cho `thong_bao` ngay từ đầu (USING `sdt_nguoi_nhan = current_guest_sdt()`).

---

## E. RỦI RO & LƯU Ý

1. **Spam thông báo**: 1 ca đông khách → host nhận N thông báo "đặt slot". → Gộp ("3 khách vừa đặt ca X") hoặc throttle theo ca; G6/điểm-uy-tín chỉ ghi khi đổi mốc.
2. **Thông báo cũ không còn liên quan**: ca đã qua / slot đã hủy lại. → Lưu `link_data` (caId/slotId) + khi click kiểm tra còn hợp lệ; auto-ẩn/tự xóa thông báo > 30 ngày (cron hoặc xóa khi đọc danh sách).
3. **Quyền truy cập (QUAN TRỌNG)**: khách KHÔNG được thấy thông báo của host khác. → RLS bắt buộc `sdt_nguoi_nhan = chính mình`; **không** dựa filter client. Với RLS hiện lỏng → đây là lý do chọn polling + cần policy chặt cho riêng bảng này.
4. **Đồng bộ đa thiết bị / đa tab**: `lastSeen` lưu server-side (cột `da_doc`) thay vì chỉ localStorage để nhất quán.
5. **Khối lượng ghi**: mỗi sự kiện +1 INSERT — với cộng đồng nhỏ là nhẹ; nếu lớn cân nhắc batch.
6. **Admin broadcast**: ghi N dòng (mỗi user 1) → tốn; cân nhắc 1 bản ghi "broadcast" + bảng `da_doc_broadcast` riêng (tối ưu sau).
7. **Bảo mật nội dung**: thông báo render `noi_dung` → phải `escHTML` (đồng bộ chuẩn XSS đã làm cho toast).

---

## ĐỀ XUẤT PHẠM VI v1 (nếu duyệt)
Chỉ build: **G1, G2, G3, H1, H2, S1** (6 sự kiện ưu tiên Cao) + polling 30s + drawer chuông +
RLS riêng cho `thong_bao`. Các sự kiện còn lại (nhắc 2h, broadcast, điểm uy tín...) để v2.

> **CẦN DUYỆT**: (1) chọn Phương án 1 (polling) hay 2 (realtime)? (2) phạm vi v1 ở trên ổn chưa?
> (3) có làm admin broadcast ngay v1 không? → Sau khi chốt, mở phiên build + 1 file SQL.
