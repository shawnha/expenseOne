"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Camera, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    // Dismiss the PWA brand splash (root layout inline HTML)
    if (typeof window !== "undefined" && (window as unknown as Record<string, () => void>).__splashDismiss) {
      (window as unknown as Record<string, () => void>).__splashDismiss();
    }
  }, []);

  // Guard: redirect away if user already completed onboarding
  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (json?.data?.onboardingCompleted) {
          window.location.href = "/";
        }
      })
      .catch(() => {});
  }, []);

  const [name, setName] = useState("");
  const [cardLastFour, setCardLastFour] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("이미지 파일만 업로드할 수 있습니다.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("파일 크기는 5MB 이하여야 합니다.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setProfileImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("이름을 입력해주세요.");
      return;
    }

    if (cardLastFour && !/^\d{4}$/.test(cardLastFour)) {
      toast.error("카드 끝 4자리 숫자를 정확히 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload profile image to Supabase Storage if provided
      let profileImageUrl: string | null = null;

      if (profileImage && profileImage.startsWith("data:")) {
        const uploadRes = await fetch("/api/onboarding/upload-avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: profileImage }),
        });
        if (uploadRes.ok) {
          const result = await uploadRes.json();
          profileImageUrl = result.url;
        }
      }

      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cardLastFour: cardLastFour || "",
          profileImageUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || "프로필 저장에 실패했습니다.");
      }

      toast.success("프로필이 저장되었습니다!");
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "프로필 저장에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const initials = name.trim()
    ? name.trim().charAt(0).toUpperCase()
    : "?";

  return (
    <div
      className="h-dvh overflow-y-auto flex items-start sm:items-center justify-center px-4 bg-[var(--apple-system-background)]"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full max-w-md space-y-6 my-auto">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--apple-label)]">
            프로필 설정
          </h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-2">
            서비스 이용을 위해 프로필을 완성해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-6 space-y-6">
          {/* 프로필 사진 */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative size-24 rounded-full overflow-hidden bg-[var(--apple-blue)]/10 flex items-center justify-center hover:bg-[var(--apple-blue)]/20 transition-colors group"
            >
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="프로필 사진"
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-[var(--apple-blue)]">
                  {initials}
                </span>
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="size-6 text-white" />
              </div>
            </button>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              프로필 사진 (선택사항)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </div>

          {/* 이름 */}
          <div className="space-y-1.5">
            <Label htmlFor="name">
              이름 <span className="text-[var(--apple-red)]">*</span>
            </Label>
            <Input
              id="name"
              placeholder="한글 이름을 입력해주세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* 카드 끝 4자리 */}
          <div className="space-y-1.5">
            <Label htmlFor="cardLastFour">법인카드 끝 4자리</Label>
            <Input
              id="cardLastFour"
              placeholder="0000"
              maxLength={4}
              inputMode="numeric"
              value={cardLastFour}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d]/g, "");
                setCardLastFour(val);
              }}
            />
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              법카사용 내역 제출 시 자동으로 입력됩니다.
            </p>
          </div>

          {/* 제출 */}
          <Button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="w-full rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                저장 중...
              </>
            ) : (
              "시작하기"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
