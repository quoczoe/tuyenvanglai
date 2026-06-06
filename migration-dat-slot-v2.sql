-- ============================================================
-- MIGRATION: dat_slot v2 — Thêm các cột bị thiếu
-- Mục đích: Cho phép lưu thanh toán, tiền phạt bùng, thời gian hủy
-- Cách chạy: Paste toàn bộ vào Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Cột đánh dấu khách đã thanh toán tiền sân (Host tick checkbox)
ALTER TABLE dat_slot ADD COLUMN IF NOT EXISTS da_thanh_toan  BOOLEAN     DEFAULT FALSE;

-- Cột lưu tiền phạt thu được khi khách bùng kèo (0 = không thu)
ALTER TABLE dat_slot ADD COLUMN IF NOT EXISTS tien_thu_bung  INTEGER     DEFAULT 0;

-- Cột timestamp khi khách hủy hoặc host đánh dấu Bùng kèo
ALTER TABLE dat_slot ADD COLUMN IF NOT EXISTS huy_luc        TIMESTAMPTZ;

-- ============================================================
-- KIỂM TRA — chạy sau khi migration thành công
-- ============================================================
-- SELECT id, ten_khach, da_thanh_toan, tien_thu_bung, huy_luc
-- FROM dat_slot LIMIT 5;
