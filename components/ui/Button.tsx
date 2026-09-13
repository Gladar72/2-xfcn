import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "w-full rounded-pill py-4 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        variant === "primary" && "bg-accent text-white",
        variant === "secondary" && "bg-white text-ink-900 border border-ink-400/20",
        className
      )}
      {...props}
    />
  );
}
