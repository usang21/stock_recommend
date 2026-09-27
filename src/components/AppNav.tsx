import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

export function AppNav() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/dashboard/strategy1" className="text-sm font-semibold">
          데일리 트레이딩 스크리너
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-500">
          <Link href="/dashboard/strategy1" className="hover:text-neutral-900 dark:hover:text-neutral-100">
            리포트
          </Link>
          <Link href="/history" className="hover:text-neutral-900 dark:hover:text-neutral-100">
            히스토리
          </Link>
          <Link href="/settings" className="hover:text-neutral-900 dark:hover:text-neutral-100">
            설정
          </Link>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
