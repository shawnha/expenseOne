"use client";

import React, { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SwipeableGroup, SwipeableRow } from "@/components/ui/swipeable-row";
import type { SwipeAction } from "@/components/ui/swipeable-row";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Department {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

interface DepartmentManagerProps {
  initialDepartments: Department[];
}

export function DepartmentManager({ initialDepartments }: DepartmentManagerProps) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refreshDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/departments");
      const data = await res.json();
      if (data.data) setDepartments(data.data);
    } catch {
      // silent
    }
  }, []);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setIsAdding(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "부서 추가에 실패했습니다.");
      }

      toast.success("부서가 추가되었습니다.");
      setNewName("");
      await refreshDepartments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "부서 추가에 실패했습니다.");
    } finally {
      setIsAdding(false);
    }
  };

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleEdit = (dept: Department) => {
    setEditingId(dept.id);
    setEditName(dept.name);
    setEditDialogOpen(true);
  };

  const handleCancelEdit = () => {
    setEditDialogOpen(false);
    setEditingId(null);
    setEditName("");
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;

    setSavingId(id);
    try {
      const res = await fetch("/api/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "부서 수정에 실패했습니다.");
      }

      toast.success("부서가 수정되었습니다.");
      setEditDialogOpen(false);
      setEditingId(null);
      setEditName("");
      await refreshDepartments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "부서 수정에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch("/api/departments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "부서 삭제에 실패했습니다.");
      }

      toast.success("부서가 삭제되었습니다.");
      await refreshDepartments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "부서 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const dept = departments[index];
    const prev = departments[index - 1];

    setSavingId(dept.id);
    try {
      await Promise.all([
        fetch("/api/departments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: dept.id, name: dept.name, sortOrder: prev.sortOrder }),
        }),
        fetch("/api/departments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: prev.id, name: prev.name, sortOrder: dept.sortOrder }),
        }),
      ]);
      await refreshDepartments();
    } catch {
      toast.error("순서 변경에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === departments.length - 1) return;
    const dept = departments[index];
    const next = departments[index + 1];

    setSavingId(dept.id);
    try {
      await Promise.all([
        fetch("/api/departments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: dept.id, name: dept.name, sortOrder: next.sortOrder }),
        }),
        fetch("/api/departments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: next.id, name: next.name, sortOrder: dept.sortOrder }),
        }),
      ]);
      await refreshDepartments();
    } catch {
      toast.error("순서 변경에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const getActions = (dept: Department): SwipeAction[] => [
    {
      key: "edit",
      icon: <Pencil className="size-4" />,
      label: "수정",
      color: "var(--apple-orange, #FF9500)",
      onAction: () => handleEdit(dept),
    },
    {
      key: "delete",
      icon: <Trash2 className="size-4" />,
      label: "삭제",
      color: "var(--apple-red, #FF3B30)",
      requireConfirm: true,
      confirmLabel: "확인?",
      onAction: () => handleDelete(dept.id),
    },
  ];

  return (
    <div className="glass p-6 animate-card-enter stagger-1">
      {/* Add new department */}
      <div className="flex items-center gap-3 mb-6">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 부서명 입력"
          maxLength={100}
          className="flex-1 max-w-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <Button
          onClick={handleAdd}
          disabled={isAdding || !newName.trim()}
          className="rounded-full h-9 px-5 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-white"
        >
          {isAdding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Plus className="size-4 mr-1" />
              추가
            </>
          )}
        </Button>
      </div>

      {/* Department list */}
      {departments.length === 0 ? (
        <div className="text-center py-12 text-sm text-[var(--apple-secondary-label)]">
          등록된 부서가 없습니다.
        </div>
      ) : (
        <SwipeableGroup>
          <div className="space-y-1">
            {departments.map((dept, index) => (
              <SwipeableRow
                key={dept.id}
                id={dept.id}
                actions={getActions(dept)}
                enabled
                className="rounded-xl"
              >
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors group">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0 || savingId === dept.id}
                      className="p-0.5 rounded hover:bg-[rgba(0,0,0,0.06)] dark:hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="위로 이동"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === departments.length - 1 || savingId === dept.id}
                      className="p-0.5 rounded hover:bg-[rgba(0,0,0,0.06)] dark:hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="아래로 이동"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>

                  {/* Department name */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--apple-label)]">
                      {dept.name}
                    </span>
                  </div>

                  {/* Desktop edit/delete buttons (hidden on mobile where swipe is used) */}
                  <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(dept)}
                      disabled={savingId === dept.id}
                      className="p-1.5 rounded-lg hover:bg-[rgba(255,149,0,0.1)] text-[var(--apple-orange,#FF9500)] transition-colors disabled:opacity-30"
                      aria-label={`${dept.name} 수정`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(dept.id)}
                      disabled={savingId === dept.id}
                      className="p-1.5 rounded-lg hover:bg-[rgba(255,59,48,0.1)] text-[var(--apple-red,#FF3B30)] transition-colors disabled:opacity-30"
                      aria-label={`${dept.name} 삭제`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </SwipeableRow>
            ))}
          </div>
        </SwipeableGroup>
      )}

      {/* Edit department dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        if (!open) handleCancelEdit();
      }}>
        <DialogContent
          showCloseButton={false}
          className="glass border-0 ring-1 ring-white/20 shadow-2xl"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-[var(--apple-label)]">
              부서명 수정
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              ref={editInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              placeholder="부서명"
              className="w-full"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && editingId) handleSaveEdit(editingId);
                if (e.key === "Escape") handleCancelEdit();
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              className="rounded-full h-9 px-5 text-[var(--apple-secondary-label)]"
              onClick={handleCancelEdit}
            >
              취소
            </Button>
            <Button
              className="rounded-full h-9 px-5 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-white"
              onClick={() => editingId && handleSaveEdit(editingId)}
              disabled={savingId !== null || !editName.trim()}
            >
              {savingId !== null ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
