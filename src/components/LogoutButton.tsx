"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleClick} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      로그아웃
    </button>
  );
}
