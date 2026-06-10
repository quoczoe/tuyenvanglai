-- =====================================================================
--  MIGRATION TAXONOMY TRÌNH ĐỘ — v1  (DRAFT — CHƯA CHẠY)
--  Dự án: TUYENVANGLAI.IO.VN
--  Mục tiêu: chuẩn hóa giá trị trình độ cũ → 12 mức IN HOA chuẩn.
--
--  ⚠️ BẮT BUỘC TRƯỚC KHI CHẠY:
--    1. BACKUP database (Supabase Dashboard → Database → Backups, hoặc pg_dump
--       2 bảng: nguoi_dung, ca_dau).
--    2. Đây là migration MỘT LẦN, chạy NGAY TRƯỚC/TẠI thời điểm deploy UI mới.
--       KHÔNG chạy lại sau khi host đã tạo ca với mức "KHÁ" (mức 12) bằng UI mới,
--       vì giá trị cũ "Khá" (host) được hiểu là TB KHÁ — xem hàm map bên dưới.
--    3. Chạy lần lượt từng SECTION, đối chiếu kết quả SELECT trước/sau.
--
--  MAPPING ĐÃ DUYỆT:
--    Chung:   Newbie→NEWBIE | Yếu→YẾU | TBY→TBY | TB-→TB- | TB→TB | TB+→TB+
--    Hồ sơ (nguoi_dung.trinh_do):  Khá→KHÁ        | Giỏi→KHÁ
--    Ca đấu (ca_dau.yeu_cau_trinh_do): Khá→TB KHÁ | TB Khá/TB khá→TB KHÁ
--    Text tự do (vd "chơi 1 năm đổ lên") → GIỮ NGUYÊN
--    12 mức chuẩn: NEWBIE, YẾU-, YẾU, YẾU+, TBY-, TBY, TBY+, TB-, TB, TB+, TB KHÁ, KHÁ
-- =====================================================================


-- =====================================================================
-- SECTION 1 — SELECT TRƯỚC MIGRATE (chạy, lưu kết quả để đối chiếu)
-- =====================================================================

-- 1A. Phân bố trình độ trong hồ sơ
SELECT COALESCE(NULLIF(btrim(trinh_do), ''), '(rỗng)') AS gia_tri,
       COUNT(*) AS so_nguoi
FROM nguoi_dung
GROUP BY 1
ORDER BY so_nguoi DESC, gia_tri;

-- 1B. Các giá trị distinct đang nằm trong ca_dau.yeu_cau_trinh_do (nam + nu)
SELECT val AS gia_tri, COUNT(*) AS so_lan
FROM (
    SELECT jsonb_array_elements_text(yeu_cau_trinh_do->'nam') AS val
    FROM ca_dau WHERE jsonb_typeof(yeu_cau_trinh_do->'nam') = 'array'
    UNION ALL
    SELECT jsonb_array_elements_text(yeu_cau_trinh_do->'nu') AS val
    FROM ca_dau WHERE jsonb_typeof(yeu_cau_trinh_do->'nu') = 'array'
) q
GROUP BY val
ORDER BY so_lan DESC, gia_tri;


-- =====================================================================
-- SECTION 2 — HÀM MAP TẠM (tạo trước, drop ở SECTION 6)
-- =====================================================================

-- 2A. Map cho HỒ SƠ: "Khá"→KHÁ, "Giỏi"→KHÁ
CREATE OR REPLACE FUNCTION tvl_map_level_profile(orig text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN orig IS NULL OR btrim(orig) = '' THEN orig
    WHEN upper(btrim(orig)) IN ('GIỎI','GIOI')      THEN 'KHÁ'
    WHEN upper(btrim(orig)) IN ('KHÁ','KHA')        THEN 'KHÁ'
    WHEN upper(btrim(orig)) IN ('TB KHÁ','TB KHA')  THEN 'TB KHÁ'
    WHEN upper(btrim(orig)) = 'NEWBIE'              THEN 'NEWBIE'
    WHEN upper(btrim(orig)) IN ('YẾU','YEU')        THEN 'YẾU'
    WHEN upper(btrim(orig)) IN ('YẾU-','YEU-')      THEN 'YẾU-'
    WHEN upper(btrim(orig)) IN ('YẾU+','YEU+')      THEN 'YẾU+'
    WHEN upper(btrim(orig)) = 'TBY-'                THEN 'TBY-'
    WHEN upper(btrim(orig)) = 'TBY'                 THEN 'TBY'
    WHEN upper(btrim(orig)) = 'TBY+'                THEN 'TBY+'
    WHEN upper(btrim(orig)) = 'TB-'                 THEN 'TB-'
    WHEN upper(btrim(orig)) = 'TB'                  THEN 'TB'
    WHEN upper(btrim(orig)) = 'TB+'                 THEN 'TB+'
    ELSE orig   -- không nhận dạng → giữ nguyên (xem SECTION 5 để xử lý tay)
  END
$$;

-- 2B. Map cho CA ĐẤU: "Khá" (giá trị cũ từ host) → TB KHÁ
--     Lưu ý: chỉ giá trị ĐÚNG 'Khá' (mixed-case cũ) mới thành TB KHÁ;
--     'KHÁ' (đã IN HOA = mức 12 mới) được giữ nguyên → an toàn nếu lỡ chạy lại.
CREATE OR REPLACE FUNCTION tvl_map_level_cadau(orig text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN orig IS NULL OR btrim(orig) = '' THEN orig
    WHEN btrim(orig) = 'Khá'                        THEN 'TB KHÁ'   -- cũ: host = TB Khá
    WHEN upper(btrim(orig)) IN ('TB KHÁ','TB KHA')  THEN 'TB KHÁ'
    WHEN upper(btrim(orig)) = 'KHÁ'                 THEN 'KHÁ'      -- đã là mức 12 mới
    WHEN upper(btrim(orig)) IN ('GIỎI','GIOI')      THEN 'KHÁ'      -- phòng hờ (host vốn không có)
    WHEN upper(btrim(orig)) = 'NEWBIE'              THEN 'NEWBIE'
    WHEN upper(btrim(orig)) IN ('YẾU','YEU')        THEN 'YẾU'
    WHEN upper(btrim(orig)) IN ('YẾU-','YEU-')      THEN 'YẾU-'
    WHEN upper(btrim(orig)) IN ('YẾU+','YEU+')      THEN 'YẾU+'
    WHEN upper(btrim(orig)) = 'TBY-'                THEN 'TBY-'
    WHEN upper(btrim(orig)) = 'TBY'                 THEN 'TBY'
    WHEN upper(btrim(orig)) = 'TBY+'                THEN 'TBY+'
    WHEN upper(btrim(orig)) = 'TB-'                 THEN 'TB-'
    WHEN upper(btrim(orig)) = 'TB'                  THEN 'TB'
    WHEN upper(btrim(orig)) = 'TB+'                 THEN 'TB+'
    ELSE orig   -- text tự do ("chơi 1 năm đổ lên"...) → GIỮ NGUYÊN
  END
$$;


-- =====================================================================
-- SECTION 3 — MIGRATE (bọc trong transaction; review rồi COMMIT thủ công)
--   Bỏ comment BEGIN/COMMIT khi chạy thật. Nếu số liệu sai → ROLLBACK.
-- =====================================================================
-- BEGIN;

-- 3A. Hồ sơ
UPDATE nguoi_dung
SET trinh_do = tvl_map_level_profile(trinh_do)
WHERE trinh_do IS NOT NULL
  AND trinh_do IS DISTINCT FROM tvl_map_level_profile(trinh_do);

-- 3B. Ca đấu — rebuild mảng nam[] và nu[]
UPDATE ca_dau
SET yeu_cau_trinh_do = jsonb_build_object(
    'nam', CASE WHEN jsonb_typeof(yeu_cau_trinh_do->'nam') = 'array'
                THEN COALESCE((SELECT jsonb_agg(tvl_map_level_cadau(x))
                               FROM jsonb_array_elements_text(yeu_cau_trinh_do->'nam') AS t(x)), '[]'::jsonb)
                ELSE '[]'::jsonb END,
    'nu',  CASE WHEN jsonb_typeof(yeu_cau_trinh_do->'nu') = 'array'
                THEN COALESCE((SELECT jsonb_agg(tvl_map_level_cadau(x))
                               FROM jsonb_array_elements_text(yeu_cau_trinh_do->'nu') AS t(x)), '[]'::jsonb)
                ELSE '[]'::jsonb END
)
WHERE yeu_cau_trinh_do IS NOT NULL;

-- COMMIT;   -- ← bỏ comment để xác nhận; hoặc ROLLBACK; nếu cần hủy


-- =====================================================================
-- SECTION 4 — SELECT SAU MIGRATE (đối chiếu với SECTION 1)
-- =====================================================================

-- 4A. Hồ sơ sau migrate
SELECT COALESCE(NULLIF(btrim(trinh_do), ''), '(rỗng)') AS gia_tri,
       COUNT(*) AS so_nguoi
FROM nguoi_dung
GROUP BY 1
ORDER BY so_nguoi DESC, gia_tri;

-- 4B. Ca đấu sau migrate
SELECT val AS gia_tri, COUNT(*) AS so_lan
FROM (
    SELECT jsonb_array_elements_text(yeu_cau_trinh_do->'nam') AS val
    FROM ca_dau WHERE jsonb_typeof(yeu_cau_trinh_do->'nam') = 'array'
    UNION ALL
    SELECT jsonb_array_elements_text(yeu_cau_trinh_do->'nu') AS val
    FROM ca_dau WHERE jsonb_typeof(yeu_cau_trinh_do->'nu') = 'array'
) q
GROUP BY val
ORDER BY so_lan DESC, gia_tri;


-- =====================================================================
-- SECTION 5 — PHÁT HIỆN GIÁ TRỊ LẠ (ngoài 12 mức chuẩn) — xử lý tay nếu có
--   Kết quả = text tự do của host HOẶC giá trị cũ chưa lường trước.
--   Gửi danh sách này cho dev để bổ sung mapping nếu cần.
-- =====================================================================

-- 5A. Hồ sơ — giá trị ngoài chuẩn
SELECT DISTINCT trinh_do
FROM nguoi_dung
WHERE trinh_do IS NOT NULL AND btrim(trinh_do) <> ''
  AND trinh_do NOT IN
    ('NEWBIE','YẾU-','YẾU','YẾU+','TBY-','TBY','TBY+','TB-','TB','TB+','TB KHÁ','KHÁ')
ORDER BY trinh_do;

-- 5B. Ca đấu — giá trị ngoài chuẩn (thường là text tự do, GIỮ NGUYÊN là đúng)
SELECT DISTINCT val
FROM (
    SELECT jsonb_array_elements_text(yeu_cau_trinh_do->'nam') AS val
    FROM ca_dau WHERE jsonb_typeof(yeu_cau_trinh_do->'nam') = 'array'
    UNION ALL
    SELECT jsonb_array_elements_text(yeu_cau_trinh_do->'nu') AS val
    FROM ca_dau WHERE jsonb_typeof(yeu_cau_trinh_do->'nu') = 'array'
) q
WHERE val NOT IN
    ('NEWBIE','YẾU-','YẾU','YẾU+','TBY-','TBY','TBY+','TB-','TB','TB+','TB KHÁ','KHÁ')
ORDER BY val;


-- =====================================================================
-- SECTION 6 — DỌN HÀM TẠM (chạy sau khi đã COMMIT & đối chiếu xong)
-- =====================================================================
DROP FUNCTION IF EXISTS tvl_map_level_profile(text);
DROP FUNCTION IF EXISTS tvl_map_level_cadau(text);
