"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Nav } from "@/components/Nav";
import { Loading } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return <Loading />;
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
