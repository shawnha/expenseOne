"use client";

import Image from "next/image";

export interface SubmitterData {
  userId: string;
  name: string;
  profileImageUrl: string | null;
  amount: number;
  count: number;
}

interface Props {
  data: SubmitterData[];
}

const AVATAR_COLORS = [
  "var(--apple-blue)",
  "var(--apple-green)",
  "var(--apple-orange)",
  "var(--apple-purple)",
  "var(--apple-red)",
  "var(--apple-teal)",
];

function abbreviateAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return `${amount}`;
}

export function ReportTopSubmitters({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="border border-[var(--apple-separator)] rounded-xl p-4">
        <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">Top 5 제출자</p>
        <div className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
          데이터가 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <p className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">Top 5 제출자</p>
      <div className="overflow-x-auto">
        <div className="flex gap-3 pb-1" style={{ minWidth: "max-content" }}>
          {data.map((submitter, i) => {
            const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const firstChar = submitter.name.charAt(0);

            return (
              <div
                key={submitter.userId}
                className="flex flex-col items-center gap-1.5 min-w-[56px]"
              >
                {/* Avatar */}
                {submitter.profileImageUrl ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={submitter.profileImageUrl}
                      alt={submitter.name}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  </div>
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: avatarColor }}
                  >
                    <span className="text-white text-[14px] font-semibold leading-none">
                      {firstChar}
                    </span>
                  </div>
                )}

                {/* Name */}
                <span className="text-[11px] text-[var(--apple-label)] text-center max-w-[56px] truncate">
                  {submitter.name}
                </span>

                {/* Amount */}
                <span className="text-[11px] font-semibold text-[var(--apple-secondary-label)] tabular-nums">
                  {abbreviateAmount(submitter.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
