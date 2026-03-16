"use client";

import { useState } from "react";
import { Loader2, Trash2, ChevronDown, Check } from "lucide-react";
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
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={`${badgeClass} inline-flex items-center gap-0.5 cursor-pointer hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed outline-none`}
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
            className="flex items-center justify-between gap-4"
          >
            {opt.label}
            {opt.value === role && <Check className="size-3.5 text-[#007AFF]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UsersTable({ users: initialUsers, currentUserId }: UsersTableProps) {
  const [userList, setUserList] = useState(initialUsers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
                  className={`hover:bg-[rgba(0,0,0,0.03)] ${!user.isActive ? "opacity-50" : ""}`}
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

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {userList.map((user) => {
          const isSelf = user.id === currentUserId;
          const isUpdating = updatingId === user.id;
          const isDeleting = deletingId === user.id;
          return (
            <div
              key={user.id}
              className={`rounded-xl p-4 bg-[rgba(0,0,0,0.03)] space-y-3 ${!user.isActive ? "opacity-50" : ""}`}
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
                <RoleLabel
                  role={user.role}
                  interactive={!isSelf}
                  disabled={isUpdating}
                  onChange={(newRole) => handleRoleChange(user.id, newRole)}
                />
                {user.cardLastFour && (
                  <span className={SECONDARY}>카드 ****-{user.cardLastFour}</span>
                )}
                <span className={SECONDARY}>{formatDate(user.createdAt)}</span>
              </div>

              {!isSelf && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={user.isActive ? "destructive" : "default"}
                    disabled={isUpdating || isDeleting}
                    onClick={() => handleToggleActive(user.id, !user.isActive)}
                    className="flex-1 rounded-xl text-[12px] h-7"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
