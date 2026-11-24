"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isVehicleRentalMerchant, VEHICLE_MODEL_MAX, type VehicleRental } from "@/lib/vehicle-rental";

const MODELS = [
  "현대 아반떼", "현대 쏘나타", "현대 그랜저", "현대 투싼", "현대 싼타페", "현대 스타리아",
  "현대 아이오닉 5", "현대 아이오닉 6", "기아 모닝", "기아 레이", "기아 K5", "기아 K8", "기아 셀토스",
  "기아 스포티지", "기아 쏘렌토", "기아 카니발", "기아 EV6", "제네시스 G80", "제네시스 GV70", "테슬라 모델 Y",
];
const searchKey = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

export function VehicleRentalField({ rental, onChange, merchant }: {
  rental: VehicleRental | null;
  onChange: (rental: VehicleRental | null) => void;
  merchant?: string | null;
}) {
  const id = useId();
  const query = searchKey(rental?.model ?? "");
  const matches = query ? MODELS.filter((model) => searchKey(model).includes(query) && searchKey(model) !== query).slice(0, 5) : [];
  const suggested = isVehicleRentalMerchant(merchant);

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">차량 렌트 정보</legend>
      <Label className="flex min-h-11 w-fit cursor-pointer items-center gap-2">
        <input type="checkbox" className="size-4 accent-[var(--apple-blue)]" checked={rental !== null} onChange={(event) => onChange(event.target.checked ? { model: "" } : null)} />
        차량 렌트
      </Label>
      {suggested && !rental && <p className="text-xs text-[var(--apple-secondary-label)]">렌트사로 보이는 가맹점이에요. 차량을 빌린 결제라면 체크해 주세요.</p>}
      {rental && (
        <div className="space-y-2">
          <Label htmlFor={id}>차종·모델 (선택)</Label>
          <Input id={id} value={rental.model} onChange={(event) => onChange({ model: event.target.value })}
            maxLength={VEHICLE_MODEL_MAX} autoComplete="off" className="min-h-11" placeholder="예: 아반떼, 카니발" aria-describedby={`${id}-hint`} />
          {matches.length > 0 && (
            <ul aria-label="차종 검색 결과" className="divide-y divide-[var(--apple-separator)] rounded-xl border border-[var(--apple-separator)]">
              {matches.map((model) => (
                <li key={model}>
                  <button type="button" className="min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[var(--apple-tertiary-system-fill)]"
                    onClick={() => onChange({ model })}>{model}</button>
                </li>
              ))}
            </ul>
          )}
          <p id={`${id}-hint`} className="text-xs text-[var(--apple-secondary-label)]">목록에 없는 차종은 직접 입력할 수 있어요. 모르면 비워 두고 나중에 수정하세요.</p>
        </div>
      )}
    </fieldset>
  );
}
