import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "TAID — 말하는 현장, 배우는 공장";
const description = "작업자의 말을 문제·개선·노하우 데이터로 바꾸는 중소 제조현장용 AI 지식 운영 서비스";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host") ?? "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      images: [{ url: imageUrl, width: 1729, height: 910, alt: "TAID — 현장은 말하고, 공장은 배웁니다." }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
