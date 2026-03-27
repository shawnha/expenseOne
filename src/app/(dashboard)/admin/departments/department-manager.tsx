"use client";

import React, { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

  const handleEdit = (dept: Department) => {
    setEditingId(dept.id);
    setEditName(dept.name);
  };

  const handleCancelEdit = () => {
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

    // Swap sort orders
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
        <div className="space-y-1">
          {departments.map((dept, index) => (
            <div
              key={dept.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(0,0,0,0.03)] transition-colors group"
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0 || savingId === dept.id}
                  className="p-0.5 rounded hover:bg-[rgba(0,0,0,0.06)] disabled:opacity-20 disabled:cursor-not-allowed"
                  aria-label="위로 이동"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === departments.length - 1 || savingId === dept.id}
                  className="p-0.5 rounded hover:bg-[rgba(0,0,0,0.06)] disabled:opacity-20 disabled:cursor-not-allowed"
                  aria-label="아래로 이동"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>

              {/* Department name */}
              <div className="flex-1 min-w-0">
                {editingId === dept.id ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={100}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(dept.id);
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                  />
                ) : (
                  <span className="text-sm font-medium text-[var(--apple-label)]">
                    {dept.name}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {editingId === dept.id ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-[var(--apple-green)] hover:bg-[rgba(52,199,89,0.1)]"
                      onClick={() => handleSaveEdit(dept.id)}
                      disabled={savingId === dept.id || !editName.trim()}
                      aria-label="저장"
                    >
                      {savingId === dept.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.06)]"
                      onClick={handleCancelEdit}
                      aria-label="취소"
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.06)] opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleEdit(dept)}
                      aria-label="수정"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-[var(--apple-red,#FF3B30)] hover:bg-[rgba(255,59,48,0.1)] opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(dept.id)}
                      disabled={deletingId === dept.id}
                      aria-label="삭제"
                    >
                      {deletingId === dept.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
