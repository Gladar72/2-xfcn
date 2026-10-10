import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "m-btn",
        variant === "primary" && "m-btn-v",
        variant === "secondary" && "m-btn-o",
        className
      )}
      {...props}
    />
  );
}
