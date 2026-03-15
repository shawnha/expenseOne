"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { UserRole } from "@/types";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  isActive: boolean;
  createdAt: string;
  cardLastFour: string | null;
}

interface UsersTableProps {
  users: UserRow[];
  currentUserId: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function UsersTable({ users: initialUsers, currentUserId }: UsersTableProps) {
  const [userList, setUserList] = useState(initialUsers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>부서</TableHead>
              <TableHead>카드번호</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead className="text-right">활성/비활성</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userList.map((user) => {
              const isSelf = user.id === currentUserId;
              const isUpdating = updatingId === user.id;
              return (
                <TableRow
                  key={user.id}
                  className={`hover:bg-[rgba(0,0,0,0.03)] ${!user.isActive ? "opacity-50" : ""}`}
                >
                  <TableCell className="text-sm font-medium text-[var(--apple-label)]">{user.name}</TableCell>
                  <TableCell className="text-xs text-[var(--apple-secondary-label)]">{user.email}</TableCell>
                  <TableCell>
                    {isSelf ? (
                      <span className="text-xs font-medium text-[var(--apple-label)]">
                        {user.role === "ADMIN" ? "관리자" : "멤버"}
                      </span>
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                        disabled={isUpdating}
                      >
                        <SelectTrigger className="w-24" aria-label="역할 변경">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEMBER">멤버</SelectItem>
                          <SelectItem value="ADMIN">관리자</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--apple-secondary-label)]">{user.department ?? "-"}</TableCell>
                  <TableCell className="text-xs text-[var(--apple-secondary-label)]">
                    {user.cardLastFour ? `****-${user.cardLastFour}` : "-"}
                  </TableCell>
                  <TableCell>
                    <span className={user.isActive ? "glass-badge glass-badge-green" : "glass-badge glass-badge-red"}>
                      {user.isActive ? "활성" : "비활성"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-[var(--apple-secondary-label)]">{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {isSelf ? (
                      <span className="text-xs text-[var(--apple-secondary-label)]">-</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={user.isActive ? "destructive" : "default"}
                        disabled={isUpdating}
                        onClick={() => handleToggleActive(user.id, !user.isActive)}
                        className="rounded-xl"
                      >
                        {isUpdating && <Loader2 className="size-3 animate-spin" />}
                        {user.isActive ? "비활성화" : "활성화"}
                      </Button>
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
          return (
            <div
              key={user.id}
              className={`rounded-xl p-4 bg-[rgba(0,0,0,0.03)] space-y-3 ${!user.isActive ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--apple-label)]">{user.name}</p>
                  <p className="truncate text-xs text-[var(--apple-secondary-label)]">{user.email}</p>
                </div>
                <span className={user.isActive ? "glass-badge glass-badge-green" : "glass-badge glass-badge-red"}>
                  {user.isActive ? "활성" : "비활성"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="glass-badge glass-badge-blue">
                  {user.role === "ADMIN" ? "관리자" : "멤버"}
                </span>
                {user.department && (
                  <span className="text-[var(--apple-secondary-label)]">{user.department}</span>
                )}
                {user.cardLastFour && (
                  <span className="text-[var(--apple-secondary-label)]">카드 ****-{user.cardLastFour}</span>
                )}
                <span className="text-[var(--apple-secondary-label)]">{formatDate(user.createdAt)}</span>
              </div>

              {!isSelf && (
                <div className="flex gap-2">
                  <Select
                    value={user.role}
                    onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                    disabled={isUpdating}
                  >
                    <SelectTrigger className="flex-1" aria-label="역할 변경">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">멤버</SelectItem>
                      <SelectItem value="ADMIN">관리자</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={user.isActive ? "destructive" : "default"}
                    disabled={isUpdating}
                    onClick={() => handleToggleActive(user.id, !user.isActive)}
                    className="rounded-xl"
                  >
                    {isUpdating && <Loader2 className="size-3 animate-spin" />}
                    {user.isActive ? "비활성화" : "활성화"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
