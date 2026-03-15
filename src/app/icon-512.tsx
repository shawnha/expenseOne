import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon512() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          borderRadius: 112,
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
            gap: 36,
            width: 210,
          }}
        >
          <div style={{ height: 36, borderRadius: 18, background: "white", width: "100%" }} />
          <div style={{ height: 36, borderRadius: 18, background: "rgba(255,255,255,0.7)", width: "75%" }} />
          <div style={{ height: 36, borderRadius: 18, background: "white", width: "100%" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
