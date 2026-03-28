"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Trash2, ChevronDown, Check, Shield, ShieldOff, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { UserRole } from "@/types";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  cardLastFour: string | null;
}

interface UsersTableProps {
  users: UserRow[];
  currentUserId: string;
}

/* ------------------------------------------------------------------ */
/* Apple HIG typography tokens (used across all cells)                */
/*   - cell text: 13px / leading-normal                               */
/*   - primary: --apple-label                                         */
/*   - secondary: --apple-secondary-label                             */
/*   - badge: glass-badge (11px pill)                                 */
/* ------------------------------------------------------------------ */

const CELL = "text-[13px] leading-normal";
const PRIMARY = `${CELL} font-medium text-[var(--apple-label)]`;
const SECONDARY = `${CELL} text-[var(--apple-secondary-label)]`;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "ADMIN", label: "관리자" },
  { value: "MEMBER", label: "크루" },
];

function RoleLabel({
  role,
  interactive,
  disabled,
  onChange,
}: {
  role: string;
  interactive: boolean;
  disabled?: boolean;
  onChange?: (newRole: UserRole) => void;
}) {
  const current = ROLE_OPTIONS.find((o) => o.value === role) ?? ROLE_OPTIONS[1];
  const badgeClass = role === "ADMIN" ? "glass-badge glass-badge-blue" : "glass-badge glass-badge-gray";

  if (!interactive) {
    return <span className={badgeClass}>{current.label}</span>;
  }

  return (
    <DropdownMenu modal={true}>
      <DropdownMenuTrigger
        disabled={disabled}
        render={<button type="button" />}
        className={`${badgeClass} inline-flex items-center gap-0.5 cursor-pointer hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed outline-none min-h-[44px] min-w-[44px] justify-center sm:min-h-0 sm:min-w-0`}
      >
        {current.label}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        {ROLE_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => {
              if (opt.value !== role) onChange?.(opt.value);
            }}
            className="flex items-center justify-between gap-4 min-h-[44px] sm:min-h-0"
          >
            {opt.label}
            {opt.value === role && <Check className="size-3.5 text-[var(--apple-blue)]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* iOS-style long-press context menu for mobile                       */
/* ------------------------------------------------------------------ */

interface ContextMenuState {
  user: UserRow;
  x: number;
  y: number;
}

function useLongPress(
  onLongPress: (e: React.TouchEvent<HTMLDivElement>) => void,
  onPressStart?: () => void,
  onPressEnd?: () => void,
  delay = 500,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);
  const activeRef = useRef(false);

  const start = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Prevent text selection on long press
      e.preventDefault();
      movedRef.current = false;
      activeRef.current = true;
      onPressStart?.();
      timerRef.current = setTimeout(() => {
        if (!movedRef.current && activeRef.current) {
          if (navigator.vibrate) navigator.vibrate(10);
          onLongPress(e);
          onPressEnd?.();
        }
      }, delay);
    },
    [onLongPress, onPressStart, onPressEnd, delay],
  );

  const move = useCallback(() => {
    movedRef.current = true;
    onPressEnd?.();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [onPressEnd]);

  const end = useCallback(() => {
    activeRef.current = false;
    onPressEnd?.();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [onPressEnd]);

  return { onTouchStart: start, onTouchMove: move, onTouchEnd: end, onTouchCancel: end };
}

function MobileContextMenu({
  menu,
  currentUserId,
  updatingId,
  deletingId,
  onRoleChange,
  onToggleActive,
  onDelete,
  onClose,
}: {
  menu: ContextMenuState;
  currentUserId: string;
  updatingId: string | null;
  deletingId: string | null;
  onRoleChange: (userId: string, newRole: UserRole) => void;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onDelete: (userId: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    opacity: 0,
    position: "fixed",
    left: 0,
    top: 0,
  });

  const { user } = menu;
  const isSelf = user.id === currentUserId;
  const isUpdating = updatingId === user.id;
  const isDeleting = deletingId === user.id;

  // Position the menu centered horizontally, above the touch point
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const menuW = el.offsetWidth;
    const menuH = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Center horizontally on screen
    let left = (vw - menuW) / 2;

    // Position above the touch point
    let top = menu.y - menuH - 12;

    // If no room above, show below
    if (top < 12) {
      top = menu.y + 12;
    }

    // Clamp to viewport
    if (top + menuH > vh - 12) top = vh - 12 - menuH;
    if (top < 12) top = 12;
    if (left < 12) left = 12;
    if (left + menuW > vw - 12) left = vw - 12 - menuW;

    setMenuStyle({
      position: "fixed",
      left,
      top,
      opacity: 1,
      transform: "scale(1)",
    });
  }, [menu.x, menu.y]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while menu is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  if (showDeleteConfirm) {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
        {/* Confirm dialog */}
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
          <div className="w-full max-w-[300px] rounded-2xl backdrop-blur-xl bg-white/90 dark:bg-black/90 shadow-2xl border border-[var(--glass-border)] overflow-hidden">
            <div className="p-5 text-center">
              <p className="text-[15px] font-semibold text-[var(--apple-label)] mb-1">사용자 삭제</p>
              <p className="text-[13px] text-[var(--apple-secondary-label)] leading-relaxed">
                <strong>{user.name}</strong> ({user.email})을(를) 삭제하시겠습니까?
                모든 경비 내역과 알림이 함께 삭제됩니다.
              </p>
            </div>
            <div className="border-t border-[var(--apple-separator)]">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="w-full px-4 py-3 text-[15px] text-[var(--apple-blue)] font-normal active:bg-black/5 border-b border-[var(--apple-separator)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(user.id);
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                disabled={isDeleting}
                className="w-full px-4 py-3 text-[15px] text-[var(--apple-red)] font-semibold active:bg-black/5 disabled:opacity-50"
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/10"
        onClick={onClose}
      />
      {/* Context menu */}
      <div
        ref={menuRef}
        style={{
          ...menuStyle,
          transition: "opacity 0.15s ease, transform 0.15s ease",
          transformOrigin: "center top",
        }}
        className="z-[9999] w-[220px] rounded-2xl backdrop-blur-xl bg-white/80 dark:bg-black/80 shadow-2xl border border-[var(--glass-border)] overflow-hidden"
      >
        {/* User info header */}
        <div className="px-4 py-2.5 border-b border-[var(--apple-separator)]">
          <p className="text-[13px] font-semibold text-[var(--apple-label)] truncate">{user.name}</p>
          <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{user.email}</p>
        </div>

        {!isSelf && (
          <>
            {/* Role toggle */}
            <button
              type="button"
              disabled={isUpdating}
              onClick={() =>
                handleAction(() =>
                  onRoleChange(user.id, user.role === "ADMIN" ? "MEMBER" : "ADMIN"),
                )
              }
              className="w-full px-4 py-3 flex items-center gap-3 active:bg-black/5 disabled:opacity-50 border-b border-[var(--apple-separator)]"
            >
              {user.role === "ADMIN" ? (
                <ShieldOff className="size-[18px] text-[var(--apple-secondary-label)]" />
              ) : (
                <Shield className="size-[18px] text-[var(--apple-secondary-label)]" />
              )}
              <span className="text-[14px] text-[var(--apple-label)]">
                {user.role === "ADMIN" ? "크루로 변경" : "관리자로 변경"}
              </span>
            </button>

            {/* Active toggle */}
            <button
              type="button"
              disabled={isUpdating}
              onClick={() =>
                handleAction(() => onToggleActive(user.id, !user.isActive))
              }
              className="w-full px-4 py-3 flex items-center gap-3 active:bg-black/5 disabled:opacity-50 border-b border-[var(--apple-separator)]"
            >
              {user.isActive ? (
                <UserX className="size-[18px] text-[var(--apple-secondary-label)]" />
              ) : (
                <UserCheck className="size-[18px] text-[var(--apple-secondary-label)]" />
              )}
              <span className="text-[14px] text-[var(--apple-label)]">
                {user.isActive ? "비활성화" : "활성화"}
              </span>
            </button>

            {/* Delete (destructive) */}
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full px-4 py-3 flex items-center gap-3 active:bg-black/5 disabled:opacity-50"
            >
              <Trash2 className="size-[18px] text-[var(--apple-red)]" />
              <span className="text-[14px] text-[var(--apple-red)] font-medium">사용자 삭제</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}

function MobileUserCard({
  user,
  currentUserId,
  onLongPress,
}: {
  user: UserRow;
  currentUserId: string;
  onLongPress: (user: UserRow, x: number, y: number) => void;
}) {
  const isSelf = user.id === currentUserId;
  const [pressing, setPressing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const longPressHandlers = useLongPress(
    useCallback(
      () => {
        if (isSelf) return;
        const el = cardRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          onLongPress(user, rect.left + rect.width / 2, rect.top);
        }
      },
      [user, onLongPress, isSelf],
    ),
    useCallback(() => !isSelf && setPressing(true), [isSelf]),
    useCallback(() => setPressing(false), []),
    500,
  );

  return (
    <div
      ref={cardRef}
      {...(isSelf ? {} : longPressHandlers)}
      className={`rounded-xl p-4 bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.05)] space-y-3 select-none transition-all duration-300 ease-out ${
        pressing ? "scale-[0.98] brightness-95" : ""
      } ${!user.isActive ? "opacity-50" : ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", touchAction: "pan-y" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={PRIMARY}>{user.name}</p>
          <p className={`${SECONDARY} truncate`}>{user.email}</p>
        </div>
        <span className={user.isActive ? "glass-badge glass-badge-green" : "glass-badge glass-badge-red"}>
          {user.isActive ? "활성" : "비활성"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RoleLabel role={user.role} interactive={false} />
        {user.cardLastFour && (
          <span className={SECONDARY}>카드 ****-{user.cardLastFour}</span>
        )}
        <span className={SECONDARY}>{formatDate(user.createdAt)}</span>
      </div>

      {!isSelf && (
        <p className="text-[11px] text-[var(--apple-tertiary-label)] text-center">
          길게 눌러서 관리
        </p>
      )}
    </div>
  );
}

export function UsersTable({ users: initialUsers, currentUserId }: UsersTableProps) {
  const [userList, setUserList] = useState(initialUsers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) {
        setUserList((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
        );
        toast.success("역할이 변경되었습니다.");
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "역할 변경에 실패했습니다.");
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    setUpdatingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isActive }),
      });
      if (res.ok) {
        setUserList((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isActive } : u)),
        );
        toast.success(isActive ? "계정이 활성화되었습니다." : "계정이 비활성화되었습니다.");
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "상태 변경에 실패했습니다.");
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setUserList((prev) => prev.filter((u) => u.id !== userId));
        toast.success("사용자가 삭제되었습니다.");
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "사용자 삭제에 실패했습니다.");
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="glass p-3 sm:p-4 lg:p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">전체 사용자</h2>
        <span className="glass-badge glass-badge-gray">{userList.length}명</span>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={SECONDARY}>이름</TableHead>
              <TableHead className={SECONDARY}>이메일</TableHead>
              <TableHead className={SECONDARY}>역할</TableHead>
              <TableHead className={SECONDARY}>카드번호</TableHead>
              <TableHead className={SECONDARY}>상태</TableHead>
              <TableHead className={SECONDARY}>가입일</TableHead>
              <TableHead className={`${SECONDARY} text-right`}>관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userList.map((user) => {
              const isSelf = user.id === currentUserId;
              const isUpdating = updatingId === user.id;
              const isDeleting = deletingId === user.id;
              return (
                <TableRow
                  key={user.id}
                  className={`hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] ${!user.isActive ? "opacity-50" : ""}`}
                >
                  <TableCell className={PRIMARY}>{user.name}</TableCell>
                  <TableCell className={SECONDARY}>{user.email}</TableCell>
                  <TableCell>
                    <RoleLabel
                      role={user.role}
                      interactive={!isSelf}
                      disabled={isUpdating}
                      onChange={(newRole) => handleRoleChange(user.id, newRole)}
                    />
                  </TableCell>
                  <TableCell className={SECONDARY}>
                    {user.cardLastFour ? `****-${user.cardLastFour}` : "-"}
                  </TableCell>
                  <TableCell>
                    <span className={user.isActive ? "glass-badge glass-badge-green" : "glass-badge glass-badge-red"}>
                      {user.isActive ? "활성" : "비활성"}
                    </span>
                  </TableCell>
                  <TableCell className={SECONDARY}>{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {isSelf ? (
                      <span className={SECONDARY}>-</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant={user.isActive ? "destructive" : "default"}
                          disabled={isUpdating || isDeleting}
                          onClick={() => handleToggleActive(user.id, !user.isActive)}
                          className="rounded-xl text-[12px] h-7"
                        >
                          {isUpdating && <Loader2 className="size-3 animate-spin" />}
                          {user.isActive ? "비활성화" : "활성화"}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isDeleting}
                                className="rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50 h-7 w-7 p-0"
                              />
                            }
                          >
                            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>사용자 삭제</AlertDialogTitle>
                              <AlertDialogDescription>
                                <strong>{user.name}</strong> ({user.email}) 사용자를 삭제하시겠습니까?
                                <br />
                                해당 사용자의 모든 경비 내역과 알림이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(user.id)}
                                className="bg-red-500 hover:bg-red-600"
                              >
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards — long-press for context menu */}
      <div className="space-y-3 lg:hidden">
        {userList.map((user) => (
          <MobileUserCard
            key={user.id}
            user={user}
            currentUserId={currentUserId}
            onLongPress={(u, x, y) => setContextMenu({ user: u, x, y })}
          />
        ))}
      </div>

      {/* Long-press context menu portal */}
      {contextMenu && (
        <MobileContextMenu
          menu={contextMenu}
          currentUserId={currentUserId}
          updatingId={updatingId}
          deletingId={deletingId}
          onRoleChange={handleRoleChange}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
