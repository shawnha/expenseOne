import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
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
            gap: 13,
            width: 75,
          }}
        >
          <div style={{ height: 13, borderRadius: 7, background: "white", width: "100%" }} />
          <div style={{ height: 13, borderRadius: 7, background: "rgba(255,255,255,0.7)", width: "75%" }} />
          <div style={{ height: 13, borderRadius: 7, background: "white", width: "100%" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
