import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
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
            gap: 3,
            width: 16,
          }}
        >
          <div style={{ height: 3, borderRadius: 2, background: "white", width: "100%" }} />
          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.7)", width: "75%" }} />
          <div style={{ height: 3, borderRadius: 2, background: "white", width: "100%" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
