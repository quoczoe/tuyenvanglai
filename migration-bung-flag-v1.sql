-- =====================================================================
-- MIGRATION (TÙY CHỌN): FLAG ĐẾM BÙNG PER-SLOT — TUYENVANGLAI.IO.VN
-- Trạng thái: 🟡 KHÔNG BẮT BUỘC — CHỜ DUYỆT. KHÔNG tự chạy.
--
-- BỐI CẢNH: hệ điểm uy tín đã chuyển sang STATE-BASED DELTA
--   (window.apDiemTheoTrangThai). Cách đếm "lần bùng" hiện tại = số slot KHÁC
--   đang ở trạng thái "Bùng kèo" trong cửa sổ 30 ngày + 1. Cách này ĐÚNG cho
--   mọi test yêu cầu (toggle 1 slot, 3 slot khác nhau cùng bùng, re-bùng cùng slot).
--
-- HẠN CHẾ DUY NHẤT (edge hiếm): nếu host bùng slot A → đổi A đi khỏi "Bùng kèo"
--   (vd sang "Đã tham gia") → rồi bùng slot B, thì B được tính LẦN 1 (vì A không
--   còn đếm), thay vì LẦN 2. Yêu cầu "đã bùng là đã bùng" (đếm bền vững dù đổi đi)
--   chỉ đạt tuyệt đối khi có FLAG PER-SLOT bền vững.
--
-- → File này thêm cột `da_dem_bung BOOLEAN` để đánh dấu "slot này đã từng bị tính
--   1 lần bùng". Khi áp dụng (nếu duyệt), apDiemTheoTrangThai sẽ:
--     • Khi slot LẦN ĐẦU thành "Bùng kèo": set da_dem_bung=true.
--     • Đếm lần bùng = COUNT(slot có da_dem_bung=true AND huy_luc trong 30 ngày).
--     • Đổi đi khỏi Bùng KHÔNG xóa flag → "đã bùng là đã bùng".
--   (Phần client chỉ bật khi cột tồn tại — sẽ cập nhật ở phiên sau nếu duyệt.)
-- =====================================================================

ALTER TABLE dat_slot ADD COLUMN IF NOT EXISTS da_dem_bung BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: các slot ĐANG ở "Bùng kèo" coi như đã đếm (giữ count hiện tại không đổi)
UPDATE dat_slot SET da_dem_bung = TRUE WHERE trang_thai_di_danh = 'Bùng kèo';

-- Index hỗ trợ đếm nhanh theo khách + flag
CREATE INDEX IF NOT EXISTS idx_dat_slot_dem_bung ON dat_slot (sdt_khach, da_dem_bung);

-- ── VERIFY ──
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_name='dat_slot' AND column_name='da_dem_bung';
-- SELECT count(*) FROM dat_slot WHERE da_dem_bung = TRUE;
