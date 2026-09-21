"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, UserPlus, X } from "lucide-react";
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

  const [showForm, setShowForm] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  // 이 다이얼로그도 열릴 때 마운트된다(ProjectOpenButton). 목록은 마운트될 때 한 번 읽는다 —
  // 다른 화면에서 참여자가 바뀌었을 수 있으니 열 때마다 새로 읽는 편이 맞다.
  useEffect(() => {
    let alive = true;
    void planFetch<{
      projects: ProjectSummary[];
      companies: CompanyOption[];
      isExecutive: boolean;
    }>("/api/plans/projects").then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setProjects(res.data.projects);
      setCompanies(res.data.companies);
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

  const handleCreate = useCallback(async () => {
    if (!companyId) return toast.error("법인을 선택해주세요.");
    if (!name.trim()) return toast.error("프로젝트 이름을 입력해주세요.");
    setCreating(true);
    const res = await planFetch<{ project: ProjectSummary }>(
      "/api/plans/projects",
      jsonBody({ companyId, name: name.trim(), description: description.trim() || null }),
    );
    setCreating(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setProjects((prev) => [...prev, res.data.project]);
    setName("");
    setDescription("");
    setShowForm(false);
    setTouched(true);
    toast.success(`프로젝트 '${res.data.project.name}'을(를) 만들었습니다.`);
  }, [companyId, name, description]);

  const mutateMembers = useCallback(
    async (projectId: string, url: string, init: RequestInit, successMessage: string) => {
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
    },
    [],
  );

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

function ProjectRow({
  project,
  users,
  busy,
  onOpenPicker,
  onAdd,
  onRemove,
}: {
  project: ProjectSummary;
  users: UserOption[] | null;
  busy: boolean;
  onOpenPicker: () => void;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  /**
   * 제거를 물어보는 중인 참여자. 참여자 행이 유일한 권한 근거라, 실수로 한 번 스친 X 하나가
   * 그 사람 화면에서 이 프로젝트의 계획을 전부 404 로 만든다. 확인을 한 단계 둔다.
   * 다이얼로그 안이라 또 다른 Dialog 를 겹치지 않고 칩 줄에서 바로 묻는다.
   */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const memberIds = new Set(project.members.map((m) => m.id));
  const lastOne = project.members.length <= 1;
  const confirming = project.members.find((m) => m.id === confirmId) ?? null;

  return (
    <div className="rounded-2xl border border-[var(--apple-separator)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-subheadline font-semibold text-[var(--apple-label)] truncate">
          {project.name}
        </p>
        <span className="shrink-0 text-caption2 text-[var(--apple-secondary-label)]">
          {project.companyName}
        </span>
      </div>
      {project.description && (
        <p className="mt-1 text-caption1 text-[var(--apple-secondary-label)] line-clamp-2">
          {project.description}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {project.members.map((member) => (
          <span
            key={member.id}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[var(--apple-tertiary-system-fill)] py-1 pr-1 pl-3 text-caption1 text-[var(--apple-label)]"
          >
            {member.name}
            <button
              type="button"
              onClick={() => setConfirmId(member.id)}
              disabled={busy || lastOne}
              aria-label={`${member.name} 참여자 제거`}
              title={lastOne ? "마지막 참여자는 제거할 수 없습니다" : "참여자 제거"}
              className="flex size-9 items-center justify-center rounded-full text-[var(--apple-secondary-label)] transition-colors hover:bg-[var(--apple-red)]/15 hover:text-[var(--apple-red)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--apple-secondary-label)]"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}

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

        <Popover
          open={pickerOpen}
          onOpenChange={(next) => {
            setPickerOpen(next);
            if (next) onOpenPicker();
          }}
        >
          <PopoverTrigger
            disabled={busy}
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
                        if (!memberIds.has(user.id)) onAdd(user.id);
                      }}
                    >
                      <Check
                        className={memberIds.has(user.id) ? "size-4 opacity-100" : "size-4 opacity-0"}
                      />
                      <span className="truncate">{user.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
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
