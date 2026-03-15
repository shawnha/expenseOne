-- ============================================================================
-- RLS (Row Level Security) 정책
-- Supabase auth.uid() 기반 행 단위 접근 제어
-- ============================================================================

-- Helper: 현재 유저의 role 조회
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role::text FROM public.users WHERE id = auth.uid();
$$;

-- ============================================================================
-- 1. users 테이블
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 본인 프로필 조회
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  USING (id = auth.uid());

-- ADMIN은 전체 유저 조회
CREATE POLICY "users_select_admin"
  ON public.users FOR SELECT
  USING (public.current_user_role() = 'ADMIN');

-- 본인 프로필 수정
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ADMIN은 다른 유저 역할/상태 수정
CREATE POLICY "users_update_admin"
  ON public.users FOR UPDATE
  USING (public.current_user_role() = 'ADMIN');

-- 새 유저 등록 (auth callback에서 insert)
CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- 2. expenses 테이블
-- ============================================================================
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 본인 비용 조회
CREATE POLICY "expenses_select_own"
  ON public.expenses FOR SELECT
  USING (submitted_by_id = auth.uid());

-- ADMIN은 전체 비용 조회
CREATE POLICY "expenses_select_admin"
  ON public.expenses FOR SELECT
  USING (public.current_user_role() = 'ADMIN');

-- 본인 비용 생성
CREATE POLICY "expenses_insert_own"
  ON public.expenses FOR INSERT
  WITH CHECK (submitted_by_id = auth.uid());

-- 본인 비용 수정 (상태 변경 포함)
CREATE POLICY "expenses_update_own"
  ON public.expenses FOR UPDATE
  USING (submitted_by_id = auth.uid());

-- ADMIN은 비용 상태 변경 (승인/반려)
CREATE POLICY "expenses_update_admin"
  ON public.expenses FOR UPDATE
  USING (public.current_user_role() = 'ADMIN');

-- 본인 비용 삭제
CREATE POLICY "expenses_delete_own"
  ON public.expenses FOR DELETE
  USING (submitted_by_id = auth.uid());

-- ============================================================================
-- 3. attachments 테이블
-- ============================================================================
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- 본인이 업로드한 첨부파일 조회
CREATE POLICY "attachments_select_own"
  ON public.attachments FOR SELECT
  USING (uploaded_by_id = auth.uid());

-- ADMIN은 전체 첨부파일 조회
CREATE POLICY "attachments_select_admin"
  ON public.attachments FOR SELECT
  USING (public.current_user_role() = 'ADMIN');

-- 본인 첨부파일 생성
CREATE POLICY "attachments_insert_own"
  ON public.attachments FOR INSERT
  WITH CHECK (uploaded_by_id = auth.uid());

-- 본인 첨부파일 삭제
CREATE POLICY "attachments_delete_own"
  ON public.attachments FOR DELETE
  USING (uploaded_by_id = auth.uid());

-- ============================================================================
-- 4. notifications 테이블
-- ============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 본인 알림 조회
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

-- 알림 생성 (서비스에서 생성, 모든 인증 유저 허용)
CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 본인 알림 수정 (읽음 처리)
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
