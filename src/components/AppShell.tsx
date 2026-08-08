"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthWidget from "@/components/AuthWidget";

/* 시안의 3개 내비게이션 항목. /about은 시안 홈의 "자세히 알려주세요" 카드로 들어간다. */
const NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/plans", label: "My Plan", icon: "flight_takeoff" },
  { href: "/stocks", label: "Dividend Kings", icon: "military_tech" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 로그인은 시안에서도 내비게이션 없는 전체화면이다.
  if (pathname === "/login") return <>{children}</>;

  return (
    <>
      <nav className="fixed inset-y-0 left-0 z-60 hidden w-80 flex-col rounded-r-xl bg-surface py-stack-lg shadow-xl md:flex">
        <div className="mb-stack-lg flex items-center gap-stack-md px-container-margin">
          <Image
            src="/logo.jpg"
            alt="배당 모아 해외여행!"
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-contain"
          />
          <h2 className="text-body-lg font-headline-md leading-tight font-bold text-primary">
            배당 모아 해외여행!
          </h2>
        </div>
        <ul className="flex flex-grow flex-col gap-stack-sm">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    active
                      ? "mx-2 flex translate-x-1 items-center gap-gutter rounded-lg bg-secondary-container px-4 py-3 font-bold text-on-secondary-container transition-transform"
                      : "mx-2 flex items-center gap-gutter px-4 py-3 text-on-surface-variant transition-colors hover:bg-surface-container-low"
                  }
                >
                  <span
                    className={`material-symbols-outlined${active ? " icon-fill" : ""}`}
                  >
                    {item.icon}
                  </span>
                  <span className="text-body-lg font-body-lg">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* min-w-0: flex 아이템 기본값(min-width:auto)이면 콘텐츠보다 작게 줄지 못해
          드로어 폭만큼 본문이 삐져나가 페이지가 가로 스크롤된다. */}
      <div className="@container relative flex w-full min-w-0 flex-grow flex-col md:ml-80">
        <header className="sticky top-0 z-50 mx-auto flex w-full max-w-[1200px] items-center justify-between bg-background px-container-margin py-base">
          <Link href="/" className="flex items-center gap-stack-md">
            <Image
              src="/logo.jpg"
              alt="배당 모아 해외여행!"
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-contain md:hidden"
            />
            <h1 className="hidden text-headline-md font-headline-md font-bold text-primary sm:block">
              배당 모아 해외여행!
            </h1>
          </Link>
          <AuthWidget />
        </header>
        {children}
      </div>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-xl bg-surface px-4 pt-2 pb-4 shadow-[0_-4px_12px_rgba(0,8,31,0.05)] md:hidden">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "flex scale-95 flex-col items-center justify-center rounded-full bg-secondary-container px-4 py-1 text-on-secondary-container transition-transform"
                  : "flex flex-col items-center justify-center rounded-full px-4 py-1 text-on-surface-variant transition-all hover:bg-surface-container-high"
              }
            >
              <span
                className={`material-symbols-outlined mb-1${active ? " icon-fill" : ""}`}
              >
                {item.icon}
              </span>
              <span className="text-label-md font-label-md whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
