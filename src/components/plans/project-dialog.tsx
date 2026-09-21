"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { CompanyPillGroup } from "@/components/companies/company-pill-group";
import type { CompanyOption, ProjectSummary, UserOption } from "@/services/plan.service";
import { jsonBody, planFetch } from "./plan-client";
import { useSubmitLock } from "./use-submit-lock";

// ---------------------------------------------------------------------------
// 프로젝트 만들기 + 참여자 추가·제거.
//
// 참여자 행이 **유일한 권한 근거**다(SCHEMA.md 3절). 만든 사람도 자동으로 참여자로 들어가고,
// 마지막 한 명은 뺄 수 없다 — 아무도 못 여는 프로젝트가 남으면 되살릴 화면이 없다.
// ---------------------------------------------------------------------------

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ProjectDialog({ open, onOpenChange, onSaved }: ProjectDialogProps) {
  const router = useRouter();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [users, setUsers] = useState<UserOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyProject, setBusyProject] = useState<string | null>(null);
  // 같은 틱의 두 번째 클릭을 막는다(QA D-04). creating/busyProject 는 화면용, 이 잠금이 실제 문지기다.
  const withLock = useSubmitLock();

  const [showForm, setShowForm] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  /** 만들기 폼에서 고른 참여자(만든 사람은 자동 포함이라 여기 없다). */
  const [pickedMembers, setPickedMembers] = useState<UserOption[]>([]);
  const [touched, setTouched] = useState(false);
  /** 삭제 버튼 노출 판단(서버가 최종). 대표거나 내가 만든 프로젝트만. */
  const [viewer, setViewer] = useState<{ id: string; isExecutive: boolean } | null>(null);

  // 이 다이얼로그도 열릴 때 마운트된다(ProjectOpenButton). 목록은 마운트될 때 한 번 읽는다 —
  // 다른 화면에서 참여자가 바뀌었을 수 있으니 열 때마다 새로 읽는 편이 맞다.
  useEffect(() => {
    let alive = true;
    void planFetch<{
      projects: ProjectSummary[];
      companies: CompanyOption[];
      isExecutive: boolean;
      viewerId: string;
    }>("/api/plans/projects").then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setProjects(res.data.projects);
      setCompanies(res.data.companies);
      setViewer({ id: res.data.viewerId, isExecutive: res.data.isExecutive });
      // 프로젝트가 하나도 없으면 만들기 폼을 펼친 채로 연다 — 여기 온 이유가 그것뿐이다.
      if (res.data.projects.length === 0) setShowForm(true);
      if (res.data.companies.length === 1) setCompanyId(res.data.companies[0].id);
    });
    return () => {
      alive = false;
    };
  }, []);

  const ensureUsers = useCallback(async () => {
    if (users) return;
    const res = await planFetch<{ users: UserOption[] }>("/api/plans/users");
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setUsers(res.data.users);
  }, [users]);

  const handleCreate = useCallback(
    () =>
      withLock(async () => {
        if (!companyId) return toast.error("법인을 선택해주세요.");
        if (!name.trim()) return toast.error("프로젝트 이름을 입력해주세요.");
        setCreating(true);
        const res = await planFetch<{ project: ProjectSummary }>(
          "/api/plans/projects",
          jsonBody({
            companyId,
            name: name.trim(),
            description: description.trim() || null,
            memberIds: pickedMembers.map((m) => m.id),
          }),
        );
        setCreating(false);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        setProjects((prev) => [...prev, res.data.project]);
        setName("");
        setDescription("");
        setPickedMembers([]);
        setShowForm(false);
        setTouched(true);
        toast.success(`'${res.data.project.name}' 프로젝트를 만들었습니다.`);
      }),
    [withLock, companyId, name, description, pickedMembers],
  );

  const mutateMembers = useCallback(
    (projectId: string, url: string, init: RequestInit, successMessage: string) =>
      withLock(async () => {
        setBusyProject(projectId);
        const res = await planFetch<{ members: UserOption[] }>(url, init);
        setBusyProject(null);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const members = res.data.members;
        setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, members } : p)));
        setTouched(true);
        toast.success(successMessage);
      }),
    [withLock],
  );

  const deleteLock = useRef(false);
  const handleDeleteProject = useCallback(async (project: ProjectSummary) => {
    if (deleteLock.current) return;
    deleteLock.current = true;
    setBusyProject(project.id);
    try {
      const res = await planFetch<{ id: string; planCount: number }>(`/api/plans/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setTouched(true);
      const n = res.data.planCount;
      toast.success(
        n > 0 ? `'${project.name}' 프로젝트와 계획 ${n}건을 삭제했습니다.` : `'${project.name}' 프로젝트를 삭제했습니다.`,
      );
    } finally {
      setBusyProject(null);
      deleteLock.current = false;
    }
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // 참여자가 바뀌면 보드에 보이는 계획의 범위 자체가 달라진다. 바뀐 게 있을 때만 다시 읽는다.
    if (touched) {
      if (onSaved) onSaved();
      else router.refresh();
    }
  }, [onOpenChange, onSaved, router, touched]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-lg max-h-[86dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-headline text-[var(--apple-label)]">프로젝트</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 만들기 */}
          {showForm ? (
            <div className="space-y-3 rounded-2xl border border-[var(--apple-separator)] p-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-footnote text-[var(--apple-secondary-label)]">법인</Label>
                {companies.length === 0 ? (
                  <div className="h-9 w-48 rounded-full bg-[var(--apple-tertiary-system-fill)] animate-pulse" />
                ) : (
                  <CompanyPillGroup
                    options={companies.map((c) => ({ key: c.id, label: c.name }))}
                    value={companyId}
                    onChange={setCompanyId}
                    ariaLabel="법인 선택"
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-name" className="text-footnote text-[var(--apple-secondary-label)]">
                  이름
                </Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="예) 2026 리브랜딩"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-desc" className="text-footnote text-[var(--apple-secondary-label)]">
                  설명 <span className="font-normal">(선택)</span>
                </Label>
                <Textarea
                  id="project-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-footnote text-[var(--apple-secondary-label)]">
                  참여자 <span className="font-normal">(선택 · 나는 자동으로 포함)</span>
                </Label>
                <MemberChips
                  members={pickedMembers}
                  users={users}
                  removable
                  onOpenPicker={() => void ensureUsers()}
                  onAdd={(user) =>
                    setPickedMembers((prev) => (prev.some((m) => m.id === user.id) ? prev : [...prev, user]))
                  }
                  onRemove={(userId) => setPickedMembers((prev) => prev.filter((m) => m.id !== userId))}
                />
                <p className="text-caption2 text-[var(--apple-secondary-label)]">
                  참여자는 이 프로젝트의 계획을 보고 고칠 수 있습니다. 나중에 추가·제거할 수도 있습니다.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                {projects.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() => setShowForm(false)}
                  >
                    접기
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                >
                  {creating ? "만드는 중..." : "만들기"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setShowForm(true)}
            >
              <Plus className="size-4" aria-hidden="true" />새 프로젝트
            </Button>
          )}

          {/* 목록 */}
          <div className="space-y-2">
            {loading && projects.length === 0 ? (
              <div className="h-16 rounded-2xl bg-[var(--apple-tertiary-system-fill)] animate-pulse" />
            ) : projects.length === 0 ? (
              <p className="py-4 text-center text-footnote text-[var(--apple-secondary-label)]">
                참여 중인 프로젝트가 없습니다.
              </p>
            ) : (
              projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  users={users}
                  busy={busyProject === project.id}
                  canDelete={Boolean(viewer && (viewer.isExecutive || project.createdById === viewer.id))}
                  onDelete={() => void handleDeleteProject(project)}
                  onOpenPicker={() => void ensureUsers()}
                  onAdd={(userId) =>
                    void mutateMembers(
                      project.id,
                      `/api/plans/projects/${project.id}/members`,
                      jsonBody({ userId }),
                      "참여자를 추가했습니다.",
                    )
                  }
                  onRemove={(userId) =>
                    void mutateMembers(
                      project.id,
                      `/api/plans/projects/${project.id}/members?userId=${userId}`,
                      { method: "DELETE" },
                      "참여자를 제거했습니다.",
                    )
                  }
                />
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={handleClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/**
 * 참여자 칩 줄 + "참여자 추가" 검색 팝오버. 만들기 폼(고른 사람을 바로 뺄 수 있음)과
 * 기존 프로젝트 행(제거는 확인 뒤)에서 같이 쓴다.
 */
function MemberChips({
  members,
  users,
  removable,
  disabled,
  removeDisabled,
  removeTitle,
  onOpenPicker,
  onAdd,
  onRemove,
}: {
  members: UserOption[];
  users: UserOption[] | null;
  /** true 면 X 를 누르는 즉시 뺀다(아직 저장 전인 만들기 폼). */
  removable: boolean;
  disabled?: boolean;
  /** X 만 따로 막을 때(마지막 참여자). 추가 팝오버는 그대로 열린다. */
  removeDisabled?: boolean;
  removeTitle?: string;
  onOpenPicker: () => void;
  onAdd: (user: UserOption) => void;
  onRemove: (userId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const memberIds = new Set(members.map((m) => m.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {members.map((member) => (
        <span
          key={member.id}
          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[var(--apple-tertiary-system-fill)] py-1 pr-1 pl-3 text-caption1 text-[var(--apple-label)]"
        >
          {member.name}
          {removable && (
            <button
              type="button"
              onClick={() => onRemove(member.id)}
              disabled={disabled || removeDisabled}
              aria-label={`${member.name} 참여자 제거`}
              title={removeTitle}
              className="flex size-9 items-center justify-center rounded-full text-[var(--apple-secondary-label)] transition-colors hover:bg-[var(--apple-red)]/15 hover:text-[var(--apple-red)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--apple-secondary-label)]"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      <Popover
        open={pickerOpen}
        onOpenChange={(next) => {
          setPickerOpen(next);
          if (next) onOpenPicker();
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dashed border-[var(--apple-separator)] px-3 py-1 text-caption1 text-[var(--apple-blue)] transition-colors hover:bg-[var(--apple-blue)]/10 disabled:opacity-50"
        >
          <UserPlus className="size-3" aria-hidden="true" />
          참여자 추가
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command>
            <CommandInput placeholder="직원 검색..." />
            <CommandList>
              <CommandEmpty>{users ? "검색 결과가 없습니다." : "불러오는 중..."}</CommandEmpty>
              <CommandGroup>
                {(users ?? []).map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.name}
                    onSelect={() => {
                      setPickerOpen(false);
                      if (!memberIds.has(user.id)) onAdd(user);
                    }}
                  >
                    <Check className={memberIds.has(user.id) ? "size-4 opacity-100" : "size-4 opacity-0"} />
                    <span className="truncate">{user.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ProjectRow({
  project,
  users,
  busy,
  canDelete,
  onDelete,
  onOpenPicker,
  onAdd,
  onRemove,
}: {
  project: ProjectSummary;
  users: UserOption[] | null;
  busy: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onOpenPicker: () => void;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  /** 프로젝트 삭제 확인 단계. 참여자 전원의 계획이 함께 사라지므로 한 번 더 묻는다. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /**
   * 제거를 물어보는 중인 참여자. 참여자 행이 유일한 권한 근거라, 실수로 한 번 스친 X 하나가
   * 그 사람 화면에서 이 프로젝트의 계획을 전부 404 로 만든다. 확인을 한 단계 둔다.
   * 다이얼로그 안이라 또 다른 Dialog 를 겹치지 않고 칩 줄 아래에서 바로 묻는다.
   */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const lastOne = project.members.length <= 1;
  const confirming = project.members.find((m) => m.id === confirmId) ?? null;

  return (
    <div className="rounded-2xl border border-[var(--apple-separator)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-subheadline font-semibold text-[var(--apple-label)] truncate">
          {project.name}
        </p>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-caption2 text-[var(--apple-secondary-label)]">{project.companyName}</span>
          {canDelete && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              aria-label={`${project.name} 프로젝트 삭제`}
              title="프로젝트 삭제"
              className="flex size-11 items-center justify-center rounded-full text-[var(--apple-secondary-label)] transition-colors hover:bg-[var(--apple-red)]/15 hover:text-[var(--apple-red)] disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {confirmDelete && (
        <div className="mt-2 flex w-full flex-wrap items-center gap-2 rounded-xl bg-[var(--apple-red)]/10 px-3 py-2">
          <span className="mr-auto text-caption1 text-[var(--apple-label)] break-keep">
            이 프로젝트와 안에 있는 계획이 모두 목록에서 사라집니다. 되돌릴 수 없습니다.
          </span>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmDelete(false)} disabled={busy}>
            그대로 두기
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="min-h-11"
            onClick={() => {
              setConfirmDelete(false);
              onDelete();
            }}
            disabled={busy}
          >
            삭제
          </Button>
        </div>
      )}
      {project.description && (
        <p className="mt-1 text-caption1 text-[var(--apple-secondary-label)] line-clamp-2">
          {project.description}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <MemberChips
          members={project.members}
          users={users}
          removable
          disabled={busy}
          removeDisabled={lastOne}
          removeTitle={lastOne ? "마지막 참여자는 제거할 수 없습니다" : "참여자 제거"}
          onOpenPicker={onOpenPicker}
          onAdd={(user) => onAdd(user.id)}
          onRemove={(userId) => setConfirmId(userId)}
        />

        {confirming && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-[var(--apple-red)]/10 px-3 py-2">
            <span className="mr-auto text-caption1 text-[var(--apple-label)] break-keep">
              {confirming.name} 님을 빼면 이 프로젝트의 계획을 더 이상 볼 수 없습니다.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => setConfirmId(null)}
              disabled={busy}
            >
              그대로 두기
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="min-h-11"
              onClick={() => {
                onRemove(confirming.id);
                setConfirmId(null);
              }}
              disabled={busy}
            >
              빼기
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ProjectOpenButton({
  label = "프로젝트",
  variant = "outline",
}: {
  label?: string;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="lg" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <ProjectDialog open onOpenChange={setOpen} />}
    </>
  );
}
