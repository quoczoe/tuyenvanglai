-- ============================================================
-- MIGRATION (DỌN DỮ LIỆU): dat_slot — slot kẹt trạng thái "Chờ đánh"
-- Bối cảnh: ca đã qua giờ kết thúc nhưng host quên chốt/đánh dấu →
--           dat_slot vẫn "Chờ đánh" vĩnh viễn. Trước đây làm bộ đếm
--           giới hạn đặt slot KHÔNG reset (đã fix ở client phan-he-khach-choi.js).
--
-- LƯU Ý QUAN TRỌNG:
--   • Fix client ĐÃ giải quyết triệu chứng (giới hạn nay loại ca đã kết thúc).
--     File SQL này CHỈ để DỌN DỮ LIỆU cho sạch — KHÔNG bắt buộc.
--   • KHÔNG đổi slot đã có kết quả thật ("Đã tham gia"/"Bùng kèo"/"Khách hủy").
--   • KHÔNG tự suy diễn "Đã tham gia" cho slot kẹt (sẽ ảnh hưởng tính tiền + đánh giá).
--   • Cách chạy: paste từng SECTION vào Supabase Dashboard → SQL Editor → Run.
--     CHẠY SECTION 1 TRƯỚC, đối chiếu số liệu, rồi mới cân nhắc SECTION 3.
--   • BACKUP bảng dat_slot trước khi chạy SECTION 3.
-- ============================================================


-- ============================================================
-- SECTION 1 — CHẨN ĐOÁN (chỉ đọc): liệt kê slot kẹt "Chờ đánh"
--   = slot "Chờ đánh" thuộc ca ĐÃ qua giờ kết thúc và CHƯA chốt.
-- ============================================================
SELECT
    ds.id              AS slot_id,
    ds.ma_slot,
    ds.sdt_khach,
    ds.trang_thai_di_danh,
    ds.thoi_gian_dat,
    cd.id              AS ca_id,
    cd.ngay_danh,
    cd.gio_ket_thuc,
    cd.da_chot_ca,
    (cd.ngay_danh + cd.gio_ket_thuc)::timestamp AS ket_thuc_luc
FROM dat_slot ds
JOIN ca_dau cd ON cd.id = ds.id_ca_dau
WHERE ds.trang_thai_di_danh = 'Chờ đánh'
  AND cd.da_chot_ca IS NOT TRUE
  AND cd.ngay_danh   IS NOT NULL
  AND cd.gio_ket_thuc IS NOT NULL
  AND (cd.ngay_danh + cd.gio_ket_thuc)::timestamp
        < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
ORDER BY cd.ngay_danh DESC;

-- Đếm tổng số slot kẹt (xem nhanh quy mô):
SELECT count(*) AS tong_slot_ket
FROM dat_slot ds
JOIN ca_dau cd ON cd.id = ds.id_ca_dau
WHERE ds.trang_thai_di_danh = 'Chờ đánh'
  AND cd.da_chot_ca IS NOT TRUE
  AND cd.ngay_danh   IS NOT NULL
  AND cd.gio_ket_thuc IS NOT NULL
  AND (cd.ngay_danh + cd.gio_ket_thuc)::timestamp
        < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');


-- ============================================================
-- SECTION 2 — (KHÔNG BẮT BUỘC) chuẩn bị giá trị mốc
--   Nếu muốn chỉ dọn slot kẹt LÂU (vd > 7 ngày sau khi ca kết thúc),
--   dùng điều kiện bổ sung ở SECTION 3 (đã có sẵn comment).
-- ============================================================
-- (không cần chạy gì ở section này — chỉ là ghi chú)


-- ============================================================
-- SECTION 3 — DỌN (GHI): đổi slot kẹt sang trạng thái kết thúc trung tính.
--   ⚠️ MẶC ĐỊNH BỊ COMMENT. Bỏ comment 1 trong 2 phương án rồi mới chạy.
--   ⚠️ BACKUP TRƯỚC. Chạy trong transaction để có thể ROLLBACK nếu sai.
-- ============================================================

-- BEGIN;
--
-- -- Phương án A (khuyến nghị): đánh dấu "Khách hủy" cho slot kẹt — KHÔNG tính tiền,
-- --   KHÔNG ảnh hưởng đánh giá, đưa slot về trạng thái terminal để không kẹt bộ đếm.
-- UPDATE dat_slot ds
-- SET trang_thai_di_danh = 'Khách hủy',
--     huy_luc = COALESCE(huy_luc, now())   -- cần đã chạy migration-dat-slot-v2.sql (cột huy_luc)
-- FROM ca_dau cd
-- WHERE cd.id = ds.id_ca_dau
--   AND ds.trang_thai_di_danh = 'Chờ đánh'
--   AND cd.da_chot_ca IS NOT TRUE
--   AND cd.ngay_danh   IS NOT NULL
--   AND cd.gio_ket_thuc IS NOT NULL
--   AND (cd.ngay_danh + cd.gio_ket_thuc)::timestamp
--         < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
--   -- Tùy chọn: chỉ dọn ca kết thúc QUÁ 7 ngày, thêm:
--   --   AND (cd.ngay_danh + cd.gio_ket_thuc)::timestamp
--   --         < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '7 days'
--
-- -- (Nếu CHƯA chạy migration-dat-slot-v2.sql thì bỏ dòng "huy_luc = ..." ở trên.)
--
-- COMMIT;
-- -- Nếu số dòng ảnh hưởng KHÁC kỳ vọng ở SECTION 1 → chạy ROLLBACK; thay vì COMMIT.


-- ============================================================
-- SECTION 4 — ĐỐI CHIẾU SAU KHI DỌN (chỉ đọc): phải ra 0 dòng.
-- ============================================================
SELECT count(*) AS con_ket_sau_khi_don
FROM dat_slot ds
JOIN ca_dau cd ON cd.id = ds.id_ca_dau
WHERE ds.trang_thai_di_danh = 'Chờ đánh'
  AND cd.da_chot_ca IS NOT TRUE
  AND cd.ngay_danh   IS NOT NULL
  AND cd.gio_ket_thuc IS NOT NULL
  AND (cd.ngay_danh + cd.gio_ket_thuc)::timestamp
        < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
