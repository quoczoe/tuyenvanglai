-- =====================================================================
-- MIGRATION: "TỪ CHỐI KHÁCH" + KHÓA TRẠNG THÁI THEO GIỜ — TUYENVANGLAI.IO.VN
-- Trạng thái: 🔴 CHỜ DUYỆT — KHÔNG tự chạy. Chạy 1 lần trên Supabase SQL Editor
--             SAU khi chủ app duyệt. (Thiết kế: docs/THIET-KE-NHOM3.md §3A)
--
-- ---------------------------------------------------------------------
-- KẾT LUẬN: PHẦN 3A KHÔNG CẦN THAY ĐỔI SCHEMA.
-- ---------------------------------------------------------------------
--   • Khóa trạng thái theo giờ: đọc `ca_dau.ngay_danh` + `gio_bat_dau` +
--     `gio_ket_thuc` — 3 cột ĐÃ CÓ SẴN & đang dùng (openGuestListModal,
--     autoUpdateChoDao). Client tự tính phase (truoc/trong/sau) ở GMT+7.
--   • Tính năng "Từ chối khách": dùng GIÁ TRỊ status MỚI "Host từ chối" trong
--     cột `dat_slot.trang_thai_di_danh`. Cột này là TEXT TỰ DO, KHÔNG có
--     CHECK/enum (supabase-schema.sql:111 `trang_thai_di_danh TEXT DEFAULT
--     'Chờ đánh'`) → thêm giá trị mới KHÔNG cần ALTER/SQL.
--   • Phạt host khi từ chối <2h: dùng thang HOST_HUY trong window.DIEM_UY_TIN
--     (client) + cột `dat_slot.huy_luc` (đã có ở migration-dat-slot-v2.sql).
--   • Thông báo cho khách: dùng RPC ghi_thong_bao có sẵn (migration-thong-bao-v1).
--
--   => File này KHÔNG BẮT BUỘC chạy. Chỉ chứa:
--      (A) 1 RPC TUỲ CHỌN get_slot_time() — phòng khi client cần đọc giờ ca từ
--          1 slot id mà không có sẵn trong context (hiện code ĐÃ có giờ ca →
--          nhiều khả năng KHÔNG cần; để đây cho chắc, có thể bỏ qua).
--      (B) Khối VERIFY xác nhận giả định (không có CHECK trên trang_thai_di_danh
--          + 3 cột giờ tồn tại) — NÊN chạy để chốt trước khi build code.
-- =====================================================================


-- ============================================================
-- (A) RPC TUỲ CHỌN — đọc giờ ca từ 1 dat_slot.id
--     SECURITY DEFINER. Trả ngay/giờ bắt đầu/giờ kết thúc của ca chứa slot.
--     KHÔNG nhạy cảm (giờ ca là thông tin công khai trong Tìm Kèo) → cấp anon.
--     ⚠ CHỈ tạo nếu thấy client THIẾU dữ liệu giờ ca. Hiện tại host DS Khách +
--       card khách ĐÃ có gio_bat_dau/gio_ket_thuc → có thể KHÔNG cần.
-- ============================================================
CREATE OR REPLACE FUNCTION get_slot_time(p_slot_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT jsonb_build_object(
                    'status',       'ok',
                    'id_ca_dau',    c.id,
                    'ngay_danh',    c.ngay_danh,
                    'gio_bat_dau',  c.gio_bat_dau,
                    'gio_ket_thuc', c.gio_ket_thuc,
                    'da_chot_ca',   c.da_chot_ca
                )
           FROM dat_slot s
           JOIN ca_dau   c ON c.id = s.id_ca_dau
          WHERE s.id = p_slot_id
          LIMIT 1),
        jsonb_build_object('status', 'not_found')
    );
$$;
GRANT EXECUTE ON FUNCTION get_slot_time(UUID) TO anon;


-- =====================================================================
-- (B) VERIFY — chạy ĐỘC LẬP để chốt giả định trước khi build code 3A.
-- =====================================================================
-- 1) trang_thai_di_danh là TEXT TỰ DO, KHÔNG có CHECK constraint
--    (mong đợi: 0 dòng trả về → thêm giá trị "Host từ chối" an toàn, không cần SQL):
-- SELECT con.conname, pg_get_constraintdef(con.oid) AS def
--   FROM pg_constraint con
--   JOIN pg_class rel ON rel.oid = con.conrelid
--  WHERE rel.relname = 'dat_slot'
--    AND con.contype = 'c'
--    AND pg_get_constraintdef(con.oid) ILIKE '%trang_thai_di_danh%';
--
-- 2) 3 cột giờ tồn tại trên ca_dau (mong đợi: 3 dòng ngay_danh/gio_bat_dau/gio_ket_thuc):
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'ca_dau'
--    AND column_name IN ('ngay_danh','gio_bat_dau','gio_ket_thuc')
--  ORDER BY column_name;
--
-- 3) cột huy_luc tồn tại trên dat_slot (cho phạt host <2h — migration-dat-slot-v2):
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'dat_slot' AND column_name = 'huy_luc';
--
-- 4) (nếu tạo get_slot_time) hàm tồn tại:
-- SELECT routine_name FROM information_schema.routines
--  WHERE routine_schema = 'public' AND routine_name = 'get_slot_time';
-- =====================================================================
