const RENTAL_LABEL = "차량 렌트";
const MODEL_LABEL = `${RENTAL_LABEL} · 차종: `;
export const VEHICLE_MODEL_MAX = 80;

export interface VehicleRental {
  model: string;
}

export function isVehicleRentalMerchant(merchant?: string | null): boolean {
  const name = merchant?.normalize("NFKC").toLowerCase() ?? "";
  return /렌[터트]카|쏘카|그린카|rent[-_.]?a[-_.]?car/u.test(name.replace(/\s+/g, ""))
    || /\b(?:gcar|socar)\b/u.test(name);
}

export function readVehicleRental(description: string | null) {
  const text = description ?? "";
  const end = text.indexOf("\n");
  const firstLine = end === -1 ? text : text.slice(0, end);
  if (firstLine !== RENTAL_LABEL && !firstLine.startsWith(MODEL_LABEL)) return { rental: null, description: text };
  return {
    rental: { model: firstLine.startsWith(MODEL_LABEL) ? firstLine.slice(MODEL_LABEL.length) : "" },
    description: end === -1 ? "" : text.slice(end + (text[end + 1] === "\n" ? 2 : 1)),
  };
}

export function describeVehicleRental(rental: VehicleRental | null | undefined, description: string | undefined) {
  if (!rental) return description || null;
  const model = rental.model.replace(/\s+/g, " ").trim();
  const firstLine = model ? `${MODEL_LABEL}${model}` : RENTAL_LABEL;
  return description ? `${firstLine}\n\n${description}` : firstLine;
}
