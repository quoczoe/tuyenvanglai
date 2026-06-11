-- ============================================================================
-- cleanup-qatest.sql — XÓA THẬT dữ liệu test QATEST (PHIÊN C / suite Playwright sống)
-- LÝ DO CẦN SQL: anon key KHÔNG có quyền DELETE (RLS) → suite chỉ NEUTRALIZE được
--   (ca→da_chot_ca/ẩn, slot→"Khách hủy", user→is_active=false). File này xóa vật lý.
-- AN TOÀN: mọi điều kiện đều ràng theo tiền tố QATEST- hoặc 5 SĐT QATEST cố định.
--   Tài khoản/ca/slot THẬT KHÔNG khớp các điều kiện này.
-- CHẠY 1 LẦN trên Supabase Dashboard → SQL Editor. Đối chiếu SELECT trước/sau.
-- ============================================================================

-- 5 SĐT QATEST cố định (xem .devtest/qa-lib.js → PH)
--   0389990001 HOST · 0389990002 K1 · 0389990003 K2 · 0389990004 BUNG · 0389990005 THR

-- ─── SECTION 1: ĐỐI CHIẾU TRƯỚC (chạy riêng để xem số lượng) ───────────────
-- SELECT count(*) FROM dat_slot
--   WHERE sdt_khach IN ('0389990001','0389990002','0389990003','0389990004','0389990005')
--      OR id_ca_dau IN (SELECT id FROM ca_dau WHERE ten_san LIKE '%QATEST-SAN-%');
-- SELECT count(*) FROM ca_dau
--   WHERE ten_san LIKE '%QATEST-SAN-%'
--      OR sdt_nguoi_tao IN ('0389990001','0389990002','0389990003','0389990004','0389990005');
-- SELECT count(*) FROM gop_y_he_thong
--   WHERE sdt_user IN ('0389990001','0389990002','0389990003','0389990004','0389990005')
--      OR noi_dung ILIKE '%QATEST%';
-- SELECT count(*) FROM nguoi_dung
--   WHERE sdt_khach IN ('0389990001','0389990002','0389990003','0389990004','0389990005');

BEGIN;

-- ─── SECTION 2: XÓA dat_slot (con của ca_dau — xóa trước) ──────────────────
DELETE FROM dat_slot
WHERE sdt_khach IN ('0389990001','0389990002','0389990003','0389990004','0389990005')
   OR id_ca_dau IN (
       SELECT id FROM ca_dau
       WHERE ten_san LIKE '%QATEST-SAN-%'
          OR sdt_nguoi_tao IN ('0389990001','0389990002','0389990003','0389990004','0389990005')
   );

-- ─── SECTION 3: XÓA ca_dau QATEST ─────────────────────────────────────────
DELETE FROM ca_dau
WHERE ten_san LIKE '%QATEST-SAN-%'
   OR sdt_nguoi_tao IN ('0389990001','0389990002','0389990003','0389990004','0389990005');

-- ─── SECTION 4: XÓA góp ý QATEST ──────────────────────────────────────────
DELETE FROM gop_y_he_thong
WHERE sdt_user IN ('0389990001','0389990002','0389990003','0389990004','0389990005')
   OR noi_dung ILIKE '%QATEST%';

-- ─── SECTION 5: XÓA tài khoản QATEST ──────────────────────────────────────
DELETE FROM nguoi_dung
WHERE sdt_khach IN ('0389990001','0389990002','0389990003','0389990004','0389990005');

-- Kiểm tra kết quả ngay trong transaction trước khi COMMIT:
--   (Nếu số liệu hợp lý → COMMIT; nếu nghi ngờ → ROLLBACK.)
COMMIT;

-- ─── SECTION 6: ĐỐI CHIẾU SAU (phải = 0 ở cả 4 bảng) ──────────────────────
-- SELECT
--   (SELECT count(*) FROM nguoi_dung WHERE sdt_khach LIKE '038999000%') AS users_left,
--   (SELECT count(*) FROM ca_dau     WHERE ten_san LIKE '%QATEST-SAN-%') AS ca_left,
--   (SELECT count(*) FROM gop_y_he_thong WHERE noi_dung ILIKE '%QATEST%') AS gopy_left;
