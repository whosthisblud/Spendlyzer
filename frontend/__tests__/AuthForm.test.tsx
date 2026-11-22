import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const auth = { user: null as null | { id: string }, signIn: vi.fn(), signUp: vi.fn() };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

import { AuthForm } from "@/components/AuthForm";

async function fill(email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
}

describe("AuthForm", () => {
  beforeEach(() => {
    auth.user = null;
    auth.signIn.mockReset();
    auth.signUp.mockReset();
    replace.mockReset();
  });

  it("signs in with the entered credentials", async () => {
    auth.signIn.mockResolvedValue(undefined);
    render(<AuthForm mode="login" />);
    await fill("a@b.co", "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signIn).toHaveBeenCalledWith("a@b.co", "secret123");
  });

  it("shows sign-in errors", async () => {
    auth.signIn.mockRejectedValue(new Error("Invalid login credentials"));
    render(<AuthForm mode="login" />);
    await fill("a@b.co", "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
  });

  it("tells new users to confirm their email when required", async () => {
    auth.signUp.mockResolvedValue({ needsConfirmation: true });
    render(<AuthForm mode="register" />);
    await fill("new@b.co", "longpassword");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });

  it("requires 8+ character passwords on register", () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("minLength", "8");
  });

  it("redirects signed-in users to the dashboard", async () => {
    auth.user = { id: "u1" };
    render(<AuthForm mode="login" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
});
