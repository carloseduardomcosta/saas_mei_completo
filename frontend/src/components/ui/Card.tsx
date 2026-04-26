import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-3.5 ${className}`}>
      {children}
    </div>
  );
}
