"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PlanCommentRow } from "@/services/plan.service";
import { formatStamp, jsonBody, planFetch } from "./plan-client";

// ---------------------------------------------------------------------------
// 계획 메모 스레드. 쓰기·본인 수정·본인 삭제, 그리고 **열 때 읽음 표시**.
//
// 읽음은 상세 조회가 아니라 이 컴포넌트가 따로 올린다 — 상세 GET 은 읽기 전용 트랜잭션이라
// upsert 를 할 수 없어서 POST …/read 로 갈라져 있다. 여기서 부르지 않으면
// 보드의 '새 메모' 배지가 영영 안 지워진다.
//
// 지운 메모는 행이 남고 body 만 비워진다(작성자·시각은 이력으로 남긴다).
// ---------------------------------------------------------------------------

interface CommentThreadProps {
  planId: string;
  initialComments: PlanCommentRow[];
}

export function CommentThread({ planId, initialComments }: CommentThreadProps) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const marked = useRef(false);

  // 열릴 때 한 번만. StrictMode 의 두 번째 마운트까지 세면 같은 요청이 두 번 나간다.
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void planFetch(`/api/plans/items/${planId}/read`, { method: "POST" });
  }, [planId]);

  const send = useCallback(
    async (url: string, init: RequestInit, successMessage: string, after?: () => void) => {
      setBusy(true);
      const res = await planFetch<{ comments: PlanCommentRow[] }>(url, init);
      setBusy(false);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setComments(res.data.comments);
      after?.();
      toast.success(successMessage);
    },
    [],
  );

  const handleCreate = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    void send(`/api/plans/items/${planId}/comments`, jsonBody({ body }), "메모를 남겼습니다.", () =>
      setDraft(""),
    );
  }, [draft, planId, send]);

  const handleEdit = useCallback(
    (commentId: string) => {
      const body = editDraft.trim();
      if (!body) return;
      void send(
        `/api/plans/items/${planId}/comments/${commentId}`,
        { ...jsonBody({ body }), method: "PATCH" },
        "메모를 고쳤습니다.",
        () => setEditingId(null),
      );
    },
    [editDraft, planId, send],
  );

  const handleDelete = useCallback(
    (commentId: string) => {
      void send(
        `/api/plans/items/${planId}/comments/${commentId}`,
        { method: "DELETE" },
        "메모를 지웠습니다.",
      );
    },
    [planId, send],
  );

  return (
    <section className="glass rounded-2xl p-4 sm:p-5" aria-label="메모">
      <h2 className="text-headline text-[var(--apple-label)]">메모</h2>

      <ul className="mt-3 flex flex-col gap-3">
        {comments.length === 0 && (
          <li className="py-2 text-footnote text-[var(--apple-secondary-label)]">
            아직 메모가 없습니다. 결정한 내용이나 바뀐 사정을 남겨 두세요.
          </li>
        )}
        {comments.map((comment) => (
          <li
            key={comment.id}
            className="rounded-xl bg-[var(--apple-tertiary-system-fill)] px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-caption1 font-medium text-[var(--apple-label)]">
                {comment.authorName ?? "알 수 없음"}
              </p>
              <p className="shrink-0 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                {formatStamp(comment.createdAt)}
                {comment.editedAt && !comment.deletedAt && " (수정됨)"}
              </p>
            </div>

            {comment.deletedAt ? (
              <p className="mt-1 text-footnote italic text-[var(--apple-secondary-label)]">
                삭제된 메모
              </p>
            ) : editingId === comment.id ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  maxLength={4000}
                  aria-label="메모 수정"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    취소
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleEdit(comment.id)}
                    disabled={busy || !editDraft.trim()}
                  >
                    저장
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-1 whitespace-pre-wrap text-footnote text-[var(--apple-label)]">
                  {comment.body}
                </p>
                {comment.canEdit && (
                  <div className="mt-1.5 flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditDraft(comment.body);
                      }}
                      disabled={busy}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-[var(--apple-red)]"
                      onClick={() => handleDelete(comment.id)}
                      disabled={busy}
                    >
                      삭제
                    </Button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          placeholder="메모 남기기"
          aria-label="새 메모"
        />
        <div className="flex justify-end">
          <Button type="button" size="lg" onClick={handleCreate} disabled={busy || !draft.trim()}>
            {busy ? "저장 중..." : "메모 남기기"}
          </Button>
        </div>
      </div>
    </section>
  );
}
