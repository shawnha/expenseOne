import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          borderRadius: 42,
          background: "linear-gradient(145deg, #0A84FF 0%, #007AFF 50%, #0063CC 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            width: 80,
          }}
        >
          <div style={{ height: 14, borderRadius: 7, background: "white", width: "100%" }} />
          <div style={{ height: 14, borderRadius: 7, background: "rgba(255,255,255,0.7)", width: "75%" }} />
          <div style={{ height: 14, borderRadius: 7, background: "white", width: "100%" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
