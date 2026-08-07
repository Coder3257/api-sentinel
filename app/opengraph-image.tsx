import { ImageResponse } from "next/og";

export const alt = "API Sentinel — Ship through Stripe API changes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#060707",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Aurora glow */}
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "10%",
            width: "600px",
            height: "600px",
            background: "radial-gradient(circle, rgba(194, 212, 184, 0.15), transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "10%",
            right: "15%",
            width: "500px",
            height: "500px",
            background: "radial-gradient(circle, rgba(169, 188, 196, 0.12), transparent 70%)",
            filter: "blur(80px)",
          }}
        />

        {/* Brand mark */}
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #c2d4b8 0%, #a9bcc4 100%)",
            marginBottom: "32px",
            boxShadow: "0 0 40px rgba(194, 212, 184, 0.4)",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: "72px",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "#f7f8f6",
            textAlign: "center",
            maxWidth: "900px",
            lineHeight: 1.1,
            marginBottom: "24px",
          }}
        >
          Ship through Stripe API changes
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "28px",
            color: "#a8aca7",
            textAlign: "center",
            maxWidth: "700px",
            lineHeight: 1.5,
          }}
        >
          Auto-fix breaking changes before they break your build
        </div>

        {/* Footer badge */}
        <div
          style={{
            position: "absolute",
            bottom: "48px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "20px",
            color: "#7e837d",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#7fd6a6",
              boxShadow: "0 0 0 6px rgba(127, 214, 166, 0.2)",
            }}
          />
          <span>Live monitoring for Stripe OpenAPI</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
