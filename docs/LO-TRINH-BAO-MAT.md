# LỘ TRÌNH BẢO MẬT — RLS + XSS (DRAFT, chờ duyệt)
> Soạn phiên 16 (2026-06-10). Trạng thái: **KẾ HOẠCH** — chưa thực thi SQL, chưa sửa render sites.
> Liên quan: [security-auth-v4.sql](../security-auth-v4.sql) · [supabase-schema.sql](../supabase-schema.sql) · [ket-noi-supabase.js](../ket-noi-supabase.js)

---

## 0. Bối cảnh rủi ro (hiện trạng)

RLS hiện tại (supabase-schema.sql) cho `anon` quyền `USING(true)` trên hầu hết bảng →
client chỉ được bảo vệ bằng "ẩn nút UI", bypass dễ qua DevTools:

| Lỗ hổng | Hậu quả | Mức |
|---|---|---|
| `anon SELECT nguoi_dung *` | Lộ `mat_khau_hash` + toàn bộ PII mọi user | 🔴 |
| `anon UPDATE nguoi_dung` | Ghi đè hồ sơ bất kỳ ai + **leo thang `vai_tro='admin'`** | 🔴 |
| `anon UPDATE/DELETE ca_dau` | Sửa/xóa ca của host khác | 🔴 |
| `anon UPDATE quan_ly_key` | Sửa key host | 🟡 |
| **Thao tác Admin KHÔNG enforce ở DB** (xem §0.1) | Bất kỳ ai có anon key (public) cũng gọi được REST xóa user / đổi vai trò / sửa key / xóa ca | 🔴 |
| DB strings render qua `innerHTML` không escape | **Stored XSS** — xem §2 (toast + admin đã vá; client `/tim-keo`, host còn lại) | 🔴→🟡 |

### 0.1 — KIỂM TRA PHÂN QUYỀN ADMIN (phiên 18)
**Quyền admin xác định ở đâu?** `phan-he-quan-tri.js`:
- **Đăng nhập** (`xacThucQuyenAdmin`, `khoiTaoTrangAdmin`): Supabase Auth `signInWithPassword` → JWT
  (chữ ký server, **không giả mạo được danh tính**) → SELECT `nguoi_dung WHERE auth_uid=session.user.id
  AND vai_tro='admin' AND is_active`. ✅ **Cổng đăng nhập console hợp lý** (auth_uid không fake được).
- **NHƯNG các THAO TÁC admin** (xóa user `_xoaTV`, đổi vai trò `xacNhanDoiVaiTro`, CRUD key, sửa cấu hình,
  xóa ca/đánh giá) đi qua `dbEngine` → REST PATCH/DELETE/INSERT. Việc này **chỉ dựa vào RLS** để chặn.
- 🔴 **RLS hiện permissive** (`USING(true)`), `is_admin()` + policy chặt trong `security-auth-v4.sql`
  Parts 2→8 **CHƯA CHẠY**. Vì anon key nằm sẵn trong client (public), **bất kỳ ai** dùng DevTools +
  anon key đều gọi được các REST mutation tương ứng (xóa user, tự nâng `vai_tro='admin'`, sửa/xóa ca…)
  — KHÔNG cần đăng nhập admin. UI chỉ "ẩn nút" chứ DB không chặn.
- **Kết luận**: ranh giới bảo mật thật là RLS. Bắt buộc chạy `security-auth-v4.sql` (§1) để DB tự enforce
  `is_admin()` cho mọi bảng nhạy cảm. KHÔNG tự chạy SQL trong phiên này — chỉ ghi nhận.

---

## 1. SIẾT RLS — chạy `security-auth-v4.sql`

`security-auth-v4.sql` đã có sẵn mô hình đúng:
- Hàm RPC `SECURITY DEFINER` (server validate): `phan_he_guest_login`, `phan_he_dat_pass_lan_dau`,
  `verify_guest_token`, `guest_dat_slot`, `guest_huy_slot`, `get_current_guest_profile` (đã `GRANT EXECUTE TO anon`).
- DROP các policy `anon ... USING(true)`; tạo policy siết: đọc/ghi `nguoi_dung` chỉ cho `authenticated` + `is_admin()`.

### ⚠️ Tác động khi chạy (PHẢI xử lý trước/đồng thời)
Sau khi siết, **client đọc `nguoi_dung` TRỰC TIẾP bằng anon sẽ HỎNG**. Các điểm gọi cần refactor:

| File:dòng | Mục đích | Hướng thay |
|---|---|---|
| phan-he-khach-choi.js (`_thucHienTimKiem`, ~1509) | Lấy tên + `diem_uy_tin` + `so_sao_tb` của host để hiển thị/xếp hạng | **RPC mới** `get_public_host_info(sdt_list)` trả `{sdt, ten, diem_uy_tin, so_sao_tb}` (chỉ field công khai) |
| phan-he-khach-choi.js ~1286, ~1935, ~3580 | Đọc hồ sơ CHÍNH MÌNH (trust, created_at) | Dùng `get_current_guest_profile(token, sdt)` (đã có) |
| phan-he-host.js ~1185 | Check `diem_uy_tin` của chính host trước khi đăng | `get_current_guest_profile` |
| phan-he-host.js ~2247, ~2850 | GHI `diem_uy_tin` (cộng/trừ điểm khách) | **RPC mới** `host_cham_diem(token, sdt_khach, delta)` validate host sở hữu ca → cập nhật (không cho client tự PATCH điểm bất kỳ ai) |
| phan-he-quan-tri.js (mọi đọc/ghi) | Admin | OK — admin JWT qua `is_admin()` policy |

### Thứ tự triển khai an toàn
1. **Thêm RPC công khai** `get_public_host_info` + `host_cham_diem` (SECURITY DEFINER, GRANT anon) — *bổ sung vào security-auth-v4.sql hoặc file mới, tôi soạn khi duyệt*.
2. **Sửa client** dùng RPC ở các điểm trên (sau lưng vẫn fallback REST cho tới khi chắc chắn).
3. **Chạy phần siết RLS** (DROP permissive + CREATE restrictive).
4. Test: guest xem kèo (trust hiện đúng), host cộng/trừ điểm, admin CRUD.
5. Gỡ fallback REST cũ.

> Nguyên tắc: **bổ sung RPC + sửa client TRƯỚC**, siết RLS SAU → không gãy giữa chừng.

---

## 2. XSS — escape dữ liệu DB trước khi render

### 2.0 ĐÃ VÁ (phiên 18) — không cần chạy SQL
- ✅ **`hienToast` (hieu-ung-giao-dien.js)**: trước đây dựng `innerHTML` với `${title}/${msg}` →
  XSS lưu trữ qua TOÀN BỘ toast (nhiều caller truyền `ten_khach`, `ten_san`, `sdt`…). Đã đổi sang
  dựng DOM bằng `textContent` (cấu trúc DOM/CSS giữ nguyên). **Chặn 1 lớp XSS dùng chung toàn app.**
- ✅ **`phan-he-quan-tri.js`** (đã có sẵn helper `_escHtml`): vá các điểm còn sót:
  `ca.ten_san` (tab Báo cáo), tên user `_layTen` (bảng Đánh giá), `r.nhan_xet` (bảng Đánh giá +
  card đánh giá — bản cũ chỉ escape `< >`, nay dùng `_escHtml` đủ 5 ký tự).
- ✅ **`phan-he-ung-dung.js`**: render điểm uy tín bằng `.textContent` — không có lỗ XSS.
- ✅ **`phan-he-gop-y.js`**: thông báo dùng `.textContent`; chỉ INSERT, không render góp ý người khác.

### 2.1 Thêm helper (tầng dùng chung)
Trong `bo-may-du-lieu.js`:
```js
window.escHTML = function (s) {
    return (s == null ? "" : String(s))
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};
```

### 2.2 Áp dụng tại render sites (template literal → innerHTML) — CÒN LẠI
Quét và bọc `escHTML(...)` quanh MỌI chuỗi nguồn-DB chèn vào innerHTML. Trường rủi ro cao:
`ten_san`, `ten_khach`, `ten_host`, `nhan_xet`, `bio`, `dia_chi_san`, `san_cu_the`, custom level text.

**Trạng thái phiên 18:**
- ✅ `phan-he-quan-tri.js` (đã có `_escHtml`, vá nốt các điểm sót — xem §2.0).
- ✅ `phan-he-gop-y.js` / `phan-he-ung-dung.js` (không render dữ liệu người khác / dùng textContent).
- ✅ Toast dùng chung (`hienToast`) đã chuyển textContent.
- 🟡 **CÒN LẠI (cần 1 đợt riêng)**: `phan-he-khach-choi.js` + `phan-he-host.js` — nhiều điểm render
  template-literal innerHTML hiển thị dữ liệu host/khách cho NGƯỜI KHÁC (rủi ro cao nhất):
  - `phan-he-khach-choi.js`: card kèo (ten_san, dia_chi/san_cu_the, ten_host), modal chi tiết kèo,
    hồ sơ người đăng, render lịch sử (ten_san), modal đánh giá.
  - `phan-he-host.js`: DS Khách (`ten_khach`), chi tiết ca (`ten_san`/`dia_chi`), card đánh giá (`nhan_xet`).
  - Cách làm: thêm `window.escHTML` (§2.1) vào bo-may-du-lieu.js (load trước 2 file này), rồi bọc tại
    các điểm trên. Toast đã an toàn nên ưu tiên còn lại là innerHTML template trong 2 file này.

> Lưu ý: KHÔNG escape các URL dùng trong `href`/`src` bằng escHTML — validate riêng (chống `javascript:`).
> Với link Maps/Facebook: kiểm tra `^https?://` trước khi gán.

### 2.3 Ưu tiên
- Cao nhất: `ten_san`, `nhan_xet`, `bio` (người dùng tự nhập, hiển thị cho người khác).
- Có thể làm **độc lập, không đụng SQL** → giảm rủi ro XSS ngay cả khi chưa siết RLS.

---

## 3. Bổ sung khác (kèm theo)
- `UNIQUE(sdt_khach, id_ca_dau)` trên `dat_slot` (chống double-book ở tầng DB — bổ trợ guard client B3 đã thêm).
- Cập nhật `supabase-schema.sql` cho khớp DB thật (thiếu: `diem_uy_tin`, `so_ca_thanh_cong`, `is_whitelisted`, `is_tam_khoa`, `is_frozen`, `da_thanh_toan`, `tien_thu_bung`, `huy_luc`, `ma_key_host`, `so_sao_tb`...).

---

## 4. Việc cần BẠN quyết trước khi tôi code
1. Duyệt **2 RPC mới** (`get_public_host_info`, `host_cham_diem`) — tôi soạn SQL.
2. Cho phép tôi **sửa client** (4–5 điểm gọi) sang RPC.
3. XSS: làm ngay phần 2 (độc lập) hay gộp chung đợt RLS?
