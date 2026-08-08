import type { Metadata } from "next";
import localFont from "next/font/local";
import AppShell from "@/components/AppShell";
import "./globals.css";

// 제목(display-lg/headline-lg 계열)
const pretendardBold = localFont({
  src: "../../Pretendard/Pretendard-Bold.otf",
  variable: "--font-pretendard-bold",
  weight: "700",
  display: "swap",
});

// 소제목(headline-md 계열)
const pretendardMedium = localFont({
  src: "../../Pretendard/Pretendard-Medium.otf",
  variable: "--font-pretendard-medium",
  weight: "500",
  display: "swap",
});

// 본문(body/label 계열)
const pretendardRegular = localFont({
  src: "../../Pretendard/Pretendard-Regular.otf",
  variable: "--font-pretendard-regular",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "배당 모아 해외여행",
  description: "목표 월배당금액과 투자계획금액으로 AI가 배당주 포트폴리오를 제안해요.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${pretendardBold.variable} ${pretendardMedium.variable} ${pretendardRegular.variable} h-full antialiased`}
    >
      <head>
        {/* 시안이 쓰는 아이콘 폰트. next/font는 Material Symbols를 지원하지 않아 링크로 로드한다. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-full w-full bg-background text-on-background">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
