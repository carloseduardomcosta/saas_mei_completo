import React from "react";

type BadgeVariant = "green" | "amber" | "red" | "orange" | "gray";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  green:  "bg-success-light text-success",
  amber:  "bg-warning-light text-warning",
  red:    "bg-danger-light text-danger",
  orange: "bg-brand-light text-brand",
  gray:   "bg-gray-100 text-gray-500",
};

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-medium ${variantClasses[variant]} ${className}`}
      style={{ borderRadius: 99, fontSize: 11, fontWeight: 500 }}
    >
      {children}
    </span>
  );
}
