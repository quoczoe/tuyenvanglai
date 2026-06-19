-- ============================================================
-- MIGRATION: TIMESTAMP CẢNH BÁO TÊN VI PHẠM (cưỡng chế đổi tên 24h)
-- Dự án: TUYENVANGLAI.IO.VN  ·  Phiên: 2026-06-19
-- ------------------------------------------------------------
-- Thêm 1 cột lưu thời điểm hệ thống cảnh báo LẦN ĐẦU rằng tên tài khoản
-- vi phạm (tên rác / tục tĩu / mạo danh / spam). Frontend (phan-he-ung-dung.js
-- → quetTenViPham) dùng cột này để đếm hạn 24h: quá 24h mà tên vẫn vi phạm
-- → khóa tài khoản bằng cột is_active=false (đã có sẵn, login đã chặn).
--
-- KHÔNG cần RPC: role anon đã UPDATE được nguoi_dung theo RLS hiện tại
-- (cùng cách app đang PATCH is_active / điểm uy tín).
--
-- Trước khi chạy SQL này: code TỰ FALLBACK localStorage (cơ chế vẫn hoạt động
-- per-thiết bị). Chạy SQL để timestamp BỀN cross-device (không né được bằng
-- cách xóa cache / đổi máy).
-- ============================================================

ALTER TABLE nguoi_dung
    ADD COLUMN IF NOT EXISTS ten_canh_bao_luc TIMESTAMPTZ;

-- ── VERIFY ───────────────────────────────────────────────────
--   SELECT sdt_khach, ten_khach, ten_canh_bao_luc, is_active
--   FROM nguoi_dung WHERE ten_canh_bao_luc IS NOT NULL;
-- ============================================================
